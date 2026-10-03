// Edge Function: babelos — lado PABX da ponte comercial com a Babel OS.
// Valida o mentor logado e repassa a ação à edge integracao-comercial da
// Babel OS usando o token da ponte (secret server-side — o navegador nunca vê).
// Ações: dados_ficha · criar_conta_temporaria · gerar_contrato ·
//        status_contrato · confirmar_ativacao · semear_conhecimento ·
//        enviar_diagnostico
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const ACOES = new Set([
  "dados_ficha",
  "criar_conta_temporaria",
  "gerar_contrato",
  "status_contrato",
  "confirmar_ativacao",
  "semear_conhecimento",
  "enviar_diagnostico",
]);

// Material bruto (conversa de WhatsApp, PDF colado, anotações) vira blocos
// de conhecimento via IA — mesma regra da casa: só o que está no material.
async function textoParaBlocos(admin: ReturnType<typeof createClient>, texto: string) {
  const { data: chaves } = await admin
    .from("chaves_api").select("chave").eq("provedor", "openrouter").eq("ativa", true).limit(1);
  if (!chaves?.length) throw new Error("cadastre a chave OpenRouter em Gestão → Chaves");

  const prompt = [
    "Transforme o material bruto abaixo em blocos de conhecimento para o agente de IA de uma empresa.",
    "REGRAS:",
    "1. Use SOMENTE o que está no material — não invente nada.",
    "2. Cada bloco: um fato ou assunto autocontido (preço, horário, processo, política, quem é quem).",
    "3. 3 a 20 blocos, os mais úteis para atender clientes.",
    "4. tipo de cada bloco: um de apresentacao|valor|resposta|pagamento|processo|contato|empresa.",
    'Responda APENAS JSON: {"blocos": [{"titulo": "...", "conteudo": "...", "tipo": "..."}]}',
    "",
    "MATERIAL:",
    texto.slice(0, 24000),
  ].join("\n");

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chaves[0].chave}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!resp.ok) throw new Error(`LLM respondeu ${resp.status}`);
  const bruto = (await resp.json())?.choices?.[0]?.message?.content ?? "{}";
  const blocos = JSON.parse(bruto)?.blocos;
  if (!Array.isArray(blocos) || blocos.length === 0) throw new Error("a IA não extraiu blocos do material");
  return blocos;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: quem } = await admin.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: "não autenticado" }, 401);
  const { data: perfil } = await admin
    .from("profiles").select("ativo, nome").eq("user_id", quem.user.id).single();
  if (!perfil?.ativo) return json({ erro: "acesso desativado" }, 403);

  const corpo = await req.json().catch(() => ({}));
  const acao = String(corpo.acao ?? "");
  if (!ACOES.has(acao)) return json({ erro: `ação não permitida: ${acao}` }, 400);

  const urlBos = Deno.env.get("BABEL_OS_URL") ?? "";
  const tokenPonte = Deno.env.get("BABEL_OS_TOKEN") ?? "";
  if (!urlBos || !tokenPonte) {
    return json({ erro: "ponte não configurada (BABEL_OS_URL/BABEL_OS_TOKEN)" }, 500);
  }

  // material bruto vira blocos aqui (a chave da IA mora no PABX) e segue pronto
  if (acao === "semear_conhecimento" && corpo.texto_bruto && !corpo.blocos) {
    try {
      corpo.blocos = await textoParaBlocos(admin, String(corpo.texto_bruto));
      delete corpo.texto_bruto;
    } catch (e) {
      return json({ erro: (e as Error).message }, 502);
    }
  }

  const resp = await fetch(`${urlBos}/functions/v1/integracao-comercial`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-babel-token": tokenPonte },
    body: JSON.stringify(corpo),
  });
  const dados = await resp.json().catch(() => ({ erro: "resposta inválida da Babel OS" }));

  // amarra a conta/contrato ao lead + rastro de quem fez, e quando
  if (dados?.ok && corpo.lead_id) {
    if (acao === "criar_conta_temporaria" && dados.user_id) {
      await admin.from("leads").update({ babel_user_id: dados.user_id }).eq("id", corpo.lead_id);
    }
    if (acao === "gerar_contrato" && dados.chave_publica) {
      await admin.from("leads").update({ babel_contrato_chave: dados.chave_publica }).eq("id", corpo.lead_id);
    }
    if (acao === "confirmar_ativacao") {
      // a virada: lead vira cliente (creditado ao mentor que validou o pagamento)
      // e é transferido ao implementador configurado em Gestão → Operação
      await admin.from("leads").update({
        status: "convertido",
        babel_plano_id: corpo.plano_id ?? null,
        atualizado_em: new Date().toISOString(),
      }).eq("id", corpo.lead_id);
      await admin.from("lead_eventos").insert({
        lead_id: corpo.lead_id, tipo: "status",
        descricao: "Status alterado para convertido (venda fechada na call)",
        autor: quem.user.id,
      });
      const { data: cfg } = await admin.from("config")
        .select("valor").eq("chave", "implementador").maybeSingle();
      if (cfg?.valor) {
        await admin.from("leads").update({ atribuido_a: cfg.valor }).eq("id", corpo.lead_id);
        await admin.from("lead_eventos").insert({
          lead_id: corpo.lead_id, tipo: "nota",
          descricao: "📦 Lead transferido ao implementador — coletar materiais para a base de conhecimento (conversas de WhatsApp, PDFs, site, tabelas de preço)",
          autor: quem.user.id,
        });
      }

      // carteira: credita o lucro ao fechar de quem validou a venda
      const { data: com } = await admin.from("comissoes_config")
        .select("tipo, valor").eq("user_id", quem.user.id).maybeSingle();
      if (com && Number(com.valor) > 0) {
        const totalVenda = Number(dados?.resultado?.valor_plano ?? 0) +
          Number(dados?.resultado?.valor_implantacao ?? 0);
        const credito = com.tipo === "percentual"
          ? Math.round(totalVenda * Number(com.valor)) / 100
          : Number(com.valor);
        if (credito > 0) {
          await admin.from("carteira_lancamentos").insert({
            user_id: quem.user.id,
            valor: credito,
            lead_id: corpo.lead_id,
            descricao: `Venda fechada${totalVenda ? ` (R$ ${totalVenda.toLocaleString("pt-BR")})` : ""} — lucro ao fechar`,
          });
        }
      }
    }
    const rotulo = {
      criar_conta_temporaria: `⚡ Sistema ativado na call (degustação) — conta ${dados.email ?? ""}`,
      gerar_contrato: "📜 Contrato gerado na call",
      confirmar_ativacao: "✅ Pagamento validado na call — conta definitiva na Babel OS",
      semear_conhecimento: `🌱 ${dados.blocos_criados ?? 0} bloco(s) de conhecimento enviados para a Babel do cliente`,
    }[acao];
    if (rotulo) {
      await admin.from("lead_eventos").insert({
        lead_id: corpo.lead_id, tipo: "nota",
        descricao: `${rotulo} · por ${perfil.nome}`, autor: quem.user.id,
      });
    }
  }

  return json(dados, resp.status);
});

/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// integracao-comercial — a ponte do Babel Central (PABX comercial da Babel).
//
// O time comercial vive no Babel Central (outro projeto Supabase). Durante a
// mentoria, o mentor ativa o sistema para o lead: esta edge cria a conta em
// modo degustação, gera o contrato do tenant-mãe, informa o status e confirma
// a ativação quando o humano valida o pagamento na call.
//
// Auth (padrão do projeto, espelho de cron-coletar-custos-llm):
//   header x-babel-token === env BABEL_CENTRAL_TOKEN (≥32 chars)
//   ou Authorization: Bearer <service_role exata>.
// RPCs chamadas aqui são exclusivas do service_role (revoke de todos).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-babel-token",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Senha temporária legível (o lead troca depois): Babel-x9k2m4p7
function senhaTemporaria(): string {
  const miolo = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  return `Babel-${miolo}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const esperado = Deno.env.get("BABEL_CENTRAL_TOKEN") ?? "";
  const tokenPonte = req.headers.get("x-babel-token") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const autorizado = (esperado.length >= 32 && tokenPonte === esperado) ||
    (SERVICE_KEY.length > 0 && bearer === SERVICE_KEY);
  if (!autorizado) return json({ erro: "não autorizado" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);
  const TENANT_MAE = Deno.env.get("BABEL_TENANT_MAE") ?? "96d2d4d9-efe5-436e-b506-d128fe864749";
  // URL_PUBLICA = onde o tenant LOGA (Plataforma Limpa). O link de CONTRATO mora
  // na Babel e tem env própria — ver a nota em `_shared/tools-internas.ts`.
  const URL_CONTRATO = (Deno.env.get("CONTRATO_PUBLIC_URL") ?? "https://www.babel-os.com")
    .replace(/\/+$/, "");
  const URL_PUBLICA = (Deno.env.get("APP_PUBLIC_URL") ?? "https://www.plataformalimpa.com.br")
    .replace(/\/+$/, "");

  const corpo = await req.json().catch(() => ({}));
  const acao = String(corpo.acao ?? "");

  try {
    // ── dados para a ficha de ativação do PABX ──────────────────────────
    if (acao === "dados_ficha") {
      const [nichos, planos, templates] = await Promise.all([
        admin.from("nichos").select("id, slug, nome_exibicao").eq("ativo", true).order("nome_exibicao"),
        admin.from("loja_planos").select("id, nome, preco_mensal, max_conversas").eq("is_active", true).order("ordem"),
        admin.from("contratos_template").select("id, nome, valor_a_vista").eq("user_id", TENANT_MAE).eq("ativo", true),
      ]);
      return json({
        ok: true,
        nichos: nichos.data ?? [],
        planos: planos.data ?? [],
        templates_contrato: templates.data ?? [],
      });
    }

    // ── conta temporária na call ("ativar o sistema") ───────────────────
    if (acao === "criar_conta_temporaria") {
      const email = String(corpo.email ?? "").trim().toLowerCase();
      const nome = String(corpo.nome ?? "").trim();
      const empresa = String(corpo.empresa ?? "").trim();
      if (!email || !nome) return json({ erro: "informe nome e email do lead" }, 400);

      const senha = String(corpo.senha ?? "") || senhaTemporaria();
      const { data: criado, error: erroUser } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        // sem convidado_por: nasce TENANT, nunca membro de equipe
        user_metadata: { full_name: nome, company_name: empresa },
      });
      if (erroUser) {
        const ja = /already|registered|exists/i.test(erroUser.message);
        return json({ erro: ja ? "este email já tem conta na Babel" : erroUser.message }, ja ? 409 : 500);
      }
      const userId = criado.user?.id;
      if (!userId) return json({ erro: "usuário não foi criado" }, 500);

      // o gatilho on_auth_user_created cria profiles + agentes — confirma
      let perfilOk = false;
      for (let i = 0; i < 6 && !perfilOk; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const { data } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
        perfilOk = !!data;
      }
      if (!perfilOk) return json({ erro: "perfil não nasceu do gatilho — verificar on_auth_user_created" }, 500);

      const { data: prov, error: erroProv } = await admin.rpc("integracao_provisionar_conta", {
        p_user_id: userId,
        p_nicho_id: corpo.nicho_id ?? null,
        p_dados: {
          phone: corpo.phone ?? "",
          document: corpo.document ?? "",
          tipo_pessoa: corpo.tipo_pessoa ?? "",
          cnpj: corpo.cnpj ?? "",
          razao_social: corpo.razao_social ?? "",
          empresa_nome: empresa,
          empresa_descricao: corpo.empresa_descricao ?? "",
          nome_agente: corpo.nome_agente ?? "",
          dias_degustacao: corpo.dias_degustacao ?? 7,
        },
      });
      if (erroProv) return json({ erro: `conta criada, mas provisionamento falhou: ${erroProv.message}`, user_id: userId }, 500);

      return json({
        ok: true,
        user_id: userId,
        email,
        senha,
        url: URL_PUBLICA,
        provisionado: prov,
      });
    }

    // ── contrato do tenant-mãe (trilho oficial, com p_tenant_id) ────────
    if (acao === "gerar_contrato") {
      const templateId = corpo.template_id;
      if (!templateId) return json({ erro: "informe template_id" }, 400);

      const { data: gerado, error: erroCtr } = await admin.rpc("criar_contrato_livre_de_template", {
        p_template_id: templateId,
        p_tenant_id: TENANT_MAE,
      });
      if (erroCtr) return json({ erro: erroCtr.message }, 500);
      const linha = Array.isArray(gerado) ? gerado[0] : gerado;
      if (!linha?.chave_publica) return json({ erro: "contrato não devolveu chave pública" }, 500);

      // dados do cliente e evidências extras da call (foto da meet como prova)
      const dadosCliente = { ...(corpo.dados_cliente ?? {}) } as Record<string, unknown>;
      if (corpo.foto_meet) dadosCliente.foto_meet = corpo.foto_meet;
      if (Object.keys(dadosCliente).length) {
        await admin.from("contratos").update({ dados_cliente: dadosCliente }).eq("id", linha.contrato_id);
      }

      // conta de apresentação: a oferta na Babel OS acha o contrato pelo perfil
      if (corpo.user_id) {
        const { data: perfilCtr } = await admin.from("profiles")
          .select("metadata").eq("id", corpo.user_id).maybeSingle();
        if (perfilCtr) {
          await admin.from("profiles").update({
            metadata: {
              ...(perfilCtr.metadata ?? {}),
              contrato_chave: linha.chave_publica,
              contrato_url: `${URL_CONTRATO}/contrato/${linha.chave_publica}`,
            },
          }).eq("id", corpo.user_id);
        }
      }

      return json({
        ok: true,
        contrato_id: linha.contrato_id,
        chave_publica: linha.chave_publica,
        url: `${URL_CONTRATO}/contrato/${linha.chave_publica}`,
      });
    }

    // ── status do contrato (assinou? mandou comprovante?) ───────────────
    if (acao === "status_contrato") {
      const chave = corpo.chave_publica;
      if (!chave) return json({ erro: "informe chave_publica" }, 400);
      const { data } = await admin.from("contratos")
        .select("id, status, assinado_em, url_comprovante_pagamento, forma_pagamento_escolhida")
        .eq("chave_publica", chave).maybeSingle();
      if (!data) return json({ erro: "contrato não encontrado" }, 404);
      return json({
        ok: true,
        status: data.status,
        assinado: !!data.assinado_em,
        assinado_em: data.assinado_em,
        comprovante: !!data.url_comprovante_pagamento,
        forma_pagamento: data.forma_pagamento_escolhida ?? null,
      });
    }

    // ── diagnóstico digital: retrato da empresa vindo do BabelPhone ─────
    // A conta de apresentação mostra isso como primeira tela (efeito uau).
    if (acao === "enviar_diagnostico") {
      const userId = corpo.user_id;
      const diagnostico = corpo.diagnostico;
      if (!userId || !diagnostico || typeof diagnostico !== "object") {
        return json({ erro: "informe user_id e diagnostico (objeto)" }, 400);
      }
      if (JSON.stringify(diagnostico).length > 40_000) {
        return json({ erro: "diagnóstico grande demais (máx 40KB)" }, 400);
      }
      const { data: perfilDg } = await admin.from("profiles")
        .select("metadata").eq("id", userId).maybeSingle();
      if (!perfilDg) return json({ erro: "perfil não encontrado" }, 404);
      const { error: erroDg } = await admin.from("profiles")
        .update({ metadata: { ...(perfilDg.metadata ?? {}), diagnostico_digital: diagnostico } })
        .eq("id", userId);
      if (erroDg) return json({ erro: erroDg.message }, 500);
      return json({ ok: true });
    }

    // ── semear conhecimento: blocos prontos → base do tenant ────────────
    if (acao === "semear_conhecimento") {
      const userId = corpo.user_id;
      const blocos = Array.isArray(corpo.blocos) ? corpo.blocos : [];
      if (!userId || blocos.length === 0) {
        return json({ erro: "informe user_id e blocos [{titulo, conteudo, tipo?}]" }, 400);
      }
      const { data: agente } = await admin.from("agentes")
        .select("id").eq("user_id", userId)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (!agente?.id) return json({ erro: "tenant sem agente — provisionar primeiro" }, 404);

      const TIPOS = new Set(["apresentacao", "valor", "resposta", "pagamento", "processo", "clausula_contrato", "contato", "empresa"]);
      const linhas = blocos
        .filter((b: Record<string, string>) => b?.titulo && b?.conteudo)
        .slice(0, 60)
        .map((b: Record<string, string>) => ({
          agente_id: agente.id,
          title: String(b.titulo).slice(0, 200),
          content: String(b.conteudo).slice(0, 4000),
          tipo: TIPOS.has(String(b.tipo)) ? String(b.tipo) : "empresa",
          escopo: "tenant",
          ativo: true,
        }));
      if (linhas.length === 0) return json({ erro: "nenhum bloco válido" }, 400);

      const { error: erroIns } = await admin.from("blocos_conhecimento").insert(linhas);
      if (erroIns) return json({ erro: erroIns.message }, 500);
      // o embedding entra sozinho: gatilho → fila pgmq → gerar-embedding
      return json({ ok: true, blocos_criados: linhas.length });
    }

    // ── ativação confirmada (humano validou o pagamento na call) ────────
    if (acao === "confirmar_ativacao") {
      const { user_id, plano_id, com_implantacao } = corpo;
      if (!user_id || !plano_id) return json({ erro: "informe user_id e plano_id" }, 400);
      const { data, error } = await admin.rpc("integracao_confirmar_ativacao", {
        p_user_id: user_id,
        p_plano_id: plano_id,
        p_com_implantacao: com_implantacao !== false,
      });
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true, resultado: data });
    }

    return json({ erro: `ação desconhecida: ${acao}` }, 400);
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});

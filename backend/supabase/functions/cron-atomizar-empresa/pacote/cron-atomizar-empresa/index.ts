/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-atomizar-empresa · one-shot · gera blocos atômicos a partir da tabela empresas
// 1 bloco por campo importante · category atômica · vinculado ao agente_id do tenant
// Bloco 3.5 — atomização semântica

import { criarClienteAdmin } from "../_shared/supabase.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

type EmpresaRow = {
  user_id: string;
  nome: string | null;
  descricao: string | null;
  cnpj: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  site: string | null;
  data_inicio: string | null;
  missao: string | null;
  valores: string | null;
  horario_funcionamento: Record<string, string> | null;
};

type ChunkAtomico = {
  content: string;
  category: string;
  tag: string;
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const supabase = criarClienteAdmin();

  const t0 = Date.now();
  const body = await req.json().catch(() => ({})) as { tenant_id?: string };
  const tenantIdFiltro = body.tenant_id ?? null;

  // Busca empresas com todos os campos necessários
  const q = supabase
    .from("empresas")
    .select(
      "user_id, nome, descricao, cnpj, endereco, bairro, cidade, estado, cep, " +
      "whatsapp, instagram, facebook, tiktok, youtube, site, data_inicio, " +
      "missao, valores, horario_funcionamento",
    )
    .order("user_id");

  const { data: empresasRaw, error } = await q;
  if (error) return jsonResp({ error: error.message }, 500);

  const empresas = (empresasRaw ?? []) as unknown as EmpresaRow[];
  const empresasFiltradas: EmpresaRow[] = tenantIdFiltro
    ? empresas.filter((e) => e.user_id === tenantIdFiltro)
    : empresas;

  let totalChunksGerados = 0;
  const erros: string[] = [];

  for (const emp of empresasFiltradas) {
    // Buscar agente_id do tenant
    const { data: agent } = await supabase
      .from("agentes_usuario")
      .select("id")
      .eq("user_id", emp.user_id)
      .maybeSingle();

    if (!agent?.id) {
      erros.push(`tenant ${emp.user_id} sem user_agent`);
      continue;
    }

    const agentId: string = agent.id;
    const blocos: ChunkAtomico[] = [];

    // ENDEREÇO — bloco único com todos os componentes
    const endPartes = [emp.endereco, emp.bairro, emp.cidade, emp.estado, emp.cep]
      .filter(Boolean);
    if (endPartes.length > 0) {
      blocos.push({
        content: `Endereço: ${endPartes.join(", ")}.`,
        category: "endereco",
        tag: `empresa_${emp.user_id}_endereco`,
      });
    }

    // HORÁRIO — formata jsonb em texto legível
    if (emp.horario_funcionamento && typeof emp.horario_funcionamento === "object") {
      const formatado = Object.entries(emp.horario_funcionamento)
        .map(([dia, h]) => `${dia}: ${h}`)
        .join(" · ");
      blocos.push({
        content: `Horário de funcionamento: ${formatado}.`,
        category: "horario",
        tag: `empresa_${emp.user_id}_horario`,
      });
    }

    // REDES SOCIAIS — bloco consolidado
    const redes = [
      emp.instagram && `Instagram: ${emp.instagram}`,
      emp.facebook  && `Facebook: ${emp.facebook}`,
      emp.tiktok    && `TikTok: ${emp.tiktok}`,
      emp.youtube   && `YouTube: ${emp.youtube}`,
      emp.site      && `Site: ${emp.site}`,
    ].filter(Boolean) as string[];
    if (redes.length > 0) {
      blocos.push({
        content: `Redes e canais: ${redes.join(" · ")}.`,
        category: "redes_sociais",
        tag: `empresa_${emp.user_id}_redes`,
      });
    }

    // TELEFONE / WHATSAPP
    if (emp.whatsapp) {
      blocos.push({
        content: `WhatsApp para contato: ${emp.whatsapp}.`,
        category: "telefone",
        tag: `empresa_${emp.user_id}_telefone`,
      });
    }

    // CNPJ + dados cadastrais
    const cnpjPartes = [
      emp.nome        && `Nome da empresa: ${emp.nome}`,
      emp.cnpj        && `CNPJ: ${emp.cnpj}`,
      emp.data_inicio && `Fundada em: ${emp.data_inicio}`,
    ].filter(Boolean) as string[];
    if (cnpjPartes.length > 0) {
      blocos.push({
        content: cnpjPartes.join(". ") + ".",
        category: "cnpj_dados",
        tag: `empresa_${emp.user_id}_cnpj`,
      });
    }

    // DESCRIÇÃO (category empresa — mantém existente)
    if (emp.descricao) {
      blocos.push({
        content: emp.descricao.slice(0, 500),
        category: "empresa",
        tag: `empresa_${emp.user_id}_descricao`,
      });
    }

    // MISSÃO (se preenchida)
    if (emp.missao) {
      blocos.push({
        content: `Missão da empresa: ${emp.missao}`,
        category: "empresa",
        tag: `empresa_${emp.user_id}_missao`,
      });
    }

    // Persiste cada bloco (DELETE + INSERT idempotente)
    for (const c of blocos) {
      // Limpa texto antes de embedar
      const { data: limpo } = await supabase.rpc("limpar_antes_embedar", {
        p_text: c.content,
        p_cap_bytes: 600,
      });
      const textoFinal: string = (limpo as { texto_limpo?: string } | null)?.texto_limpo ?? c.content;

      // Apaga versão anterior do mesmo tag (idempotente)
      await supabase
        .from("blocos_conhecimento")
        .delete()
        .eq("agente_id", agentId)
        .eq("tag", c.tag);

      // Insere novo bloco (embedding gerado pelo trigger enfileirar_tarefa_embedding)
      const { error: insErr } = await supabase.from("blocos_conhecimento").insert({
        agente_id: agentId,
        title: `Empresa — ${c.category}`,
        content: textoFinal,
        category: c.category,
        tag: c.tag,
        ativo: true,
        embedding_status: "pendente",
      });

      if (insErr) {
        erros.push(`tenant ${emp.user_id} categoria ${c.category}: ${insErr.message}`);
      } else {
        totalChunksGerados++;
      }
    }
  }

  return jsonResp({
    ok: true,
    duration_ms: Date.now() - t0,
    tenants_processados: empresasFiltradas.length,
    chunks_gerados: totalChunksGerados,
    erros: erros.length > 0 ? erros.slice(0, 20) : undefined,
  });
});

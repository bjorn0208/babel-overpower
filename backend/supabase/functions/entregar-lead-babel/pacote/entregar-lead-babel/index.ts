/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin, criarClienteUsuarioDoRequest } from "../_shared/supabase.ts";

/**
 * entregar-lead-babel — roteia e entrega leads da Babel aos tenants (bloco 6, 2026-09-16).
 *
 * Quem chama: o Admin (app Gerenciador de Leads, botão "Rotear prontos") com o próprio JWT.
 * Só `platform_admin` passa. Pra cada `leads_babel` em status `pronto` da campanha:
 *   1. `rotear_lead_babel` decide o tenant (maior atraso, lock por campanha, motivo gravado).
 *   2. O lead nasce/é achado na conta do tenant por `buscar_ou_criar_conversa` — a mesma
 *      função do webhook Z-API, com `telefones_equivalentes`: se o tenant já falou com
 *      esse número, NÃO duplica (auditoria 16/09 §9). Cópia, não transferência: o lead
 *      da Babel continua na Babel.
 *   3. `leads.origem_lead = 'babel_anuncio'` + tag `origem:babel_anuncio` + a ficha da
 *      qualificação vira fato em `memoria_lead` (o agente do tenant já sabe do que se trata).
 *   4. Aviso na barra do dono: bolha do Mentor numa thread "Leads da Babel".
 * Corpo: { campanha_babel_id?: string, lead_babel_id?: string, limite?: number }.
 */

type Entrega = { lead_babel_id: string; tenant_id: string | null; lead_id: string | null; motivo: string; erro?: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsOk();
  try {
    const usuario = criarClienteUsuarioDoRequest(req);
    if (!usuario) return jsonRes({ ok: false, erro: "nao_autenticado" }, 401);
    const { data: u } = await usuario.auth.getUser();
    if (!u?.user) return jsonRes({ ok: false, erro: "nao_autenticado" }, 401);
    const admin = criarClienteAdmin();
    const { data: perfil } = await admin.from("profiles").select("system_role").eq("id", u.user.id).maybeSingle();
    if (perfil?.system_role !== "platform_admin") return jsonRes({ ok: false, erro: "so_admin" }, 403);

    const corpo = await req.json().catch(() => ({})) as { campanha_babel_id?: string; lead_babel_id?: string; limite?: number };
    const limite = Math.min(Math.max(Number(corpo.limite ?? 50), 1), 200);

    let q = admin.from("leads_babel").select("id, campanha_babel_id, phone, nome, ficha, ctwa_clid")
      .eq("status", "pronto").is("deleted_at", null).order("pronto_em", { ascending: true }).limit(limite);
    if (corpo.lead_babel_id) q = q.eq("id", corpo.lead_babel_id);
    else if (corpo.campanha_babel_id) q = q.eq("campanha_babel_id", corpo.campanha_babel_id);
    const { data: prontos, error } = await q;
    if (error) return jsonRes({ ok: false, erro: error.message }, 500);

    const entregas: Entrega[] = [];
    for (const lead of (prontos ?? []) as Array<Record<string, unknown>>) {
      const leadBabelId = String(lead.id);
      const { data: decisao, error: eRot } = await admin.rpc("rotear_lead_babel", { p_lead_babel_id: leadBabelId });
      const d = (decisao ?? {}) as { ok?: boolean; erro?: string; entrega_id?: string; tenant_id?: string; motivo?: string };
      if (eRot || !d.ok || !d.tenant_id || !d.entrega_id) {
        entregas.push({ lead_babel_id: leadBabelId, tenant_id: null, lead_id: null, motivo: "", erro: eRot?.message ?? d.erro ?? "sem_decisao" });
        continue;
      }
      const entrega = await copiarProTenant(admin, { leadBabel: lead, tenantId: d.tenant_id, entregaId: d.entrega_id, motivo: d.motivo ?? "" });
      entregas.push(entrega);
    }
    return jsonRes({ ok: true, total: entregas.length, entregues: entregas.filter((e) => e.lead_id).length, entregas });
  } catch (e) {
    return jsonRes({ ok: false, erro: (e as Error).message }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function copiarProTenant(admin: any, p: { leadBabel: Record<string, unknown>; tenantId: string; entregaId: string; motivo: string }): Promise<Entrega> {
  const { leadBabel, tenantId, entregaId, motivo } = p;
  const leadBabelId = String(leadBabel.id);
  const telefone = String(leadBabel.phone ?? "");
  const ficha = (leadBabel.ficha ?? {}) as Record<string, unknown>;
  try {
    const { data: agente } = await admin.from("agentes_usuario").select("id").eq("user_id", tenantId)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    const { data: r, error } = await admin.rpc("buscar_ou_criar_conversa", {
      p_phone: telefone, p_tenant_id: tenantId, p_agent_id: agente?.id ?? null, p_channel: "whatsapp", p_first_fase: "saudacao",
    });
    if (error) throw error;
    const conv = (r as { conversation?: { id?: string; lead_id?: string } } | null)?.conversation;
    const leadId = conv?.lead_id ?? null;
    if (!leadId) throw new Error("buscar_ou_criar_conversa sem lead_id");

    // Carimbo de origem + nome, sem apagar o que o tenant já tinha.
    const { data: atual } = await admin.from("leads").select("name, tags, origem_lead").eq("id", leadId).maybeSingle();
    const tags = new Set<string>(Array.isArray(atual?.tags) ? atual.tags : []);
    tags.add("origem:babel_anuncio");
    await admin.from("leads").update({
      origem_lead: atual?.origem_lead ?? "babel_anuncio",
      name: atual?.name ?? (leadBabel.nome as string | null) ?? null,
      tags: [...tags],
      updated_at: new Date().toISOString(),
    }).eq("id", leadId);

    // A qualificação vira memória do lead no tenant — o agente já sabe o que ele quer.
    const resumo = resumirFicha(ficha);
    if (resumo) {
      await admin.from("memoria_lead").insert({
        lead_id: leadId, tenant_id: tenantId, fato: `Veio da Babel (anúncio): ${resumo}`, categoria: "contexto",
        relevancia: "alta", fonte: "babel_gerenciador", escopo: "longo", confianca: 0.9, ativa: true,
      }).then(({ error: e }: { error: { message: string } | null }) => { if (e) console.warn("[entregar-lead-babel] memoria_lead:", e.message); });
    }

    await admin.from("entregas_lead_babel").update({ lead_id: leadId }).eq("id", entregaId);

    await avisarDonoNaBarra(admin, tenantId, `Chegou lead da Babel: ${(leadBabel.nome as string | null) ?? `contato final ${telefone.slice(-4)}`}.` +
      (resumo ? ` Quer: ${resumo.slice(0, 160)}.` : "") + " Já está nas suas conversas — é só chamar.");

    return { lead_babel_id: leadBabelId, tenant_id: tenantId, lead_id: leadId, motivo };
  } catch (e) {
    // A decisão ficou registrada; a cópia falhou. Devolve pra roda com motivo — nada some.
    await admin.rpc("devolver_lead_babel", { p_entrega_id: entregaId, p_motivo: `copia_falhou: ${(e as Error).message}` });
    return { lead_babel_id: leadBabelId, tenant_id: tenantId, lead_id: null, motivo, erro: (e as Error).message };
  }
}

function resumirFicha(ficha: Record<string, unknown>): string {
  const partes: string[] = [];
  for (const [k, v] of Object.entries(ficha)) {
    if (k === "mensagens" || v == null || v === "") continue;
    if (typeof v === "object") continue;
    partes.push(`${k.replace(/_/g, " ")}: ${String(v)}`);
  }
  if (partes.length === 0 && Array.isArray(ficha.mensagens)) {
    const ultima = (ficha.mensagens as Array<{ texto?: string | null }>).map((m) => m?.texto).filter(Boolean).slice(-2).join(" / ");
    if (ultima) partes.push(`disse: "${ultima.slice(0, 200)}"`);
  }
  return partes.join("; ");
}

// deno-lint-ignore no-explicit-any
async function avisarDonoNaBarra(admin: any, tenantId: string, texto: string): Promise<void> {
  try {
    const TITULO = "Leads da Babel";
    let { data: conv } = await admin.from("mentor_conversas").select("id").eq("owner_id", tenantId).eq("canal", "mentor")
      .eq("titulo", TITULO).limit(1).maybeSingle();
    if (!conv) {
      const { data: nova } = await admin.from("mentor_conversas").insert({ owner_id: tenantId, titulo: TITULO, canal: "mentor" }).select("id").single();
      conv = nova;
    }
    if (!conv?.id) return;
    await admin.from("mentor_mensagens").insert({ conversa_id: conv.id, papel: "assistant", conteudo: texto, tool_calls: null });
    await admin.from("mentor_conversas").update({ atualizado_em: new Date().toISOString() }).eq("id", conv.id);
  } catch (e) {
    console.warn("[entregar-lead-babel] aviso na barra falhou:", (e as Error).message);
  }
}

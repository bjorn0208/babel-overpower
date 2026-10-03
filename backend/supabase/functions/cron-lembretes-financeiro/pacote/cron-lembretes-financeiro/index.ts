/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-lembretes-financeiro — varre contas_a_pagar devidas e lembra o tenant via WhatsApp.
//
// Chamada 1×/dia pelo pg_cron (net.http_post + service_role do vault).
// Regras (deterministicas, sem LLM — a conversa fica com o cargo Financeiro):
//   - persistencia 'sem_aviso'   → nunca lembra.
//   - persistencia 'aviso_unico' → 1 lembrete no dia do vencimento (ou 1º dia após).
//   - persistencia 'insistir'    → 1 lembrete por dia até a conta ser quitada.
// O lembrete entra no MESMO histórico do assistente (mentor_conversas canal financeiro)
// e sai via Z-API pro número principal (mais antigo ativo) do tenant.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { conversaFinanceira } from "../_shared/canal-financeiro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const fmtBRL = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

function hojeBRT(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  // Fail-closed: só o pg_cron invoca. Segredo dedicado compartilhado (v3, pós
  // security review): env CRON_FINANCEIRO_TOKEN (edge) == vault
  // `cron_financeiro_token` (lado do cron, header x-cron-token). Sem depender
  // da RLS de tabela alheia nem de geração da service_role key. Env ausente =
  // endpoint fechado (só service_role exata da env passa).
  const tokenCron = req.headers.get("x-cron-token") ?? "";
  const esperado = Deno.env.get("CRON_FINANCEIRO_TOKEN") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const autorizado = (esperado.length >= 32 && tokenCron === esperado) || bearer === SERVICE_KEY;
  if (!autorizado) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const hoje = hojeBRT();
  let enviados = 0, pulados = 0, erros = 0;

  try {
    const { data: contas } = await supabase
      .from("contas_a_pagar")
      .select("id, tenant_id, titulo, valor_total, parcelas_total, parcelas_pagas, proximo_vencimento, persistencia, ultimo_lembrete_em")
      .eq("status", "aberta")
      .is("deleted_at", null)
      .neq("persistencia", "sem_aviso")
      .lte("proximo_vencimento", hoje)
      .limit(500);

    for (const conta of contas ?? []) {
      try {
        // Anti-spam: no máximo 1 lembrete por dia; aviso_unico = só o primeiro.
        const ultimoDia = conta.ultimo_lembrete_em
          ? new Date(new Date(conta.ultimo_lembrete_em as string).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : null;
        if (ultimoDia === hoje) { pulados++; continue; }
        if (conta.persistencia === "aviso_unico" && conta.ultimo_lembrete_em) { pulados++; continue; }

        // Portão geral + número principal do tenant
        const { data: cfg } = await supabase
          .from("financeiro_config_tenant")
          .select("ativo")
          .eq("tenant_id", conta.tenant_id)
          .eq("ativo", true)
          .maybeSingle();
        if (!cfg?.ativo) { pulados++; continue; }
        const { data: numero } = await supabase
          .from("financeiro_numeros_autorizados")
          .select("numero, rotulo")
          .eq("tenant_id", conta.tenant_id)
          .eq("ativo", true)
          .order("criado_em", { ascending: true })
          .limit(1)
          .maybeSingle();
        const { data: canal } = await supabase
          .from("canais")
          .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
          .eq("user_id", conta.tenant_id)
          .eq("type", "whatsapp") // blindagem: tenant pode ter canal instagram ativo na mesma tabela
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (!numero?.numero || !canal?.zapi_instance_id || !canal?.zapi_token) { pulados++; continue; }

        // Mensagem simples em pt-BR (parcela atual quando é dívida parcelada)
        const parcelasTotal = Number(conta.parcelas_total) || 1;
        const valorParcela = Number(conta.valor_total) / parcelasTotal;
        const pedaco = parcelasTotal > 1
          ? `parcela ${Math.min(Number(conta.parcelas_pagas) + 1, parcelasTotal)}/${parcelasTotal} de ${fmtBRL(valorParcela)}`
          : fmtBRL(Number(conta.valor_total));
        const venceu = String(conta.proximo_vencimento) < hoje;
        const texto =
          `Lembrete: a conta "${conta.titulo}" (${pedaco}) ${venceu ? "venceu e segue em aberto" : "vence hoje"}. ` +
          `Já pagou? Me manda o comprovante que eu registro. ` +
          `Se negociou outra data, me fala o dia que eu reagendo o lembrete.`;

        // Histórico + WhatsApp (conversa da pessoa que recebe o lembrete)
        const conversaId = await conversaFinanceira(
          supabase,
          conta.tenant_id as string,
          numero.numero as string,
          (numero.rotulo as string | null) ?? null,
        );
        if (conversaId) {
          await supabase.from("mentor_mensagens").insert({
            conversa_id: conversaId,
            papel: "assistant",
            conteudo: texto,
          });
        }
        const zapiBase = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
        const envio = await fetch(`${zapiBase}/send-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" },
          body: JSON.stringify({ phone: numero.numero, message: texto }),
        });
        if (!envio.ok) throw new Error(`zapi ${envio.status}`);

        await supabase
          .from("contas_a_pagar")
          .update({ ultimo_lembrete_em: new Date().toISOString() })
          .eq("id", conta.id);
        enviados++;
      } catch (e) {
        erros++;
        console.error("[lembrete-financeiro] conta", conta.id, (e as Error).message);
      }
    }

    return new Response(JSON.stringify({ ok: true, enviados, pulados, erros }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[lembrete-financeiro] fatal:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});

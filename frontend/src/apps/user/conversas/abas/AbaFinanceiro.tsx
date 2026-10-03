/**
 * Aba "Financeiro" — contratos · pagamentos · comprovantes · link público de acompanhamento.
 *
 * Fontes reais (Onda B):
 *  - contratos (titulo, valor, parcelas, status, chave_publica)
 *  - pagamentos (valor, data, metodo, status, comprovante_url)
 *  - documentos_cliente (comprovantes anexos)
 *  - log_acesso_contrato (último acesso público)
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { duration, easing, fadeSlideIn, stagger, staggerItem, tapPress } from "@/os/motion/presets";
import type { Conversa, Contrato, Pagamento } from "../tipos";
import { enriquecerDossieViaRPC, type DossieEnriquecido } from "../hooks/useConversasLive";
import { urlContrato } from "@/lib/url-app";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/bundle/bundle-shared";

// Cast bruto: tabelas fora dos types gerados (mesmo padrão de acoes-cliente.ts).
// deno-lint-ignore no-explicit-any
type SupabaseBruto = any;

interface AbaFinanceiroProps {
  conversa: Conversa;
  /** UUID real da conversa quando `conversa.id` é mock. Onda 2026-05-14. */
  conversaIdOverride?: string | null;
}

/**
 * Mapeia contratos do RPC fn_dossie_lead_consolidado pro shape `Contrato` da UI.
 * Status do RPC ('emitido'/'assinado'/'pago'/'cancelado'/etc) → status da UI
 * (ativo|atrasado|concluido|rascunho). Valor e parcelas não vêm no RPC; UI mostra "—".
 * Onda 2026-05-14.
 */
function rpcParaContrato(item: Record<string, unknown>): Contrato {
  const statusRpc = String(item.status ?? "rascunho");
  const status: Contrato["status"] =
    statusRpc === "pago" || statusRpc === "concluido"
      ? "concluido"
      : statusRpc === "atrasado"
        ? "atrasado"
        : statusRpc === "assinado" || statusRpc === "emitido" || statusRpc === "ativo"
          ? "ativo"
          : "rascunho";
  return {
    id: String(item.id),
    titulo: String(item.titulo ?? "Contrato"),
    valor_total: 0,
    parcelas_pagas: 0,
    parcelas_total: 0,
    status,
    chave_publica: typeof item.chave_publica === "string" ? item.chave_publica : undefined,
    data_assinatura: typeof item.assinado_em === "string" ? item.assinado_em : undefined,
  };
}

const COR_STATUS_CONTRATO: Record<Contrato["status"], string> = {
  ativo: "oklch(0.72 0.18 145)",
  atrasado: "oklch(0.65 0.24 25)",
  concluido: "oklch(0.7 0.18 220)",
  rascunho: "var(--txt-3)",
};

const COR_STATUS_PAGAMENTO: Record<Pagamento["status"], string> = {
  pago: "oklch(0.72 0.18 145)",
  pendente: "oklch(0.82 0.18 80)",
  atrasado: "oklch(0.65 0.24 25)",
};

function formatarBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}

export function AbaFinanceiro({ conversa, conversaIdOverride }: AbaFinanceiroProps) {
  const t = useToast();
  // Modelos de contrato do tenant (2026-08-19): gera contrato do template e
  // copia o link de assinatura pra mandar manualmente no chat.
  const [modelos, setModelos] = useState<Array<{ id: string; nome: string }>>([]);
  const [gerandoModelo, setGerandoModelo] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: ses } = await supabase.auth.getSession();
      const uid = ses?.session?.user?.id;
      if (!uid) return;
      const { data } = await (supabase as SupabaseBruto)
        .from("contratos_template")
        .select("id, nome")
        .eq("ativo", true)
        .eq("user_id", uid)
        .order("nome");
      if (vivo && Array.isArray(data)) setModelos(data);
    })();
    return () => { vivo = false; };
  }, []);

  const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const [dossie, setDossie] = useState<DossieEnriquecido | null>(null);
  const convIdEfetivo = conversaIdOverride ?? conversa.id;

  const gerarLinkModelo = async (modelo: { id: string; nome: string }) => {
    setGerandoModelo(modelo.id);
    const { data, error } = await (supabase as SupabaseBruto)
      .rpc("criar_contrato_livre_de_template", { p_template_id: modelo.id });
    setGerandoModelo(null);
    if (error || !data?.[0]?.chave_publica) {
      t.error("Não consegui gerar o contrato");
      return;
    }
    const chave = String(data[0].chave_publica);
    // Vincula o contrato ao lead DESTA conversa — o link vira individual e fica
    // listado na seção Contratos acima, copiável sempre que precisar.
    const leadId = conversa.lead?.id;
    if (leadId && EH_UUID.test(leadId)) {
      await (supabase as SupabaseBruto)
        .from("contratos")
        .update({ lead_id: leadId })
        .eq("chave_publica", chave);
      const d = await enriquecerDossieViaRPC(leadId, convIdEfetivo);
      if (d) setDossie(d);
    }
    try {
      await navigator.clipboard.writeText(urlContrato(chave));
      t.success(`Link do "${modelo.nome}" deste lead copiado — cola no chat`);
    } catch {
      t.success("Contrato gerado (veja na lista de contratos)");
    }
  };
  // Onda 2026-05-14 — RPC consolidado tem `contratos`. Quando vier preenchido, mostra.
  // Senão cai no `conversa.contratos` (preenchido só em fluxos legados — vazio em ChatTeste).
  useEffect(() => {
    let ativo = true;
    const leadId = conversa.lead?.id;
    if (!leadId) return;
    enriquecerDossieViaRPC(leadId, convIdEfetivo).then((d) => {
      if (ativo && d) setDossie(d);
    });
    return () => { ativo = false; };
  }, [conversa.lead?.id, convIdEfetivo, conversa.mente.atualizado_em]);

  const contratos = useMemo<Contrato[]>(() => {
    const doRpc = (dossie?.contratos ?? []).map(rpcParaContrato);
    return doRpc.length > 0 ? doRpc : conversa.contratos;
  }, [dossie?.contratos, conversa.contratos]);
  // Pagamentos não vêm no RPC ainda — quando entrarem, mesma estratégia.
  const pagamentos: Pagamento[] = conversa.pagamentos;

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", gap: 18, padding: "16px 18px" }}
    >
      <section aria-label="Contratos">
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Contratos ({contratos.length})
        </div>
        {contratos.length === 0 ? (
          <span className="muted tiny">Sem contratos registrados.</span>
        ) : (
          <motion.div
            variants={stagger(0.04, 0.02)}
            initial="hidden"
            animate="visible"
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {contratos.map((c) => {
              const pct = c.parcelas_total > 0 ? (c.parcelas_pagas / c.parcelas_total) * 100 : 0;
              const cor = COR_STATUS_CONTRATO[c.status];
              return (
                <motion.article
                  key={c.id}
                  variants={staggerItem}
                  className="os-vidro"
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.titulo}</div>
                      <div className="muted tiny" style={{ marginTop: 2 }}>
                        {formatarBRL(c.valor_total)} · assinado {c.data_assinatura ? formatarData(c.data_assinatura) : "—"}
                      </div>
                    </div>
                    <span
                      className="badge mono tiny"
                      style={{
                        color: cor,
                        borderColor: cor,
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: `1px solid ${cor}`,
                        background: "transparent",
                      }}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${c.parcelas_pagas} de ${c.parcelas_total} parcelas pagas`}
                    style={{
                      marginTop: 10,
                      height: 4,
                      borderRadius: 2,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: cor,
                        transition: "width 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                    />
                  </div>
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                    <span className="mono tiny">{c.parcelas_pagas} / {c.parcelas_total} parcelas</span>
                    {c.chave_publica && (
                      <motion.button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "2px 8px", fontSize: 11 }}
                        whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
                        whileTap={tapPress}
                        onClick={() => {
                          navigator.clipboard
                            .writeText(urlContrato(c.chave_publica ?? ""))
                            .then(() => t.success("Link de assinatura do contrato copiado"))
                            .catch(() => t.error("Falha ao copiar o link"));
                        }}
                        aria-label={`Copiar link de assinatura do contrato ${c.titulo}`}
                      >
                        🔗 Link do contrato
                      </motion.button>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        )}
      </section>

      {modelos.length > 0 && (
        <section aria-label="Modelos de contrato">
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            Modelos de contrato ({modelos.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {modelos.map((m) => (
              <div
                key={m.id}
                className="os-vidro row"
                style={{ justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nome}</span>
                <motion.button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "3px 10px", fontSize: 11, whiteSpace: "nowrap" }}
                  disabled={gerandoModelo === m.id}
                  whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
                  whileTap={tapPress}
                  onClick={() => void gerarLinkModelo(m)}
                >
                  {gerandoModelo === m.id ? "Gerando…" : "🔗 Gerar link e copiar"}
                </motion.button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Pagamentos">
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Pagamentos ({pagamentos.length})
        </div>
        {pagamentos.length === 0 ? (
          <span className="muted tiny">Sem pagamentos registrados.</span>
        ) : (
          <motion.ul
            variants={stagger(0.03, 0.02)}
            initial="hidden"
            animate="visible"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}
          >
            {pagamentos.map((p) => {
              const cor = COR_STATUS_PAGAMENTO[p.status];
              return (
                <motion.li
                  key={p.id}
                  variants={staggerItem}
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: cor,
                        boxShadow: `0 0 6px ${cor}/0.6`,
                      }}
                    />
                    <span className="mono small">{formatarBRL(p.valor)}</span>
                    <span className="muted tiny">{p.metodo.toUpperCase()}</span>
                  </div>
                  <span className="muted tiny mono">{formatarData(p.data)}</span>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </section>
    </motion.div>
  );
}

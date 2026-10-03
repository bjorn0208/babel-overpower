/**
 * Seção Recargas — lista de recargas pendentes de aprovação.
 * Mostra: aguardando + comprovante_enviado. Ações: aprovar / recusar.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { inputStyle } from "./tipos";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { Vazio, BotaoIcone, BadgeStatus } from "./ui-admin";
import { ModalComprovante } from "./modal-comprovante";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, pegarToast } from "./tipos";
import type { Recarga, SupabaseBruto } from "./tipos";

interface Props {
  recargas: Recarga[];
  onMudou: () => void;
}

export function SecaoRecargas({ recargas, onMudou }: Props) {
  const t = pegarToast();

  const pendentes = recargas.filter(
    (r) => r.status === "aguardando" || r.status === "comprovante_enviado",
  );

  const [tenantSel, setTenantSel] = useState("");
  const [valorCredito, setValorCredito] = useState("");
  const [creditando, setCreditando] = useState(false);
  const [tenantsLista, setTenantsLista] = useState<Array<{ id: string; rotulo: string }>>([]);
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase as SupabaseBruto;
      const { data } = await sb
        .from("profiles")
        .select("id, full_name, email")
        .eq("system_role", "user")
        .order("email", { ascending: true });
      setTenantsLista(
        ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
          .map((p) => ({ id: p.id, rotulo: p.full_name ? `${p.full_name} (${p.email ?? ""})` : (p.email ?? p.id.slice(0, 8)) })),
      );
    })();
  }, []);

  async function creditarSaldo() {
    const valor = Number(valorCredito.replace(",", "."));
    if (!tenantSel) { t.error("Selecione um tenant."); return; }
    if (isNaN(valor) || valor <= 0) { t.error("Valor inválido."); return; }
    setCreditando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb.rpc("creditar_saldo_admin", {
        p_tenant_id: tenantSel, p_valor: valor, p_motivo: "Crédito manual pelo admin",
      });
      if (error) throw error;
      if (data && data.ok === false) { t.error("Não foi possível creditar: " + (data.erro ?? "")); return; }
      t.success(`Saldo creditado. Novo saldo: R$ ${Number(data?.saldo_apos ?? 0).toFixed(2)}`);
      setTenantSel(""); setValorCredito("");
      onMudou();
    } catch {
      t.error("Falha ao creditar saldo.");
    } finally {
      setCreditando(false);
    }
  }

  async function aprovar(id: string) {
    if (!window.confirm("Aprovar essa recarga? O saldo será creditado na carteira do tenant.")) return;
    try {
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb.rpc("aprovar_recarga", { p_recarga_id: id });
      if (error) throw error;
      if (data && data.ok === false) {
        t.error("Não foi possível aprovar: " + (data.erro ?? "erro desconhecido"));
        return;
      }
      t.success("Recarga aprovada. Saldo creditado.");
      onMudou();
    } catch {
      t.error("Falha ao aprovar recarga.");
    }
  }

  async function recusar(id: string) {
    if (!window.confirm("Recusar essa recarga? O tenant será notificado.")) return;
    try {
      const sb = supabase as SupabaseBruto;
      // Não há RPC de admin pra recusar (só `aprovar_recarga`). O UPDATE direto
      // depende de policy de escrita — a tabela só tem escrita do tenant dono da
      // recarga, então o admin costuma afetar 0 linhas sem erro. `.select()` +
      // checagem de linhas evita o toast de sucesso falso.
      const { data, error } = await sb
        .from("consultas_recargas")
        .update({ status: "recusado" })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        t.error("Não foi possível recusar: sem permissão de escrita nesta recarga.");
        return;
      }
      t.success("Recarga recusada.");
      onMudou();
    } catch {
      t.error("Falha ao recusar recarga.");
    }
  }

  function nomeTenant(r: Recarga): string {
    return r.tenant?.full_name ?? r.tenant_id.slice(0, 8) + "…";
  }

  function dataFormatada(iso: string): string {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" style={{ padding: 4 }}>
      {/* Creditar saldo manual */}
      <div style={{ marginBottom: 18, padding: 16, background: "oklch(0.18 0.06 280 / 0.4)", border: "1px solid oklch(0.7 0.18 145 / 0.25)", borderRadius: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0)", marginBottom: 4 }}>Creditar saldo a um tenant</div>
        <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", marginBottom: 12 }}>Crédito manual direto na carteira (sem PIX/recarga) — registrado no extrato.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 240px" }}>
            <select style={{ ...inputStyle, appearance: "auto" }} value={tenantSel} onChange={(e) => setTenantSel(e.target.value)}>
              <option value="">— escolher tenant —</option>
              {tenantsLista.map((tn) => <option key={tn.id} value={tn.id}>{tn.rotulo}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <input style={inputStyle} type="number" min={0} step="0.01" value={valorCredito} onChange={(e) => setValorCredito(e.target.value)} placeholder="R$ valor" />
          </div>
          <motion.button type="button" whileTap={tapPress} onClick={() => void creditarSaldo()} disabled={creditando}
            style={{ padding: "9px 18px", fontSize: 12, fontWeight: 600, background: "oklch(0.7 0.18 145 / 0.25)", color: "oklch(0.85 0.18 145)", border: "1px solid oklch(0.7 0.18 145 / 0.4)", borderRadius: 10, cursor: creditando ? "not-allowed" : "pointer" }}>
            {creditando ? "Creditando…" : "Creditar"}
          </motion.button>
        </div>
      </div>

      {/* Cabeçalho */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
          Recargas pendentes
        </div>
        <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 3 }}>
          Recargas aguardando comprovante ou aguardando aprovação do pagamento via PIX.
        </div>
      </div>

      {/* Contador */}
      {pendentes.length > 0 && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            marginBottom: 14,
            background: "oklch(0.78 0.18 80 / 0.1)",
            border: "1px solid oklch(0.78 0.18 80 / 0.3)",
            borderRadius: 999,
            fontSize: 11,
            color: "oklch(0.78 0.18 80)",
            fontWeight: 600,
          }}
        >
          {pendentes.length} {pendentes.length === 1 ? "recarga pendente" : "recargas pendentes"}
        </div>
      )}

      {/* Lista */}
      {pendentes.length === 0 ? (
        <Vazio mensagem="Nenhuma recarga pendente de aprovação." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pendentes.map((r) => (
            <motion.div
              key={r.id}
              layout
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: "oklch(0.18 0.06 280 / 0.4)",
                border: "1px solid oklch(0.98 0 0 / 0.06)",
                borderRadius: 12,
              }}
            >
              {/* Avatar do tenant */}
              {r.tenant?.avatar_url ? (
                <img
                  src={r.tenant.avatar_url}
                  alt={nomeTenant(r)}
                  style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid oklch(0.98 0 0 / 0.1)" }}
                />
              ) : (
                <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "oklch(0.7 0.18 220 / 0.2)", color: "oklch(0.85 0.12 220)", fontSize: 15, fontWeight: 700, border: "1px solid oklch(0.98 0 0 / 0.1)" }}>
                  {nomeTenant(r).charAt(0).toUpperCase()}
                </div>
              )}

              {/* Info principal */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "oklch(0.98 0 0)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {nomeTenant(r)}
                  </span>
                  <BadgeStatus status={r.status} />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 4,
                    fontSize: 11,
                    color: "oklch(0.98 0 0 / 0.5)",
                  }}
                >
                  <span>{dataFormatada(r.created_at)}</span>
                  <span>•</span>
                  <span>
                    Paga{" "}
                    <strong style={{ color: "oklch(0.98 0 0 / 0.8)", fontFamily: "ui-monospace, monospace" }}>
                      {formatBRL(r.valor)}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Crédito{" "}
                    <strong style={{ color: "oklch(0.72 0.18 145)", fontFamily: "ui-monospace, monospace" }}>
                      {formatBRL(r.credito)}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {r.url_comprovante && (
                  <BotaoIcone
                    onClick={() => setComprovanteUrl(r.url_comprovante!)}
                    titulo="Ver comprovante"
                  >
                    <ExternalLink size={13} />
                  </BotaoIcone>
                )}
                <BotaoIcone
                  onClick={() => aprovar(r.id)}
                  titulo="Aprovar recarga"
                  desabilitado={r.status === "aguardando"}
                >
                  <CheckCircle size={15} style={{ color: "oklch(0.72 0.18 145)" }} />
                </BotaoIcone>
                <BotaoIcone onClick={() => recusar(r.id)} titulo="Recusar recarga" perigo>
                  <XCircle size={15} />
                </BotaoIcone>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Nota sobre aprovação */}
      {pendentes.some((r) => r.status === "aguardando") && (
        <div
          style={{
            marginTop: 14,
            padding: "8px 12px",
            background: "oklch(0.98 0 0 / 0.03)",
            border: "1px solid oklch(0.98 0 0 / 0.06)",
            borderRadius: 8,
            fontSize: 10,
            color: "oklch(0.98 0 0 / 0.4)",
          }}
        >
          Recargas com status "Aguardando" ainda não têm comprovante enviado — o botão de aprovar fica
          desabilitado até o tenant enviar o comprovante.
        </div>
      )}

      {/* Modal do comprovante */}
      <ModalComprovante url={comprovanteUrl} onClose={() => setComprovanteUrl(null)} />
    </motion.div>
  );
}

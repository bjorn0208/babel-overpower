/**
 * Aba Configurações — toggle geral + lista de números autorizados (com rótulo).
 * Qualquer número da lista fala com o assistente financeiro; o rótulo carimba
 * a autoria dos lançamentos (controle de quem da equipe enviou).
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { inputStyle, type SupabaseBruto, type ToastApi } from "./tipos";

type NumeroAutorizado = { id: string; numero: string; rotulo: string | null };

type Props = { ownerId: string | null; t: ToastApi };

export function AbaConfig({ ownerId, t }: Props) {
  const [ativo, setAtivo] = useState(false);
  const [numeros, setNumeros] = useState<NumeroAutorizado[]>([]);
  const [novoNumero, setNovoNumero] = useState("");
  const [novoRotulo, setNovoRotulo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!ownerId) return;
    const sb = supabase as SupabaseBruto;
    const [{ data: cfg }, { data: nums }] = await Promise.all([
      sb.from("financeiro_config_tenant").select("ativo").eq("tenant_id", ownerId).maybeSingle(),
      sb.from("financeiro_numeros_autorizados").select("id, numero, rotulo")
        .eq("tenant_id", ownerId).eq("ativo", true).order("criado_em"),
    ]);
    setAtivo(!!cfg?.ativo);
    setNumeros((nums ?? []) as NumeroAutorizado[]);
  }, [ownerId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const salvarToggle = async (novo: boolean) => {
    if (!ownerId) return;
    setAtivo(novo);
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("financeiro_config_tenant")
      .upsert({ tenant_id: ownerId, ativo: novo }, { onConflict: "tenant_id" });
    if (error) { t.error("Falha ao salvar."); setAtivo(!novo); return; }
    t.success(novo ? "Assistente financeiro ligado." : "Assistente financeiro desligado.");
  };

  const adicionar = async () => {
    if (!ownerId) return;
    const digitos = novoNumero.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 15) {
      t.error("Número inválido — use DDI+DDD+número, ex: 5511999998888.");
      return;
    }
    setOcupado(true);
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("financeiro_numeros_autorizados").insert({
      tenant_id: ownerId,
      numero: digitos,
      rotulo: novoRotulo.trim() || null,
    });
    setOcupado(false);
    if (error) {
      t.error(/uk_financeiro_numeros_ativo|duplicate/i.test(String(error.message))
        ? "Esse número já está autorizado (aqui ou em outra conta)."
        : "Falha ao adicionar o número.");
      return;
    }
    setNovoNumero("");
    setNovoRotulo("");
    t.success("Número autorizado.");
    void carregar();
  };

  const remover = async (n: NumeroAutorizado) => {
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("financeiro_numeros_autorizados").delete().eq("id", n.id);
    if (error) { t.error("Falha ao remover."); return; }
    t.success(`Número ${n.rotulo || n.numero} removido.`);
    void carregar();
  };

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden" style={{ maxWidth: 520 }}>
      <p style={{ fontSize: 13, color: "oklch(0.98 0 0 / 0.7)", lineHeight: 1.6, marginBottom: 16 }}>
        Autorize os números de WhatsApp que podem falar com o assistente financeiro
        (você, sócio, equipe). Quem mandar mensagem pro número da empresa a partir de um
        deles cai direto no assistente: comprovantes, extratos e gastos viram lançamentos,
        e o <strong style={{ color: "oklch(0.98 0 0)" }}>rótulo identifica quem enviou</strong>.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, cursor: "pointer" }}>
        <input type="checkbox" checked={ativo} onChange={(e) => void salvarToggle(e.target.checked)} />
        <span style={{ fontSize: 13, color: "oklch(0.98 0 0)" }}>Assistente financeiro ligado</span>
      </label>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input style={{ ...inputStyle, flex: 1 }} value={novoNumero} inputMode="numeric" maxLength={15}
          onChange={(e) => setNovoNumero(e.target.value.replace(/[^\d]/g, ""))} placeholder="5511999998888" />
        <input style={{ ...inputStyle, flex: 1 }} value={novoRotulo} maxLength={40}
          onChange={(e) => setNovoRotulo(e.target.value)} placeholder="Rótulo (ex: Theus, sócio)" />
        <motion.button whileTap={tapPress} type="button" disabled={ocupado} onClick={() => void adicionar()}
          style={{
            padding: "8px 16px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
            color: "oklch(0.98 0 0)", borderRadius: 10, cursor: ocupado ? "wait" : "pointer",
            border: "1px solid oklch(0.7 0.18 220 / 0.4)",
            background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))",
            opacity: ocupado ? 0.6 : 1,
          }}>
          + Adicionar
        </motion.button>
      </div>

      {numeros.length === 0 ? (
        <p style={{ fontSize: 12, color: "oklch(0.98 0 0 / 0.45)" }}>
          Nenhum número autorizado ainda — o assistente só responde números desta lista.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {numeros.map((n) => (
            <div key={n.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
              borderRadius: 10, background: "oklch(0.18 0.06 280 / 0.25)",
              border: "1px solid oklch(0.98 0 0 / 0.06)",
            }}>
              <span style={{ fontSize: 13, color: "oklch(0.98 0 0)", fontVariantNumeric: "tabular-nums" }}>
                {n.numero}
              </span>
              {n.rotulo && (
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 999,
                  color: "oklch(0.7 0.18 220)", background: "oklch(0.7 0.18 220 / 0.15)",
                }}>
                  {n.rotulo}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <motion.button whileTap={tapPress} type="button" onClick={() => void remover(n)}
                style={{
                  fontSize: 10, padding: "4px 8px", borderRadius: 8, cursor: "pointer",
                  border: "1px solid oklch(0.98 0 0 / 0.1)", background: "transparent",
                  color: "oklch(0.65 0.24 25)",
                }}>
                remover
              </motion.button>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.45)", lineHeight: 1.5, marginTop: 16 }}>
        Atenção: número autorizado deixa de ser tratado como conversa de cliente — vira
        conversa privada com o agente financeiro.
      </p>
    </motion.div>
  );
}

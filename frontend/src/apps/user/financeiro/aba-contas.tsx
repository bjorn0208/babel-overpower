/**
 * Aba Contas — pagamentos por fazer (conta simples ou dívida parcelada).
 * Cadastro com nível de lembrete em linguagem simples, marcar parcela paga
 * (gera saída no caixa) e excluir. O agente cobra via WhatsApp conforme o nível.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { parseMoedaBR } from "@/lib/moeda";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { formatBRL, inputStyle, type SupabaseBruto, type ToastApi } from "./tipos";

type Conta = {
  id: string;
  titulo: string;
  valor_total: number;
  parcelas_total: number;
  parcelas_pagas: number;
  proximo_vencimento: string | null;
  persistencia: "sem_aviso" | "aviso_unico" | "insistir";
  status: string;
};

const ROTULO_AVISO: Record<Conta["persistencia"], string> = {
  sem_aviso: "Sem aviso",
  aviso_unico: "Avisa 1 vez",
  insistir: "Insiste até pagar",
};

type Props = { ownerId: string | null; t: ToastApi };

export function AbaContas({ ownerId, t }: Props) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [pagando, setPagando] = useState<string | null>(null);
  const [form, setForm] = useState({ titulo: "", valor: "", parcelas: "1", vencimento: "", persistencia: "aviso_unico" });

  const carregar = useCallback(async () => {
    if (!ownerId) return;
    const sb = supabase as SupabaseBruto;
    const { data, error } = await sb
      .from("contas_a_pagar")
      .select("id, titulo, valor_total, parcelas_total, parcelas_pagas, proximo_vencimento, persistencia, status")
      .eq("tenant_id", ownerId)
      .eq("status", "aberta")
      .is("deleted_at", null)
      .order("proximo_vencimento", { ascending: true });
    if (error) { t.error("Falha ao carregar as contas."); return; }
    setContas((data ?? []) as Conta[]);
  }, [ownerId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const cadastrar = async () => {
    if (!ownerId) return;
    const valor = parseMoedaBR(form.valor);
    const parcelas = Math.max(1, Math.trunc(Number(form.parcelas) || 1));
    if (!form.titulo.trim()) { t.error("Dê um nome pra conta."); return; }
    if (!Number.isFinite(valor) || valor <= 0) { t.error("Valor inválido."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.vencimento)) { t.error("Escolha o vencimento."); return; }
    setOcupado(true);
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("contas_a_pagar").insert({
      tenant_id: ownerId,
      titulo: form.titulo.trim().slice(0, 120),
      valor_total: valor,
      parcelas_total: parcelas,
      proximo_vencimento: form.vencimento,
      persistencia: form.persistencia,
    });
    setOcupado(false);
    if (error) { t.error("Falha ao cadastrar a conta."); return; }
    setCriando(false);
    setForm({ titulo: "", valor: "", parcelas: "1", vencimento: "", persistencia: "aviso_unico" });
    t.success("Conta cadastrada — o agente acompanha conforme o aviso escolhido.");
    void carregar();
  };

  // Mesma regra da tool do agente: lança a saída no caixa e avança a parcela.
  const marcarPaga = async (c: Conta) => {
    if (pagando !== c.id) { setPagando(c.id); return; }
    setPagando(null);
    const sb = supabase as SupabaseBruto;
    const parcelasTotal = Number(c.parcelas_total) || 1;
    const totalConta = Number(c.valor_total);
    const pagasNovo = Math.min(c.parcelas_pagas + 1, c.parcelas_total);
    const quitou = pagasNovo >= c.parcelas_total;
    // Arredonda a parcela pra 2 casas; a ÚLTIMA fecha o total exato
    // (evita que a soma das parcelas fique com sobra/falta de centavos).
    const parcelaBase = Math.round((totalConta / parcelasTotal) * 100) / 100;
    const valorParcela = quitou
      ? Math.round((totalConta - parcelaBase * (parcelasTotal - 1)) * 100) / 100
      : parcelaBase;
    const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { error: movErr } = await sb.from("movimentos_financeiros").insert({
      owner_id: ownerId,
      tipo: "saida",
      valor: valorParcela,
      descricao: `${c.titulo}${c.parcelas_total > 1 ? ` — parcela ${pagasNovo}/${c.parcelas_total}` : ""}`,
      categoria: "contas",
      data_movimento: hoje,
      origem: "manual",
      conta_id: c.id,
      carga: {},
    });
    if (movErr) { t.error("Falha ao lançar o pagamento."); return; }
    const proximo = c.proximo_vencimento
      ? new Date(Date.UTC(
          Number(c.proximo_vencimento.slice(0, 4)),
          Number(c.proximo_vencimento.slice(5, 7)),
          Math.min(Number(c.proximo_vencimento.slice(8, 10)), 28),
        )).toISOString().slice(0, 10)
      : null;
    const { error } = await sb.from("contas_a_pagar")
      .update(quitou
        ? { parcelas_pagas: pagasNovo, status: "quitada" }
        : { parcelas_pagas: pagasNovo, proximo_vencimento: proximo, ultimo_lembrete_em: null })
      .eq("id", c.id);
    if (error) { t.error("Pagamento lançado, mas falhou atualizar a conta."); return; }
    t.success(quitou ? `Conta "${c.titulo}" quitada!` : "Parcela paga e lançada no caixa.");
    void carregar();
  };

  const excluir = async (c: Conta) => {
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("contas_a_pagar")
      .update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { t.error("Falha ao excluir."); return; }
    t.success("Conta excluída.");
    void carregar();
  };

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden">
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: "oklch(0.98 0 0 / 0.6)", margin: 0 }}>
          O que você tem pra pagar. O agente lembra no WhatsApp conforme o aviso de cada conta.
        </p>
        <div style={{ flex: 1 }} />
        <motion.button whileTap={tapPress} type="button" onClick={() => setCriando(!criando)} style={botaoPrimario}>
          {criando ? "fechar" : "+ Nova conta"}
        </motion.button>
      </div>

      {criando && (
        <div style={{ ...moldura, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={inputStyle} value={form.titulo} maxLength={120} placeholder="Nome (ex: aluguel, fornecedor X)"
            onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input style={{ ...inputStyle, width: 130 }} value={form.valor} inputMode="decimal" placeholder="Valor total"
              onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            <input style={{ ...inputStyle, width: 110 }} value={form.parcelas} inputMode="numeric" placeholder="Parcelas"
              onChange={(e) => setForm({ ...form, parcelas: e.target.value.replace(/\D/g, "") })} />
            <input type="date" style={{ ...inputStyle, width: 150 }} value={form.vencimento}
              onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
            <select style={{ ...inputStyle, width: 170 }} value={form.persistencia}
              onChange={(e) => setForm({ ...form, persistencia: e.target.value })}>
              <option value="sem_aviso">Sem aviso</option>
              <option value="aviso_unico">Avisa 1 vez no vencimento</option>
              <option value="insistir">Insiste até pagar</option>
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <motion.button whileTap={tapPress} type="button" disabled={ocupado} onClick={() => void cadastrar()}
              style={{ ...botaoPrimario, opacity: ocupado ? 0.6 : 1 }}>
              {ocupado ? "salvando…" : "salvar"}
            </motion.button>
          </div>
        </div>
      )}

      {contas.length === 0 && !criando ? (
        <div style={vazio}>Nenhuma conta aberta. Cadastre aqui ou fale com o agente: "anota uma conta de 300 pro dia 15".</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {contas.map((c) => {
            const pt = Number(c.parcelas_total) || 1;
            const armado = pagando === c.id;
            return (
              <div key={c.id} style={{ ...moldura, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "oklch(0.98 0 0)" }}>{c.titulo}</div>
                  <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 2 }}>
                    {pt > 1
                      ? `parcela ${Math.min(c.parcelas_pagas + 1, pt)}/${pt} de ${formatBRL(Number(c.valor_total) / pt)}`
                      : formatBRL(Number(c.valor_total))}
                    {c.proximo_vencimento ? ` · vence ${c.proximo_vencimento.split("-").reverse().join("/")}` : ""}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 999,
                  color: c.persistencia === "insistir" ? "oklch(0.78 0.18 80)" : "oklch(0.7 0.18 220)",
                  background: c.persistencia === "insistir" ? "oklch(0.78 0.18 80 / 0.15)" : "oklch(0.7 0.18 220 / 0.12)",
                }}>
                  {ROTULO_AVISO[c.persistencia]}
                </span>
                <motion.button whileTap={tapPress} type="button" onClick={() => void marcarPaga(c)}
                  style={{ ...botaoAcao, color: armado ? "oklch(0.72 0.18 145)" : "oklch(0.98 0 0 / 0.55)" }}>
                  {armado ? "confirmar?" : "marcar paga"}
                </motion.button>
                <motion.button whileTap={tapPress} type="button" onClick={() => void excluir(c)}
                  style={{ ...botaoAcao, color: "oklch(0.65 0.24 25)" }}>
                  excluir
                </motion.button>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

const moldura: React.CSSProperties = {
  padding: "11px 14px", borderRadius: 10,
  background: "oklch(0.18 0.06 280 / 0.25)", border: "1px solid oklch(0.98 0 0 / 0.06)",
};
const vazio: React.CSSProperties = {
  padding: "36px 0", textAlign: "center", color: "oklch(0.98 0 0 / 0.45)", fontSize: 13,
};
const botaoPrimario: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 10, cursor: "pointer",
  color: "oklch(0.98 0 0)", border: "1px solid oklch(0.7 0.18 220 / 0.4)",
  background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))",
};
const botaoAcao: React.CSSProperties = {
  fontSize: 10, padding: "4px 8px", borderRadius: 8, whiteSpace: "nowrap",
  border: "1px solid oklch(0.98 0 0 / 0.1)", background: "transparent",
  color: "oklch(0.98 0 0 / 0.55)", cursor: "pointer",
};

/**
 * Aba Movimentos — resumo do mês + lista do livro-caixa: totais, categorias,
 * novo lançamento manual, editar inline (com anexo), ver documento e excluir.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { parseMoedaBR } from "@/lib/moeda";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import {
  FormLancamento,
  limparDocumentoOrfao,
  subirComprovante,
  type AcaoAnexo,
  type FormLanc,
} from "./form-lancamento";
import { LinhaMovimento } from "./linha-movimento";
import {
  formatBRL,
  mesAtual,
  rotuloMes,
  somarMes,
  type MovimentoFinanceiro,
  type SupabaseBruto,
  type ToastApi,
} from "./tipos";

type Props = {
  ownerId: string | null;
  movimentos: MovimentoFinanceiro[];
  mes: string;
  setMes: (m: string) => void;
  t: ToastApi;
  onMudou: () => void;
};

const FORM_VAZIO: FormLanc = { tipo: "saida", valor: "", data: "", descricao: "", categoria: "" };

const cardStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "oklch(0.18 0.06 280 / 0.35)",
  border: "1px solid oklch(0.98 0 0 / 0.08)",
};

const molduraForm: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  background: "oklch(0.18 0.06 280 / 0.35)",
  border: "1px solid oklch(0.7 0.18 220 / 0.35)",
};

export function AbaMovimentos({ ownerId, movimentos, mes, setMes, t, onMudou }: Props) {
  const { isMobile } = useBreakpoint();
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState<FormLanc>(FORM_VAZIO);
  const [acaoAnexo, setAcaoAnexo] = useState<AcaoAnexo>({ tipo: "manter" });
  const [salvando, setSalvando] = useState(false);

  const { entradas, saidas, porCategoria } = useMemo(() => {
    let e = 0, s = 0;
    const cat = new Map<string, number>();
    for (const m of movimentos) {
      const v = Number(m.valor) || 0;
      if (m.tipo === "entrada") e += v;
      else {
        s += v;
        const c = m.categoria || "sem categoria";
        cat.set(c, (cat.get(c) ?? 0) + v);
      }
    }
    return { entradas: e, saidas: s, porCategoria: [...cat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6) };
  }, [movimentos]);

  const validar = (): number | null => {
    const valor = parseMoedaBR(form.valor);
    if (!Number.isFinite(valor) || valor <= 0) { t.error("Valor inválido."); return null; }
    // Data obrigatória: a lista do mês filtra por gte/lt em data_movimento —
    // sem data o lançamento some de TODOS os meses. Exige data válida.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data)) { t.error("Escolha a data do lançamento."); return null; }
    return valor;
  };

  const abrirEdicao = (m: MovimentoFinanceiro) => {
    setExcluindo(null);
    setCriando(false);
    setEditando(m.id);
    setAcaoAnexo({ tipo: "manter" });
    setForm({ tipo: m.tipo, valor: String(m.valor ?? ""), data: m.data_movimento ?? "", descricao: m.descricao ?? "", categoria: m.categoria ?? "" });
  };

  const abrirCriacao = () => {
    setExcluindo(null);
    setEditando(null);
    setCriando(true);
    setAcaoAnexo({ tipo: "manter" });
    setForm({ ...FORM_VAZIO, data: `${mesAtual()}-${String(new Date().getDate()).padStart(2, "0")}`.slice(0, 10) });
  };

  const fecharForm = () => { setEditando(null); setCriando(false); setAcaoAnexo({ tipo: "manter" }); };

  /** Resolve a ação de anexo: documento_id final (undefined = não mexer) + docs a checar como órfãos. */
  const resolverAnexo = async (
    sb: SupabaseBruto,
    docAtual: string | null,
  ): Promise<{ docFinal: string | null | undefined; orfaos: string[] }> => {
    if (acaoAnexo.tipo === "manter") return { docFinal: undefined, orfaos: [] };
    if (acaoAnexo.tipo === "remover") return { docFinal: null, orfaos: docAtual ? [docAtual] : [] };
    if (!ownerId) return { docFinal: undefined, orfaos: [] };
    const novoId = await subirComprovante(sb, ownerId, acaoAnexo.arquivo);
    return { docFinal: novoId, orfaos: docAtual && docAtual !== novoId ? [docAtual] : [] };
  };

  const salvarEdicao = async (m: MovimentoFinanceiro) => {
    const valor = validar();
    if (valor === null) return;
    setSalvando(true);
    const sb = supabase as SupabaseBruto;
    try {
      const { docFinal, orfaos } = await resolverAnexo(sb, m.documento_id);
      const patch: Record<string, unknown> = {
        tipo: form.tipo,
        valor,
        data_movimento: form.data || null,
        descricao: form.descricao.trim() || null,
        categoria: form.categoria.trim().toLowerCase() || null,
      };
      if (docFinal !== undefined) patch.documento_id = docFinal;
      const { error } = await sb.from("movimentos_financeiros").update(patch).eq("id", m.id);
      if (error) throw new Error(error.message);
      for (const d of orfaos) await limparDocumentoOrfao(sb, d);
      fecharForm();
      t.success("Lançamento atualizado.");
      onMudou();
    } catch {
      t.error("Falha ao salvar a edição.");
    } finally {
      setSalvando(false);
    }
  };

  const criarLancamento = async () => {
    if (!ownerId) return;
    const valor = validar();
    if (valor === null) return;
    setSalvando(true);
    const sb = supabase as SupabaseBruto;
    try {
      let docId: string | null = null;
      if (acaoAnexo.tipo === "novo") docId = await subirComprovante(sb, ownerId, acaoAnexo.arquivo);
      const { error } = await sb.from("movimentos_financeiros").insert({
        owner_id: ownerId,
        tipo: form.tipo,
        valor,
        data_movimento: form.data || null,
        descricao: form.descricao.trim() || null,
        categoria: form.categoria.trim().toLowerCase() || null,
        origem: "manual",
        documento_id: docId,
        carga: {},
      });
      if (error) throw new Error(error.message);
      fecharForm();
      t.success("Lançamento registrado.");
      onMudou();
    } catch {
      t.error("Falha ao registrar o lançamento.");
    } finally {
      setSalvando(false);
    }
  };

  const verDocumento = async (mov: MovimentoFinanceiro) => {
    const path = mov.documento?.storage_path;
    if (!path) { t.info("Esse lançamento não tem documento anexado."); return; }
    const sb = supabase as SupabaseBruto;
    const { data, error } = await sb.storage.from("financeiro").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { t.error("Não consegui abrir o documento."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const excluir = async (mov: MovimentoFinanceiro) => {
    if (excluindo !== mov.id) { setExcluindo(mov.id); return; } // 1º clique arma, 2º confirma
    const sb = supabase as SupabaseBruto;
    const { error } = await sb
      .from("movimentos_financeiros")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", mov.id);
    setExcluindo(null);
    if (error) { t.error("Falha ao excluir o lançamento."); return; }
    if (mov.documento_id) await limparDocumentoOrfao(sb, mov.documento_id);
    t.success("Lançamento excluído.");
    onMudou();
  };

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden">
      {/* Navegação de mês + novo lançamento */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <motion.button whileTap={tapPress} type="button" onClick={() => setMes(somarMes(mes, -1))} style={botaoNav}>‹</motion.button>
        <span style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)", textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>
          {rotuloMes(mes)}
        </span>
        <motion.button whileTap={tapPress} type="button" onClick={() => setMes(somarMes(mes, 1))} style={botaoNav}>›</motion.button>
        <div style={{ flex: 1 }} />
        <motion.button whileTap={tapPress} type="button" onClick={abrirCriacao}
          style={{
            fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 10, cursor: "pointer",
            color: "oklch(0.98 0 0)", border: "1px solid oklch(0.7 0.18 220 / 0.4)",
            background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.3), oklch(0.65 0.22 280 / 0.2))",
          }}>
          + Novo lançamento
        </motion.button>
      </div>

      {/* Form de novo lançamento */}
      {criando && (
        <div style={{ ...molduraForm, marginBottom: 14 }}>
          <FormLancamento form={form} setForm={setForm} temAnexo={false}
            acaoAnexo={acaoAnexo} setAcaoAnexo={setAcaoAnexo} salvando={salvando}
            onSalvar={() => void criarLancamento()} onCancelar={fecharForm} />
        </div>
      )}

      {/* Totais do mês */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
        <div style={cardStyle}>
          <div style={rotuloKpi}>Entradas</div>
          <div style={{ ...valorKpi, color: "oklch(0.72 0.18 145)" }}>{formatBRL(entradas)}</div>
        </div>
        <div style={cardStyle}>
          <div style={rotuloKpi}>Saídas</div>
          <div style={{ ...valorKpi, color: "oklch(0.65 0.24 25)" }}>{formatBRL(saidas)}</div>
        </div>
        <div style={cardStyle}>
          <div style={rotuloKpi}>Saldo do mês</div>
          <div style={{ ...valorKpi, color: entradas - saidas >= 0 ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.24 25)" }}>
            {formatBRL(entradas - saidas)}
          </div>
        </div>
      </div>

      {/* Gastos por categoria */}
      {porCategoria.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {porCategoria.map(([c, v]) => (
            <span key={c} style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 999,
              background: "oklch(0.98 0 0 / 0.05)", color: "oklch(0.98 0 0 / 0.75)",
              border: "1px solid oklch(0.98 0 0 / 0.08)",
            }}>
              {c}: <strong>{formatBRL(v)}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Lista */}
      {movimentos.length === 0 && !criando ? (
        <div style={{ padding: "36px 0", textAlign: "center", color: "oklch(0.98 0 0 / 0.45)", fontSize: 13 }}>
          Nenhum movimento em {rotuloMes(mes)}. Manda um comprovante pro seu assistente no WhatsApp ou usa o "+ Novo lançamento".
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {movimentos.map((m) => {
            const armado = excluindo === m.id;
            if (editando === m.id) {
              return (
                <div key={m.id} style={molduraForm}>
                  <FormLancamento form={form} setForm={setForm} temAnexo={!!m.documento_id}
                    acaoAnexo={acaoAnexo} setAcaoAnexo={setAcaoAnexo} salvando={salvando}
                    onSalvar={() => void salvarEdicao(m)} onCancelar={fecharForm} />
                </div>
              );
            }
            return (
              <LinhaMovimento key={m.id} m={m} armado={armado}
                onDoc={() => void verDocumento(m)} onEditar={() => abrirEdicao(m)} onExcluir={() => void excluir(m)} />
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

const botaoNav: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: "1px solid oklch(0.98 0 0 / 0.1)",
  background: "oklch(0.18 0.06 280 / 0.4)", color: "oklch(0.98 0 0 / 0.8)",
  fontSize: 16, cursor: "pointer",
};

const rotuloKpi: React.CSSProperties = { fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginBottom: 4 };
const valorKpi: React.CSSProperties = { fontSize: 18, fontWeight: 650 };

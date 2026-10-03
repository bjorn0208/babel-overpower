/**
 * Passo 2 do Wizard — Público.
 *
 * 4 modos canônicos vivos no banco (`campanhas.filters.modo`):
 *   - todos: qualquer lead ativo da base
 *   - segmento: critérios estruturados via tags reais do tenant
 *               (dados capturados ja viram tag `chave:valor` via trigger)
 *   - lead_ids: lista explícita de UUIDs
 *   - persona: descrição em linguagem natural pra similaridade semântica
 *
 * O modo `segmento` lê em runtime as chaves+valores reais do tenant
 * (via `useChavesDisponiveis`) — não inventa nada. Backend só sabe
 * resolver `eq` (contains) e `in` (overlaps), então a UI já limita.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fadeSlideIn } from "@/os/motion/presets";

import {
  BotaoIcone,
  Campo,
  inputStyle,
  type CriterioFiltro,
  type ModoPublico,
  type OperadorCriterio,
  type SupabaseBruto,
} from "../re-exports";
import {
  type ChaveAgrupada,
  useChavesDisponiveis,
} from "./tags-do-tenant";
import { SubirLeadsPlanilha } from "./subir-leads-planilha";

export interface EstadoStep2 {
  modo: ModoPublico;
  operador_global: "AND" | "OR";
  criterios: CriterioFiltro[];
  lead_ids: string[];
  persona_descricao: string;
}

interface Props {
  ownerId: string;
  estado: EstadoStep2;
  setEstado: (e: EstadoStep2) => void;
}

const MODOS: Array<{ id: ModoPublico; titulo: string; sub: string }> = [
  { id: "todos", titulo: "Todos os leads", sub: "Bate em todos os contatos da base" },
  { id: "segmento", titulo: "Segmento", sub: "Filtra pelos dados capturados (tags do lead)" },
  // Grava `modo: "lead_ids"` — a planilha vira lead na Base e os ids entram na lista.
  { id: "lead_ids", titulo: "Planilha", sub: "Sobe CSV ou Excel com os contatos" },
  { id: "persona", titulo: "Persona", sub: "Descreve em linguagem natural" },
];

// Backend só resolve eq + in hoje (ver eligibility.ts:90-117). Limito a UI.
const OPERADORES_SUPORTADOS: Array<{ id: OperadorCriterio; rotulo: string }> = [
  { id: "eq", rotulo: "é exatamente" },
  { id: "in", rotulo: "é qualquer um de" },
];

export function Step2Publico({ ownerId, estado, setEstado }: Props) {
  const set = <K extends keyof EstadoStep2>(k: K, v: EstadoStep2[K]) =>
    setEstado({ ...estado, [k]: v });

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {MODOS.map((m) => {
          const on = estado.modo === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => set("modo", m.id)}
              style={{
                textAlign: "left",
                padding: 14,
                background: on
                  ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.18), oklch(0.65 0.22 280 / 0.12))"
                  : "oklch(0.18 0.06 280 / 0.35)",
                border: on
                  ? "1px solid oklch(0.7 0.18 220 / 0.5)"
                  : "1px solid oklch(0.98 0 0 / 0.08)",
                borderRadius: 12,
                cursor: "pointer",
                color: "oklch(0.98 0 0)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.titulo}</div>
              <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", marginTop: 2 }}>
                {m.sub}
              </div>
            </button>
          );
        })}
      </div>

      {estado.modo === "todos" && (
        <div
          style={{
            padding: 14,
            fontSize: 11,
            color: "oklch(0.98 0 0 / 0.55)",
            background: "oklch(0.98 0 0 / 0.04)",
            borderRadius: 10,
          }}
        >
          A campanha vai elegível qualquer lead ativo da sua base (respeitando opt-out e janela).
        </div>
      )}

      {estado.modo === "segmento" && (
        <EditorSegmento ownerId={ownerId} estado={estado} setEstado={setEstado} />
      )}

      {estado.modo === "lead_ids" && (
        <Campo
          label="Contatos da planilha"
          hint="Pode subir mais de uma — as listas somam. Depois da criação dá pra subir mais na aba Configuração."
        >
          <div style={{ display: "grid", gap: 10 }}>
            <SubirLeadsPlanilha
              ownerId={ownerId}
              aoConcluir={(ids) => {
                // União com o que já estava escolhido — subir uma segunda planilha
                // soma à seleção em vez de apagar a primeira.
                set("lead_ids", Array.from(new Set([...estado.lead_ids, ...ids])));
              }}
            />
            <div style={{ fontSize: 12, color: "oklch(0.98 0 0 / 0.7)" }}>
              {estado.lead_ids.length === 0
                ? "Nenhum contato escolhido ainda."
                : `${estado.lead_ids.length.toLocaleString("pt-BR")} contatos nesta campanha.`}
            </div>
            <details>
              <summary style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", cursor: "pointer" }}>
                Colar IDs da Base manualmente
              </summary>
              <textarea
                value={estado.lead_ids.join("\n")}
                onChange={(e) =>
                  set(
                    "lead_ids",
                    e.target.value
                      .split(/\s+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                rows={8}
                style={{
                  ...inputStyle,
                  marginTop: 8,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  fontSize: 11,
                }}
                placeholder="ex: 8c5e3a8f-... (um por linha)"
              />
            </details>
          </div>
        </Campo>
      )}

      {estado.modo === "persona" && (
        <Campo
          label="Descrição da persona"
          hint="Quem é o lead ideal? O agente vai usar similaridade semântica pra achar quem mais parece."
        >
          <textarea
            value={estado.persona_descricao}
            onChange={(e) => set("persona_descricao", e.target.value)}
            rows={6}
            placeholder="Ex.: mulher 30-45 anos, mora em capital, já comprou pacote premium…"
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Campo>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Editor de segmento — UI rica com chaves+valores reais do tenant
// ---------------------------------------------------------------------------

function EditorSegmento({
  ownerId,
  estado,
  setEstado,
}: {
  ownerId: string;
  estado: EstadoStep2;
  setEstado: (e: EstadoStep2) => void;
}) {
  const { grupos, carregando } = useChavesDisponiveis(ownerId);
  const set = <K extends keyof EstadoStep2>(k: K, v: EstadoStep2[K]) =>
    setEstado({ ...estado, [k]: v });

  const adicionarCriterio = () => {
    const primeiraChave = grupos[0]?.chave ?? "";
    const primeiroValor = grupos[0]?.valores[0]?.valor ?? "";
    set("criterios", [
      ...estado.criterios,
      { chave: primeiraChave, operador: "eq", valor: primeiroValor },
    ]);
  };

  const editarCriterio = (i: number, patch: Partial<CriterioFiltro>) => {
    const novos = estado.criterios.map((c, k) => (k === i ? { ...c, ...patch } : c));
    set("criterios", novos);
  };

  const removerCriterio = (i: number) =>
    set("criterios", estado.criterios.filter((_, k) => k !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Campo label="Operador global">
        <select
          value={estado.operador_global}
          onChange={(e) => set("operador_global", e.target.value as "AND" | "OR")}
          style={inputStyle}
        >
          <option value="AND">Todos os critérios (E)</option>
          <option value="OR">Qualquer critério (OU)</option>
        </select>
      </Campo>

      {carregando ? (
        <div style={{ padding: 14, fontSize: 11, color: "oklch(0.98 0 0 / 0.5)" }}>
          Lendo dados capturados pelo agente…
        </div>
      ) : grupos.length === 0 ? (
        <div
          style={{
            padding: 14,
            fontSize: 11,
            color: "oklch(0.78 0.18 80)",
            background: "oklch(0.78 0.18 80 / 0.1)",
            border: "1px solid oklch(0.78 0.18 80 / 0.3)",
            borderRadius: 10,
          }}
        >
          Nenhum lead com tags ainda. Conforme o agente conversa, os dados capturados
          viram tags automaticamente — volte aqui depois.
        </div>
      ) : (
        <>
          {estado.criterios.map((c, i) => (
            <LinhaCriterio
              key={i}
              grupos={grupos}
              criterio={c}
              onEditar={(patch) => editarCriterio(i, patch)}
              onRemover={() => removerCriterio(i)}
            />
          ))}

          <button
            type="button"
            onClick={adicionarCriterio}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              fontSize: 11,
              color: "oklch(0.7 0.18 220)",
              background: "oklch(0.7 0.18 220 / 0.1)",
              border: "1px dashed oklch(0.7 0.18 220 / 0.4)",
              borderRadius: 8,
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            <Plus size={12} />
            Adicionar critério
          </button>

          {estado.criterios.length > 0 && (
            <PreviewContagem ownerId={ownerId} estado={estado} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinhaCriterio — 1 critério (chave + operador + valor(es))
// ---------------------------------------------------------------------------

function LinhaCriterio({
  grupos,
  criterio,
  onEditar,
  onRemover,
}: {
  grupos: ChaveAgrupada[];
  criterio: CriterioFiltro;
  onEditar: (patch: Partial<CriterioFiltro>) => void;
  onRemover: () => void;
}) {
  const grupoAtivo = grupos.find((g) => g.chave === criterio.chave);
  const valoresDisponiveis = grupoAtivo?.valores ?? [];

  const valorAtual = useMemo<string[]>(() => {
    if (Array.isArray(criterio.valores)) return criterio.valores;
    if (typeof criterio.valor === "string" && criterio.valor) return [criterio.valor];
    return [];
  }, [criterio]);

  const trocarChave = (novaChave: string) => {
    const grupoNovo = grupos.find((g) => g.chave === novaChave);
    const primeiroValor = grupoNovo?.valores[0]?.valor ?? "";
    onEditar({ chave: novaChave, valor: primeiroValor, valores: undefined });
  };

  const trocarOperador = (novoOp: OperadorCriterio) => {
    if (novoOp === "in") {
      onEditar({ operador: novoOp, valores: valorAtual, valor: undefined });
    } else {
      onEditar({ operador: novoOp, valor: valorAtual[0] ?? "", valores: undefined });
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 0.8fr 1.4fr auto",
        gap: 8,
        alignItems: "end",
        padding: 12,
        background: "oklch(0.18 0.06 280 / 0.28)",
        border: "1px solid oklch(0.98 0 0 / 0.06)",
        borderRadius: 10,
      }}
    >
      <Campo label="Chave">
        <select
          value={criterio.chave}
          onChange={(e) => trocarChave(e.target.value)}
          style={inputStyle}
        >
          {agrupar(grupos).map(([origem, lista]) => (
            <optgroup key={origem} label={LABEL_ORIGEM[origem]}>
              {lista.map((g) => (
                <option key={g.chave} value={g.chave}>
                  {g.rotulo} ({g.total})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Campo>

      <Campo label="Operador">
        <select
          value={criterio.operador}
          onChange={(e) => trocarOperador(e.target.value as OperadorCriterio)}
          style={inputStyle}
        >
          {OPERADORES_SUPORTADOS.map((op) => (
            <option key={op.id} value={op.id}>
              {op.rotulo}
            </option>
          ))}
        </select>
      </Campo>

      <Campo label="Valor">
        {criterio.operador === "in" ? (
          <MultiSelectValor
            opcoes={valoresDisponiveis}
            selecionados={valorAtual}
            onChange={(v) => onEditar({ valores: v, valor: undefined })}
          />
        ) : (
          <select
            value={valorAtual[0] ?? ""}
            onChange={(e) =>
              onEditar({ valor: e.target.value, valores: undefined })
            }
            style={inputStyle}
          >
            {valoresDisponiveis.length === 0 ? (
              <option value="">— Sem valores —</option>
            ) : (
              valoresDisponiveis.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {v.rotulo} ({v.contagem})
                </option>
              ))
            )}
          </select>
        )}
      </Campo>

      <BotaoIcone onClick={onRemover} titulo="Remover critério" perigo>
        <Trash2 size={14} />
      </BotaoIcone>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MultiSelectValor — chips de valor pra operador "in"
// ---------------------------------------------------------------------------

function MultiSelectValor({
  opcoes,
  selecionados,
  onChange,
}: {
  opcoes: ChaveAgrupada["valores"];
  selecionados: string[];
  onChange: (v: string[]) => void;
}) {
  const alternar = (valor: string) => {
    if (selecionados.includes(valor)) {
      onChange(selecionados.filter((s) => s !== valor));
    } else {
      onChange([...selecionados, valor]);
    }
  };
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        padding: 6,
        background: "oklch(0.18 0.06 280 / 0.4)",
        border: "1px solid oklch(0.98 0 0 / 0.1)",
        borderRadius: 10,
        maxHeight: 96,
        overflowY: "auto",
      }}
    >
      {opcoes.length === 0 ? (
        <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.4)", padding: 4 }}>
          — Sem valores —
        </span>
      ) : (
        opcoes.map((v) => {
          const on = selecionados.includes(v.valor);
          return (
            <button
              key={v.valor}
              type="button"
              onClick={() => alternar(v.valor)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 500,
                background: on
                  ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.4), oklch(0.65 0.22 280 / 0.3))"
                  : "oklch(0.98 0 0 / 0.05)",
                color: on ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.6)",
                border: on
                  ? "1px solid oklch(0.7 0.18 220 / 0.5)"
                  : "1px solid oklch(0.98 0 0 / 0.08)",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {v.rotulo}
              <span style={{ fontSize: 9, opacity: 0.6 }}>{v.contagem}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PreviewContagem — quantos leads batem nos critérios agora
// ---------------------------------------------------------------------------

function PreviewContagem({
  ownerId,
  estado,
}: {
  ownerId: string;
  estado: EstadoStep2;
}) {
  const [resultado, setResultado] = useState<{
    contagem: number | null;
    erro: string | null;
    carregando: boolean;
  }>({ contagem: null, erro: null, carregando: true });

  // Serializa critérios pra detectar mudança (evita query a cada render)
  const chave = useMemo(
    () => JSON.stringify({ op: estado.operador_global, c: estado.criterios }),
    [estado.operador_global, estado.criterios],
  );

  useEffect(() => {
    let cancelado = false;
    const tagsArrays = estado.criterios.map((c) => {
      const valores = Array.isArray(c.valores) ? c.valores : c.valor ? [String(c.valor)] : [];
      return valores.map((v) => `${c.chave}:${v}`);
    }).filter((arr) => arr.length > 0);

    if (tagsArrays.length === 0) {
      setResultado({ contagem: 0, erro: null, carregando: false });
      return;
    }

    setResultado((r) => ({ ...r, carregando: true }));
    (async () => {
      try {
        const sb = supabase as SupabaseBruto;
        // Mesma semântica do eligibility.ts: AND = contains encadeado, OR = overlaps
        let q = sb
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", ownerId)
          .is("deleted_at", null)
          .eq("location", "base");

        if (estado.operador_global === "OR") {
          // Achata todas as tags em 1 overlaps
          const todas = tagsArrays.flat();
          q = q.overlaps("tags", todas);
        } else {
          // AND: contains de cada array independente
          for (const grupo of tagsArrays) {
            q = q.contains("tags", grupo);
          }
        }

        const { count, error } = await q;
        if (cancelado) return;
        if (error) {
          setResultado({ contagem: null, erro: error.message, carregando: false });
          return;
        }
        setResultado({ contagem: count ?? 0, erro: null, carregando: false });
      } catch (e) {
        if (cancelado) return;
        setResultado({
          contagem: null,
          erro: e instanceof Error ? e.message : "Erro",
          carregando: false,
        });
      }
    })();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ownerId]);

  const cor = resultado.erro
    ? "oklch(0.65 0.24 25)"
    : resultado.contagem === 0
    ? "oklch(0.78 0.18 80)"
    : "oklch(0.72 0.18 145)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: "oklch(0.18 0.06 280 / 0.35)",
        border: `1px solid ${cor.replace(")", " / 0.3)")}`,
        borderRadius: 10,
      }}
    >
      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>Bate em</span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: cor,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}
      >
        {resultado.carregando ? "…" : (resultado.contagem ?? "?").toLocaleString("pt-BR")}
      </span>
      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>
        {resultado.contagem === 1 ? "lead" : "leads"} da sua base
      </span>
      {resultado.erro && (
        <span style={{ fontSize: 10, color: "oklch(0.65 0.24 25)", marginLeft: "auto" }}>
          {resultado.erro}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers de agrupamento por origem
// ---------------------------------------------------------------------------

const LABEL_ORIGEM: Record<ChaveAgrupada["origem"], string> = {
  lead: "Lead — canônicos",
  ficha: "Capturados pelo agente",
  flag: "Flags booleanas",
};

function agrupar(grupos: ChaveAgrupada[]): Array<[ChaveAgrupada["origem"], ChaveAgrupada[]]> {
  const mapa = new Map<ChaveAgrupada["origem"], ChaveAgrupada[]>();
  for (const g of grupos) {
    if (!mapa.has(g.origem)) mapa.set(g.origem, []);
    mapa.get(g.origem)!.push(g);
  }
  return [...mapa.entries()];
}

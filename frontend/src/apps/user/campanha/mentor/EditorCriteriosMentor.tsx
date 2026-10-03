/**
 * Editor de critérios do Mentor — igual em espírito ao `EditorSegmento` do
 * wizard de campanha (`../wizard/Step2Publico.tsx`), mas com 2 famílias de
 * critério lado a lado:
 *
 *   - CANÔNICOS: `desfecho` / `dias_sem_resposta` / `mes_entrada` /
 *     `mes_desfecho` — colunas reais de `leads`, resolvidas direto (não
 *     tag). Únicos aqui porque o wizard de campanha não lida com coluna
 *     real, só tag.
 *   - TAG: as mesmas chaves dinâmicas de `useChavesDisponiveis` — reusa o
 *     hook tal e qual, sem duplicar a leitura de `leads.tags[]`.
 *
 * A contagem ao vivo chama a edge `resolver-lista-disparo` (mesmo
 * resolvedor usado no envio real — sem drift entre preview e execução).
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { Campo, inputStyle, BotaoIcone } from "../re-exports";
import { useChavesDisponiveis, type ChaveAgrupada } from "../wizard/tags-do-tenant";
import {
  CHAVES_CANONICAS_LEAD,
  OPCOES_DESFECHO,
  type CriteriosListaDisparo,
  type CriterioLead,
  type ModoPublicoLead,
  type OperadorCriterioLead,
} from "./tipos";

interface Props {
  ownerId: string;
  estado: CriteriosListaDisparo;
  setEstado: (e: CriteriosListaDisparo) => void;
}

const MODOS: Array<{ id: ModoPublicoLead; titulo: string; sub: string }> = [
  { id: "todos", titulo: "Todos os leads", sub: "Bate em todos os contatos ativos da base" },
  { id: "segmento", titulo: "Por critério", sub: "Estado final, dias sem resposta, mês, tags…" },
];

export function EditorCriteriosMentor({ ownerId, estado, setEstado }: Props) {
  const { grupos: gruposTag } = useChavesDisponiveis(ownerId);
  const set = <K extends keyof CriteriosListaDisparo>(k: K, v: CriteriosListaDisparo[K]) =>
    setEstado({ ...estado, [k]: v });

  const adicionarCriterio = () => {
    set("criterios", [...estado.criterios, { chave: "desfecho", operador: "eq", valor: "sumido" }]);
  };
  const editarCriterio = (i: number, patch: Partial<CriterioLead>) => {
    set(
      "criterios",
      estado.criterios.map((c, k) => (k === i ? { ...c, ...patch } : c)),
    );
  };
  const removerCriterio = (i: number) =>
    set(
      "criterios",
      estado.criterios.filter((_, k) => k !== i),
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
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

      {estado.modo === "segmento" && (
        <>
          <Campo label="Operador global">
            <select
              value={estado.operadorGlobal}
              onChange={(e) => set("operadorGlobal", e.target.value as "AND" | "OR")}
              style={inputStyle}
            >
              <option value="AND">Todos os critérios (E)</option>
              <option value="OR">Qualquer critério (OU) — só entre tags</option>
            </select>
          </Campo>

          {estado.criterios.map((c, i) => (
            <LinhaCriterioMentor
              key={i}
              gruposTag={gruposTag}
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
        </>
      )}

      <PreviewContagemMentor ownerId={ownerId} estado={estado} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function LinhaCriterioMentor({
  gruposTag,
  criterio,
  onEditar,
  onRemover,
}: {
  gruposTag: ChaveAgrupada[];
  criterio: CriterioLead;
  onEditar: (patch: Partial<CriterioLead>) => void;
  onRemover: () => void;
}) {
  const ehCanonico = CHAVES_CANONICAS_LEAD.some((c) => c.chave === criterio.chave);

  const trocarChave = (novaChave: string) => {
    if (novaChave === "desfecho")
      return onEditar({ chave: novaChave, operador: "eq", valor: "sumido", valores: undefined });
    if (novaChave === "dias_sem_resposta")
      return onEditar({ chave: novaChave, operador: "gte", valor: 7, valores: undefined });
    if (novaChave === "mes_entrada" || novaChave === "mes_desfecho") {
      return onEditar({ chave: novaChave, operador: "eq", valor: "", valores: undefined });
    }
    const grupo = gruposTag.find((g) => g.chave === novaChave);
    onEditar({
      chave: novaChave,
      operador: "eq",
      valor: grupo?.valores[0]?.valor ?? "",
      valores: undefined,
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.1fr 1.4fr auto",
        gap: 8,
        alignItems: "end",
        padding: 12,
        background: "oklch(0.18 0.06 280 / 0.28)",
        border: "1px solid oklch(0.98 0 0 / 0.06)",
        borderRadius: 10,
      }}
    >
      <Campo label="Critério">
        <select
          value={criterio.chave}
          onChange={(e) => trocarChave(e.target.value)}
          style={inputStyle}
        >
          <optgroup label="Estado do lead">
            {CHAVES_CANONICAS_LEAD.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.rotulo}
              </option>
            ))}
          </optgroup>
          {gruposTag.length > 0 && (
            <optgroup label="Dados capturados / tags">
              {gruposTag.map((g) => (
                <option key={g.chave} value={g.chave}>
                  {g.rotulo} ({g.total})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Campo>

      {ehCanonico ? (
        <ValorCanonico criterio={criterio} onEditar={onEditar} />
      ) : (
        <ValorTag gruposTag={gruposTag} criterio={criterio} onEditar={onEditar} />
      )}

      <BotaoIcone onClick={onRemover} titulo="Remover critério" perigo>
        <Trash2 size={14} />
      </BotaoIcone>
    </div>
  );
}

function ValorCanonico({
  criterio,
  onEditar,
}: {
  criterio: CriterioLead;
  onEditar: (p: Partial<CriterioLead>) => void;
}) {
  if (criterio.chave === "desfecho") {
    return (
      <Campo label="Valor">
        <select
          value={String(criterio.valor ?? "")}
          onChange={(e) => onEditar({ operador: "eq", valor: e.target.value, valores: undefined })}
          style={inputStyle}
        >
          {OPCOES_DESFECHO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </Campo>
    );
  }
  if (criterio.chave === "dias_sem_resposta") {
    return (
      <Campo label="Dias sem resposta">
        <div style={{ display: "flex", gap: 6 }}>
          <select
            value={criterio.operador}
            onChange={(e) => onEditar({ operador: e.target.value as OperadorCriterioLead })}
            style={{ ...inputStyle, width: 110 }}
          >
            <option value="gte">≥ (ou mais)</option>
            <option value="lte">≤ (ou menos)</option>
          </select>
          <input
            type="number"
            min={0}
            value={Number(criterio.valor ?? 0)}
            onChange={(e) => onEditar({ valor: Number(e.target.value) })}
            style={inputStyle}
          />
        </div>
      </Campo>
    );
  }
  // mes_entrada / mes_desfecho
  return (
    <Campo label="Mês">
      <input
        type="month"
        value={String(criterio.valor ?? "")}
        onChange={(e) => onEditar({ operador: "eq", valor: e.target.value })}
        style={inputStyle}
      />
    </Campo>
  );
}

function ValorTag({
  gruposTag,
  criterio,
  onEditar,
}: {
  gruposTag: ChaveAgrupada[];
  criterio: CriterioLead;
  onEditar: (p: Partial<CriterioLead>) => void;
}) {
  const grupo = gruposTag.find((g) => g.chave === criterio.chave);
  const valores = grupo?.valores ?? [];
  return (
    <Campo label="Valor">
      <select
        value={String(criterio.valor ?? "")}
        onChange={(e) => onEditar({ operador: "eq", valor: e.target.value, valores: undefined })}
        style={inputStyle}
      >
        {valores.length === 0 ? (
          <option value="">— Sem valores —</option>
        ) : (
          valores.map((v) => (
            <option key={v.valor} value={v.valor}>
              {v.rotulo} ({v.contagem})
            </option>
          ))
        )}
      </select>
    </Campo>
  );
}

// ---------------------------------------------------------------------------
// Preview de contagem — chama a edge resolver-lista-disparo (mesmo
// resolvedor do envio real).
// ---------------------------------------------------------------------------

function PreviewContagemMentor({
  ownerId,
  estado,
}: {
  ownerId: string;
  estado: CriteriosListaDisparo;
}) {
  const [resultado, setResultado] = useState<{
    total: number | null;
    erro: string | null;
    carregando: boolean;
  }>({
    total: null,
    erro: null,
    carregando: true,
  });

  const chave = useMemo(() => JSON.stringify(estado), [estado]);

  useEffect(() => {
    let cancelado = false;
    setResultado((r) => ({ ...r, carregando: true }));
    (async () => {
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const token = sessao?.session?.access_token;
        if (!token) throw new Error("sessao expirada");
        const { data, error } = await supabase.functions.invoke("resolver-lista-disparo", {
          body: {
            modo: estado.modo,
            operadorGlobal: estado.operadorGlobal,
            criterios: estado.criterios,
            publico: estado.publico,
          },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelado) return;
        if (error) throw error;
        setResultado({ total: (data as { total: number }).total, erro: null, carregando: false });
      } catch (e) {
        if (cancelado) return;
        setResultado({
          total: null,
          erro: e instanceof Error ? e.message : "Erro",
          carregando: false,
        });
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ownerId]);

  const cor = resultado.erro
    ? "oklch(0.65 0.24 25)"
    : resultado.total === 0
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
        {resultado.carregando ? "…" : (resultado.total ?? "?").toLocaleString("pt-BR")}
      </span>
      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>
        {resultado.total === 1 ? "lead" : "leads"} da sua base
      </span>
      {resultado.erro && (
        <span style={{ fontSize: 10, color: "oklch(0.65 0.24 25)", marginLeft: "auto" }}>
          {resultado.erro}
        </span>
      )}
    </div>
  );
}

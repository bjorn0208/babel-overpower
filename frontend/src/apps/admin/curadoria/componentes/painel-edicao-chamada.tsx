// @ts-nocheck
/**
 * PainelEdicaoChamada — painel direito de edição de uma ConfigChamadaLlm.
 * Extraído de AbaChamadasLlm.tsx (Onda 9).
 * Onda 5 — modelos dinâmicos do banco + métricas reais de traces + nota modelo_override.
 *
 * Gerencia tabs: prompt | gavetas | métricas | histórico.
 */

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import type { ConfigChamadaLlm } from "../dados/use-config-chamadas-llm";
import type { ModeloLlm } from "../dados/use-modelos-llm";
import { MetricasChamadaLlm } from "./metricas-chamada-llm";

// ─── tipos ────────────────────────────────────────────────────────────────────

export type ConfigChamada = ConfigChamadaLlm & {
  latencia_p50_ms?: number;
  latencia_p95_ms?: number;
  custo_medio_turno?: number;
};

export interface PainelEdicaoChamadaProps {
  sel: ConfigChamada;
  editando: ConfigChamada;
  salvando: boolean;
  onSalvar: () => void;
  onChange: (c: ConfigChamada) => void;
  modelosDisponiveis: ModeloLlm[];
  gavetasDisponiveis: string[];
}

// ─── componente ───────────────────────────────────────────────────────────────

export function PainelEdicaoChamada({
  sel,
  editando,
  salvando,
  onSalvar,
  onChange,
  modelosDisponiveis,
  gavetasDisponiveis,
}: PainelEdicaoChamadaProps) {
  const [abaDetalhe, setAbaDetalhe] = useState<"prompt" | "gavetas" | "metricas" | "historico">(
    "prompt",
  );

  function toggleGaveta(g: string) {
    const tem = editando.itens_produzidos.includes(g);
    onChange({
      ...editando,
      itens_produzidos: tem
        ? editando.itens_produzidos.filter((x) => x !== g)
        : [...editando.itens_produzidos, g],
    });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* header */}
      <div className="px-4 py-3 border-b border-borda row shrink-0">
        <div>
          <div className="small font-semibold">{sel.nome}</div>
          <div className="tiny muted">{sel.descricao}</div>
        </div>
        <button
          className="btn btn-primary btn-sm shrink-0"
          onClick={onSalvar}
          disabled={salvando}
        >
          <Icon name="save" size={14} />
          {salvando ? "salvando…" : "salvar"}
        </button>
      </div>

      {/* configuração básica */}
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="tiny uppercase text-txt3">Modelo</span>
          <select
            className="os-card px-2 py-1 text-xs rounded-md mono"
            value={editando.modelo}
            onChange={(e) => onChange({ ...editando, modelo: e.target.value })}
          >
            {modelosDisponiveis.length === 0 && (
              <option value={editando.modelo}>{editando.modelo}</option>
            )}
            {modelosDisponiveis.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.nome} — {m.slug} — ${m.custo_input_1m}/${m.custo_output_1m}/1M tokens
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="tiny uppercase text-txt3">Temperatura</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            className="os-card px-2 py-1 text-xs rounded-md mono w-16"
            value={editando.temperatura}
            onChange={(e) => onChange({ ...editando, temperatura: Number(e.target.value) })}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="tiny uppercase text-txt3">Max tokens</span>
          <input
            type="number"
            step="128"
            min="64"
            max="8192"
            className="os-card px-2 py-1 text-xs rounded-md mono w-20"
            value={editando.max_tokens}
            onChange={(e) => onChange({ ...editando, max_tokens: Number(e.target.value) })}
          />
        </div>
        {/* Fix 5.5.4 — botão testar agora (placeholder até RPC testar_chamada_llm existir) */}
        <button
          className="btn btn-outline btn-sm ml-auto shrink-0"
          disabled
          title="Em breve — requer RPC testar_chamada_llm no banco"
        >
          <Icon name="play" size={14} />
          Testar agora (em breve)
        </button>
      </div>

      {/* tabs de detalhe */}
      <div className="flex border-b border-borda px-4 shrink-0">
        {(["prompt", "gavetas", "metricas", "historico"] as const).map((t) => (
          <button
            key={t}
            className="px-3 py-2 text-xs border-b-2 transition-colors -mb-px"
            style={
              abaDetalhe === t
                ? { borderColor: "var(--os-acento-1)", color: "var(--os-acento-1)" }
                : { borderColor: "transparent", color: "var(--os-txt3)" }
            }
            onClick={() => setAbaDetalhe(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* conteúdo das tabs */}
      <div className="flex-1 overflow-auto p-4">
        {abaDetalhe === "prompt" && (
          <div className="space-y-2 h-full flex flex-col">
            <div className="row">
              <div className="tiny uppercase text-txt3">Template do system prompt</div>
              <span className="tiny muted mono">{editando.prompt_template.length} chars</span>
            </div>
            <textarea
              className="os-card w-full flex-1 px-3 py-2 text-xs mono rounded-lg resize-none"
              style={{ minHeight: 320 }}
              value={editando.prompt_template}
              onChange={(e) => onChange({ ...editando, prompt_template: e.target.value })}
            />
            <div className="tiny muted">
              Variáveis disponíveis:{" "}
              <span className="mono">
                {"{{nome_agente}} {{persona}} {{blocos_recuperados}} {{historico_conversa}} {{campos_ficha}}"}
              </span>
            </div>
          </div>
        )}

        {abaDetalhe === "gavetas" && (
          <div className="space-y-3">
            <div className="tiny uppercase text-txt3">
              Gavetas acionadas por esta chamada ({editando.itens_produzidos.length} ativas)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {gavetasDisponiveis.map((g) => {
                const ativa = editando.itens_produzidos.includes(g);
                return (
                  <label
                    key={g}
                    className="row gap-2 os-card px-3 py-2 rounded-lg cursor-pointer small"
                    style={
                      ativa
                        ? {
                            background: "var(--os-acento-1-soft)",
                            border: "1px solid var(--os-acento-1)",
                          }
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={ativa}
                      onChange={() => toggleGaveta(g)}
                      style={{ accentColor: "var(--os-acento-1)" }}
                    />
                    <span className="mono truncate">{g}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {abaDetalhe === "metricas" && (
          <MetricasChamadaLlm
            chave={sel.chave}
            modeloConfig={sel.modelo}
            versao={sel.versao}
          />
        )}

        {abaDetalhe === "historico" && (
          <div className="space-y-2">
            <div className="tiny uppercase text-txt3">Histórico de versões</div>
            {Array.from({ length: Math.min(sel.versao, 5) }, (_, i) => {
              const v = sel.versao - i;
              return (
                <div key={v} className="os-card px-3 py-2 row gap-3 small">
                  <span
                    className="badge tiny mono shrink-0"
                    style={
                      i === 0
                        ? { background: "var(--os-acento-1-soft)", color: "var(--os-acento-1)" }
                        : undefined
                    }
                  >
                    v{v}
                  </span>
                  <span className="muted flex-1">
                    {i === 0
                      ? "versão atual"
                      : `alteração ${i === 1 ? "anterior" : `${i} versões atrás`}`}
                  </span>
                  {i > 0 && (
                    <button className="btn btn-ghost btn-xs shrink-0">restaurar</button>
                  )}
                </div>
              );
            })}
            <div
              className="rounded-lg px-4 py-3 small"
              style={{
                background: "oklch(0.70 0.16 85 / 0.08)",
                border: "1px solid oklch(0.70 0.16 85 / 0.25)",
                color: "oklch(0.85 0.10 85)",
              }}
            >
              <Icon name="warning" size={13} className="inline mr-1.5" />
              Histórico completo disponível após migração Onda C1 criar{" "}
              <span className="mono">historico_config_chamadas_llm</span>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

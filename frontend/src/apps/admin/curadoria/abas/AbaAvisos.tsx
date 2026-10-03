// @ts-nocheck
/**
 * Aba Avisos — tela inicial do app Curadoria.
 *
 * Visual alinhado ao LLM-OS: .os-card .lift, .badge*, .row, .h1/.h3, .tabs/.tab
 * Lógica plugada ao banco real na Onda 2D (use-avisos).
 */

import { useMemo, useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import type { AvisoCuradoria, SeveridadeAviso } from "../dados/tipos";
import { useAvisos } from "../dados/use-avisos";

type FiltroSeveridade = "todas" | SeveridadeAviso;

const BADGE_SEVERIDADE: Record<SeveridadeAviso, string> = {
  critico: "badge badge-err",
  atencao: "badge badge-warn",
  sugestao: "badge badge-aurora",
  info: "badge badge-info",
};

const LABEL_SEVERIDADE: Record<SeveridadeAviso, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  sugestao: "Sugestão",
  info: "Info",
};

const BADGE_ESCOPO: Record<string, string> = {
  global: "badge badge-info",
  nicho: "badge badge-aurora",
  tenant: "badge",
};

const ACOES_MAP: Record<string, string> = {
  religar_gaveta: "religar gaveta",
  editar_prompt: "editar prompt",
  aprovar_candidato: "aprovar candidato",
  desligar_cron: "desligar cron",
  criar_bloco: "criar bloco",
  criar_indice_hnsw: "criar índice HNSW",
};

function formatarHora(iso: string): string {
  try {
    const d = new Date(iso);
    const hoje = new Date();
    const eHoje = d.toDateString() === hoje.toDateString();
    if (eHoje) {
      return `hoje ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ============================================================
// Card individual de aviso
// ============================================================

interface CardAvisoProps {
  aviso: AvisoCuradoria;
  onLido: () => void;
  onArquivar: () => void;
}

function CardAviso({ aviso, onLido, onArquivar }: CardAvisoProps) {
  const lido = !!aviso.lido_em;

  return (
    <div
      className="os-card lift"
      style={{
        padding: 14,
        opacity: lido ? 0.55 : 1,
        transition: "opacity 150ms ease",
      }}
    >
      <div className="row gap-3" style={{ alignItems: "flex-start" }}>
        {/* Avatar do autor — minimal */}
        <div
          className="row center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "linear-gradient(135deg, var(--os-acento-1-soft), var(--os-acento-2-soft))",
            flexShrink: 0,
          }}
        >
          {aviso.autor_tipo === "cargo" ? (
            <Icon name="sparkles" size={12} />
          ) : (
            <Icon name="users" size={12} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Título + meta inline */}
          <div className="row gap-2" style={{ alignItems: "baseline", marginBottom: 6, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: 0.05 }}>{aviso.titulo}</div>
            <div style={{ flex: 1 }} />
            <span className={BADGE_SEVERIDADE[aviso.severidade]} style={{ fontSize: 9, padding: "1px 6px" }}>
              {LABEL_SEVERIDADE[aviso.severidade]}
            </span>
            <span className="muted tiny" style={{ opacity: 0.55 }}>{formatarHora(aviso.criado_em)}</span>
          </div>

          {/* Mensagem */}
          <div className="muted small" style={{ lineHeight: 1.55, whiteSpace: "pre-line", opacity: 0.85 }}>
            {aviso.mensagem}
          </div>

          {/* Meta secundária — escopo + aba */}
          <div className="row gap-2" style={{ marginTop: 8, opacity: 0.5 }}>
            <span className="tiny">{aviso.escopo}</span>
            {aviso.contexto_aba && (
              <>
                <span className="tiny">·</span>
                <span className="tiny mono">#{aviso.contexto_aba}</span>
              </>
            )}
          </div>

          {/* Origem do bloco — inline na linha de meta */}
          {aviso.bloco_origem_tabela && (
            <div className="row gap-1" style={{ marginTop: 4, opacity: 0.45 }}>
              <Icon name="database" size={10} />
              <span className="tiny mono">{aviso.bloco_origem_tabela}</span>
              {aviso.bloco_origem_id && (
                <span className="tiny mono">·#{aviso.bloco_origem_id.slice(0, 6)}</span>
              )}
            </div>
          )}

          {/* Ações — mais leves */}
          <div className="row gap-1" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {aviso.acao_sugerida_tipo && (
              <button className="btn btn-primary btn-sm">
                {ACOES_MAP[aviso.acao_sugerida_tipo] ?? aviso.acao_sugerida_tipo}
              </button>
            )}
            {!lido && (
              <button className="btn btn-ghost btn-sm" onClick={onLido} style={{ opacity: 0.7 }}>
                marcar lido
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onArquivar} style={{ opacity: 0.5 }}>
              arquivar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AbaAvisos principal
// ============================================================

export function AbaAvisos() {
  const [filtro, setFiltro] = useState<FiltroSeveridade>("todas");
  const { status, avisos, erro, refetch, marcarLido, arquivar } = useAvisos({ realtime: true });

  const filtrados = useMemo(() => {
    if (filtro === "todas") return avisos;
    return avisos.filter((a) => a.severidade === filtro);
  }, [avisos, filtro]);

  const contagem: Record<FiltroSeveridade, number> = useMemo(
    () => ({
      todas: avisos.length,
      critico: avisos.filter((a) => a.severidade === "critico").length,
      atencao: avisos.filter((a) => a.severidade === "atencao").length,
      sugestao: avisos.filter((a) => a.severidade === "sugestao").length,
      info: avisos.filter((a) => a.severidade === "info").length,
    }),
    [avisos],
  );

  const pendentes = avisos.filter((a) => !a.lido_em && !a.arquivado_em).length;

  return (
    <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", height: "100%", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      {/* Cabeçalho — minimal */}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 20, alignItems: "flex-end" }}>
        <div>
          <div className="h1" style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.2 }}>
            Avisos da <span className="os-aurora-text">Curadoria</span>
          </div>
          {pendentes > 0 && (
            <div className="muted small" style={{ marginTop: 4, opacity: 0.7 }}>
              {pendentes} {pendentes === 1 ? "pendente" : "pendentes"}
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ opacity: 0.75 }}>
          <Icon name="plus" size={12} />
          novo aviso
        </button>
      </div>

      {/* Filtros por severidade — minimal, sem divisor */}
      <div className="row gap-2" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        <div className="tabs">
          {(["todas", "critico", "atencao", "sugestao", "info"] as FiltroSeveridade[]).map((f) => (
            <span
              key={f}
              className={`tab ${filtro === f ? "tab-on" : ""}`}
              onClick={() => setFiltro(f)}
              style={{ fontSize: 12 }}
            >
              {f === "todas" ? "Todas" : LABEL_SEVERIDADE[f as SeveridadeAviso]}
              {contagem[f] > 0 && (
                <span className="muted tiny" style={{ marginLeft: 4, opacity: 0.55 }}>
                  {contagem[f]}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Estado: carregando */}
      {status === "carregando" && (
        <div className="col gap-3" style={{ flex: 1 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="os-card"
              style={{
                padding: 16,
                height: 88,
                background: "rgba(255,255,255,0.03)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      )}

      {/* Estado: erro */}
      {status === "erro" && (
        <div
          className="os-card"
          style={{
            padding: 16,
            background: "oklch(0.65 0.24 25 / 0.08)",
            border: "1px solid oklch(0.65 0.24 25 / 0.3)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Icon name="alert" size={16} />
          <span className="small" style={{ flex: 1, color: "oklch(0.82 0.20 25)" }}>
            Erro ao carregar avisos: {erro}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={refetch}>
            <Icon name="refresh" size={12} />
            tentar novamente
          </button>
        </div>
      )}

      {/* Estado: ok — lista de avisos */}
      {status === "ok" && (
        <div className="col gap-3" style={{ flex: 1, overflowY: "auto" }}>
          {filtrados.length === 0 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                paddingTop: 60,
              }}
            >
              <div
                className="row center"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Icon name="bell" size={24} />
              </div>
              <div className="h3 muted">Nenhum aviso nesta categoria</div>
              <div className="muted small" style={{ textAlign: "center", maxWidth: 320 }}>
                Quando o cargo Curadoria detectar algo importante, vai aparecer aqui.
              </div>
            </div>
          )}
          {filtrados.map((aviso) => (
            <CardAviso
              key={aviso.id}
              aviso={aviso}
              onLido={() => marcarLido(aviso.id)}
              onArquivar={() => arquivar(aviso.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

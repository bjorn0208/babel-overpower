/**
 * Seção "Acompanhamentos automáticos" da Aba Configuração do app Agente.
 *
 * O usuário liga/desliga cada cenário de chamada proativa e define quantas
 * tentativas sem resposta até o lead ser marcado como "desistiu".
 *
 * Quem lê isso no backend:
 * - `cron-varrer-gatilhos-temporais/enqueue-acao.ts` — gate por toggle
 *   (`configuracao.automacoes.{silencio,nao_assinou_contrato,nao_enviou_comprovante,despedida_sem_data}.ativo`)
 * - `_shared/desistencia-guard.ts` — `automacoes.max_retomadas_sem_resposta`
 */

export interface AutomacoesValor {
  silencio: boolean;
  nao_assinou_contrato: boolean;
  nao_enviou_comprovante: boolean;
  despedida_sem_data: boolean;
  max_retomadas_sem_resposta: number;
}

export const AUTOMACOES_PADRAO: AutomacoesValor = {
  silencio: true,
  nao_assinou_contrato: true,
  nao_enviou_comprovante: true,
  despedida_sem_data: true,
  max_retomadas_sem_resposta: 3,
};

/** Lê o jsonb `configuracao.automacoes` do agente pro formato da UI (default ligado). */
export function lerAutomacoes(automacoes: Record<string, unknown> | null): AutomacoesValor {
  const ativo = (chave: keyof AutomacoesValor): boolean => {
    const cfg = automacoes?.[chave];
    if (cfg === undefined || cfg === null) return true;
    if (typeof cfg === "object") return (cfg as { ativo?: unknown }).ativo !== false;
    return cfg !== false;
  };
  const tentativas = Number(automacoes?.max_retomadas_sem_resposta ?? 3);
  return {
    silencio: ativo("silencio"),
    nao_assinou_contrato: ativo("nao_assinou_contrato"),
    nao_enviou_comprovante: ativo("nao_enviou_comprovante"),
    despedida_sem_data: ativo("despedida_sem_data"),
    max_retomadas_sem_resposta: Number.isFinite(tentativas) && tentativas >= 1 ? Math.min(tentativas, 10) : 3,
  };
}

/** Mescla o valor da UI de volta no jsonb, preservando subchaves existentes (ex.: intervalos). */
export function aplicarAutomacoes(
  automacoesBase: Record<string, unknown> | null,
  valor: AutomacoesValor,
): Record<string, unknown> {
  const base = automacoesBase ?? {};
  const mesclarToggle = (chave: string, ativo: boolean) => {
    const existente = base[chave];
    return typeof existente === "object" && existente !== null
      ? { ...(existente as Record<string, unknown>), ativo }
      : { ativo };
  };
  return {
    ...base,
    silencio: mesclarToggle("silencio", valor.silencio),
    nao_assinou_contrato: mesclarToggle("nao_assinou_contrato", valor.nao_assinou_contrato),
    nao_enviou_comprovante: mesclarToggle("nao_enviou_comprovante", valor.nao_enviou_comprovante),
    despedida_sem_data: mesclarToggle("despedida_sem_data", valor.despedida_sem_data),
    max_retomadas_sem_resposta: valor.max_retomadas_sem_resposta,
  };
}

const CENARIOS: { chave: keyof Omit<AutomacoesValor, "max_retomadas_sem_resposta">; titulo: string; descricao: string }[] = [
  {
    chave: "silencio",
    titulo: "Chamar após silêncio",
    descricao: "Lead parou de responder? O agente escolhe o melhor momento e ângulo pra retomar a conversa.",
  },
  {
    chave: "nao_assinou_contrato",
    titulo: "Lembrete de contrato",
    descricao: "Lead recebeu o link do contrato e não assinou — o agente lembra com jeito.",
  },
  {
    chave: "nao_enviou_comprovante",
    titulo: "Lembrete de pagamento",
    descricao: "Lead disse que pagou mas não mandou o comprovante — o agente pede de forma gentil.",
  },
  {
    chave: "despedida_sem_data",
    titulo: "Retomar após despedida",
    descricao: "Lead se despediu sem marcar próximo passo — o agente reabre com algo de valor.",
  },
];

interface SecaoAutomacoesProps {
  valor: AutomacoesValor;
  onChange: (novo: AutomacoesValor) => void;
}

export function SecaoAutomacoes({ valor, onChange }: SecaoAutomacoesProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {CENARIOS.map(({ chave, titulo, descricao }) => {
        const ligado = valor[chave];
        return (
          <div key={chave} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--txt-1)" }}>{titulo}</div>
              <div className="muted tiny">{descricao}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={ligado}
              aria-label={titulo}
              onClick={() => onChange({ ...valor, [chave]: !ligado })}
              style={{
                position: "relative",
                width: 36,
                height: 20,
                borderRadius: 999,
                border: "1px solid",
                borderColor: ligado ? "oklch(0.7 0.18 220 / 0.5)" : "rgba(255,255,255,0.12)",
                background: ligado ? "oklch(0.7 0.18 220 / 0.35)" : "rgba(255,255,255,0.05)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 120ms ease-out",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 2,
                  left: ligado ? "calc(100% - 16px)" : 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: ligado ? "oklch(0.85 0.1 220)" : "var(--txt-4)",
                  transition: "left 120ms ease-out",
                }}
              />
            </button>
          </div>
        );
      })}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--txt-1)" }}>Tentativas até desistir</div>
          <div className="muted tiny">
            Quantas chamadas sem resposta antes do lead ser marcado como "desistiu" e o agente parar de insistir.
          </div>
        </div>
        <input
          type="number"
          className="input"
          min={1}
          max={10}
          value={valor.max_retomadas_sem_resposta}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange({
              ...valor,
              max_retomadas_sem_resposta: Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : 3,
            });
          }}
          style={{ width: 72, textAlign: "center", flexShrink: 0 }}
        />
      </div>
    </div>
  );
}

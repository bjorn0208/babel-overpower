// @ts-nocheck
/**
 * LobbyReuniao — listagem do lobby (salas ao vivo, agendadas, equipe).
 *
 * Estilo Google Meet: dot pulsante nas salas ao vivo, data legível nas
 * agendadas, equipe em chips com avatar, skeleton de carregamento e
 * botão de copiar link com confirmação visual.
 */

import { useState } from "react";
import { ArrowRight, CalendarClock, CalendarX2, Check, Link2, PhoneOff } from "lucide-react";
import type { SalaResumo, MembroEquipe } from "./reuniao-tipos";
import { Avatar, cor } from "./reuniao-ui";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Props = {
  salas: SalaResumo[];
  membros: MembroEquipe[];
  carregando: boolean;
  entrando: string | null;
  onEntrar: (sala: SalaResumo) => void;
  onCopiarLink: (chave: string) => void;
  /** Desliga uma call que ficou aberta, sem precisar entrar nela. */
  onEncerrar?: (sala: SalaResumo) => void;
};

// ─── Estilos ─────────────────────────────────────────────────────────────────

const s = {
  secao: { display: "flex", flexDirection: "column" as const, gap: 10 },
  secaoTitulo: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    color: cor.texto3,
    textTransform: "uppercase" as const,
  },
  card: {
    background: cor.superficie,
    border: `1px solid ${cor.borda}`,
    borderRadius: 14,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap" as const,
  },
  cardInfo: { display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 180 },
  cardTextos: { display: "flex", flexDirection: "column" as const, gap: 3, minWidth: 0 },
  cardNome: {
    fontSize: 14,
    fontWeight: 600,
    color: cor.texto1,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardSub: { fontSize: 12, color: cor.texto2, display: "flex", alignItems: "center", gap: 6 },
  acoes: { display: "flex", gap: 8, alignItems: "center", flexShrink: 0 },
  vazio: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 18px",
    borderRadius: 14,
    border: `1px dashed ${cor.borda}`,
    color: cor.texto3,
    fontSize: 13,
  },
  iconeCirculo: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "oklch(0.22 0.05 250 / 0.4)",
    color: "oklch(0.72 0.12 250)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipsEquipe: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: cor.superficie,
    border: `1px solid ${cor.borda}`,
    borderRadius: 999,
    padding: "5px 14px 5px 5px",
    fontSize: 13,
    color: cor.texto1,
  },
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatarAgendamento(iso: string | null): string {
  if (!iso) return "Sem data definida";
  try {
    const data = new Date(iso);
    const dia = data.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dia} · ${hora}`;
  } catch {
    return iso;
  }
}

function DotAoVivo() {
  return (
    <span
      aria-hidden
      style={{
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: cor.vivo,
        display: "inline-block",
        animation: "reu-pulso 1.8s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
  );
}

function BotaoCopiar({
  chave,
  onCopiarLink,
}: {
  chave: string;
  onCopiarLink: (chave: string) => void;
}) {
  const [copiado, setCopiado] = useState(false);
  function copiar() {
    onCopiarLink(chave);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }
  return (
    <button
      type="button"
      className="reu-btn reu-btn-fantasma"
      onClick={copiar}
      title={copiado ? "Link copiado" : "Copiar link da sala"}
      aria-label={copiado ? "Link copiado" : "Copiar link da sala"}
      style={{ width: 40, height: 40 }}
    >
      {copiado ? <Check size={18} color={cor.vivo} /> : <Link2 size={18} />}
    </button>
  );
}

/**
 * Desliga uma call que ficou aberta. Confirmação em dois toques (o 1º clique
 * arma, o 2º derruba) — desligar reunião dos outros não pode ser tiro fácil,
 * e um modal só pra isso seria peso demais. Desarma sozinho em 4s.
 */
function BotaoDesligar({ sala, onEncerrar }: { sala: SalaResumo; onEncerrar: (sala: SalaResumo) => void }) {
  const [armado, setArmado] = useState(false);

  function clicar() {
    if (!armado) {
      setArmado(true);
      setTimeout(() => setArmado(false), 4000);
      return;
    }
    setArmado(false);
    onEncerrar(sala);
  }

  return (
    <button
      type="button"
      className={armado ? "reu-btn reu-pill-perigo" : "reu-btn reu-btn-fantasma"}
      onClick={clicar}
      title={armado ? "Clique de novo pra desligar" : "Desligar esta call"}
      aria-label={armado ? "Confirmar: desligar a call" : "Desligar esta call"}
      style={{
        height: 40,
        gap: 8,
        padding: armado ? "0 14px" : 0,
        width: armado ? undefined : 40,
        color: armado ? undefined : cor.perigo,
      }}
    >
      <PhoneOff size={18} aria-hidden />
      {armado && <span style={{ fontSize: 13, fontWeight: 600 }}>Desligar mesmo?</span>}
    </button>
  );
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function LobbyReuniao({
  salas,
  membros,
  carregando,
  entrando,
  onEntrar,
  onCopiarLink,
  onEncerrar,
}: Props) {
  const salasAtivas = salas.filter((sala) => sala.status === "ao_vivo");
  const salasAgendadas = salas.filter((sala) => sala.status === "agendada");

  if (carregando) {
    return (
      <div style={s.secao} aria-busy="true" aria-label="Carregando reuniões">
        <span style={s.secaoTitulo}>Suas reuniões</span>
        <div className="reu-skeleton" style={{ height: 68 }} />
        <div className="reu-skeleton" style={{ height: 68 }} />
      </div>
    );
  }

  return (
    <>
      {salasAtivas.length > 0 && (
        <div style={s.secao}>
          <span style={s.secaoTitulo}>Ao vivo</span>
          {salasAtivas.map((sala) => (
            <div key={sala.id} className="reu-card reu-surgir" style={s.card}>
              <div style={s.cardInfo}>
                <div
                  style={{
                    ...s.iconeCirculo,
                    background: "oklch(0.22 0.06 150 / 0.35)",
                    color: cor.vivo,
                  }}
                >
                  <DotAoVivo />
                </div>
                <div style={s.cardTextos}>
                  <span style={s.cardNome}>{sala.titulo}</span>
                  <span style={{ ...s.cardSub, color: cor.vivo }}>Acontecendo agora</span>
                </div>
              </div>
              <div style={s.acoes}>
                <BotaoCopiar chave={sala.chave_publica} onCopiarLink={onCopiarLink} />
                {onEncerrar && <BotaoDesligar sala={sala} onEncerrar={onEncerrar} />}
                <button
                  type="button"
                  className="reu-btn reu-btn-primario"
                  onClick={() => onEntrar(sala)}
                  disabled={!!entrando}
                >
                  {entrando === sala.id ? (
                    "Entrando…"
                  ) : (
                    <>
                      Entrar <ArrowRight size={16} aria-hidden />
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={s.secao}>
        <span style={s.secaoTitulo}>Agendadas</span>
        {salasAgendadas.length === 0 ? (
          <div style={s.vazio}>
            <CalendarX2 size={20} aria-hidden style={{ flexShrink: 0 }} />
            <span>Nenhuma reunião agendada. Use o botão "Agendar" pra marcar a próxima.</span>
          </div>
        ) : (
          salasAgendadas.map((sala) => (
            <div key={sala.id} className="reu-card reu-surgir" style={s.card}>
              <div style={s.cardInfo}>
                <div style={s.iconeCirculo}>
                  <CalendarClock size={19} aria-hidden />
                </div>
                <div style={s.cardTextos}>
                  <span style={s.cardNome}>{sala.titulo}</span>
                  <span style={s.cardSub}>
                    {formatarAgendamento(sala.agendada_para)}
                    {sala.duracao_min ? ` · ${sala.duracao_min} min` : ""}
                  </span>
                </div>
              </div>
              <div style={s.acoes}>
                <BotaoCopiar chave={sala.chave_publica} onCopiarLink={onCopiarLink} />
              </div>
            </div>
          ))
        )}
      </div>

      {membros.length > 0 && (
        <div style={s.secao}>
          <span style={s.secaoTitulo}>Equipe</span>
          <div style={s.chipsEquipe}>
            {membros.map((m) => (
              <span key={m.id} style={s.chip}>
                <Avatar nome={m.nome} tamanho={28} />
                {m.nome}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Freio de mão das campanhas e disparos do tenant.
 *
 * Pedido do Theus (2026-09-17). Mesmo desenho do botão das Rifas: relê o estado
 * a cada 10s, porque a pausa pode ter sido ligada em outra aba ou por outra
 * pessoa da equipe, e um freio que mente sobre o próprio estado é pior que não
 * ter freio.
 *
 * Escopo (dele): segura campanhas e disparos. A agente continua respondendo
 * quem escrever — o texto do botão diz isso.
 */

import { useCallback, useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

import { definirPausaDisparos, lerPausaDisparos } from "./dados-pausa";
import type { ToastApi } from "./re-exports";

export function BotaoPausaGeral({
  tenantId,
  t,
  aoMudar,
}: {
  tenantId: string;
  t: ToastApi;
  aoMudar?: (pausado: boolean) => void;
}) {
  const [pausado, setPausado] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    lerPausaDisparos(tenantId)
      .then((e) => setPausado(e.pausado))
      .catch(() => setPausado(null));
  }, [tenantId]);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 10_000);
    return () => clearInterval(id);
  }, [carregar]);

  const alternar = async () => {
    if (pausado === null || salvando) return;
    const novo = !pausado;
    setSalvando(true);
    try {
      await definirPausaDisparos(tenantId, novo);
      setPausado(novo);
      aoMudar?.(novo);
      t.success(
        novo
          ? "Campanhas e disparos pausados. O que já saiu não volta; o próximo não sai. A agente continua respondendo quem escrever."
          : "Campanhas e disparos liberados.",
      );
    } catch (e) {
      t.error(`Não consegui mudar a pausa: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSalvando(false);
    }
  };

  if (pausado === null) return null;

  return (
    <button
      type="button"
      onClick={() => void alternar()}
      disabled={salvando}
      title={
        pausado
          ? "Liberar campanhas e disparos do tenant"
          : "Pausar TODAS as campanhas e disparos deste tenant"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 11px",
        fontSize: 11.5,
        fontWeight: 600,
        borderRadius: 9,
        cursor: salvando ? "default" : "pointer",
        color: pausado ? "oklch(0.78 0.18 145)" : "oklch(0.72 0.22 25)",
        background: pausado ? "oklch(0.72 0.18 145 / 0.12)" : "oklch(0.7 0.22 25 / 0.12)",
        border: `1px solid ${pausado ? "oklch(0.72 0.18 145 / 0.4)" : "oklch(0.7 0.22 25 / 0.4)"}`,
      }}
    >
      {pausado ? <Play size={13} /> : <Pause size={13} />}
      {pausado ? "Retomar envios" : "Pausar tudo"}
    </button>
  );
}

/** Faixa de aviso pra quando a pausa está ligada (usada na esteira). */
export function FaixaPausado() {
  return (
    <div
      style={{
        padding: "9px 12px",
        borderRadius: 10,
        fontSize: 11.5,
        color: "oklch(0.82 0.16 80)",
        background: "oklch(0.78 0.18 80 / 0.1)",
        border: "1px solid oklch(0.78 0.18 80 / 0.3)",
      }}
    >
      Envios pausados para este tenant. Nenhuma campanha e nenhum disparo sai até você retomar —
      a agente continua respondendo quem escrever.
    </div>
  );
}

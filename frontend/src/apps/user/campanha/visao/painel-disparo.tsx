/**
 * PainelDisparo — "está disparando agora? se não, por quê?"
 *
 * Δ 2026-09-15: o dono configurava a campanha e não entendia por que nada saía
 * (janela de 1 minuto entre duas passadas do motor, data de início no futuro,
 * campanha finalizada pelo `ends_at`). Este painel refaz, no navegador, as mesmas
 * checagens que `supabase/functions/processar-campanhas` faz a cada passada — na
 * mesma ordem — e diz em português qual delas está segurando o disparo.
 *
 * Espelho de: index.ts (status, starts_at, ends_at, indicação), throttle.ts
 * (`dentroDeJanela`, BRT fixo, janela que vira a meia-noite, teto diário/hora).
 * Se mudar lá, muda aqui.
 */

import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

import type { Campanha as CampanhaT, SupabaseBruto } from "../re-exports";

/** Brasil sem horário de verão desde 2019 — igual ao throttle.ts. */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type Nivel = "ok" | "espera" | "bloqueio";

interface Diagnostico {
  nivel: Nivel;
  titulo: string;
  detalhe: string;
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function dentroDeJanela(c: CampanhaT, agora: Date): boolean {
  const brt = new Date(agora.getTime() - BRT_OFFSET_MS);
  const dia = brt.getUTCDay();
  const atual = brt.getUTCHours() * 60 + brt.getUTCMinutes();
  const inicio = minutos(c.window_start);
  const fim = minutos(c.window_end);
  if (fim > inicio) return c.weekdays.includes(dia) && atual >= inicio && atual < fim;
  if (fim === inicio) return false;
  if (atual >= inicio) return c.weekdays.includes(dia);
  if (atual < fim) return c.weekdays.includes((dia + 6) % 7);
  return false;
}

/** Próximo minuto em que a janela abre, olhando até 8 dias pra frente. */
function proximaAbertura(c: CampanhaT, agora: Date): Date | null {
  const base = Math.ceil(agora.getTime() / 60_000) * 60_000;
  for (let i = 0; i < 8 * 24 * 60; i++) {
    const t = new Date(base + i * 60_000);
    if (dentroDeJanela(c, t)) return t;
  }
  return null;
}

function formatarQuando(d: Date, agora: Date): string {
  const brt = new Date(d.getTime() - BRT_OFFSET_MS);
  const hora = `${String(brt.getUTCHours()).padStart(2, "0")}:${String(brt.getUTCMinutes()).padStart(2, "0")}`;
  const hojeBrt = new Date(agora.getTime() - BRT_OFFSET_MS);
  const mesmoDia =
    brt.getUTCFullYear() === hojeBrt.getUTCFullYear() &&
    brt.getUTCMonth() === hojeBrt.getUTCMonth() &&
    brt.getUTCDate() === hojeBrt.getUTCDate();
  if (mesmoDia) return `hoje às ${hora}`;
  const data = `${String(brt.getUTCDate()).padStart(2, "0")}/${String(brt.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${DIAS[brt.getUTCDay()]} ${data} às ${hora}`;
}

function inicioDoDiaBrt(agora: Date): Date {
  const brt = new Date(agora.getTime() - BRT_OFFSET_MS);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()) + BRT_OFFSET_MS);
}

function diagnosticar(c: CampanhaT, agora: Date, enviadosHoje: number | null, naFila: number): Diagnostico {
  const janela = `${c.window_start.slice(0, 5)}–${c.window_end.slice(0, 5)}`;

  if (c.type === "indicacao") {
    return {
      nivel: "espera",
      titulo: "Indicação não dispara sozinha",
      detalhe: "Esse tipo entra quando alguém usa o cupom no chat.",
    };
  }
  if (c.status !== "ativa") {
    const nome = c.status === "rascunho" ? "em rascunho" : c.status;
    return {
      nivel: "bloqueio",
      titulo: `Parada: campanha ${nome}`,
      detalhe: "Clique em Ativar para o motor começar a olhar esta campanha.",
    };
  }
  if (c.starts_at && new Date(c.starts_at) > agora) {
    return {
      nivel: "espera",
      titulo: "Ainda não começou",
      detalhe: `"Começa em" está marcado para ${formatarQuando(new Date(c.starts_at), agora)}.`,
    };
  }
  if (c.ends_at && new Date(c.ends_at) <= agora) {
    return {
      nivel: "bloqueio",
      titulo: "Já terminou",
      detalhe: `"Termina em" já passou. Ajuste a data na Configuração.`,
    };
  }
  if (minutos(c.window_start) === minutos(c.window_end)) {
    return {
      nivel: "bloqueio",
      titulo: "Janela vazia",
      detalhe: "Início e fim da janela são iguais — ela nunca abre. Ajuste na Configuração.",
    };
  }
  if (c.weekdays.length === 0) {
    return {
      nivel: "bloqueio",
      titulo: "Nenhum dia da semana marcado",
      detalhe: "Marque pelo menos um dia na Configuração.",
    };
  }
  if (!dentroDeJanela(c, agora)) {
    const prox = proximaAbertura(c, agora);
    return {
      nivel: "espera",
      titulo: "Fora da janela de horário",
      detalhe: prox
        ? `Janela ${janela}. Próxima abertura: ${formatarQuando(prox, agora)}.`
        : `Janela ${janela} não abre nos próximos dias — confira os dias marcados.`,
    };
  }

  const usados = (enviadosHoje ?? 0) + naFila;
  if (c.throttle_per_day !== null && usados >= c.throttle_per_day) {
    const amanha = new Date(inicioDoDiaBrt(agora).getTime() + 24 * 60 * 60 * 1000);
    const prox = proximaAbertura(c, amanha);
    return {
      nivel: "espera",
      titulo: "Limite do dia atingido",
      detalhe:
        `${usados} de ${c.throttle_per_day} envios hoje.` +
        (prox ? ` Volta ${formatarQuando(prox, agora)}.` : "") +
        " Para mandar mais, aumente o limite por dia na Configuração.",
    };
  }

  return {
    nivel: "ok",
    titulo: "Disparando",
    detalhe:
      `Dentro da janela ${janela}. O motor passa a cada minuto e a mensagem sai 1–2 min depois` +
      (c.throttle_per_day !== null ? ` · hoje ${usados} de ${c.throttle_per_day}` : "") +
      (c.throttle_per_hour !== null ? ` · até ${c.throttle_per_hour}/hora` : "") +
      ".",
  };
}

const CORES: Record<Nivel, string> = {
  ok: "oklch(0.72 0.18 145)",
  espera: "oklch(0.78 0.18 80)",
  bloqueio: "oklch(0.65 0.24 25)",
};

export function PainelDisparo({ campanha }: { campanha: CampanhaT }) {
  const [agora, setAgora] = useState(() => new Date());
  const [enviadosHoje, setEnviadosHoje] = useState<number | null>(null);
  const [naFila, setNaFila] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Contagem de hoje — só desta campanha. O teto real é dividido entre as
  // campanhas ativas do mesmo número (throttle.ts), então isto é um piso.
  const minutoAtual = Math.floor(agora.getTime() / 60_000);
  useEffect(() => {
    let cancelado = false;
    const sb = supabase as SupabaseBruto;
    void Promise.all([
      sb
        .from("leads_campanha")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campanha.id)
        .gte("last_contact_at", inicioDoDiaBrt(new Date()).toISOString()),
      sb
        .from("acoes_agendadas")
        .select("id", { count: "exact", head: true })
        .in("status", ["pendente", "processando"])
        .eq("action_type", "campaign_trigger")
        .eq("carga->>campaign_id", campanha.id),
    ]).then(([hoje, fila]: Array<{ count: number | null }>) => {
      if (cancelado) return;
      setEnviadosHoje(hoje.count ?? 0);
      setNaFila(fila.count ?? 0);
    });
    return () => {
      cancelado = true;
    };
  }, [campanha.id, minutoAtual]);

  const d = diagnosticar(campanha, agora, enviadosHoje, naFila);
  const cor = CORES[d.nivel];

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 14px",
        background: `color-mix(in oklch, ${cor} 10%, transparent)`,
        border: `1px solid color-mix(in oklch, ${cor} 40%, transparent)`,
        borderRadius: 10,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          marginTop: 5,
          borderRadius: "50%",
          background: cor,
          flex: "0 0 auto",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.98 0 0)" }}>{d.titulo}</span>
        <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.65)" }}>{d.detalhe}</span>
      </div>
    </div>
  );
}

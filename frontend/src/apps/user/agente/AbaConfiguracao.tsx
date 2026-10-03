/**
 * Aba Configuração do app Agente — horário de atendimento.
 *
 * Recria o recurso do frontend antigo (SecaoHorario.tsx) sobre o que o motor
 * NOVO realmente consome: `agentes.configuracao.horario` (HorarioConfig) +
 * `agentes.configuracao.automacoes.respeita_horario_comercial`.
 *
 * Quem lê isso no backend: `_shared/business-hours.ts` (checkIsWithinBusinessHours)
 * via `processar-acompanhamentos` — automações só disparam dentro da janela quando
 * o modo é "horário personalizado".
 *
 * `agentes` é a tabela real; `agentes_usuario` é view sobre ela — gravamos na tabela.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  SecaoAutomacoes,
  AUTOMACOES_PADRAO,
  lerAutomacoes,
  aplicarAutomacoes,
  type AutomacoesValor,
} from "./SecaoAutomacoes";
import { UploadConversasZip } from "./hub-conhecimento/UploadConversasZip";
import { SecaoBlocosAgente } from "./SecaoBlocosAgente";

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info?: (m: string) => void;
}

function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

type DiaSemana =
  | "segunda" | "terca" | "quarta" | "quinta" | "sexta" | "sabado" | "domingo";

interface Turno {
  dia: DiaSemana;
  ativo: boolean;
  inicio: string; // HH:mm
  fim: string;    // HH:mm
}

type ModoHorario = "sempre" | "personalizado";

// Ordem de exibição (semana começando na segunda) + rótulo curto.
const DIAS: { dia: DiaSemana; rotulo: string }[] = [
  { dia: "segunda", rotulo: "Seg" },
  { dia: "terca", rotulo: "Ter" },
  { dia: "quarta", rotulo: "Qua" },
  { dia: "quinta", rotulo: "Qui" },
  { dia: "sexta", rotulo: "Sex" },
  { dia: "sabado", rotulo: "Sáb" },
  { dia: "domingo", rotulo: "Dom" },
];

function turnoPadrao(dia: DiaSemana): Turno {
  const fimDeSemana = dia === "sabado" || dia === "domingo";
  return { dia, ativo: !fimDeSemana, inicio: "09:00", fim: "18:00" };
}

/** Garante os 7 dias na ordem, preservando o que já estava salvo. */
function normalizarTurnos(salvos: unknown): Turno[] {
  const lista = Array.isArray(salvos) ? (salvos as Partial<Turno>[]) : [];
  return DIAS.map(({ dia }) => {
    const achado = lista.find((t) => t?.dia === dia);
    if (!achado) return turnoPadrao(dia);
    return {
      dia,
      ativo: achado.ativo !== false,
      inicio: typeof achado.inicio === "string" ? achado.inicio : "09:00",
      fim: typeof achado.fim === "string" ? achado.fim : "18:00",
    };
  });
}

interface AbaConfiguracaoProps {
  agenteId: string;
}

export function AbaConfiguracao({ agenteId }: AbaConfiguracaoProps) {
  const t = pegarToast();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // Configuração inteira (jsonb) — preservada no save pra não perder outras chaves.
  const [configBase, setConfigBase] = useState<Record<string, unknown>>({});
  const [modo, setModo] = useState<ModoHorario>("sempre");
  const [turnos, setTurnos] = useState<Turno[]>(() => DIAS.map((d) => turnoPadrao(d.dia)));
  const [autos, setAutos] = useState<AutomacoesValor>(AUTOMACOES_PADRAO);
  const [inicial, setInicial] = useState<string>("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb
        .from("agentes")
        .select("configuracao")
        .eq("id", agenteId)
        .maybeSingle();
      if (error) throw error;
      const cfg = (data?.configuracao as Record<string, unknown> | null) ?? {};
      const horario = (cfg.horario as Record<string, unknown> | null) ?? null;
      const automacoes = (cfg.automacoes as Record<string, unknown> | null) ?? null;
      const respeita = automacoes?.respeita_horario_comercial === true;
      const ehPersonalizado = respeita && horario?.tipo === "personalizado";
      const novosTurnos = normalizarTurnos(horario?.turnos);
      const modoCarregado: ModoHorario = ehPersonalizado ? "personalizado" : "sempre";
      const autosCarregados = lerAutomacoes(automacoes);
      setConfigBase(cfg);
      setModo(modoCarregado);
      setTurnos(novosTurnos);
      setAutos(autosCarregados);
      setInicial(JSON.stringify({ modo: modoCarregado, turnos: novosTurnos, autos: autosCarregados }));
    } catch (e) {
      console.error("[AbaConfiguracao] carregar falhou:", e);
      t.error(`Falha ao carregar configuração: ${(e as Error).message}`);
    } finally {
      setCarregando(false);
    }
  }, [agenteId]);

  useEffect(() => { void carregar(); }, [carregar]);

  function setTurno(i: number, patch: Partial<Turno>) {
    setTurnos((xs) => xs.map((tt, idx) => (idx === i ? { ...tt, ...patch } : tt)));
  }

  const sujo = useMemo(
    () => JSON.stringify({ modo, turnos, autos }) !== inicial,
    [modo, turnos, autos, inicial],
  );

  async function salvar() {
    setSalvando(true);
    try {
      const personalizado = modo === "personalizado";
      const sb = supabase as SupabaseBruto;
      // Relê a configuração fresca antes de escrever e faz o merge sobre ela —
      // o snapshot `configBase` do load pode estar velho e apagaria chaves
      // gravadas em paralelo (ex.: outra aba/automação alterou outro campo).
      const { data: atual } = await sb
        .from("agentes")
        .select("configuracao")
        .eq("id", agenteId)
        .maybeSingle();
      const base =
        (atual?.configuracao as Record<string, unknown> | null) ?? configBase;
      const novaConfig: Record<string, unknown> = {
        ...base,
        horario: { tipo: personalizado ? "personalizado" : "24h", turnos },
        automacoes: {
          ...aplicarAutomacoes(
            (base.automacoes as Record<string, unknown> | null) ?? {},
            autos,
          ),
          respeita_horario_comercial: personalizado,
        },
      };
      const { error } = await sb
        .from("agentes")
        .update({ configuracao: novaConfig })
        .eq("id", agenteId);
      if (error) throw error;
      setConfigBase(novaConfig);
      setInicial(JSON.stringify({ modo, turnos, autos }));
      t.success("Configuração do agente salva");
      // Config vence sempre (DEC-043): regenera o bloco "Horário de Atendimento" do RAG.
      // Fire-and-forget — caso Diego 2026-06-11: sem isso o agente falava horário velho.
      void supabase.functions
        .invoke("sincronizar-blocos", { body: { agente_id: agenteId } })
        .catch(() => { /* sync silencioso — próximo save ressincroniza */ });
    } catch (e) {
      console.error("[AbaConfiguracao] salvar falhou:", e);
      t.error(`Falha ao salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  function descartar() {
    if (!inicial) return;
    const snap = JSON.parse(inicial) as { modo: ModoHorario; turnos: Turno[]; autos?: AutomacoesValor };
    setModo(snap.modo);
    setTurnos(snap.turnos);
    setAutos(snap.autos ?? AUTOMACOES_PADRAO);
  }

  if (carregando) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--txt-3)", fontSize: 13 }}>
        Carregando configuração…
      </div>
    );
  }

  return (
    <div style={{ padding: "18px 18px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <SecaoConfig
        titulo="Horário de atendimento"
        icone="🕐"
        descricao="Define quando o agente pode iniciar conversas e disparar acompanhamentos automáticos. Respostas a mensagens do cliente acontecem sempre; isto controla as ações automáticas."
      >
        <div style={{ display: "flex", gap: 8 }}>
          <BotaoModo ativo={modo === "sempre"} onClick={() => setModo("sempre")}>
            ☀️ Sempre disponível
          </BotaoModo>
          <BotaoModo ativo={modo === "personalizado"} onClick={() => setModo("personalizado")}>
            🗓️ Horário personalizado
          </BotaoModo>
        </div>

        {modo === "sempre" ? (
          <div className="muted small" style={{ marginTop: 4 }}>
            O agente atua a qualquer hora, todos os dias.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            {turnos.map((turno, i) => (
              <div key={turno.dia} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setTurno(i, { ativo: !turno.ativo })}
                  aria-pressed={turno.ativo}
                  style={{
                    width: 48,
                    padding: "5px 0",
                    borderRadius: 8,
                    border: "1px solid",
                    borderColor: turno.ativo ? "oklch(0.7 0.18 220 / 0.5)" : "rgba(255,255,255,0.08)",
                    background: turno.ativo ? "oklch(0.7 0.18 220 / 0.14)" : "rgba(255,255,255,0.03)",
                    color: turno.ativo ? "var(--txt-1)" : "var(--txt-4)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: turno.ativo ? "none" : "line-through",
                  }}
                >
                  {DIAS[i].rotulo}
                </button>
                {turno.ativo ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="time"
                      className="input"
                      value={turno.inicio}
                      onChange={(e) => setTurno(i, { inicio: e.target.value })}
                      style={{ width: 110 }}
                    />
                    <span className="muted small">às</span>
                    <input
                      type="time"
                      className="input"
                      value={turno.fim}
                      onChange={(e) => setTurno(i, { fim: e.target.value })}
                      style={{ width: 110 }}
                    />
                  </div>
                ) : (
                  <span className="muted small" style={{ fontStyle: "italic" }}>Fechado</span>
                )}
              </div>
            ))}
            <div className="muted tiny" style={{ marginTop: 2 }}>
              Fuso horário de Brasília (BRT). Dias fechados não recebem ações automáticas.
            </div>
          </div>
        )}
      </SecaoConfig>

      <SecaoConfig
        titulo="Acompanhamentos automáticos"
        icone="🔔"
        descricao="O agente decide sozinho o melhor momento e o jeito de chamar — aqui você só escolhe quais situações ele pode agir."
      >
        <SecaoAutomacoes valor={autos} onChange={setAutos} />
      </SecaoConfig>

      <SecaoConfig
        titulo="Aprender com conversas"
        icone="📚"
        descricao="Importe uma pasta ZIP com conversas anteriores para o agente analisar padrões e aprender"
      >
        <UploadConversasZip
          tenantId={agenteId}
          agenteId={agenteId}
          onBlocosAdicionados={() => {
            t.success("Conversas importadas e adicionadas ao conhecimento!");
            void carregar();
          }}
        />
      </SecaoConfig>

      <SecaoBlocosAgente
        agenteId={agenteId}
        onBlocosAlterados={() => {
          void carregar();
        }}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={descartar} disabled={!sujo || salvando}>
          Descartar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void salvar()}
          disabled={!sujo || salvando}
        >
          {salvando ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}

function BotaoModo({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid",
        borderColor: ativo ? "oklch(0.7 0.18 220 / 0.5)" : "rgba(255,255,255,0.08)",
        background: ativo ? "oklch(0.7 0.18 220 / 0.14)" : "rgba(255,255,255,0.03)",
        color: ativo ? "var(--txt-1)" : "var(--txt-3)",
        fontSize: 12,
        fontWeight: ativo ? 600 : 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// Espelha o visual de SecaoAgente (AgenteApp) sem importar — evita ciclo de import.
function SecaoConfig({
  titulo,
  icone,
  descricao,
  children,
}: {
  titulo: string;
  icone?: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: "14px 16px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: descricao ? 4 : 12 }}>
        {icone && <span aria-hidden="true">{icone}</span>}
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--txt-2)", flex: 1 }}>
          {titulo}
        </h3>
      </div>
      {descricao && (
        <div className="muted tiny" style={{ marginBottom: 10 }}>{descricao}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

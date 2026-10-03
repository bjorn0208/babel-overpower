/**
 * App admin Reuniões — capacidade e ocupação do servidor de reunião (LiveKit na VPS).
 *
 * O músculo é um só: todas as salas da plataforma (e o PABX) dividem a mesma
 * VPS. Aqui o admin vê a ocupação ao vivo, ajusta o teto de participantes por
 * sala e controla o aviso de lotação (liga/desliga + a partir de quantas
 * pessoas). Referência de capacidade: diagnóstico 2026-08-01 — ~40-60
 * participantes simultâneos antes do degrau 2 (VPS dedicada).
 */

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { Activity, RefreshCw, Save } from "lucide-react";
import { Campo, Toggle, Vazio } from "../consulta/ui-admin";
import { inputStyle, pegarToast } from "../consulta/tipos";
import type { SupabaseBruto } from "../consulta/tipos";
import { supabase } from "@/integrations/supabase/client";

type SalaViva = { nome: string; participantes: number };

type Ocupacao = {
  total: number;
  salas: SalaViva[];
};

type ConfigReuniao = {
  id: string;
  teto_por_sala: number;
  aviso_ativo: boolean;
  aviso_limiar: number;
};

const INTERVALO_ATUALIZACAO_MS = 10_000;
/** Referência do diagnóstico 2026-08-01: acima disso a VPS começa a suar. */
const CAPACIDADE_REFERENCIA = 40;

const cartao: React.CSSProperties = {
  background: "oklch(0.18 0.06 280 / 0.35)",
  border: "1px solid oklch(0.98 0 0 / 0.08)",
  borderRadius: 14,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export function AppReunioes() {
  const t = pegarToast();
  const [config, setConfig] = useState<ConfigReuniao | null>(null);
  const [ocupacao, setOcupacao] = useState<Ocupacao | null>(null);
  const [erroOcupacao, setErroOcupacao] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const carregarConfig = useCallback(async () => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("config_plataforma")
      .select("id, reuniao_limite_participantes, reuniao_aviso_ativo, reuniao_aviso_limiar")
      .limit(1)
      .single();
    if (data) {
      setConfig({
        id: data.id,
        teto_por_sala: data.reuniao_limite_participantes ?? 10,
        aviso_ativo: data.reuniao_aviso_ativo ?? false,
        aviso_limiar: data.reuniao_aviso_limiar ?? 40,
      });
    }
  }, []);

  const carregarOcupacao = useCallback(async () => {
    setAtualizando(true);
    try {
      const { data, error } = await supabase.functions.invoke("sala-reuniao", {
        body: { acao: "ocupacao" },
      });
      if (error || !data || typeof data.total !== "number") throw error ?? new Error("sem dados");
      setOcupacao({ total: data.total, salas: data.salas ?? [] });
      setErroOcupacao(false);
    } catch {
      setErroOcupacao(true);
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([carregarConfig(), carregarOcupacao()]).finally(() => setCarregando(false));
    const timer = setInterval(() => void carregarOcupacao(), INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(timer);
  }, [carregarConfig, carregarOcupacao]);

  async function salvar() {
    if (!config) return;
    const teto = Math.round(config.teto_por_sala);
    const limiar = Math.round(config.aviso_limiar);
    if (teto < 2 || teto > 100) {
      t.error("Teto por sala precisa ficar entre 2 e 100.");
      return;
    }
    if (limiar < 1 || limiar > 500) {
      t.error("Limiar do aviso precisa ficar entre 1 e 500.");
      return;
    }
    setSalvando(true);
    const sb = supabase as SupabaseBruto;
    const { error } = await sb
      .from("config_plataforma")
      .update({
        reuniao_limite_participantes: teto,
        reuniao_aviso_ativo: config.aviso_ativo,
        reuniao_aviso_limiar: limiar,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);
    setSalvando(false);
    if (error) {
      t.error("Não foi possível salvar. Tente de novo.");
      return;
    }
    t.success("Capacidade da Reunião atualizada.");
  }

  if (carregando) {
    return <Vazio mensagem="Carregando dados da Reunião…" />;
  }

  const total = ocupacao?.total ?? 0;
  const corTotal =
    total >= CAPACIDADE_REFERENCIA
      ? "oklch(0.65 0.24 25)"
      : total >= CAPACIDADE_REFERENCIA * 0.6
        ? "oklch(0.78 0.18 80)"
        : "oklch(0.72 0.18 145)";

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      {/* ─ Ocupação ao vivo ─ */}
      <div style={cartao}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.98 0 0 / 0.9)", display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={14} /> Ao vivo agora
          </span>
          <button
            type="button"
            onClick={() => void carregarOcupacao()}
            disabled={atualizando}
            style={{ background: "transparent", border: "none", color: "oklch(0.98 0 0 / 0.55)", cursor: "pointer", display: "grid", placeItems: "center" }}
            title="Atualizar agora"
          >
            <RefreshCw size={14} style={atualizando ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>

        {erroOcupacao ? (
          <Vazio pequeno mensagem="Servidor de reunião não respondeu — tento de novo em instantes." />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: corTotal }}>{total}</span>
              <span style={{ fontSize: 12, color: "oklch(0.98 0 0 / 0.55)" }}>
                {total === 1 ? "pessoa em reunião" : "pessoas em reunião"} · referência da VPS: ~{CAPACIDADE_REFERENCIA}
              </span>
            </div>
            {ocupacao && ocupacao.salas.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ocupacao.salas.map((sala) => (
                  <div
                    key={sala.nome}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "oklch(0.98 0 0 / 0.75)", background: "oklch(0.98 0 0 / 0.04)", borderRadius: 8, padding: "6px 10px" }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sala.nome.startsWith("os-") ? "Sala da plataforma" : `PABX · ${sala.nome}`}
                    </span>
                    <span style={{ fontWeight: 700 }}>{sala.participantes}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Vazio pequeno mensagem="Nenhuma sala ativa agora." />
            )}
          </>
        )}
        <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.4)" }}>
          Atualiza sozinho a cada {INTERVALO_ATUALIZACAO_MS / 1000}s. Conta todas as salas do servidor (PABX incluso).
        </span>
      </div>

      {/* ─ Capacidade ─ */}
      {config && (
        <div style={cartao}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.98 0 0 / 0.9)" }}>Capacidade</span>

          <Campo label="Teto de participantes por sala">
            <input
              type="number"
              min={2}
              max={100}
              value={config.teto_por_sala}
              onChange={(e) => setConfig({ ...config, teto_por_sala: Number(e.target.value) })}
              style={inputStyle}
            />
          </Campo>

          <Toggle
            ativo={config.aviso_ativo}
            onChange={(v) => setConfig({ ...config, aviso_ativo: v })}
            rotulo="Avisar quem entra quando a plataforma estiver cheia"
          />

          <Campo label="Avisar a partir de quantas pessoas (soma de todas as salas)">
            <input
              type="number"
              min={1}
              max={500}
              value={config.aviso_limiar}
              onChange={(e) => setConfig({ ...config, aviso_limiar: Number(e.target.value) })}
              disabled={!config.aviso_ativo}
              style={{ ...inputStyle, opacity: config.aviso_ativo ? 1 : 0.5 }}
            />
          </Campo>

          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 700,
              color: "oklch(0.98 0 0)",
              background: "linear-gradient(135deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))",
              border: "none",
              borderRadius: 10,
              cursor: salvando ? "wait" : "pointer",
              opacity: salvando ? 0.6 : 1,
            }}
          >
            <Save size={13} /> {salvando ? "Salvando…" : "Salvar"}
          </button>
          <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.4)" }}>
            O teto vale na criação de salas novas (o servidor também trava). O aviso aparece pra quem entra numa sala quando a soma passa do limiar.
          </span>
        </div>
      )}
    </div>
  );
}

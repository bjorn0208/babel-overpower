// @ts-nocheck
// Aba 5 — Simulador / Chat-Teste
// Onda 4: invoca ragentic-processar-inline REAL com modo_teste=true via useSimulador.
// canal=curadoria + cargo_alvo no contexto_curadoria. Não persiste em buffer_mensagens, não dispara Z-API.

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useTenantImpersonado } from "../dados/contexto-curadoria";
import { useSimulador } from "../dados/use-simulador";
import { TENANT_UNIVERSO } from "../dados/tipos";

// ─── tipos locais ────────────────────────────────────────────────────────────

// Tipos antigos do mock removidos — useSimulador retorna MensagemSimulacao com telemetria minimalista

// ─── sub-componentes ──────────────────────────────────────────────────────────

function Bolha({ m }: { m: Mensagem }) {
  const isLead = m.de === "lead";
  return (
    <div className={`flex ${isLead ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
          isLead ? "bg-info/15 text-txt ring-1 ring-info/30" : "bg-painel ring-1 ring-borda"
        }`}
      >
        <div>{m.texto}</div>
        <div className="text-2xs text-txt3 mono mt-0.5">{m.t}</div>
      </div>
    </div>
  );
}

function BolhaProcessando({ estagio }: { estagio: string | null }) {
  return (
    <div className="flex justify-start">
      <div className="bg-painel ring-1 ring-borda rounded-xl px-3 py-2 text-xs flex items-center gap-2">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--os-acento-1)",
                animation: `pulso 1.2s ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
        <span className="text-txt2 mono">
          {estagio === "porteiro" ? "Porteiro pensando…" : "Síntese respondendo…"}
        </span>
      </div>
    </div>
  );
}

function PainelTelemetria({ t }: { t: any }) {
  if (!t) return null;
  return (
    <div className="space-y-2 text-sm">
      <div className="os-card p-3 space-y-1.5">
        {[
          { label: "modelo", val: t.modelo ?? "—" },
          { label: "cargo", val: t.cargo ?? "—" },
          { label: "latência", val: t.latencia_total_ms ? `${t.latencia_total_ms}ms` : "—" },
          { label: "custo est.", val: t.custo_estimado_usd ? `$${Number(t.custo_estimado_usd).toFixed(5)}` : "—" },
        ].map(({ label, val }) => (
          <div key={label} className="row gap-2 tiny">
            <span className="muted w-20 shrink-0">{label}</span>
            <span className="mono truncate">{val}</span>
          </div>
        ))}
      </div>
      <div className="muted tiny">Telemetria detalhada (gavetas, tools, tokens) via `traces` real disponível na aba <strong>Cérebro</strong>.</div>
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

export function AbaSimulador() {
  const tenant = useTenantImpersonado();
  const universoBloqueado = tenant.id === TENANT_UNIVERSO.id;
  const tenantId = universoBloqueado ? null : tenant.id;
  const [cargo, setCargo] = useState("Vendedor");
  const [input, setInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  const sim = useSimulador(tenantId, cargo);
  const ultimaTelemetria = sim.mensagens.filter((m) => m.telemetria).slice(-1)[0]?.telemetria;

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [sim.mensagens, sim.enviando]);

  function enviar() {
    if (!input.trim() || sim.enviando) return;
    const t = input.trim();
    setInput("");
    void sim.enviar(t);
  }

  function limpar() {
    sim.resetar();
  }

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3">Simulador / Chat-Teste</div>
          <div className="small muted mt-0.5">
            Testa um turno completo sem ir pro WhatsApp.{" "}
            <span className="mono">modo_teste=true</span> · não persiste em mensagens.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="btn btn-ghost btn-sm"
            onClick={limpar}
          >
            <Icon name="trash" size={14} />
            limpar
          </button>
        </div>
      </div>

      {/* aviso universo */}
      {universoBloqueado && (
        <div
          className="mx-5 mt-3 rounded-lg px-4 py-2.5 small row gap-2 shrink-0"
          style={{ background: "oklch(0.55 0.14 250 / 0.08)", border: "1px solid oklch(0.55 0.14 250 / 0.20)" }}
        >
          <Icon name="info" size={14} style={{ color: "oklch(0.55 0.14 250)" }} />
          <span style={{ color: "oklch(0.75 0.08 250)" }}>
            Selecione um tenant para usar o simulador com dados reais. No modo Universo a conversa é genérica.
          </span>
        </div>
      )}

      {/* corpo */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* área de chat */}
        <div className="flex-1 flex flex-col border-r border-borda min-w-0">
          {/* toolbar */}
          <div className="px-4 py-2 border-b border-borda flex items-center gap-3 text-xs shrink-0">
            <select
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className="os-card px-2 py-1 text-xs rounded-md"
            >
              <option>Vendedor</option>
              <option>Recepção</option>
              <option>Suporte</option>
            </select>
            <span className="ml-auto mono tiny text-txt3">
              {universoBloqueado ? "modo Universo · sem tenant" : `tenant: ${tenant.nome}`}
            </span>
          </div>

          {/* mensagens */}
          <div ref={chatRef} className="flex-1 overflow-auto p-4 space-y-1.5" style={{ background: "var(--os-fundo)" }}>
            {sim.mensagens.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 muted small">
                <Icon name="chat" size={20} />
                <span>Comece com uma mensagem</span>
                <span className="tiny text-center max-w-48">
                  Motor real (ragentic-processar-inline) · modo_teste=true · não persiste.
                </span>
              </div>
            )}
            {sim.mensagens.map((m, i) => (
              <Bolha key={i} m={m} />
            ))}
            {sim.enviando && <BolhaProcessando estagio="motor" />}
            {sim.erro && (
              <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "oklch(0.65 0.24 25 / 0.10)", color: "oklch(0.82 0.20 25)" }}>
                erro: {sim.erro}
              </div>
            )}
          </div>

          {/* input */}
          <div className="border-t border-borda p-3 flex items-center gap-2 shrink-0">
            <input
              className="os-card flex-1 px-3 py-2 text-sm rounded-lg focus:outline-none"
              placeholder="mensagem do lead…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviar()}
              disabled={sim.enviando}
              autoFocus
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={enviar}
              disabled={sim.enviando || !input.trim()}
            >
              <Icon name="send" size={14} />
              enviar
            </button>
          </div>
        </div>

        {/* painel telemetria */}
        <div className="w-[440px] overflow-auto p-4 space-y-3 shrink-0">
          <div className="tiny uppercase text-txt3 tracking-wide">Telemetria do último turno</div>
          {!ultimaTelemetria ? (
            <div className="muted small mt-2">Mande uma mensagem para ver a telemetria</div>
          ) : (
            <PainelTelemetria t={ultimaTelemetria} />
          )}
        </div>
      </div>
    </div>
  );
}

// @ts-nocheck
/**
 * CommandPalette — paleta de busca de abas da Curadoria.
 * Abre via ⌘K ou "/" fora de input.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { ABAS } from "../dados/abas";
import type { AbaId } from "../dados/tipos";

const ICONE_ABA: Record<string, string> = {
  Bell: "bell",
  Brain: "brain",
  Chart: "trending",
  Chat: "message",
  Book: "bookOpen",
  Flask: "flaskConical",
  Heart: "heart",
  Cart: "package",
  Wrench: "wrench",
  Zap: "zap",
  Cal: "calendar",
  Badge: "briefcase",
  Cpu: "cpu",
  Clock: "clock",
  Layers: "layers",
};

export function iconeAba(nome: string): string {
  return ICONE_ABA[nome] ?? "dot";
}

export interface CommandPaletteProps {
  aberto: boolean;
  onClose: () => void;
  onAba: (id: AbaId) => void;
}

export function CommandPalette({ aberto, onClose, onAba }: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aberto) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [aberto]);

  if (!aberto) return null;

  const filtradas = ABAS.filter(
    (a) =>
      !q ||
      a.label.toLowerCase().includes(q.toLowerCase()) ||
      a.id.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
      }}
      onClick={onClose}
    >
      <div
        className="os-card"
        style={{ width: 540, maxHeight: 440, overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="row gap-2">
            <Icon name="search" size={14} />
            <input
              ref={inputRef}
              className="input"
              style={{ border: "none", background: "transparent", flex: 1, height: 28 }}
              placeholder="buscar aba..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="badge" style={{ fontSize: 10 }}>Esc</span>
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: 6 }}>
          {filtradas.map((a) => (
            <button
              key={a.id}
              className="btn btn-ghost"
              style={{ width: "100%", justifyContent: "flex-start", gap: 8, height: 36, padding: "0 10px", borderRadius: 8 }}
              onClick={() => { onAba(a.id); onClose(); }}
            >
              <Icon name={iconeAba(a.icone)} size={13} />
              <span style={{ flex: 1, textAlign: "left", fontSize: 13 }}>{a.label}</span>
              {a.badge && (
                <span className="badge badge-info" style={{ fontSize: 10 }}>{a.badge}</span>
              )}
              {a.atalho && (
                <span className="badge" style={{ fontSize: 10 }}>⌘{a.atalho}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

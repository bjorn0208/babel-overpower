/**
 * ModalRecursos — menu de recursos da call (anfitrião).
 *
 * Fase 1: contratos. Lista os contratos `pendente` do tenant e "Enviar na
 * call" dispara o comando `abrir_recurso` — o link público de assinatura
 * abre na tela dos participantes e o lead assina sem sair da reunião.
 */

import { useEffect, useState } from "react";
import { FileText, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cor } from "./reuniao-ui";

export type ContratoResumo = {
  id: string;
  titulo: string | null;
  chave_publica: string;
  created_at: string | null;
};

type Props = {
  aoEnviar: (contrato: ContratoResumo) => void;
  aoFechar: () => void;
};

export default function ModalRecursos({ aoEnviar, aoFechar }: Props) {
  const [contratos, setContratos] = useState<ContratoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from("contratos")
        .select("id, titulo, chave_publica, created_at")
        .eq("status", "pendente")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!vivo) return;
      setContratos((data ?? []) as ContratoResumo[]);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 40, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "oklch(0.05 0.01 264 / 0.6)", backdropFilter: "blur(3px)",
      }}
      onClick={aoFechar}
    >
      <div
        className="reu-surgir"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, calc(100% - 32px))", maxHeight: "70%", overflowY: "auto",
          background: cor.fundo, border: `1px solid ${cor.borda}`, borderRadius: 18,
          padding: 18, display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: cor.texto1 }}>
            <FileText size={16} /> Recursos da call — Contratos
          </span>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar recursos"
            style={{ background: "transparent", border: "none", color: cor.texto2, cursor: "pointer" }}
          >
            <X size={17} />
          </button>
        </div>

        {carregando && <span style={{ fontSize: 12.5, color: cor.texto3 }}>Buscando contratos…</span>}
        {!carregando && contratos.length === 0 && (
          <span style={{ fontSize: 12.5, color: cor.texto3 }}>
            Nenhum contrato pendente. Crie no app Contratos e volte aqui.
          </span>
        )}

        {contratos.map((contrato) => (
          <div
            key={contrato.id}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              background: cor.tile, borderRadius: 12, padding: "10px 12px",
            }}
          >
            <span style={{ fontSize: 13, color: cor.texto1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {contrato.titulo || "Contrato sem título"}
            </span>
            <button
              type="button"
              onClick={() => aoEnviar(contrato)}
              style={{
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                background: cor.primario, color: cor.texto1, border: "none",
                borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Send size={13} /> Enviar na call
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

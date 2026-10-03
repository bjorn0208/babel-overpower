/**
 * PainelTranscricao — legenda ao vivo da call, só pro time.
 *
 * O transcritor da VPS manda cada faixa pro Deepgram e publica no Realtime
 * (`sala:<id>`, evento `turno`) + grava em `salas_reuniao_turnos`. Aqui:
 * carga inicial da tabela (quem entra no meio da call vê o que já foi dito)
 * + falas novas chegando ao vivo. Convidado NUNCA monta este componente —
 * ele só existe no lado logado (Reuniao.tsx).
 */

import { useEffect, useRef, useState } from "react";
import { Captions, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { assinarBroadcastSala } from "./canal-sala";
import { cor } from "./reuniao-ui";

// `salas_reuniao_turnos` ainda não está nos tipos gerados do client — cast
// bruto no padrão dos apps admin (SupabaseBruto).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Fala = { id: string; nome: string; doTime: boolean; texto: string; hora: string };

const MAX_FALAS = 120;

function horaAgora(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function PainelTranscricao({ salaId }: { salaId: string }) {
  const [aberto, setAberto] = useState(true);
  const [falas, setFalas] = useState<Fala[]>([]);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await sb
        .from("salas_reuniao_turnos")
        .select("id, nome, do_time, texto, falado_em")
        .eq("sala_id", salaId)
        .is("deleted_at", null)
        .order("falado_em", { ascending: true })
        .limit(MAX_FALAS);
      if (!vivo || !data) return;
      setFalas(
        (data as { id: string; nome: string; do_time: boolean; texto: string; falado_em: string }[])
          .map((l) => ({ id: l.id, nome: l.nome, doTime: l.do_time, texto: l.texto, hora: horaAgora(l.falado_em) })),
      );
    })();

    // Canal compartilhado do topic `sala:<id>` (mesmo do dossiê) — a VPS publica
    // evento `turno`. O helper garante 1 único join no socket entre os painéis.
    const desassinar = assinarBroadcastSala(salaId, "turno", (payload) => {
      const msg = payload as { peerId: string; nome: string; doTime: boolean; texto: string; t: number };
      if (!msg?.texto) return;
      setFalas((atual) =>
        [...atual, {
          id: `${msg.peerId}-${msg.t}`,
          nome: msg.nome,
          doTime: msg.doTime,
          texto: msg.texto,
          hora: horaAgora(),
        }].slice(-MAX_FALAS),
      );
    });
    return () => {
      vivo = false;
      desassinar();
    };
  }, [salaId]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [falas.length]);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Abrir transcrição da call"
        style={{
          position: "absolute", bottom: 96, left: 16, zIndex: 30,
          width: 42, height: 42, borderRadius: "50%", border: `1px solid ${cor.borda}`,
          background: cor.superficie, color: cor.texto1, cursor: "pointer",
          display: "grid", placeItems: "center", backdropFilter: "blur(6px)",
        }}
      >
        <Captions size={18} />
      </button>
    );
  }

  return (
    <div
      className="reu-surgir"
      style={{
        position: "absolute", bottom: 96, left: 16, zIndex: 30,
        width: 330, maxHeight: "42%", display: "flex", flexDirection: "column", gap: 8,
        background: cor.superficie, border: `1px solid ${cor.borda}`,
        borderRadius: 16, padding: 14, backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: cor.texto1 }}>
          <Captions size={15} /> Transcrição ao vivo
        </span>
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Recolher transcrição"
          style={{ background: "transparent", border: "none", color: cor.texto2, cursor: "pointer" }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
        {falas.length === 0 && (
          <span style={{ fontSize: 12, color: cor.texto3 }}>
            Ouvindo… o que for falado aparece aqui e fica salvo na ata.
          </span>
        )}

        {falas.map((fala) => (
          <div key={fala.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <b style={{ fontSize: 11.5, fontWeight: 700, color: fala.doTime ? cor.vivo : cor.texto1 }}>
                {fala.nome}
              </b>
              <span style={{ fontSize: 10, color: cor.texto3, fontVariantNumeric: "tabular-nums" }}>{fala.hora}</span>
            </span>
            <span style={{ fontSize: 12, lineHeight: 1.5, color: cor.texto2 }}>{fala.texto}</span>
          </div>
        ))}
        <div ref={fimRef} />
      </div>
    </div>
  );
}

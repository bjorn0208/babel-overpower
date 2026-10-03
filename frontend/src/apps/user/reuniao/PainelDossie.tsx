/**
 * PainelDossie — dossiê da call ao vivo, só pro time.
 *
 * O transcritor da VPS ouve as faixas, extrai dados por LLM e publica no
 * Realtime (`sala:<id>`, evento `dossie`) + grava em `salas_reuniao_dossie`.
 * Aqui: carga inicial da tabela + atualizações ao vivo. Um card por pessoa
 * (convidados) + bloco "Combinados" da reunião. Convidado NUNCA monta este
 * componente — ele só existe no lado logado (Reuniao.tsx).
 */

import { useEffect, useState } from "react";
import { NotebookPen, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { assinarBroadcastSala } from "./canal-sala";
import { cor } from "./reuniao-ui";

// `salas_reuniao_dossie` ainda não está nos tipos gerados do client — cast
// bruto no padrão dos apps admin (SupabaseBruto).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Dossie = { peerId: string; nome: string; dados: Record<string, unknown> };

const ROTULOS: Record<string, string> = {
  nome: "Nome",
  cargo: "Cargo",
  empresa: "Empresa",
  dor: "Dor",
  orcamento: "Orçamento",
  prazo: "Prazo",
};

export default function PainelDossie({ salaId }: { salaId: string }) {
  const [aberto, setAberto] = useState(true);
  const [dossies, setDossies] = useState<Record<string, Dossie>>({});

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await sb
        .from("salas_reuniao_dossie")
        .select("peer_id, nome, dados")
        .eq("sala_id", salaId)
        .is("deleted_at", null);
      if (!vivo || !data) return;
      const mapa: Record<string, Dossie> = {};
      for (const linha of data as { peer_id: string; nome: string; dados: Record<string, unknown> }[]) {
        mapa[linha.peer_id] = { peerId: linha.peer_id, nome: linha.nome, dados: linha.dados ?? {} };
      }
      setDossies(mapa);
    })();

    // Canal compartilhado do topic `sala:<id>` (mesmo da transcrição) — a VPS
    // publica evento `dossie`. O helper garante 1 único join no socket.
    const desassinar = assinarBroadcastSala(salaId, "dossie", (payload) => {
      const msg = payload as Dossie;
      if (!msg?.peerId) return;
      setDossies((atual) => ({ ...atual, [msg.peerId]: msg }));
    });
    return () => {
      vivo = false;
      desassinar();
    };
  }, [salaId]);

  const pessoas = Object.values(dossies).filter((d) => d.peerId !== "__geral__");
  const geral = dossies["__geral__"];
  const combinados = Array.isArray(geral?.dados?.combinados)
    ? (geral!.dados.combinados as string[])
    : [];

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Abrir dossiê da call"
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 30,
          width: 42, height: 42, borderRadius: "50%", border: `1px solid ${cor.borda}`,
          background: cor.superficie, color: cor.texto1, cursor: "pointer",
          display: "grid", placeItems: "center", backdropFilter: "blur(6px)",
        }}
      >
        <NotebookPen size={18} />
      </button>
    );
  }

  return (
    <div
      className="reu-surgir"
      style={{
        position: "absolute", top: 16, right: 16, bottom: 96, zIndex: 30,
        width: 280, display: "flex", flexDirection: "column", gap: 10,
        background: cor.superficie, border: `1px solid ${cor.borda}`,
        borderRadius: 16, padding: 14, backdropFilter: "blur(10px)",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: cor.texto1 }}>
          <NotebookPen size={15} /> Dossiê da call
        </span>
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Recolher dossiê"
          style={{ background: "transparent", border: "none", color: cor.texto2, cursor: "pointer" }}
        >
          <X size={16} />
        </button>
      </div>

      {pessoas.length === 0 && combinados.length === 0 && (
        <span style={{ fontSize: 12, color: cor.texto3 }}>
          Ouvindo… os dados que o contato falar vão aparecer aqui.
        </span>
      )}

      {pessoas.map((pessoa) => (
        <div
          key={pessoa.peerId}
          style={{ background: cor.tile, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: cor.texto1 }}>{pessoa.nome}</span>
          {Object.entries(pessoa.dados).map(([campo, valor]) =>
            ROTULOS[campo] && valor ? (
              <span key={campo} style={{ fontSize: 12, color: cor.texto2 }}>
                <b style={{ color: cor.texto1, fontWeight: 600 }}>{ROTULOS[campo]}:</b> {String(valor)}
              </span>
            ) : null,
          )}
        </div>
      ))}

      {combinados.length > 0 && (
        <div style={{ background: cor.tile, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: cor.vivo }}>Combinados</span>
          {combinados.map((item, i) => (
            <span key={i} style={{ fontSize: 12, color: cor.texto2 }}>• {item}</span>
          ))}
        </div>
      )}
    </div>
  );
}

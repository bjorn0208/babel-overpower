/**
 * Mensagem personalizada da campanha — texto, foto ou vídeo.
 *
 * Pedido do Theus (2026-09-17): "na parte de criação ter como eu escrever
 * mensagem personalizada para disparar texto, video ou foto".
 *
 * Decisão dele: o texto sai LITERAL no 1º contato (com os placeholders trocados),
 * sem passar pelo modelo. Deixar em branco mantém o comportamento antigo — a
 * agente escreve a abordagem.
 *
 * Mídia vai pro bucket `disparo-lead-midias` (o mesmo do Mentor de Disparo).
 */

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { Campo, inputStyle, type SupabaseBruto } from "../re-exports";

export type TipoConteudoCampanha = "texto" | "foto" | "foto_texto" | "video";

export interface EstadoMensagem {
  tipo_conteudo: TipoConteudoCampanha;
  mensagem_inicial: string;
  midia_url: string | null;
}

export const estadoMensagemInicial: EstadoMensagem = {
  tipo_conteudo: "texto",
  mensagem_inicial: "",
  midia_url: null,
};

const OPCOES: Array<{ id: TipoConteudoCampanha; rotulo: string }> = [
  { id: "texto", rotulo: "Só texto" },
  { id: "foto", rotulo: "Só foto" },
  { id: "foto_texto", rotulo: "Foto + texto" },
  { id: "video", rotulo: "Vídeo + texto" },
];

const MAX_BYTES = 25 * 1024 * 1024;

/** Mídia é obrigatória em tudo que não é só texto. */
export function mensagemValida(e: EstadoMensagem): boolean {
  if (e.tipo_conteudo === "texto") return true;
  if (!e.midia_url) return false;
  if (e.tipo_conteudo === "foto") return true;
  return e.mensagem_inicial.trim().length > 0;
}

export function CamposMensagemCampanha({
  ownerId,
  estado,
  setEstado,
}: {
  ownerId: string;
  estado: EstadoMensagem;
  setEstado: (e: EstadoMensagem) => void;
}) {
  const refArquivo = useRef<HTMLInputElement | null>(null);
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const precisaMidia = estado.tipo_conteudo !== "texto";

  const subir = async (file: File) => {
    setErro(null);
    if (file.size > MAX_BYTES) {
      setErro(`Arquivo muito grande (${Math.round(file.size / 1048576)} MB). Limite: 25 MB.`);
      return;
    }
    const ehVideo = file.type.startsWith("video/");
    if (estado.tipo_conteudo === "video" && !ehVideo) {
      setErro("Esse tipo de disparo espera um vídeo.");
      return;
    }
    if (estado.tipo_conteudo !== "video" && !file.type.startsWith("image/")) {
      setErro("Esse tipo de disparo espera uma imagem.");
      return;
    }
    setSubindo(true);
    try {
      const sb = supabase as SupabaseBruto;
      const ext = (file.name.includes(".") ? file.name.split(".").pop() : "") || (ehVideo ? "mp4" : "jpg");
      const caminho = `${ownerId}/campanha-${Date.now()}.${ext.toLowerCase()}`;
      const { error } = await sb.storage.from("disparo-lead-midias").upload(caminho, file);
      if (error) throw error;
      const { data: pub } = sb.storage.from("disparo-lead-midias").getPublicUrl(caminho);
      setEstado({ ...estado, midia_url: pub?.publicUrl ?? null });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setSubindo(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Campo label="Primeira mensagem (opcional)">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {OPCOES.map((o) => {
            const on = estado.tipo_conteudo === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  setEstado({
                    ...estado,
                    tipo_conteudo: o.id,
                    midia_url: o.id === "texto" ? null : estado.midia_url,
                  })
                }
                style={{
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  cursor: "pointer",
                  color: on ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.55)",
                  background: on ? "oklch(0.7 0.18 220 / 0.18)" : "oklch(0.98 0 0 / 0.05)",
                  border: `1px solid ${on ? "oklch(0.7 0.18 220 / 0.45)" : "oklch(0.98 0 0 / 0.12)"}`,
                }}
              >
                {o.rotulo}
              </button>
            );
          })}
        </div>

        <textarea
          value={estado.mensagem_inicial}
          onChange={(ev) => setEstado({ ...estado, mensagem_inicial: ev.target.value })}
          rows={4}
          placeholder={
            "Deixe em branco para a agente escrever a abordagem.\n\nOu escreva a mensagem que deve sair exatamente assim. Dá para usar {{nome}}, {{produto}} e {{fase_pipeline}}."
          }
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
        <div style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.45)", marginTop: 6, lineHeight: 1.5 }}>
          Com texto escrito, a primeira mensagem sai igual ao que você digitou e a agente assume a
          conversa a partir da resposta do lead. Em branco, a agente escreve como faz hoje.
        </div>
      </Campo>

      {precisaMidia && (
        <Campo label={estado.tipo_conteudo === "video" ? "Vídeo" : "Foto"}>
          <input
            ref={refArquivo}
            type="file"
            accept={estado.tipo_conteudo === "video" ? "video/*" : "image/*"}
            style={{ display: "none" }}
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (f) void subir(f);
              ev.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => refArquivo.current?.click()}
            disabled={subindo}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 8,
              cursor: subindo ? "default" : "pointer",
              color: "oklch(0.98 0 0 / 0.8)",
              background: "oklch(0.98 0 0 / 0.06)",
              border: "1px solid oklch(0.98 0 0 / 0.14)",
            }}
          >
            <Upload size={13} />
            {subindo ? "Enviando…" : estado.midia_url ? "Trocar arquivo" : "Escolher arquivo"}
          </button>
          {estado.midia_url && (
            <div style={{ fontSize: 10.5, color: "oklch(0.78 0.18 145)", marginTop: 6 }}>
              Arquivo pronto para o disparo.
            </div>
          )}
          {erro && (
            <div style={{ fontSize: 10.5, color: "oklch(0.7 0.22 25)", marginTop: 6 }}>{erro}</div>
          )}
        </Campo>
      )}
    </div>
  );
}

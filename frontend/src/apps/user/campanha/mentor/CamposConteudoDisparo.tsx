/**
 * Campos visuais de conteúdo do disparo fixo (tipo/mensagem/mídia/agenda) —
 * usado pelos dois composers (por lista salva e por números manuais).
 */

import { motion } from "framer-motion";
import { Image as ImageIcon, Loader2, Upload } from "lucide-react";

import { tapPress } from "@/os/motion/presets";
import { botaoSecundarioStyle, Campo, inputStyle } from "../re-exports";
import type { TipoConteudoDisparo } from "./tipos";
import type { ConteudoDisparo } from "./use-conteudo-disparo";

export function CamposConteudoDisparo({ conteudo }: { conteudo: ConteudoDisparo }) {
  const {
    tipoConteudo,
    setTipoConteudo,
    mensagem,
    setMensagem,
    midiaUrl,
    enviandoMidia,
    aoEscolherArquivo,
    inputRef,
    modoAgendamento,
    setModoAgendamento,
    horario,
    setHorario,
    tempoDescanso,
    setTempoDescanso,
    precisaMidia,
  } = conteudo;

  return (
    <>
      <Campo label="Tipo de conteúdo">
        <select
          value={tipoConteudo}
          onChange={(e) => setTipoConteudo(e.target.value as TipoConteudoDisparo)}
          style={inputStyle}
        >
          <option value="texto">Só texto</option>
          <option value="foto">Só foto</option>
          <option value="foto_texto">Foto + texto</option>
          <option value="video">Vídeo + texto</option>
        </select>
      </Campo>

      <Campo label="Mensagem" hint="Placeholders: {{nome}} {{produto}} {{fase_pipeline}}">
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={4}
          placeholder="Oi {{nome}}, tudo bem?…"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </Campo>

      {precisaMidia && (
        <Campo label="Mídia">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              onChange={aoEscolherArquivo}
              style={{ display: "none" }}
            />
            <motion.button
              type="button"
              whileTap={tapPress}
              onClick={() => inputRef.current?.click()}
              disabled={enviandoMidia}
              style={{
                ...botaoSecundarioStyle,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {enviandoMidia ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Upload size={13} />
              )}
              {enviandoMidia ? "Enviando…" : "Escolher arquivo"}
            </motion.button>
            {midiaUrl && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: "oklch(0.72 0.18 145)",
                }}
              >
                <ImageIcon size={12} /> anexado
              </span>
            )}
          </div>
        </Campo>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo label="Quando">
          <select
            value={modoAgendamento}
            onChange={(e) => setModoAgendamento(e.target.value as "agora" | "recorrente")}
            style={inputStyle}
          >
            <option value="agora">Agora (dispara 1x)</option>
            <option value="recorrente">Recorrente — todo dia num horário</option>
          </select>
        </Campo>
        {modoAgendamento === "recorrente" ? (
          <Campo label="Horário (BRT)">
            <input
              type="time"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              style={inputStyle}
            />
          </Campo>
        ) : (
          <Campo label="Descanso entre envios (s)">
            <input
              type="number"
              min={1}
              value={tempoDescanso}
              onChange={(e) => setTempoDescanso(Number(e.target.value))}
              style={inputStyle}
            />
          </Campo>
        )}
      </div>
    </>
  );
}

// @ts-nocheck
/**
 * ChatCuradoria — chat lateral do app Curadoria.
 *
 * Onda 2G: resizable (drag handle) + collapsible (toggle).
 * Props largura/colapsado/onLarguraChange/onAlternarColapsado vêm do orquestrador Curadoria.tsx.
 *
 * Layout (top → bottom):
 *   ┌──────────────────────────────────────┐
 *   │ Header: avatar Curadoria + modelo    │
 *   ├──────────────────────────────────────┤
 *   │ Lista de bolhas (scroll)             │
 *   ├──────────────────────────────────────┤
 *   │ SeletorLlm + composer                │
 *   └──────────────────────────────────────┘
 *   [drag handle 4px na borda direita]
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import type { AbaId, MidiaPendenteCuradoria, TenantImpersonado } from "../dados/tipos";
import { SeletorLlm } from "./SeletorLlm";
import { useChatCuradoria } from "./dados/use-chat-curadoria";
import { useGravarAudio, useUploadAnexo } from "./dados/hooks-midia";
import { LARGURA_COLAPSADO } from "./dados/use-largura-chat";

interface ChatCuradoriaProps {
  abaAtivaId: AbaId;
  tenantImpersonado: TenantImpersonado;
  largura: number;
  colapsado: boolean;
  onLarguraChange: (n: number) => void;
  onAlternarColapsado: () => void;
}

interface AnexoPendente {
  midia: MidiaPendenteCuradoria;
  url_assinada?: string;
}

export function ChatCuradoria({
  abaAtivaId,
  tenantImpersonado,
  largura,
  colapsado,
  onLarguraChange,
  onAlternarColapsado,
}: ChatCuradoriaProps) {
  const chat = useChatCuradoria({ aba_ativa: abaAtivaId, tenant: tenantImpersonado });
  const upload = useUploadAnexo();
  const audio = useGravarAudio();
  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<AnexoPendente | null>(null);
  const refLista = useRef<HTMLDivElement>(null);
  const refTextarea = useRef<HTMLTextAreaElement>(null);
  const refInputArquivo = useRef<HTMLInputElement>(null);
  const refInputImagem = useRef<HTMLInputElement>(null);

  // drag handle state
  const arrastandoRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(largura);

  // auto-scroll pra última bolha
  useEffect(() => {
    refLista.current?.scrollTo({
      top: refLista.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat.mensagens.length, chat.enviando]);

  async function tratarArquivo(arquivo: File) {
    const midia: MidiaPendenteCuradoria = {
      arquivo,
      tipo: arquivo.type.startsWith("image/")
        ? "imagem"
        : arquivo.type.startsWith("audio/")
          ? "audio"
          : arquivo.type.startsWith("video/")
            ? "video"
            : "documento",
      nome: arquivo.name,
      mime: arquivo.type,
    };
    setAnexo({ midia });
    const res = await upload.enviar(arquivo);
    if (res) {
      setAnexo({ midia, url_assinada: res.url_publica });
    } else {
      setAnexo(null);
    }
  }

  async function alternarAudio() {
    if (audio.gravando) {
      const m = await audio.parar();
      if (m?.arquivo) await tratarArquivo(m.arquivo);
    } else {
      await audio.iniciar();
    }
  }

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo && !anexo) return;
    const midiaPraEnviar = anexo?.url_assinada
      ? { url: anexo.url_assinada, tipo: anexo.midia.tipo }
      : undefined;
    setTexto("");
    setAnexo(null);
    await chat.enviar(conteudo || `(anexo: ${anexo?.midia.nome ?? "arquivo"})`, midiaPraEnviar);
    refTextarea.current?.focus();
  }

  function tratarTeclado(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  // Drag handle — pointer events
  function handleDragPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    arrastandoRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = largura;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function handleDragPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastandoRef.current) return;
    const delta = e.clientX - startXRef.current;
    onLarguraChange(startWidthRef.current + delta);
  }

  function handleDragPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    arrastandoRef.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  }

  // ── SIDEBAR COLAPSADA ──────────────────────────────────────────────────────
  if (colapsado) {
    return (
      <aside
        style={{
          width: LARGURA_COLAPSADO,
          height: "100%",
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: "rgba(255,255,255,0.02)",
          overflow: "hidden",
          gap: 12,
          paddingTop: 10,
        }}
      >
        {/* Avatar aurora compacto */}
        <div
          className="row center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "linear-gradient(135deg, var(--os-acento-1), var(--os-acento-2))",
            flexShrink: 0,
          }}
        >
          <Icon name="sparkles" size={14} />
        </div>

        {/* Botão expandir */}
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onAlternarColapsado}
          aria-label="Abrir chat"
          title="Abrir chat"
        >
          <Icon name="chevronRight" size={14} />
        </button>
      </aside>
    );
  }

  // ── CHAT EXPANDIDO ─────────────────────────────────────────────────────────
  return (
    <aside
      style={{
        width: "100%",
        height: "100%",
        flexShrink: 0,
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* HEADER — minimal: avatar + título + ações sutis */}
      <div
        className="row gap-2"
        style={{
          padding: "12px 16px",
          flexShrink: 0,
        }}
      >
        <div
          className="row center"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "linear-gradient(135deg, var(--os-acento-1), var(--os-acento-2))",
            flexShrink: 0,
          }}
        >
          <Icon name="sparkles" size={11} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: 0.1 }}>Curadoria</div>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={chat.resetar}
          aria-label="nova conversa"
          title="nova conversa"
          style={{ opacity: 0.55 }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.55"; }}
        >
          <Icon name="refresh" size={12} />
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onAlternarColapsado}
          aria-label="Recolher chat"
          title="Recolher chat"
          style={{ opacity: 0.55 }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.55"; }}
        >
          <Icon name="chevronLeft" size={12} />
        </button>
      </div>

      {/* LISTA DE MENSAGENS */}
      <div
        ref={refLista}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 0,
        }}
      >
        {chat.sessao_carregando && (
          <div className="muted tiny" style={{ padding: "16px 0", textAlign: "center", opacity: 0.6 }}>
            abrindo sessão…
          </div>
        )}

        {!chat.sessao_carregando && chat.mensagens.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", opacity: 0.5 }}>
            <div
              className="row center"
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "linear-gradient(135deg, var(--os-acento-1-soft), var(--os-acento-2-soft))",
                margin: "0 auto 8px",
              }}
            >
              <Icon name="sparkles" size={14} />
            </div>
            <div className="muted tiny">Curadoria</div>
          </div>
        )}

        {chat.mensagens.map((m) => (
          <Bolha key={m.id} mensagem={m} />
        ))}

        {chat.enviando && (
          <div className="muted tiny" style={{ paddingLeft: 4, opacity: 0.6 }}>digitando…</div>
        )}
      </div>

      {/* ERROS */}
      {(chat.erro || upload.erro) && (
        <div style={{ padding: "0 12px 8px" }}>
          {chat.erro && (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                background: "oklch(0.65 0.24 25 / 0.12)",
                border: "1px solid oklch(0.65 0.24 25 / 0.3)",
                fontSize: 11,
                color: "oklch(0.82 0.20 25)",
              }}
            >
              {chat.erro}
            </div>
          )}
          {upload.erro && (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                background: "oklch(0.65 0.24 25 / 0.12)",
                border: "1px solid oklch(0.65 0.24 25 / 0.3)",
                fontSize: 11,
                color: "oklch(0.82 0.20 25)",
                marginTop: 4,
              }}
            >
              upload: {upload.erro}
            </div>
          )}
        </div>
      )}

      {/* COMPOSER — minimal: textarea grande + SeletorLlm inline com ações */}
      <div
        style={{
          padding: "10px 14px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* Anexo pendente */}
        {anexo && (
          <div
            className="row gap-2"
            style={{
              padding: "5px 10px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {anexo.midia.tipo === "imagem" && <Icon name="image" size={12} />}
            {anexo.midia.tipo === "audio" && <Icon name="mic" size={12} />}
            {anexo.midia.tipo === "documento" && <Icon name="folder" size={12} />}
            {anexo.midia.tipo === "video" && <Icon name="play" size={12} />}
            <span className="tiny mono muted" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {anexo.midia.nome}
            </span>
            {!anexo.url_assinada && upload.enviando && (
              <span className="tiny muted">enviando…</span>
            )}
            {anexo.url_assinada && <Icon name="check" size={11} />}
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              style={{ width: 18, height: 18 }}
              onClick={() => setAnexo(null)}
              aria-label="remover anexo"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        )}

        {/* Gravando áudio */}
        {audio.gravando && (
          <div
            className="row gap-2"
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              background: "oklch(0.65 0.24 25 / 0.10)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "oklch(0.65 0.24 25)",
                boxShadow: "0 0 6px oklch(0.65 0.24 25 / 0.8)",
                animation: "pulse 1s infinite",
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <span className="tiny" style={{ color: "oklch(0.82 0.20 25)", flex: 1, fontSize: 11 }}>
              gravando · {audio.duracaoSegundos}s
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ height: 18, padding: "0 6px", fontSize: 10 }}
              onClick={() => audio.cancelar()}
            >
              cancelar
            </button>
          </div>
        )}

        {/* Caixa do composer — superfície única com textarea + ações inline */}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            background: "rgba(255,255,255,0.025)",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <textarea
            ref={refTextarea}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={tratarTeclado}
            placeholder="mensagem…"
            rows={2}
            style={{
              width: "100%",
              resize: "none",
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: "inherit",
              minHeight: 44,
              maxHeight: 200,
              padding: "4px 6px",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "inherit",
            }}
          />

          {/* Linha inferior: SeletorLlm à esquerda · ações à direita */}
          <div className="row gap-1" style={{ alignItems: "center" }}>
            <SeletorLlm valor={chat.modelo} onChange={chat.setModelo} />
            <div style={{ flex: 1 }} />

            {/* Inputs ocultos */}
            <input
              ref={refInputArquivo}
              type="file"
              style={{ display: "none" }}
              accept="application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void tratarArquivo(f);
                e.target.value = "";
              }}
            />
            <input
              ref={refInputImagem}
              type="file"
              style={{ display: "none" }}
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void tratarArquivo(f);
                e.target.value = "";
              }}
            />

            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="anexar arquivo"
              title="anexar arquivo"
              onClick={() => refInputArquivo.current?.click()}
              style={{ opacity: 0.7 }}
            >
              <Icon name="paperclip" size={13} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="anexar imagem ou vídeo"
              title="anexar imagem"
              onClick={() => refInputImagem.current?.click()}
              style={{ opacity: 0.7 }}
            >
              <Icon name="image" size={13} />
            </button>
            <button
              type="button"
              className={`btn btn-icon btn-sm ${audio.gravando ? "btn-primary" : "btn-ghost"}`}
              aria-label={audio.gravando ? "parar gravação" : "gravar áudio"}
              title={audio.gravando ? "parar" : "gravar áudio"}
              onClick={() => void alternarAudio()}
              style={!audio.gravando ? { opacity: 0.7 } : undefined}
            >
              <Icon name="mic" size={13} />
            </button>
            <button
              type="button"
              className="btn btn-primary btn-icon btn-sm"
              aria-label="enviar mensagem"
              title="enviar (Enter)"
              onClick={() => void enviar()}
              disabled={chat.enviando || (!texto.trim() && !anexo?.url_assinada)}
            >
              <Icon name="send" size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* DRAG HANDLE — borda direita */}
      <div
        role="separator"
        aria-label="Redimensionar chat"
        aria-orientation="vertical"
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 4,
          height: "100%",
          cursor: "col-resize",
          zIndex: 10,
          background: "transparent",
          transition: "background 150ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--os-acento-1, oklch(0.65 0.22 260 / 0.4))";
        }}
        onMouseLeave={(e) => {
          if (!arrastandoRef.current) {
            e.currentTarget.style.background = "transparent";
          }
        }}
      />
    </aside>
  );
}

// ============================================================
// Bolha individual de mensagem
// ============================================================

interface BolhaProps {
  mensagem: import("../dados/tipos").MensagemChatCuradoria;
}

function Bolha({ mensagem }: BolhaProps) {
  if (mensagem.papel === "sistema") {
    return (
      <div className="muted tiny mono" style={{ textAlign: "center", padding: "4px 0", fontStyle: "italic" }}>
        {mensagem.conteudo}
      </div>
    );
  }

  const ehHumano = mensagem.papel === "humano";

  return (
    <div style={{ display: "flex", justifyContent: ehHumano ? "flex-end" : "flex-start" }}>
      <div
        className={ehHumano ? "bolha-out" : "bolha-in"}
        style={{ maxWidth: "88%" }}
      >
        {mensagem.midia_url && mensagem.midia_tipo === "imagem" && (
          <img
            src={mensagem.midia_url}
            alt="anexo"
            loading="lazy"
            decoding="async"
            style={{ borderRadius: 8, maxWidth: "100%", marginBottom: 6, display: "block" }}
          />
        )}
        {mensagem.midia_url && mensagem.midia_tipo === "audio" && (
          <audio src={mensagem.midia_url} controls preload="none" style={{ width: "100%", marginBottom: 6 }} />
        )}
        {mensagem.midia_url && mensagem.midia_tipo === "documento" && (
          <a
            href={mensagem.midia_url}
            target="_blank"
            rel="noopener noreferrer"
            className="row gap-2 tiny mono"
            style={{ marginBottom: 6, color: "var(--os-acento-1)" }}
          >
            <Icon name="folder" size={11} />
            anexo
          </a>
        )}
        <div style={{ whiteSpace: "pre-line", fontSize: 13, lineHeight: 1.5 }}>
          {mensagem.conteudo}
        </div>
        {mensagem.modelo_usado && !ehHumano && (
          <div className="muted tiny mono" style={{ marginTop: 6, opacity: 0.6 }}>
            {mensagem.modelo_usado}
          </div>
        )}
      </div>
    </div>
  );
}

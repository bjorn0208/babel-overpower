/**
 * Chat ativo — coluna central da tela Conversas.
 *
 * - Header: avatar + nome + telefone + cargo (pílula colorida) + toggle IA ligada/desligada
 * - Bolhas: WhatsApp-style (lead esquerda, agente direita, sistema centralizado)
 * - Composer: textarea + botões anexo/audio/enviar
 * - Onda A: composer NÃO envia ainda (toast info). Onda B conecta send-message edge.
 */

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { duration, easing, springSoft, tapPress } from "@/os/motion/presets";
import type { Conversa, Mensagem } from "./tipos";
import { supabase } from "@/integrations/supabase/client";
import { BotaoContrato } from "./BotaoContrato";

/** Logo da empresa do tenant — cache no módulo, 1 busca por sessão. */
let logoEmpresaCache: string | null | undefined;

/** Sem conversa aberta (Theus 2026-08-11): a logo da empresa preenche o vazio
 *  com 50% de transparência; sem logo cadastrada, cai no visual antigo. */
function PlaceholderSemConversa() {
  const [logo, setLogo] = useState<string | null>(logoEmpresaCache ?? null);
  useEffect(() => {
    if (logoEmpresaCache !== undefined) return;
    let ativo = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        logoEmpresaCache = null;
        return;
      }
      const { data } = await supabase
        .from("empresas")
        .select("logo_url")
        .eq("user_id", uid)
        .maybeSingle();
      logoEmpresaCache = (data?.logo_url as string | null) ?? null;
      if (ativo) setLogo(logoEmpresaCache);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 40,
        color: "var(--txt-3)",
      }}
      aria-label="Nenhuma conversa selecionada"
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          draggable={false}
          style={{ maxWidth: "70%", maxHeight: 380, objectFit: "contain", opacity: 0.25 }}
        />
      ) : (
        <>
          <div style={{ fontSize: 48, opacity: 0.4 }}>💬</div>
          <div className="muted small">Selecione uma conversa pra começar.</div>
          <div className="muted tiny">Ou arraste o nome de um contato pra fora pra abrir em janela isolada.</div>
        </>
      )}
    </div>
  );
}

export interface MidiaPendente {
  arquivo?: File;
  blob?: Blob;
  tipo: "imagem" | "audio" | "video" | "documento";
  nome?: string;
  duracao_segundos?: number;
}

/** Correção do dono numa bolha da agente (lápis do Chat Treino). */
export interface CorrecaoBolha {
  texto_corrigido?: string | null;
  sugestao?: string | null;
}

interface ChatAtivoProps {
  conversa: Conversa | null;
  onEnviar?: (texto: string) => void;
  onEnviarMidia?: (midia: MidiaPendente, legenda: string) => void;
  /** Reenvia mensagem marcada como não entregue (selo ⚠ na bolha). */
  onReenviar?: (mensagem: Mensagem) => void;
  /** Quando definido (ms), Enter NÃO envia direto: comita a bolha localmente,
   *  agenda timer de silêncio. Cada nova tecla reseta. Ao expirar, chama
   *  `onAgrupar(bolhas[])` com tudo que acumulou. Default: agrupamento off
   *  (Enter envia imediato via `onEnviar`). */
  agruparEm?: number;
  /** Callback do agrupamento: recebe TODAS as bolhas pendentes em 1 chamada. */
  onAgrupar?: (bolhas: string[]) => void;
  /** Chamado IMEDIATAMENTE quando o usuário comita uma bolha (Enter) no modo agrupado.
   *  Permite renderizar a bolha no chat na hora — sem esperar os 5s do silêncio. */
  onComitarLocal?: (texto: string) => void;
  /** Mostra typing indicator "agente digitando ~X.Ys" entre bolhas do agente.
   *  Passar null pra esconder. */
  agenteDigitando?: { duracao_ms: number } | null;
  /** Lead → cliente: marca location='cliente' + converted_at + fase do fluxo. */
  onTornarCliente?: () => void;
  /** Cliente → lead: desfaz a conversão (pacote Marcos 2026-07-22). */
  onVoltarParaLead?: () => void;
  /** Tira da fila de atendimento e manda pro CRM Base (location='base'). */
  onEnviarBase?: () => void;
  /** Apagar o contato inteiro e tudo isolado dele. Hard delete profundo via RPC
   *  `excluir_conversas_profundo_para_atendimento` (conversa, mensagens, ficha,
   *  memória, engajamento, PII, campanha, pagamentos, contratos). Irreversível. */
  onApagar?: () => void;
  /** Retomada manual: religa a conversa + dispara `[RETOMADA_MANUAL]` no motor
   *  novo (`ragentic-processar-inline`). O motor é RAG-FIRST: carrega contexto
   *  (últimos turnos + ficha + memória + blocos do tenant) sozinho e gera bolha
   *  contextualizada — não precisa passar nenhum payload de inferência. */
  onRetomar?: () => void;
  /** Estado do disparo da retomada — quando true, botão fica disabled e ícone
   *  anima (controlado pelo pai pra evitar duplo clique). */
  retomando?: boolean;
  /** Liga/pausa a IA SÓ desta conversa (`conversas.agent_enabled`). Quando
   *  presente, o header mostra o botão ⏸/▶ ao lado do nome do lead. */
  onToggleAgente?: (novo: boolean) => void;
  /** Termo da busca ativa (vem da barra de busca da lista). Com 2+ caracteres,
   *  destaca todas as ocorrências nas bolhas e mostra a barra "N de M" com
   *  setas pra navegar entre elas — igual busca dentro da conversa do WhatsApp. */
  termoBusca?: string;
  /** Esconde o header do contato — quem embute (Chat de Teste no celular) já
   *  mostra a própria barra de topo estilo WhatsApp. */
  ocultarHeader?: boolean;
  /** Chat Treino: mostra o lápis nas bolhas da agente pra o dono corrigir/sugerir. */
  onCorrigirMensagem?: (mensagem: Mensagem) => void;
  /** Chat Treino: correções já feitas, por id da bolha (mostra o texto corrigido na bolha). */
  correcoes?: Record<string, CorrecaoBolha>;
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Normaliza pra busca: minúsculas + sem acento, mapeando cada code point do
 * original pra EXATAMENTE 1 caractere — assim os índices achados no texto
 * normalizado apontam direto pro texto original (o destaque não desalinha).
 */
function normalizarBusca(texto: string): string {
  return Array.from(texto)
    .map((ch) => {
      const base = ch.normalize("NFD").replace(/\p{Diacritic}/gu, "");
      const baixo = (base[0] ?? ch).toLowerCase();
      return baixo[0] ?? ch;
    })
    .join("");
}

function mensagemCasaTermo(conteudo: string, termo: string): boolean {
  return normalizarBusca(conteudo).includes(normalizarBusca(termo));
}

/** Quebra de linha da mensagem vira quebra na bolha, como no WhatsApp (sem isso o
 * navegador cola os parágrafos numa linha só). */
const ESTILO_TEXTO_BOLHA = { whiteSpace: "pre-wrap" } as const;

/** Texto com todas as ocorrências do termo destacadas em `<mark>` (case/acento-insensível). */
function TextoDestacado({ texto, termo }: { texto: string; termo?: string }) {
  const chave = termo ? normalizarBusca(termo.trim()) : "";
  if (!chave || chave.length < 2) return <span style={ESTILO_TEXTO_BOLHA}>{texto}</span>;
  const chars = Array.from(texto);
  const alvo = normalizarBusca(texto);
  if (!alvo.includes(chave)) return <span style={ESTILO_TEXTO_BOLHA}>{texto}</span>;
  const partes: ReactNode[] = [];
  let cursor = 0;
  let n = 0;
  while (true) {
    const pos = alvo.indexOf(chave, cursor);
    if (pos === -1) break;
    if (pos > cursor) partes.push(chars.slice(cursor, pos).join(""));
    partes.push(
      <mark
        key={n++}
        style={{
          background: "oklch(0.85 0.16 90 / 0.85)",
          color: "oklch(0.2 0.05 90)",
          borderRadius: 3,
          padding: "0 1px",
        }}
      >
        {chars.slice(pos, pos + chave.length).join("")}
      </mark>,
    );
    cursor = pos + chave.length;
  }
  if (cursor < chars.length) partes.push(chars.slice(cursor).join(""));
  return <span style={ESTILO_TEXTO_BOLHA}>{partes}</span>;
}

/** Chave do dia (ano-mês-dia) no fuso do usuário — detecta virada de dia entre bolhas. */
function chaveDia(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Rótulo do separador de data no chat: "Hoje" / "Ontem" / "28 de junho de 2026" (fuso do usuário = BRT do Theus). */
function formatarDataSeparador(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Chip de data centralizado no fluxo do chat (padrão visual das pílulas do app). */
function SeparadorData({ rotulo }: { rotulo: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 2px" }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--txt-3)",
          padding: "3px 10px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {rotulo}
      </span>
    </div>
  );
}

function formatarTamanho(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatarDuracao(segundos?: number): string {
  if (!segundos) return "";
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ConteudoMidia({ m, dele, onAbrirLightbox, termo }: { m: Mensagem; dele: boolean; onAbrirLightbox: (url: string, legenda: string) => void; termo?: string }) {
  if ((m.tipo === "imagem" || m.tipo === "sticker") && m.midia_url) {
    const url = m.midia_url;
    return (
      <div>
        <button
          type="button"
          onClick={() => onAbrirLightbox(url, m.conteudo)}
          aria-label="Abrir imagem em tamanho maior"
          style={{
            padding: 0,
            background: "transparent",
            border: "none",
            cursor: "zoom-in",
            display: "block",
          }}
        >
          <img
            src={url}
            alt={m.conteudo || "Imagem enviada"}
            loading="lazy"
            decoding="async"
            style={{
              maxWidth: 280,
              maxHeight: 220,
              borderRadius: 10,
              display: "block",
            }}
          />
        </button>
        {m.conteudo && (
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--txt-2)" }}>
            <TextoDestacado texto={m.conteudo} termo={termo} />
          </div>
        )}
      </div>
    );
  }

  if (m.tipo === "audio" && m.midia_url) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: dele ? "rgba(255,255,255,0.1)" : "oklch(0.7 0.18 220 / 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          🎙
        </span>
        <audio
          controls
          src={m.midia_url}
          preload="none"
          style={{ height: 28, flex: 1, minWidth: 0 }}
          aria-label={m.conteudo || `Áudio de ${formatarDuracao(m.duracao_segundos)}`}
        />
        {m.duracao_segundos && (
          <span className="mono tiny" style={{ opacity: 0.7 }}>
            {formatarDuracao(m.duracao_segundos)}
          </span>
        )}
      </div>
    );
  }

  if (m.tipo === "video" && m.midia_url) {
    return (
      <div>
        <video
          controls
          src={m.midia_url}
          preload="none"
          style={{ maxWidth: 280, maxHeight: 200, borderRadius: 10, display: "block" }}
          aria-label={m.conteudo || "Vídeo enviado"}
        />
        {m.conteudo && (
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--txt-2)" }}>
            <TextoDestacado texto={m.conteudo} termo={termo} />
          </div>
        )}
      </div>
    );
  }

  if (m.tipo === "documento") {
    return (
      <a
        href={m.midia_url}
        target="_blank"
        rel="noopener noreferrer"
        download={m.nome_arquivo}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          minWidth: 200,
          textDecoration: "none",
          color: "inherit",
          cursor: m.midia_url ? "pointer" : "default",
        }}
        aria-label={`Baixar documento ${m.nome_arquivo || "arquivo"}`}
      >
        <span aria-hidden="true" style={{ fontSize: 22 }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {m.nome_arquivo || m.conteudo || "documento"}
          </div>
          {m.tamanho_bytes && (
            <div className="muted tiny mono">{formatarTamanho(m.tamanho_bytes)}</div>
          )}
        </div>
        <span aria-hidden="true" style={{ opacity: 0.6 }}>↓</span>
      </a>
    );
  }

  if (m.tipo === "localizacao" && m.local) {
    const { lat, lng, endereco } = m.local;
    const mapa = `https://www.google.com/maps?q=${lat},${lng}`;
    return (
      <a
        href={mapa}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          minWidth: 200,
          textDecoration: "none",
          color: "inherit",
        }}
        aria-label={`Abrir localização no mapa${endereco ? `: ${endereco}` : ""}`}
      >
        <span aria-hidden="true" style={{ fontSize: 22 }}>📍</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Localização</div>
          {endereco && (
            <div className="muted tiny" style={{ whiteSpace: "normal" }}>{endereco}</div>
          )}
        </div>
        <span aria-hidden="true" style={{ opacity: 0.6 }}>↗</span>
      </a>
    );
  }

  if (m.tipo === "contato" && m.contato) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          minWidth: 200,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 22 }}>👤</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{m.contato.nome}</div>
          {m.contato.telefones.map((tel) => (
            <div key={tel} className="muted tiny mono">{tel}</div>
          ))}
        </div>
      </div>
    );
  }

  // texto puro (default)
  return (
    <span>
      <TextoDestacado texto={m.conteudo} termo={termo} />
    </span>
  );
}

function Bolha({ m, onAbrirLightbox, htmlId, termoBusca, ocorrenciaAtiva, onReenviar, onCorrigir, correcao }: {
  m: Mensagem;
  onAbrirLightbox: (url: string, legenda: string) => void;
  /** id DOM da bolha — âncora do scroll da navegação de ocorrências. */
  htmlId?: string;
  /** Termo da busca ativa — destaca ocorrências no texto. */
  termoBusca?: string;
  /** true quando esta é a ocorrência selecionada na barra "N de M". */
  ocorrenciaAtiva?: boolean;
  /** Reenvia uma mensagem que não chegou no lead (selo "não entregue"). */
  onReenviar?: (mensagem: Mensagem) => void;
  /** Chat Treino: lápis de correção (só em bolha da agente). */
  onCorrigir?: (mensagem: Mensagem) => void;
  correcao?: CorrecaoBolha;
}) {
  const dele = m.papel === "lead";
  const sistema = m.papel === "sistema";
  const humano = m.papel === "humano";

  if (sistema) {
    // Marcos de contrato (gravados pelo trigger avisar_evento_contrato) viram
    // um cartão central, não texto cru "[CONTRATO_ASSINADO]".
    const tag = (m.conteudo ?? "").trim();
    const marco =
      tag === "[CONTRATO_ASSINADO]"
        ? { label: "Contrato assinado", cor: "oklch(0.72 0.18 145)" }
        : tag === "[COMPROVANTE_ENVIADO]"
          ? { label: "Comprovante de pagamento enviado", cor: "oklch(0.7 0.15 230)" }
          : null;
    if (marco) {
      return (
        <div
          id={htmlId}
          style={{
            alignSelf: "center",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            margin: "2px 0",
            borderRadius: 999,
            background: `color-mix(in oklch, ${marco.cor} 14%, transparent)`,
            border: `1px solid color-mix(in oklch, ${marco.cor} 38%, transparent)`,
            color: marco.cor,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {marco.label}
        </div>
      );
    }
    // Sem animação de entrada — quando msg otimista é promovida (id temp→real),
    // a key muda e o React desmonta+remonta. initial+animate re-disparava e dava
    // sensação de "refresh". Sem motion, a transição fica invisível.
    return (
      <div
        id={htmlId}
        className="muted tiny"
        style={{ alignSelf: "center", padding: "4px 12px", fontStyle: "italic" }}
      >
        <TextoDestacado texto={m.conteudo} termo={termoBusca} />
      </div>
    );
  }

  const ehMidia = m.tipo !== "texto";

  // Mensagem de intervenção humana — o tenant (ou um membro da equipe dele)
  // respondeu pelo MESMO WhatsApp do agente. Sai do lado do agente (direita),
  // mas identificada: foto + "Nome — Cargo" + acento âmbar pra bater o olho e
  // ver que foi gente, não a IA. Paridade com o atendimento antigo.
  if (humano) {
    const a = m.autor;
    const nome = a?.nome?.trim() || "Atendente";
    const cargo = a?.cargo?.trim() || "";
    const foto = a?.foto_url || null;
    const iniciais =
      nome
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?";
    const ambar = "oklch(0.8 0.16 75)";
    return (
      <div
        id={htmlId}
        style={{
          alignSelf: "flex-end",
          maxWidth: "75%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          outline: ocorrenciaAtiva ? "2px solid oklch(0.85 0.16 90 / 0.7)" : undefined,
          outlineOffset: 3,
          borderRadius: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 3,
            padding: "0 4px",
          }}
        >
          <span
            className="tiny"
            style={{ color: ambar, fontWeight: 600 }}
          >
            {nome}
            {cargo && (
              <span style={{ opacity: 0.75, fontWeight: 500 }}> — {cargo}</span>
            )}
          </span>
          <div
            aria-hidden
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              flexShrink: 0,
              background: foto
                ? `url(${foto}) center/cover`
                : "oklch(0.8 0.16 75 / 0.22)",
              border: "1px solid oklch(0.8 0.16 75 / 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 700,
              color: "oklch(0.88 0.14 75)",
            }}
          >
            {!foto && iniciais}
          </div>
        </div>
        <div
          style={{
            padding: ehMidia ? "6px 8px" : "9px 13px",
            borderRadius: "14px 14px 4px 14px",
            background: "oklch(0.8 0.16 75 / 0.14)",
            border: "1px solid oklch(0.8 0.16 75 / 0.30)",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--txt-1)",
            wordBreak: "break-word",
          }}
        >
          <ConteudoMidia m={m} dele={false} onAbrirLightbox={onAbrirLightbox} termo={termoBusca} />
        </div>
        <div
          className="muted tiny mono"
          style={{ marginTop: 2, textAlign: "right", padding: "0 6px" }}
        >
          {formatarHora(m.criado_em)}
        </div>
      </div>
    );
  }

  const podeCorrigir = !!onCorrigir && m.papel === "agente" && !ehMidia;
  const corrigida = !!correcao?.texto_corrigido?.trim() && correcao.texto_corrigido.trim() !== (m.conteudo ?? "").trim();

  // Sem motion.div — bolha entra estática (sem fade+slide) pra evitar
  // sensação de "refresh" quando msg otimista é promovida pra id real.
  return (
    <div
      id={htmlId}
      style={{
        alignSelf: dele ? "flex-start" : "flex-end",
        maxWidth: "75%",
        outline: ocorrenciaAtiva ? "2px solid oklch(0.85 0.16 90 / 0.7)" : undefined,
        outlineOffset: 3,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          padding: ehMidia ? "6px 8px" : "9px 13px",
          borderRadius: dele ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
          background: dele
            ? "rgba(255,255,255,0.06)"
            : "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.20), oklch(0.65 0.22 280 / 0.16))",
          border: dele
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid oklch(0.7 0.18 220 / 0.25)",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--txt-1)",
          wordBreak: "break-word",
        }}
      >
        {corrigida ? (
          <>
            <div style={{ whiteSpace: "pre-wrap" }}>{correcao!.texto_corrigido}</div>
            <div
              title="Texto original da agente"
              style={{ marginTop: 6, fontSize: 11, opacity: 0.55, textDecoration: "line-through", whiteSpace: "pre-wrap" }}
            >
              {m.conteudo}
            </div>
          </>
        ) : (
          <ConteudoMidia m={m} dele={dele} onAbrirLightbox={onAbrirLightbox} termo={termoBusca} />
        )}
        {correcao?.sugestao?.trim() && (
          <div
            style={{
              marginTop: 6,
              padding: "5px 8px",
              borderRadius: 8,
              fontSize: 11.5,
              background: "oklch(0.82 0.16 85 / 0.12)",
              border: "1px solid oklch(0.82 0.16 85 / 0.30)",
              color: "oklch(0.9 0.12 85)",
            }}
          >
            💡 {correcao.sugestao}
          </div>
        )}
      </div>
      <div className="muted tiny mono" style={{ marginTop: 2, textAlign: dele ? "left" : "right", padding: "0 6px" }}>
        {corrigida && (
          <span style={{ marginRight: 6, color: "oklch(0.85 0.16 145)", fontWeight: 700 }}>✓ corrigida ·</span>
        )}
        {formatarHora(m.criado_em)}
        {podeCorrigir && (
          <button
            type="button"
            onClick={() => onCorrigir!(m)}
            title="Corrigir esta resposta ou deixar uma sugestão"
            aria-label="Corrigir esta resposta"
            style={{
              marginLeft: 6,
              padding: "1px 7px",
              fontSize: 11,
              borderRadius: 999,
              cursor: "pointer",
              color: "var(--txt-1)",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            ✎
          </button>
        )}
        {m.duracao_digitacao_ms != null && (
          <span
            title="tempo real que esta bolha ficou digitando antes de aparecer"
            style={{ marginLeft: 6, opacity: 0.7 }}
          >
            · ⏱ {(m.duracao_digitacao_ms / 1000).toFixed(1)}s
          </span>
        )}
        {m.falhou && (
          <span style={{ marginLeft: 6, color: "oklch(0.68 0.22 25)", fontWeight: 700 }}>
            · ⚠ não entregue
            {onReenviar && (
              <button
                type="button"
                onClick={() => onReenviar(m)}
                style={{
                  marginLeft: 6,
                  padding: "1px 7px",
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 999,
                  cursor: "pointer",
                  color: "oklch(0.98 0 0)",
                  background: "oklch(0.68 0.22 25 / 0.28)",
                  border: "1px solid oklch(0.68 0.22 25 / 0.5)",
                }}
              >
                reenviar
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

interface LightboxImagem {
  url: string;
  legenda: string;
}

function Lightbox({ imagem, onFechar }: { imagem: LightboxImagem | null; onFechar: () => void }) {
  useEffect(() => {
    if (!imagem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [imagem, onFechar]);

  if (!imagem) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label="Visualização da imagem"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        cursor: "zoom-out",
      }}
    >
      <motion.img
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: duration.normal, ease: easing.outExpo }}
        src={imagem.url}
        alt={imagem.legenda || "Imagem ampliada"}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "100%",
          maxHeight: "85vh",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          cursor: "auto",
        }}
      />
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar visualização"
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "var(--txt-1)",
          fontSize: 18,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
      {imagem.legenda && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 16px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            color: "white",
            fontSize: 13,
            maxWidth: "80%",
            textAlign: "center",
          }}
        >
          {imagem.legenda}
        </div>
      )}
    </motion.div>
  );
}

function inferirTipoMidia(arquivo: File): MidiaPendente["tipo"] {
  if (arquivo.type.startsWith("image/")) return "imagem";
  if (arquivo.type.startsWith("audio/")) return "audio";
  if (arquivo.type.startsWith("video/")) return "video";
  return "documento";
}

export function ChatAtivo({ conversa, onEnviar, onEnviarMidia, onReenviar, agruparEm, onAgrupar, onComitarLocal, agenteDigitando, onTornarCliente, onVoltarParaLead, onEnviarBase, onApagar, onRetomar, retomando, onToggleAgente, termoBusca, ocultarHeader, onCorrigirMensagem, correcoes }: ChatAtivoProps) {
  const [draft, setDraft] = useState("");
  const [midiaPendente, setMidiaPendente] = useState<MidiaPendente | null>(null);
  const [gravando, setGravando] = useState(false);
  const [duracaoGravacao, setDuracaoGravacao] = useState(0);
  const [lightbox, setLightbox] = useState<LightboxImagem | null>(null);
  // Agrupamento de bolhas: pendentes acumulam até silêncio expirar
  const refPendentes = useRef<string[]>([]);
  const refSilencio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refContagem = useRef<ReturnType<typeof setInterval> | null>(null);
  const [silenciandoEm, setSilenciandoEm] = useState<number | null>(null);
  const refScroll = useRef<HTMLDivElement | null>(null);
  const refInputArquivo = useRef<HTMLInputElement | null>(null);
  const refRecorder = useRef<MediaRecorder | null>(null);
  const refChunks = useRef<Blob[]>([]);
  const refTimer = useRef<number | null>(null);
  const refInicio = useRef<number>(0);
  const composerId = useId();

  // Cleanup do agrupamento ao desmontar (antes de qualquer early return — Rules of Hooks)
  useEffect(() => {
    return () => {
      if (refSilencio.current) clearTimeout(refSilencio.current);
      if (refContagem.current) clearInterval(refContagem.current);
    };
  }, []);

  // Trocou/reiniciou a conversa → abandona o buffer de agrupamento da anterior.
  // Sem isso, o flush agendado (setTimeout de silêncio) dispara depois já na
  // conversa nova: a bolha vaza pra sessão errada ou some. Roda só quando o id
  // muda (não a cada mensagem nova), então não interrompe agrupamento em curso.
  useEffect(() => {
    if (refSilencio.current) {
      clearTimeout(refSilencio.current);
      refSilencio.current = null;
    }
    if (refContagem.current) {
      clearInterval(refContagem.current);
      refContagem.current = null;
    }
    refPendentes.current = [];
    setSilenciandoEm(null);
  }, [conversa?.id]);

  // Smart auto-scroll: só desce sozinho se o user JÁ ESTÁ no fim do chat.
  // Se ele subiu pra ler mensagem antiga, mantém a posição (não força refresh visual).
  // Ao TROCAR/ABRIR conversa, sempre vai pro fim — INSTANT, sem animação.
  const refPertoDoFim = useRef(true);
  const refUltimaConversaId = useRef<string | null>(null);

  // Última posição de leitura conhecida — âncora pra restaurar quando o
  // re-layout do browser perde o scroll (pulo pro topo ao chegar mensagem).
  const refUltimoScrollTop = useRef(0);

  // Detecta se user está perto do fim (≤80px). Mantém ref pra não re-renderizar.
  const onScrollMensagens = () => {
    const el = refScroll.current;
    if (!el) return;
    const distanciaFim = el.scrollHeight - el.scrollTop - el.clientHeight;
    refPertoDoFim.current = distanciaFim < 80;
    refUltimoScrollTop.current = el.scrollTop;
  };

  // Rola pro fim do chat — duas rAF garantem que o browser já pintou todas as bolhas
  // (sem isso, scrollHeight pode estar pequeno e fica scroll incompleto).
  const rolarPraFimImediato = (el: HTMLDivElement) => {
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  };

  useEffect(() => {
    const el = refScroll.current;
    if (!el) return;
    const idAtual = conversa?.id ?? null;
    const trocouConversa = refUltimaConversaId.current !== idAtual;
    if (trocouConversa) {
      rolarPraFimImediato(el);
      refPertoDoFim.current = true;
      refUltimaConversaId.current = idAtual;
      return;
    }
    // Nova mensagem na mesma conversa: só desce se user já estava no fim.
    // Behavior "auto" (instant) — evita sensação de "refresh" do smooth.
    if (refPertoDoFim.current) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    } else if (Math.abs(el.scrollTop - refUltimoScrollTop.current) > 4) {
      // Leitor estava no meio do histórico e o re-layout jogou o scroll pra
      // outro lugar (tipicamente 0 = topo). Conteúdo novo entra ABAIXO, então
      // o offset absoluto salvo continua válido — restaura a posição de leitura.
      el.scrollTop = refUltimoScrollTop.current;
    }
  }, [conversa?.id, conversa?.mensagens.length]);

  // ─ Busca dentro da conversa (estilo WhatsApp) ─
  // ids das mensagens que casam com o termo, em ordem cronológica.
  const termoAtivo = (termoBusca ?? "").trim();
  const idsOcorrencias = useMemo(() => {
    if (!conversa || termoAtivo.length < 2) return [];
    return conversa.mensagens
      .filter((m) => m.conteudo && mensagemCasaTermo(m.conteudo, termoAtivo))
      .map((m) => m.id);
  }, [conversa, termoAtivo]);
  const [idxOcorrencia, setIdxOcorrencia] = useState(0);

  // Termo/conversa mudou → começa na ocorrência mais RECENTE (como o WhatsApp).
  useEffect(() => {
    setIdxOcorrencia(Math.max(0, idsOcorrencias.length - 1));
  }, [conversa?.id, termoAtivo, idsOcorrencias.length]);

  // Rola até a ocorrência selecionada (inclusive na primeira depois de digitar).
  useEffect(() => {
    if (termoAtivo.length < 2 || idsOcorrencias.length === 0) return;
    const idMsg = idsOcorrencias[Math.min(idxOcorrencia, idsOcorrencias.length - 1)];
    const alvo = refScroll.current?.querySelector<HTMLElement>(`[id="bolha-${idMsg}"]`);
    alvo?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [idxOcorrencia, idsOcorrencias, termoAtivo]);

  // Cleanup ao desmontar — ANTES do early return pra respeitar Rules of Hooks
  useEffect(() => {
    return () => {
      if (refTimer.current) clearInterval(refTimer.current);
      if (refRecorder.current && refRecorder.current.state === "recording") {
        refRecorder.current.stop();
      }
    };
  }, []);

  if (!conversa) {
    return <PlaceholderSemConversa />;
  }

  const corCargo = conversa.cargo_ativo.cor_acento;

  const limparContagem = () => {
    if (refContagem.current) {
      clearInterval(refContagem.current);
      refContagem.current = null;
    }
    setSilenciandoEm(null);
  };

  const flushAgrupado = () => {
    limparContagem();
    if (refSilencio.current) {
      clearTimeout(refSilencio.current);
      refSilencio.current = null;
    }
    const bolhas = refPendentes.current;
    refPendentes.current = [];
    if (bolhas.length > 0) onAgrupar?.(bolhas);
  };

  const agendarSilencio = (ms: number) => {
    if (refSilencio.current) clearTimeout(refSilencio.current);
    limparContagem();
    setSilenciandoEm(ms);
    const inicio = Date.now();
    refContagem.current = setInterval(() => {
      const restante = ms - (Date.now() - inicio);
      if (restante <= 0) limparContagem();
      else setSilenciandoEm(restante);
    }, 100);
    refSilencio.current = setTimeout(() => flushAgrupado(), ms);
  };

  const enviar = () => {
    const t = draft.trim();
    if (midiaPendente) {
      onEnviarMidia?.(midiaPendente, t);
      setMidiaPendente(null);
      setDraft("");
      return;
    }
    if (!t) return;
    if (agruparEm && onAgrupar) {
      // Modo agrupado: bolha aparece NA HORA via onComitarLocal,
      // entra em pendentes pro motor, agenda silêncio.
      onComitarLocal?.(t);
      refPendentes.current.push(t);
      setDraft("");
      agendarSilencio(agruparEm);
      return;
    }
    onEnviar?.(t);
    setDraft("");
  };

  const abrirSeletorArquivo = () => {
    refInputArquivo.current?.click();
  };

  const onArquivoSelecionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMidiaPendente({
      arquivo: f,
      tipo: inferirTipoMidia(f),
      nome: f.name,
    });
    // Resetar value pra permitir selecionar o mesmo arquivo de novo
    if (refInputArquivo.current) refInputArquivo.current.value = "";
  };

  const cancelarMidia = () => {
    setMidiaPendente(null);
  };

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      refChunks.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) refChunks.current.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(refChunks.current, { type: "audio/webm" });
        const segundos = Math.round((Date.now() - refInicio.current) / 1000);
        setMidiaPendente({
          blob,
          tipo: "audio",
          nome: `audio-${Date.now()}.webm`,
          duracao_segundos: segundos,
        });
        // Liberar microfone
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      refRecorder.current = recorder;
      refInicio.current = Date.now();
      setDuracaoGravacao(0);
      setGravando(true);
      refTimer.current = window.setInterval(() => {
        setDuracaoGravacao(Math.round((Date.now() - refInicio.current) / 1000));
      }, 250);
    } catch (e) {
      console.error("[ChatAtivo] permissão de microfone negada:", e);
      const w = window as unknown as { useToast?: () => { error: (m: string) => void } };
      w.useToast?.().error("Permissão de microfone negada.");
    }
  };

  const pararGravacao = () => {
    if (refRecorder.current && refRecorder.current.state === "recording") {
      refRecorder.current.stop();
    }
    if (refTimer.current) {
      clearInterval(refTimer.current);
      refTimer.current = null;
    }
    setGravando(false);
  };

  const cancelarGravacao = () => {
    if (refRecorder.current && refRecorder.current.state === "recording") {
      refRecorder.current.ondataavailable = null;
      refRecorder.current.onstop = () => {
        const stream = refRecorder.current?.stream;
        stream?.getTracks().forEach((t) => t.stop());
      };
      refRecorder.current.stop();
    }
    if (refTimer.current) {
      clearInterval(refTimer.current);
      refTimer.current = null;
    }
    refChunks.current = [];
    setGravando(false);
    setDuracaoGravacao(0);
  };



  return (
    <div
      style={{
        // Panel da react-resizable-panels v4 dimensiona ele próprio mas NÃO
        // estabelece `display:flex` no filho. Usando `flex:1` aqui a coluna
        // não preenchia altura → o `<div ref={refScroll}>` interno perdia
        // limite e o scroll caía pro Panel/Group, arrastando o header e o
        // composer junto. `height:100%` ancora a coluna na altura do Panel.
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "rgba(15, 12, 30, 0.25)",
        minHeight: 0,
        minWidth: 0,
      }}
      aria-label={`Chat com ${conversa.lead.nome}`}
    >
      {/* Header — identidade do contato + ações. Responsável e Pausar IA agora
          ficam na aba Mente do Dossiê (acima do Cargo), a pedido do Theus. */}
      {!ocultarHeader && (() => {
        const ehCliente =
          conversa.lead.estado === "cliente" || conversa.lead.estado === "cliente_em_campanha";
        return (
      <header
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          // Fixa no topo do chat. Em flex column o header podia ser comprimido
          // se o conteúdo de mensagens crescesse muito; pareando com `height:100%`
          // na raiz e com o scroll interno do `<div ref={refScroll}>`, isso
          // garante que o cabeçalho NÃO sobe junto com a conversa.
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: conversa.lead.foto_url
              ? `url(${conversa.lead.foto_url}) center/cover`
              : "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.10)",
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{conversa.lead.nome}</div>
          <div className="muted tiny mono">{conversa.lead.telefone}</div>
        </div>

        {onToggleAgente && (
          <motion.button
            type="button"
            onClick={() => onToggleAgente(!conversa.agente_ligado)}
            whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
            whileTap={tapPress}
            aria-pressed={conversa.agente_ligado}
            aria-label={conversa.agente_ligado ? "Pausar a IA desta conversa" : "Reativar a IA desta conversa"}
            title={conversa.agente_ligado ? "Pausar a IA só desta conversa — você assume manualmente" : "IA pausada nesta conversa — clique pra reativar"}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 999,
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: conversa.agente_ligado
                ? "rgba(255,255,255,0.03)"
                : "oklch(0.75 0.16 65 / 0.12)",
              border: conversa.agente_ligado
                ? "1px solid rgba(255,255,255,0.10)"
                : "1px solid oklch(0.75 0.16 65 / 0.4)",
              color: conversa.agente_ligado ? "var(--txt-2)" : "oklch(0.85 0.14 65)",
            }}
          >
            {conversa.agente_ligado ? "⏸ Pausar IA" : "▶ Ativar IA"}
          </motion.button>
        )}

        {conversa.agente_ligado === false && conversa.lead.fase_pipeline === "desistiu" && (
          <span
            className="mono tiny"
            title="A IA foi desligada automaticamente: o lead não respondeu às retomadas (gate de desistência). Use Retomar pra religar."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 999,
              background: "oklch(0.75 0.16 65 / 0.12)",
              border: "1px solid oklch(0.75 0.16 65 / 0.4)",
              color: "oklch(0.85 0.14 65)",
              fontWeight: 600,
            }}
          >
            IA desligada · desistência
          </span>
        )}

        {ehCliente ? (
          <span
            className="mono tiny"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 999,
              background: "oklch(0.72 0.20 145 / 0.12)",
              border: "1px solid oklch(0.72 0.20 145 / 0.4)",
              color: "oklch(0.85 0.20 145)",
              fontWeight: 600,
            }}
          >
            ✓ Cliente
            {onVoltarParaLead && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Voltar ${conversa.lead.nome} pra lead? O contato sai da pasta clientes; contratos e histórico ficam.`)) {
                    onVoltarParaLead();
                  }
                }}
                aria-label={`Voltar ${conversa.lead.nome} pra lead`}
                title="Voltar pra lead"
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  padding: 0,
                  marginLeft: 2,
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ↩
              </button>
            )}
          </span>
        ) : (
          onTornarCliente && (
            <motion.button
              type="button"
              onClick={() => onTornarCliente()}
              whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
              whileTap={tapPress}
              aria-label={`Tornar ${conversa.lead.nome} cliente`}
              style={{
                padding: "5px 14px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.22), oklch(0.65 0.22 280 / 0.18))",
                border: "1px solid oklch(0.7 0.18 220 / 0.5)",
                color: "var(--txt-1)",
                cursor: "pointer",
              }}
            >
              Tornar Cliente
            </motion.button>
          )
        )}

        {onEnviarBase && (
          <motion.button
            type="button"
            onClick={() => {
              if (confirm(`Enviar ${conversa.lead.nome} para a Base? Sai da fila de atendimento e vai pro CRM.`)) {
                onEnviarBase();
              }
            }}
            whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
            whileTap={tapPress}
            aria-label={`Enviar ${conversa.lead.nome} para a Base`}
            title="Enviar para a Base"
            style={{
              padding: "5px 9px",
              fontSize: 13,
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "var(--txt-2)",
              cursor: "pointer",
            }}
          >
            📥
          </motion.button>
        )}

        {onRetomar && (
          <motion.button
            type="button"
            onClick={() => onRetomar()}
            disabled={!!retomando}
            whileHover={retomando ? undefined : { scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
            whileTap={retomando ? undefined : tapPress}
            aria-label={`Retomar conversa com ${conversa.lead.nome}`}
            title="Retomar atendimento — agente lê o histórico e volta a falar"
            style={{
              padding: "5px 9px",
              fontSize: 13,
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: retomando ? "var(--txt-3)" : "var(--txt-2)",
              cursor: retomando ? "not-allowed" : "pointer",
              opacity: retomando ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <motion.span
              aria-hidden="true"
              animate={retomando ? { rotate: 360 } : { rotate: 0 }}
              transition={retomando ? { duration: 0.9, ease: "linear", repeat: Infinity } : { duration: 0 }}
              style={{ display: "inline-block", transformOrigin: "center" }}
            >
              ↻
            </motion.span>
          </motion.button>
        )}

        {onApagar && (
          <motion.button
            type="button"
            onClick={() => {
              if (confirm(`Apagar o contato ${conversa.lead.nome}? Remove de vez a conversa, mensagens, ficha, memória, engajamento, dados pessoais e tudo mais desse contato. Não dá pra desfazer.`)) {
                onApagar();
              }
            }}
            whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
            whileTap={tapPress}
            aria-label={`Apagar contato ${conversa.lead.nome}`}
            title="Apagar contato"
            style={{
              padding: "5px 9px",
              fontSize: 13,
              borderRadius: 8,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "oklch(0.78 0.20 25)",
              cursor: "pointer",
            }}
          >
            🗑
          </motion.button>
        )}
      </header>
        );
      })()}

      {/* Barra de navegação da busca — "N de M" + setas, igual WhatsApp */}
      {termoAtivo.length >= 2 && (
        <div
          role="navigation"
          aria-label="Navegação entre ocorrências da busca"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            fontSize: 12,
            color: "var(--txt-2)",
          }}
        >
          <span aria-live="polite">
            {idsOcorrencias.length === 0
              ? `Nenhuma mensagem com “${termoAtivo}”`
              : `${idxOcorrencia + 1} de ${idsOcorrencias.length} · “${termoAtivo}”`}
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            aria-label="Ocorrência anterior (mais antiga)"
            title="Anterior (mais antiga)"
            disabled={idxOcorrencia <= 0 || idsOcorrencias.length === 0}
            onClick={() => setIdxOcorrencia((i) => Math.max(0, i - 1))}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "var(--txt-1)",
              cursor: idxOcorrencia <= 0 ? "default" : "pointer",
              opacity: idxOcorrencia <= 0 || idsOcorrencias.length === 0 ? 0.4 : 1,
            }}
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Próxima ocorrência (mais recente)"
            title="Próxima (mais recente)"
            disabled={idxOcorrencia >= idsOcorrencias.length - 1 || idsOcorrencias.length === 0}
            onClick={() => setIdxOcorrencia((i) => Math.min(idsOcorrencias.length - 1, i + 1))}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "var(--txt-1)",
              cursor: idxOcorrencia >= idsOcorrencias.length - 1 ? "default" : "pointer",
              opacity:
                idxOcorrencia >= idsOcorrencias.length - 1 || idsOcorrencias.length === 0
                  ? 0.4
                  : 1,
            }}
          >
            ▼
          </button>
        </div>
      )}

      {/* Mensagens */}
      <div
        ref={refScroll}
        className="scroll"
        onScroll={onScrollMensagens}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {/* Container sem variants/initial — cada Bolha anima entrada própria
            (initial+animate inline). Antes tinha stagger + initial="hidden" que
            forçava todas as bolhas a re-animar a cada update do array de mensagens,
            causando o "refresh" relatado pelo Theus em 2026-05-13. */}
        <div
          key={conversa.id}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
            {conversa.mensagens.map((m, i) => {
              const anterior = i > 0 ? conversa.mensagens[i - 1] : null;
              const viraDia = !anterior || chaveDia(anterior.criado_em) !== chaveDia(m.criado_em);
              return (
                <Fragment key={m.id}>
                  {viraDia && <SeparadorData rotulo={formatarDataSeparador(m.criado_em)} />}
                  <Bolha
                    m={m}
                    onAbrirLightbox={(url, legenda) => setLightbox({ url, legenda })}
                    htmlId={`bolha-${m.id}`}
                    termoBusca={termoAtivo.length >= 2 ? termoAtivo : undefined}
                    ocorrenciaAtiva={
                      termoAtivo.length >= 2 && idsOcorrencias[idxOcorrencia] === m.id
                    }
                    onReenviar={onReenviar}
                    onCorrigir={onCorrigirMensagem}
                    correcao={correcoes?.[m.id]}
                  />
                </Fragment>
              );
            })}
            {agenteDigitando && (
              <div
                role="status"
                aria-label="Agente digitando"
                style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4 }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "8px 12px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span className="dot dot-on" style={{ width: 5, height: 5, animation: "neuronio 1.2s ease-in-out infinite" }} />
                  <span className="dot dot-on" style={{ width: 5, height: 5, animation: "neuronio 1.2s ease-in-out infinite", animationDelay: "0.15s" }} />
                  <span className="dot dot-on" style={{ width: 5, height: 5, animation: "neuronio 1.2s ease-in-out infinite", animationDelay: "0.3s" }} />
                </div>
                <span className="muted tiny">
                  digitando ~{(agenteDigitando.duracao_ms / 1000).toFixed(1)}s
                </span>
              </div>
            )}
        </div>
      </div>

      {/* Lightbox de imagem (Bonus B.4.1 onda-b-completa-ralph) */}
      <AnimatePresence>
        {lightbox && <Lightbox imagem={lightbox} onFechar={() => setLightbox(null)} />}
      </AnimatePresence>

      {/* Composer */}
      <div
        style={{
          padding: "10px 14px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          // Mesma proteção do header: nunca comprime, sempre colado no rodapé.
          flexShrink: 0,
        }}
      >
        <input
          ref={refInputArquivo}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
          onChange={onArquivoSelecionado}
          style={{ display: "none" }}
          aria-hidden="true"
        />

        {/* Preview de mídia pendente */}
        <AnimatePresence>
          {midiaPendente && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: duration.fast, ease: easing.outExpo }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                marginBottom: 8,
                borderRadius: 10,
                background: "oklch(0.7 0.18 220 / 0.10)",
                border: "1px solid oklch(0.7 0.18 220 / 0.30)",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 18 }}>
                {midiaPendente.tipo === "imagem" ? "🖼" :
                 midiaPendente.tipo === "audio" ? "🎙" :
                 midiaPendente.tipo === "video" ? "🎬" : "📄"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {midiaPendente.nome ?? `${midiaPendente.tipo}`}
                </div>
                <div className="muted tiny">
                  {midiaPendente.tipo}
                  {midiaPendente.duracao_segundos != null && ` · ${formatarDuracao(midiaPendente.duracao_segundos)}`}
                  {midiaPendente.arquivo && ` · ${formatarTamanho(midiaPendente.arquivo.size)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={cancelarMidia}
                className="btn btn-ghost btn-icon btn-sm"
                aria-label="Cancelar mídia"
                style={{ width: 22, height: 22, fontSize: 12 }}
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Estado de gravação ativa */}
        {gravando && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              marginBottom: 8,
              borderRadius: 10,
              background: "oklch(0.65 0.24 25 / 0.10)",
              border: "1px solid oklch(0.65 0.24 25 / 0.40)",
            }}
          >
            <motion.span
              aria-hidden="true"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "oklch(0.65 0.24 25)",
                boxShadow: "0 0 10px oklch(0.65 0.24 25 / 0.6)",
              }}
            />
            <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "oklch(0.85 0.20 25)" }}>
              Gravando áudio… {formatarDuracao(duracaoGravacao)}
            </div>
            <button
              type="button"
              onClick={cancelarGravacao}
              className="btn btn-ghost btn-sm"
              style={{ padding: "2px 8px", fontSize: 11 }}
              aria-label="Cancelar gravação"
            >
              Cancelar
            </button>
            <motion.button
              type="button"
              onClick={pararGravacao}
              whileHover={{ scale: 1.05, transition: springSoft }}
              whileTap={tapPress}
              className="btn btn-primary btn-sm"
              style={{ padding: "2px 12px", fontSize: 11 }}
              aria-label="Parar gravação e usar áudio"
            >
              ✓ Parar
            </motion.button>
          </motion.div>
        )}

        <div
          className="os-vidro"
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            padding: "8px 10px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <motion.button
            type="button"
            onClick={abrirSeletorArquivo}
            whileHover={{ scale: 1.08, transition: { duration: duration.fast, ease: easing.outExpo } }}
            whileTap={tapPress}
            disabled={gravando}
            aria-label="Anexar arquivo (imagem, vídeo, áudio, documento)"
            title="Anexar arquivo"
            className="btn btn-ghost btn-icon btn-sm"
            style={{
              width: 30,
              height: 30,
              fontSize: 16,
              opacity: gravando ? 0.4 : 1,
              cursor: gravando ? "not-allowed" : "pointer",
            }}
          >
            📎
          </motion.button>
          <BotaoContrato conversa={conversa} onEnviar={onEnviar} desabilitado={gravando} />
          <motion.button
            type="button"
            onClick={gravando ? pararGravacao : iniciarGravacao}
            whileHover={{ scale: 1.08, transition: { duration: duration.fast, ease: easing.outExpo } }}
            whileTap={tapPress}
            disabled={!!midiaPendente}
            aria-label={gravando ? "Parar gravação" : "Gravar áudio"}
            title={gravando ? "Parar gravação" : "Gravar áudio"}
            className="btn btn-ghost btn-icon btn-sm"
            style={{
              width: 30,
              height: 30,
              fontSize: 16,
              opacity: midiaPendente ? 0.4 : 1,
              cursor: midiaPendente ? "not-allowed" : "pointer",
              color: gravando ? "oklch(0.65 0.24 25)" : undefined,
            }}
          >
            🎙
          </motion.button>
          <label htmlFor={composerId} className="muted tiny" style={{ position: "absolute", left: -9999 }}>
            Mensagem pra {conversa.lead.nome}
          </label>
          <textarea
            id={composerId}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              // No modo agrupado, qualquer tecla reseta o silêncio se já há pendentes
              if (agruparEm && onAgrupar && refPendentes.current.length > 0) {
                agendarSilencio(agruparEm);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder={
              midiaPendente
                ? "Adicione uma legenda (opcional)…"
                : agruparEm
                  ? refPendentes.current.length > 0
                    ? "Vai mandar mais? Senão fica quieto que eu envio em 5s…"
                    : "Escreve normal · agrupo as bolhas em silêncio de 5s"
                  : conversa.agente_ligado
                    ? "Escreva pra interferir na conversa…"
                    : "Modo humano · sua mensagem vai direto"
            }
            rows={1}
            disabled={gravando}
            style={{
              flex: 1,
              resize: "none",
              background: "transparent",
              border: "none",
              color: "var(--txt-1)",
              fontSize: 13,
              outline: "none",
              minHeight: 22,
              maxHeight: 120,
              padding: "2px 4px",
              fontFamily: "inherit",
              opacity: gravando ? 0.4 : 1,
            }}
          />
          <motion.button
            type="button"
            onClick={enviar}
            disabled={!draft.trim() && !midiaPendente}
            whileHover={draft.trim() || midiaPendente ? { scale: 1.04, transition: springSoft } : {}}
            whileTap={draft.trim() || midiaPendente ? tapPress : {}}
            className="btn btn-primary btn-sm"
            style={{
              padding: "4px 12px",
              fontSize: 12,
              opacity: draft.trim() || midiaPendente ? 1 : 0.4,
              cursor: draft.trim() || midiaPendente ? "pointer" : "not-allowed",
            }}
            aria-label="Enviar mensagem"
          >
            Enviar
          </motion.button>
        </div>
        {agruparEm && silenciandoEm !== null && (
          <div
            role="status"
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--txt-3)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "oklch(0.78 0.18 80)",
                boxShadow: "0 0 6px oklch(0.78 0.18 80 / 0.55)",
              }}
            />
            <span>
              {refPendentes.current.length} bolha{refPendentes.current.length === 1 ? "" : "s"} agrupada{refPendentes.current.length === 1 ? "" : "s"} · envia em {(silenciandoEm / 1000).toFixed(1)}s
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

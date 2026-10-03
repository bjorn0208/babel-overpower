/**
 * Botão 📄 do compositor — envia contrato pra assinatura digital na conversa.
 *
 * Abre popover com os modelos ativos do tenant (`contratos_template`):
 *  - passar o cursor num modelo mostra o PREVIEW do contrato num painel ao lado
 *    (clicar no nome pina/despina o preview — vale pro touch);
 *  - "Enviar →" gera o contrato do template (RPC `criar_contrato_livre_de_template`,
 *    mesma da AbaFinanceiro), vincula ao lead da conversa e FORÇA as exigências
 *    padrão de prova: selfie + foto do documento (`campos_obrigatorios` — a
 *    página pública liga os passos por essas chaves, ver use-contrato.ts);
 *  - o envio sai em DUAS bolhas pelo trilho da mensagem digitada (`onEnviar` →
 *    edge `enviar-mensagem` → Z-API): apresentação e depois a URL sozinha,
 *    que chega clicável no WhatsApp do lead.
 * Criado 2026-08-20 a pedido do Theus; v2 no mesmo dia (selfie/documento
 * por padrão + bolha separada + preview no hover).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { duration, easing, tapPress } from "@/os/motion/presets";
import { supabase } from "@/integrations/supabase/client";
import { urlContrato } from "@/lib/url-app";
import { useToast } from "@/bundle/bundle-shared";
import type { Conversa } from "./tipos";

// Cast bruto: tabelas/RPCs fora dos types gerados (mesmo padrão de acoes-cliente.ts).
// deno-lint-ignore no-explicit-any
type SupabaseBruto = any;

const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Provas exigidas por padrão em todo contrato enviado pela conversa. */
const PROVAS_PADRAO = ["selfie", "documento"] as const;

/** Pausa entre a bolha de apresentação e a bolha do link — preserva a ordem
 *  de chegada no WhatsApp e soa natural (duas mensagens de gente). */
const PAUSA_ENTRE_BOLHAS_MS = 900;

interface ModeloContrato {
  id: string;
  nome: string;
  conteudo: string | null;
  conteudo_comum: string | null;
  campos_obrigatorios: string[] | null;
}

/** Texto do preview — mesma regra da RPC: `conteudo_comum` quando é texto puro;
 *  se for doc-JSON do editor v2 (começa com {"type":"), cai no `conteudo`. */
function textoPreview(m: ModeloContrato): string {
  const comum = (m.conteudo_comum ?? "").trim();
  if (comum && !comum.startsWith('{"type":"')) return comum;
  return (m.conteudo ?? "").trim();
}

interface BotaoContratoProps {
  conversa: Conversa;
  /** Mesmo callback do compositor — o link entra na conversa como mensagem sua. */
  onEnviar?: (texto: string) => void;
  /** Espelha o estado do compositor (gravando áudio desliga os botões da fileira). */
  desabilitado?: boolean;
}

export function BotaoContrato({ conversa, onEnviar, desabilitado }: BotaoContratoProps) {
  const t = useToast();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [carregou, setCarregou] = useState(false);
  const [modelos, setModelos] = useState<ModeloContrato[]>([]);
  const [gerando, setGerando] = useState<string | null>(null);
  // Preview: hover mostra; clique no nome pina (touch e leitura longa).
  const [previewHover, setPreviewHover] = useState<string | null>(null);
  const [previewPinado, setPreviewPinado] = useState<string | null>(null);
  const refRaiz = useRef<HTMLSpanElement | null>(null);

  const previewId = previewPinado ?? previewHover;
  const modeloPreview = useMemo(
    () => modelos.find((m) => m.id === previewId) ?? null,
    [modelos, previewId],
  );

  // Fecha no clique fora e no Escape — padrão de popover do OS.
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: PointerEvent) => {
      if (refRaiz.current && !refRaiz.current.contains(e.target as Node)) fechar();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("pointerdown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const fechar = () => {
    setAberto(false);
    setPreviewHover(null);
    setPreviewPinado(null);
  };

  const abrir = async () => {
    if (aberto) {
      fechar();
      return;
    }
    setAberto(true);
    if (carregou) return;
    setCarregando(true);
    const { data: ses } = await supabase.auth.getSession();
    const uid = ses?.session?.user?.id;
    if (uid) {
      const { data } = await (supabase as SupabaseBruto)
        .from("contratos_template")
        .select("id, nome, conteudo, conteudo_comum, campos_obrigatorios")
        .eq("ativo", true)
        .eq("user_id", uid)
        .order("nome");
      if (Array.isArray(data)) setModelos(data);
    }
    setCarregando(false);
    setCarregou(true);
  };

  const enviarContrato = async (modelo: ModeloContrato) => {
    setGerando(modelo.id);
    const { data, error } = await (supabase as SupabaseBruto)
      .rpc("criar_contrato_livre_de_template", { p_template_id: modelo.id });
    if (error || !data?.[0]?.chave_publica) {
      setGerando(null);
      t.error("Não consegui gerar o contrato");
      return;
    }
    const chave = String(data[0].chave_publica);

    // Vincula ao lead DESTA conversa + força as provas padrão (selfie e foto
    // do documento) no contrato gerado — a página pública liga os passos por
    // essas chaves no array `campos_obrigatorios`.
    const jaExigidos = Array.isArray(modelo.campos_obrigatorios) ? modelo.campos_obrigatorios : [];
    const camposComProvas = [...new Set([...jaExigidos, ...PROVAS_PADRAO])];
    const leadId = conversa.lead?.id;
    const mudancas: Record<string, unknown> = { campos_obrigatorios: camposComProvas };
    if (leadId && EH_UUID.test(leadId)) mudancas.lead_id = leadId;
    await (supabase as SupabaseBruto)
      .from("contratos")
      .update(mudancas)
      .eq("chave_publica", chave);

    const link = urlContrato(chave);
    setGerando(null);
    fechar();
    if (onEnviar) {
      // Duas bolhas: apresentação e, depois de uma pausa, a URL sozinha —
      // separada ela chega clicável no WhatsApp do lead.
      onEnviar(`Segue o contrato "${modelo.nome}" pra assinatura digital:`);
      window.setTimeout(() => onEnviar(link), PAUSA_ENTRE_BOLHAS_MS);
      t.success(`Contrato "${modelo.nome}" enviado na conversa`);
    } else {
      // Sem trilho de envio (uso fora do painel): não perde o trabalho — copia.
      try {
        await navigator.clipboard.writeText(link);
        t.success("Link de assinatura copiado — cola no chat");
      } catch {
        t.success("Contrato gerado (veja na aba Financeiro do dossiê)");
      }
    }
  };

  return (
    <span ref={refRaiz} style={{ position: "relative", display: "inline-flex" }}>
      <motion.button
        type="button"
        onClick={() => void abrir()}
        whileHover={{ scale: 1.08, transition: { duration: duration.fast, ease: easing.outExpo } }}
        whileTap={tapPress}
        disabled={desabilitado}
        aria-label="Enviar contrato pra assinatura digital"
        aria-expanded={aberto}
        title="Enviar contrato"
        className="btn btn-ghost btn-icon btn-sm"
        style={{
          width: 30,
          height: 30,
          fontSize: 16,
          opacity: desabilitado ? 0.4 : 1,
          cursor: desabilitado ? "not-allowed" : "pointer",
        }}
      >
        📄
      </motion.button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: duration.fast, ease: easing.outExpo }}
            className="os-vidro"
            role="menu"
            aria-label="Modelos de contrato"
            onMouseLeave={() => setPreviewHover(null)}
            style={{
              position: "absolute",
              bottom: "calc(100% + 10px)",
              left: 0,
              width: 280,
              padding: 10,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(20,25,22,0.92)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
              zIndex: 40,
            }}
          >
            <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, margin: "2px 4px 8px" }}>
              Enviar contrato pra assinatura
            </div>
            {carregando ? (
              <div className="muted tiny" style={{ padding: "6px 4px" }}>Carregando modelos…</div>
            ) : modelos.length === 0 ? (
              <div className="muted tiny" style={{ padding: "6px 4px" }}>
                Nenhum modelo ativo. Crie um no app Contratos.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
                {modelos.map((m) => (
                  <div
                    key={m.id}
                    role="menuitem"
                    onMouseEnter={() => setPreviewHover(m.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "6px 6px 6px 10px",
                      borderRadius: 10,
                      background: previewId === m.id ? "rgba(255,255,255,0.06)" : "transparent",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewPinado((atual) => (atual === m.id ? null : m.id))}
                      aria-label={`Pré-visualizar o contrato ${m.nome}`}
                      title="Clique pra fixar a pré-visualização"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: 600,
                        fontSize: 12,
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        color: "var(--txt-1)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {previewPinado === m.id ? "📌 " : ""}{m.nome}
                    </button>
                    <motion.button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={gerando !== null}
                      whileTap={tapPress}
                      onClick={() => void enviarContrato(m)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 11,
                        whiteSpace: "nowrap",
                        opacity: gerando !== null && gerando !== m.id ? 0.5 : 1,
                      }}
                    >
                      {gerando === m.id ? "Gerando…" : "Enviar →"}
                    </motion.button>
                  </div>
                ))}
              </div>
            )}

            {/* Preview do contrato — painel ao lado do popover */}
            <AnimatePresence>
              {modeloPreview && (
                <motion.aside
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: duration.fast, ease: easing.outExpo }}
                  className="os-vidro"
                  aria-label={`Pré-visualização do contrato ${modeloPreview.nome}`}
                  onMouseEnter={() => setPreviewHover(modeloPreview.id)}
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: "calc(100% + 10px)",
                    width: 340,
                    maxHeight: 440,
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(20,25,22,0.96)",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{modeloPreview.nome}</div>
                    <div className="muted tiny" style={{ marginTop: 2 }}>
                      Vai pedir: assinatura digital + selfie + foto do documento
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "10px 14px",
                      overflowY: "auto",
                      fontSize: 11.5,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      color: "var(--txt-2)",
                    }}
                  >
                    {textoPreview(modeloPreview) || "Este modelo ainda não tem texto de contrato salvo."}
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Modal "Importar WhatsApp pessoal" — QR de dispositivo vinculado (Baileys,
 * via /api/whatsapp-importar no Vercel) que puxa o histórico 1 vez só e
 * grava como leads/conversas/mensagens novos. Depois de importar, o tenant
 * revisa e marca quais conversas "fecharam venda" (vira `desfecho=convertido`
 * — é isso que alimenta o botão "Analisar conversas" da aba Conhecimento).
 *
 * Não fica canal permanente: a function faz logout do dispositivo ao terminar.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { X, Smartphone, CheckCircle2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type LeadImportado = { id: string; conversaId: string; nome: string; phone: string; preview: string };

type Fase =
  | { tipo: "conectando" }
  | { tipo: "qr"; qrDataUrl: string }
  | { tipo: "sincronizando"; mensagem: string }
  | { tipo: "revisao"; leads: LeadImportado[] }
  | { tipo: "aprendendo"; leads: LeadImportado[]; indiceAtual: number }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "concluido"; marcados: number };

/**
 * Mesma marca que `api/whatsapp-importar.ts` grava em `conversas.titulo`.
 * Se mudar lá, muda aqui — é por ela que o botão "limpar" reconhece o que a
 * importação criou e o que é conversa de verdade.
 */
const MARCA_IMPORT = "WhatsApp pessoal (importado)";

/** `.in()` vira query string num GET: acima de ~500 ids o gateway devolve 400. */
const LOTE_IDS = 300;

type Limpeza =
  | { fase: "ocioso" }
  | { fase: "contando" }
  | { fase: "confirmar"; ids: string[] }
  | { fase: "apagando" }
  | { fase: "feito"; apagadas: number }
  | { fase: "erro"; mensagem: string };

/**
 * Conversas que vieram da importação — as marcadas e as antigas, de antes da
 * marca existir, reconhecidas pela assinatura que só a importação produz: lead
 * com `origem_lead='importado_whatsapp_pessoal'` e conversa fechada, sem agente,
 * no canal whatsapp. Conversa real do agente nunca casa com as quatro condições.
 */
async function buscarConversasImportadas(tenantId: string): Promise<string[]> {
  const ids = new Set<string>();

  const { data: marcadas, error: erroMarcadas } = await supabase
    .from("conversas")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("titulo", MARCA_IMPORT);
  if (erroMarcadas) throw erroMarcadas;
  for (const c of marcadas ?? []) ids.add((c as { id: string }).id);

  const { data: leads, error: erroLeads } = await supabase
    .from("leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("origem_lead", "importado_whatsapp_pessoal");
  if (erroLeads) throw erroLeads;
  const leadIds = (leads ?? []).map((l) => (l as { id: string }).id);

  for (let i = 0; i < leadIds.length; i += LOTE_IDS) {
    const { data, error } = await supabase
      .from("conversas")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("channel", "whatsapp")
      .eq("status", "encerrada")
      .eq("agent_enabled", false)
      .in("lead_id", leadIds.slice(i, i + LOTE_IDS));
    if (error) throw error;
    for (const c of data ?? []) ids.add((c as { id: string }).id);
  }

  return [...ids];
}

/** Apaga em lotes. `mensagens` e o resto caem por ON DELETE CASCADE. */
async function apagarConversas(ids: string[]): Promise<number> {
  let apagadas = 0;
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS);
    const { error } = await supabase.from("conversas").delete().in("id", lote);
    if (error) throw error;
    apagadas += lote.length;
  }
  return apagadas;
}

/** Máximo de conversas que a "fase 2" (IA aprendendo) processa por import —
 * cada uma é 1 chamada LLM, sequencial, com timeout de 15s. */
const MAX_CONVERSAS_APRENDIZADO = 20;

/** "Fase 2" (IA lê e aprende com as conversas) só roda 1 vez na vida do
 * tenant — nem reload traz de volta, só logout (flag limpa em AuthContext).
 */
function chaveJaAprendeu(tenantId: string): string {
  return `whatsapp-aprendeu:${tenantId}`;
}

const estiloBotaoLeve: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "var(--txt-1)",
  cursor: "pointer",
};

const estiloBotaoPrimario: React.CSSProperties = {
  ...estiloBotaoLeve,
  border: "1px solid oklch(0.7 0.18 220 / 0.5)",
  background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.5), oklch(0.65 0.22 280 / 0.4))",
};

export function ImportarWhatsappPessoal({ onFechar }: { onFechar: () => void }) {
  const [fase, setFase] = useState<Fase>({ tipo: "conectando" });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const tenantIdRef = useRef<string | null>(null);
  const montadoRef = useRef(true);
  const [limpeza, setLimpeza] = useState<Limpeza>({ fase: "ocioso" });

  /** Duas etapas de propósito: o primeiro clique conta e mostra quantas são,
   *  o segundo apaga. Apagar conversa é irreversível e não tem soft delete. */
  const aoClicarLimpar = async () => {
    try {
      const tenantId = tenantIdRef.current
        ?? (await supabase.auth.getSession()).data.session?.user?.id
        ?? null;
      if (!tenantId) { setLimpeza({ fase: "erro", mensagem: "Sessão expirada — recarregue a página." }); return; }

      if (limpeza.fase === "confirmar") {
        setLimpeza({ fase: "apagando" });
        const apagadas = await apagarConversas(limpeza.ids);
        if (montadoRef.current) setLimpeza({ fase: "feito", apagadas });
        return;
      }

      setLimpeza({ fase: "contando" });
      const ids = await buscarConversasImportadas(tenantId);
      if (!montadoRef.current) return;
      setLimpeza(ids.length === 0 ? { fase: "feito", apagadas: 0 } : { fase: "confirmar", ids });
    } catch (e) {
      if (montadoRef.current) {
        setLimpeza({ fase: "erro", mensagem: (e as Error).message || "Falha ao limpar." });
      }
    }
  };

  const rotuloLimpeza = (): string => {
    switch (limpeza.fase) {
      case "contando": return "Contando…";
      case "confirmar": return `Apagar ${limpeza.ids.length} conversa(s)? Clique pra confirmar`;
      case "apagando": return "Apagando…";
      case "feito": return limpeza.apagadas === 0 ? "Nada importado pra limpar" : `${limpeza.apagadas} conversa(s) apagada(s)`;
      case "erro": return `Falhou: ${limpeza.mensagem}`;
      default: return "Limpar conversas já importadas";
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    void iniciarImportacao(ctrl.signal);
    return () => { montadoRef.current = false; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciarImportacao(signal: AbortSignal) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setFase({ tipo: "erro", mensagem: "Sessão expirada — recarregue a página." }); return; }
      tenantIdRef.current = session?.user?.id ?? null;

      const resp = await fetch("/api/whatsapp-importar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
        signal,
      });
      if (!resp.ok || !resp.body) {
        setFase({ tipo: "erro", mensagem: `Falha ao conectar (HTTP ${resp.status}).` });
        return;
      }

      const leitor = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let indiceEvento: number;
        while ((indiceEvento = buffer.indexOf("\n\n")) !== -1) {
          const bloco = buffer.slice(0, indiceEvento);
          buffer = buffer.slice(indiceEvento + 2);
          const linhaEvento = bloco.split("\n").find((l) => l.startsWith("event:"));
          const linhaDados = bloco.split("\n").find((l) => l.startsWith("data:"));
          if (!linhaEvento || !linhaDados) continue;
          const evento = linhaEvento.replace("event:", "").trim();
          let dados: Record<string, unknown> = {};
          try { dados = JSON.parse(linhaDados.replace("data:", "").trim()); } catch { /* ignora linha malformada */ }
          await tratarEvento(evento, dados);
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setFase({ tipo: "erro", mensagem: (e as Error).message || "Falha inesperada." });
    }
  }

  async function tratarEvento(evento: string, dados: Record<string, unknown>) {
    if (evento === "qr") {
      const qrDataUrl = await QRCode.toDataURL(String(dados.qr), { margin: 1, width: 260 });
      setFase({ tipo: "qr", qrDataUrl });
    } else if (evento === "status") {
      setFase({ tipo: "sincronizando", mensagem: String(dados.mensagem ?? "Processando…") });
    } else if (evento === "done") {
      const leads = (dados.leads as LeadImportado[]) ?? [];
      setFase({ tipo: "revisao", leads });
    } else if (evento === "erro") {
      setFase({ tipo: "erro", mensagem: String(dados.mensagem ?? "Falha ao importar.") });
    }
  }

  function alternar(id: string) {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  async function confirmarRevisao() {
    if (fase.tipo !== "revisao") return;
    if (selecionados.size > 0) {
      await supabase
        .from("leads")
        .update({ desfecho: "convertido", desfecho_em: new Date().toISOString() })
        .in("id", [...selecionados]);
    }
    const marcados = selecionados.size;
    const tenantId = tenantIdRef.current;
    const jaAprendeu = tenantId ? localStorage.getItem(chaveJaAprendeu(tenantId)) : "1";
    if (!jaAprendeu && fase.leads.length > 0) {
      const lote = fase.leads.slice(0, MAX_CONVERSAS_APRENDIZADO);
      setFase({ tipo: "aprendendo", leads: lote, indiceAtual: 0 });
      void rodarAprendizado(lote, tenantId, marcados);
    } else {
      setFase({ tipo: "concluido", marcados });
    }
  }

  /** Loop sequencial — 1 chamada LLM por conversa, não em lote — pra poder
   * mostrar qual contato tá sendo lido agora. Erro em 1 conversa não trava
   * as outras. Marca a flag "já aprendeu" só ao final, sucesso ou não. */
  async function rodarAprendizado(lote: LeadImportado[], tenantId: string | null, marcados: number) {
    for (let i = 0; i < lote.length; i++) {
      if (!montadoRef.current) return; // modal fechado — deixa o resto rodar em silêncio, sem mexer em state
      setFase({ tipo: "aprendendo", leads: lote, indiceAtual: i });
      try {
        await supabase.functions.invoke("aprender-conversa-whatsapp", {
          body: { conversa_id: lote[i].conversaId },
        });
      } catch (e) {
        console.warn("[ImportarWhatsappPessoal] aprendizado falhou pra", lote[i].nome, e);
      }
    }
    if (tenantId) localStorage.setItem(chaveJaAprendeu(tenantId), "1");
    if (montadoRef.current) setFase({ tipo: "concluido", marcados });
  }

  return createPortal(
    <div
      onClick={onFechar}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, background: "oklch(0.1 0.03 280 / 0.65)", backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 14,
          padding: 22, borderRadius: 16, background: "oklch(0.18 0.06 280 / 0.98)",
          border: "1px solid oklch(0.7 0.18 280 / 0.25)", maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Smartphone size={16} color="oklch(0.75 0.14 280)" aria-hidden="true" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--txt-1)" }}>Trazer minhas conversas do WhatsApp</span>
          </div>
          <button type="button" onClick={onFechar} title="Fechar" style={{ background: "transparent", border: "none", color: "var(--txt-3)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        {/* Reimportar não duplica mais (a conversa é reaproveitada pela marca em
            `titulo`), mas as importações de antes da marca ficaram soltas — e o
            dono precisa conseguir desfazer um import sem abrir o banco. Fica
            fora da fase "sincronizando" pra ninguém apagar no meio da leitura. */}
        {fase.tipo !== "sincronizando" && (
          <button
            type="button"
            onClick={() => void aoClicarLimpar()}
            disabled={limpeza.fase === "contando" || limpeza.fase === "apagando" || limpeza.fase === "feito"}
            style={{
              ...estiloBotaoLeve,
              alignSelf: "flex-start",
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 500,
              opacity: limpeza.fase === "confirmar" ? 1 : 0.75,
              borderColor: limpeza.fase === "confirmar" ? "oklch(0.72 0.17 25 / 0.6)" : undefined,
              color: limpeza.fase === "confirmar" ? "oklch(0.72 0.17 25)" : undefined,
              cursor: limpeza.fase === "feito" ? "default" : "pointer",
            }}
          >
            {rotuloLimpeza()}
          </button>
        )}

        {fase.tipo === "conectando" && (
          <p style={{ fontSize: 12, color: "var(--txt-3)", textAlign: "center", padding: "20px 0" }}>
            Conectando…
          </p>
        )}

        {fase.tipo === "qr" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <img src={fase.qrDataUrl} alt="QR code pra vincular o WhatsApp" width={260} height={260} style={{ borderRadius: 10 }} />
            <p style={{ fontSize: 11.5, color: "var(--txt-3)", textAlign: "center" }}>
              No <strong>seu</strong> celular: WhatsApp → Configurações → Aparelhos conectados →
              Conectar um aparelho. Ao escanear, suas conversas do WhatsApp são trazidas pra
              cá e aparecem no app de conversas. É uma leitura única do histórico — o aparelho
              é desconectado sozinho ao terminar.
            </p>
          </div>
        )}

        {fase.tipo === "sincronizando" && (
          <p style={{ fontSize: 12, color: "var(--txt-3)", textAlign: "center", padding: "20px 0" }}>
            {fase.mensagem}
          </p>
        )}

        {fase.tipo === "erro" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12, color: "oklch(0.72 0.17 25)" }}>{fase.mensagem}</p>
            <button type="button" onClick={onFechar} style={estiloBotaoLeve}>Fechar</button>
          </div>
        )}

        {fase.tipo === "revisao" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12, color: "var(--txt-1)", fontWeight: 600 }}>
              ✓ {fase.leads.length} conversa(s) trazida(s) — já aparecem no seu app de conversas.
            </p>
            <p style={{ fontSize: 11.5, color: "var(--txt-3)" }}>
              <strong>Opcional:</strong> marque as que <strong>fecharam venda</strong> pra IA aprender com
              elas (aba Conhecimento → "Analisar conversas"). Pode pular — não muda nada nas conversas.
            </p>
            {fase.leads.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--txt-3)" }}>Nenhuma conversa de texto encontrada no histórico.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {fase.leads.map((l) => (
                  <label
                    key={l.id}
                    style={{
                      display: "flex", gap: 8, alignItems: "flex-start", padding: 8, borderRadius: 8,
                      background: "rgba(255,255,255,0.03)", cursor: "pointer",
                    }}
                  >
                    <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => alternar(l.id)} style={{ marginTop: 3 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--txt-1)" }}>{l.nome} <span style={{ fontWeight: 400, color: "var(--txt-3)" }}>· {l.phone}</span></div>
                      <div style={{ fontSize: 11, color: "var(--txt-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.preview}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={onFechar} style={estiloBotaoLeve}>Pular</button>
              <button type="button" onClick={confirmarRevisao} style={estiloBotaoPrimario}>
                Confirmar {selecionados.size > 0 ? `(${selecionados.size})` : ""}
              </button>
            </div>
          </div>
        )}

        {fase.tipo === "aprendendo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 11.5, color: "var(--txt-3)" }}>
              A IA tá lendo cada conversa importada pra aprender padrões do seu jeito de atender.
              Isso acontece só essa vez.
            </p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }}>
              <AvatarAprendendo nome={fase.leads[fase.indiceAtual]?.nome ?? "?"} />
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--txt-1)", textAlign: "center" }}>
                {fase.leads[fase.indiceAtual]?.nome}
              </div>
              <div style={{ fontSize: 11, color: "var(--txt-3)" }}>
                {fase.indiceAtual + 1} de {fase.leads.length}
              </div>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${((fase.indiceAtual + 1) / fase.leads.length) * 100}%`,
                  background: "linear-gradient(90deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        {fase.tipo === "concluido" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "10px 0" }}>
            <CheckCircle2 size={28} color="oklch(0.72 0.16 155)" aria-hidden="true" />
            <p style={{ fontSize: 12.5, color: "var(--txt-1)", textAlign: "center" }}>
              Pronto! Suas conversas já estão no app de conversas.
              {fase.marcados > 0 ? ` ${fase.marcados} marcada(s) como convertida(s) pra IA aprender.` : ""}
            </p>
            <button type="button" onClick={onFechar} style={estiloBotaoPrimario}>Fechar</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Hash determinístico nome → matiz (mesma pessoa, mesma cor sempre). */
function matizPorNome(nome: string): number {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) % 360;
  return h;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}

/** Avatar de iniciais (disco colorido por hash do nome) + badge de "olho"
 * pulsando no canto — indica "IA lendo/aprendendo com esta conversa agora". */
function AvatarAprendendo({ nome }: { nome: string }) {
  const matiz = matizPorNome(nome);
  return (
    <div style={{ position: "relative", width: 56, height: 56 }}>
      <div
        style={{
          width: 56, height: 56, borderRadius: "50%",
          background: `oklch(0.42 0.1 ${matiz})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 700, color: "oklch(0.95 0.02 280)",
        }}
      >
        {iniciais(nome)}
      </div>
      <div
        style={{
          position: "absolute", bottom: -2, right: -2,
          width: 22, height: 22, borderRadius: "50%",
          background: "oklch(0.7 0.18 220)",
          border: "2px solid oklch(0.18 0.06 280)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "pulso-olho 1.4s ease-in-out infinite",
        }}
      >
        <Eye size={12} color="oklch(0.14 0.02 280)" aria-hidden="true" />
      </div>
      <style>{`
        @keyframes pulso-olho {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

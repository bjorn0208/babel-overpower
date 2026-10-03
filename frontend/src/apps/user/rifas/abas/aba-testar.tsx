/**
 * Aba Testar — chat de teste da Luci DENTRO do app Rifas.
 *
 * Mesmo contrato do Chat de Teste oficial: lead de teste zerado por sessão
 * (phone único com timestamp, tag lead_de_teste) + conversa channel 'teste' +
 * motor `ragentic-processar-inline` com modo_teste:true — resposta SÍNCRONA
 * (sem buffer de 3-10s, sem fila de saída, sem Z-API). Cada turno mostra o
 * tempo que o motor levou.
 *
 * Imagem nas duas mãos (Fabrício 10/09):
 * - a FOTO que a Luci manda (`enviar_foto_rifa`) não volta no retorno do motor — ela vai pra
 *   `caixa_saida_mensagens` com `carga.midia_url`, e no canal 'teste' o outbox só carimba
 *   "enviada" (nada sai pro WhatsApp). A aba lê essas linhas e mostra a foto na conversa.
 * - o dono pode ANEXAR imagem (ex.: print do comprovante): sobe pro bucket público e vai pro
 *   motor como `media_url`, igual ao webhook. Em modo_teste o motor lê a imagem e responde,
 *   mas não congela reserva nenhuma.
 */

import { FlaskConical, Paperclip, RotateCcw, Send, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CarregandoCentro, EstadoVazio } from "../componentes/basicos";
import { Botao } from "../componentes/botao";
import { AreaTexto } from "../componentes/campo";
import { subirImagemChatTeste } from "../dados-rifas";
import "./aba-bricio.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

interface BolhaTeste {
  id: string;
  de: "voce" | "luci" | "sistema";
  texto: string;
  imagem?: string;
  ms?: number;
}

interface RespostaInline {
  reply?: string;
  mensagens?: string[];
  conversation_id?: string;
  error?: string;
}

interface LinhaFoto {
  id: string;
  content: string | null;
  carga: { midia_url?: string } | null;
  created_at: string;
}

export interface AbaTestarProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

// A conversa de teste sobrevive a sair da página (Fabrício 10/09): guarda o id aqui e, na
// volta, relê as bolhas de `mensagens` — o motor já grava as duas pontas em modo_teste.
// Só "↺ nova sessão" apaga.
const chaveConversa = (uid: string) => `rifas-testar-conversa:${uid}`;
const lerConversaSalva = (uid: string): string | null => {
  try { return localStorage.getItem(chaveConversa(uid)); } catch { return null; }
};
const salvarConversa = (uid: string, convId: string | null) => {
  try {
    if (convId) localStorage.setItem(chaveConversa(uid), convId);
    else localStorage.removeItem(chaveConversa(uid));
  } catch { /* navegador sem storage: a sessão só não sobrevive à saída */ }
};

const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
const LIMITE_IMAGEM = 10 * 1024 * 1024;

/** Cenários prontos: viram chips roláveis que preenchem o composer. */
const CENARIOS = [
  "Oi, tudo bem?",
  "Quanto tá a rifa?",
  "Me manda a foto da rifa",
  "Quais são os prêmios?",
  "Que horas sai o sorteio?",
  "Como eu pago?",
];

/** Fotos que a Luci mandou nesta conversa (fila de saída — no canal 'teste' nada vai pro WhatsApp). */
async function fotosDaLuci(sb: Sb, convId: string): Promise<LinhaFoto[]> {
  const { data, error } = await sb
    .from("caixa_saida_mensagens")
    .select("id, content, carga, created_at")
    .eq("conversation_id", convId)
    .eq("carga->>origem", "enviar_foto_rifa")
    .order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return (data as LinhaFoto[]).filter((f) => typeof f.carga?.midia_url === "string" && f.carga.midia_url);
}

const bolhaDaFoto = (f: LinhaFoto): BolhaTeste => ({
  id: `f-${f.id}`, de: "luci", texto: f.content ?? "", imagem: String(f.carga?.midia_url ?? ""),
});

/** O motor grava a fala do lead com a leitura da imagem entre colchetes — na tela vale só a legenda. */
const legendaDoLead = (conteudo: string) => conteudo.replace(/\n*\[[^\]]*enviad[oa] pelo lead[\s\S]*$/, "").trim();

export const AbaTestar = ({ aoNotificar }: AbaTestarProps) => {
  const [bolhas, setBolhas] = useState<BolhaTeste[]>([]);
  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<File | null>(null);
  const [previaAnexo, setPreviaAnexo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [agenteId, setAgenteId] = useState<string | null>(null);
  const [agentePausado, setAgentePausado] = useState(false);
  const [buscandoAgente, setBuscandoAgente] = useState(true);
  const refConvId = useRef<string | null>(null);
  const refFotosVistas = useRef<Set<string>>(new Set());
  const refFim = useRef<HTMLDivElement | null>(null);
  const refArquivo = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const sb = supabase as Sb;
      const { data: ses } = await sb.auth.getSession();
      const uid = ses?.session?.user?.id;
      if (!uid) {
        if (vivo) setBuscandoAgente(false);
        return;
      }
      // Δ 2026-09-10 (Fabrício): filtrava `is_active = true` e travava com a IA Geral pausada —
      // justo quando o dono quer testar sem a Luci responder cliente. Pausa só cala o WhatsApp
      // (webhook); o motor aceita agente pausado. Mesma regra do Chat de Teste oficial.
      const { data } = await sb
        .from("agentes")
        .select("id, is_active")
        .eq("user_id", uid)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Retoma a conversa de teste que estava aberta, se ainda existir.
      const salva = lerConversaSalva(uid);
      if (salva && vivo) {
        const { data: msgs, error } = await sb
          .from("mensagens")
          .select("id, role, content, carga, created_at")
          .eq("conversation_id", salva)
          .in("role", ["user", "assistant"])
          .is("deleted_at", null)
          .order("created_at", { ascending: true });
        if (!error && Array.isArray(msgs) && msgs.length > 0) {
          refConvId.current = salva;
          const fotos = await fotosDaLuci(sb, salva);
          fotos.forEach((f) => refFotosVistas.current.add(f.id));
          type Linha = { id: string; role: string; content: string | null; carga: { media_url?: string } | null; created_at: string };
          const linhas = [
            ...(msgs as Linha[]).map((m) => ({
              em: m.created_at,
              bolha: m.role === "user"
                ? { id: String(m.id), de: "voce" as const, texto: m.carga?.media_url ? legendaDoLead(m.content ?? "") : (m.content ?? ""), imagem: m.carga?.media_url || undefined }
                : { id: String(m.id), de: "luci" as const, texto: m.content ?? "" },
            })),
            ...fotos.map((f) => ({ em: f.created_at, bolha: bolhaDaFoto(f) })),
          ].sort((a, b) => a.em.localeCompare(b.em));
          if (vivo) setBolhas(linhas.map((l) => l.bolha));
        } else if (!error) {
          salvarConversa(uid, null);
        }
      }
      if (vivo) {
        setAgenteId(data?.id ?? null);
        setAgentePausado(data?.is_active === false);
        setBuscandoAgente(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    refFim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bolhas]);

  // Solta a URL local da prévia quando troca/remove o anexo.
  useEffect(() => () => { if (previaAnexo) URL.revokeObjectURL(previaAnexo); }, [previaAnexo]);

  const escolherAnexo = (arquivo: File | null) => {
    if (!arquivo) return;
    if (!TIPOS_IMAGEM.includes(arquivo.type)) {
      aoNotificar("Mande a imagem em JPG, PNG ou WEBP.", "error");
      return;
    }
    if (arquivo.size > LIMITE_IMAGEM) {
      aoNotificar("Imagem grande demais (máx. 10 MB).", "error");
      return;
    }
    setAnexo(arquivo);
    setPreviaAnexo(URL.createObjectURL(arquivo));
  };

  const tirarAnexo = () => {
    setAnexo(null);
    setPreviaAnexo(null);
    if (refArquivo.current) refArquivo.current.value = "";
  };

  /** Lead + conversa de teste novos (sessão zerada — a Luci trata como 1º contato). */
  const garantirConversa = async (): Promise<string | null> => {
    if (refConvId.current) return refConvId.current;
    const sb = supabase as Sb;
    const { data: ses } = await sb.auth.getSession();
    const uid = ses?.session?.user?.id;
    if (!uid || !agenteId) return null;
    const phone = `__chat_teste_${uid.slice(0, 8)}_${Date.now()}__`;
    const { data: lead, error: errLead } = await sb
      .from("leads")
      .insert({
        tenant_id: uid, agente_id: agenteId, phone,
        name: "Lead de Teste", nome_exibicao: "Lead de Teste",
        dados_ficha: {}, tags: ["lead_de_teste"],
      })
      .select("id").single();
    if (errLead || !lead?.id) {
      aoNotificar(`Não consegui criar o lead de teste: ${errLead?.message ?? "sem id"}`, "error");
      return null;
    }
    const { data: conv, error: errConv } = await sb
      .from("conversas")
      .insert({
        tenant_id: uid, agente_id: agenteId, phone,
        channel: "teste", status: "ativa", agent_enabled: true, lead_id: lead.id,
      })
      .select("id").single();
    if (errConv || !conv?.id) {
      aoNotificar(`Não consegui criar a conversa de teste: ${errConv?.message ?? "sem id"}`, "error");
      return null;
    }
    refConvId.current = String(conv.id);
    salvarConversa(uid, refConvId.current);
    return refConvId.current;
  };

  const enviar = async () => {
    const msg = texto.trim();
    const arquivo = anexo;
    if ((!msg && !arquivo) || enviando || !agenteId) return;
    setTexto("");
    // A bolha mostra a imagem pela URL local (vive enquanto a aba estiver aberta; na volta, vem do banco).
    const previa = arquivo ? URL.createObjectURL(arquivo) : undefined;
    tirarAnexo();
    setBolhas((b) => [...b, { id: `u-${Date.now()}`, de: "voce", texto: msg, imagem: previa }]);
    setEnviando(true);
    const t0 = Date.now();
    try {
      const convId = await garantirConversa();
      if (!convId) return;
      let midia: { media_url: string; media_type: string } | null = null;
      if (arquivo) {
        const url = await subirImagemChatTeste(arquivo);
        if (!url) throw new Error("não consegui subir a imagem");
        midia = { media_url: url, media_type: arquivo.type };
      }
      const { data, error } = await supabase.functions.invoke<RespostaInline>(
        "ragentic-processar-inline",
        {
          body: {
            agente_id: agenteId, phone: "__chat_teste__", conversation_id: convId, modo_teste: true,
            message: msg || "[MEDIA_RECEBIDA]",
            ...(midia ?? {}),
          },
        },
      );
      if (error) throw new Error(error.message || "erro na edge");
      if (data?.error) throw new Error(data.error);
      const respostas = Array.isArray(data?.mensagens) && data.mensagens.length
        ? data.mensagens
        : data?.reply ? [data.reply] : [];
      const ms = Date.now() - t0;
      // Foto que a Luci mandou neste turno (a tool roda antes do texto — entra antes das bolhas).
      const fotosNovas = (await fotosDaLuci(supabase as Sb, convId)).filter((f) => !refFotosVistas.current.has(f.id));
      fotosNovas.forEach((f) => refFotosVistas.current.add(f.id));
      if (respostas.length === 0 && fotosNovas.length === 0) {
        setBolhas((b) => [...b, { id: `s-${Date.now()}`, de: "sistema", texto: "(a Luci ficou em silêncio neste turno)", ms }]);
      } else {
        setBolhas((b) => [
          ...b,
          ...fotosNovas.map((f, i) => ({ ...bolhaDaFoto(f), ms: i === 0 ? ms : undefined })),
          ...respostas.map((r, i) => ({
            id: `a-${Date.now()}-${i}`, de: "luci" as const, texto: r,
            ms: i === 0 && fotosNovas.length === 0 ? ms : undefined,
          })),
        ]);
      }
    } catch (e) {
      setBolhas((b) => [...b, { id: `e-${Date.now()}`, de: "sistema", texto: `Erro: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setEnviando(false);
    }
  };

  const novaSessao = async () => {
    refConvId.current = null;
    refFotosVistas.current = new Set();
    setBolhas([]);
    tirarAnexo();
    const { data: ses } = await (supabase as Sb).auth.getSession();
    const uid = ses?.session?.user?.id;
    if (uid) salvarConversa(uid, null);
    aoNotificar("Sessão nova — a Luci vai te tratar como primeiro contato.", "info");
  };

  if (buscandoAgente) {
    return <CarregandoCentro rotulo="Carregando o agente…" />;
  }
  if (!agenteId) {
    return (
      <EstadoVazio
        icone={<FlaskConical size={32} />}
        titulo="Nenhum agente cadastrado"
        descricao="Crie o agente primeiro no app Agente — é ele que responde nesta bancada."
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      {/* Cabeçalho: marca roxa + título de tela + reiniciar sessão */}
      <div className="flex items-start gap-3">
        <span className="ar-marca mt-0.5" aria-hidden>
          <FlaskConical size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="ar-titulo-tela">Testar a Luci</h2>
          <p className="text-sm ar-txt-3 mt-1">
            Conversa direta com o motor real (sem WhatsApp, sem espera de buffer). Pergunte preço, prêmios, hora do sorteio, peça a foto da rifa ou mande um print — e veja o tempo de cada resposta.
          </p>
        </div>
        <Botao variante="fantasma" tamanho="sm" onClick={novaSessao} className="shrink-0">
          <RotateCcw size={15} />
          Nova sessão
        </Botao>
      </div>

      {agentePausado && (
        <p className="ar-aviso-box">
          IA Geral pausada · o WhatsApp não responde ninguém — o teste aqui funciona normal
        </p>
      )}

      <div className="ar-cartao brc-conversa">
        {bolhas.length === 0 && (
          <p className="text-sm ar-txt-4 text-center my-auto">
            Manda um “oi” ou “quanto tá a rifa?” pra começar.
          </p>
        )}
        {bolhas.map((b) => (
          <div key={b.id} className={`brc-linha ${b.de === "voce" ? "brc-linha--voce" : ""}`}>
            <div
              className={`brc-balao ${
                b.de === "voce" ? "brc-balao--voce" : b.de === "luci" ? "brc-balao--agente" : "brc-balao--sistema"
              }`}
            >
              {b.imagem && (
                <a href={b.imagem} target="_blank" rel="noreferrer" className={`block ${b.texto ? "mb-1.5" : ""}`}>
                  <img src={b.imagem} alt="imagem da conversa" />
                </a>
              )}
              {b.texto}
              {b.ms !== undefined && (
                <span className="brc-tempo">
                  <Zap size={10} aria-hidden />
                  {(b.ms / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </div>
        ))}
        {enviando && <span className="brc-digitando">Luci pensando…</span>}
        <div ref={refFim} />
      </div>

      {/* Cenários prontos: chips roláveis, nunca quebram linha no celular */}
      <div className="ar-scroll-x -mx-4 px-4">
        {CENARIOS.map((cenario) => (
          <button
            key={cenario}
            type="button"
            disabled={enviando}
            onClick={() => { setTexto(cenario); }}
            className="ar-chip disabled:opacity-50"
          >
            {cenario}
          </button>
        ))}
      </div>

      <div className="ar-sticky-bottom brc-composer">
        {previaAnexo && (
          <div className="ar-cartao ar-cartao--alto ar-cartao--compacto flex items-center gap-3">
            <img
              src={previaAnexo}
              alt="anexo"
              className="h-12 w-12 rounded-[var(--ar-r-sm)] object-cover shrink-0"
            />
            <span className="text-sm ar-txt-2 truncate flex-1">{anexo?.name}</span>
            <button type="button" onClick={tirarAnexo} className="ar-icone-btn" aria-label="Tirar anexo">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="brc-composer__linha">
          <input
            ref={refArquivo}
            type="file"
            accept={TIPOS_IMAGEM.join(",")}
            className="hidden"
            onChange={(e) => escolherAnexo(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => refArquivo.current?.click()}
            disabled={enviando}
            title="Mandar imagem (ex.: print do comprovante)"
            aria-label="Mandar imagem"
            className="ar-icone-btn disabled:opacity-50"
          >
            <Paperclip size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <AreaTexto
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              placeholder={anexo ? "Legenda (opcional)…" : "Escreva como se fosse um cliente…"}
              disabled={enviando}
              aria-label="Mensagem do cliente de teste"
            />
          </div>
          <Botao variante="primario" onClick={() => void enviar()} carregando={enviando}>
            {!enviando && <Send size={16} />}
            Enviar
          </Botao>
        </div>
      </div>

      <p className="text-xs ar-txt-4">
        A Luci responde com as regras e a rifa ATIVAS de verdade — o teste não manda nada pro WhatsApp e o lead fica marcado como lead_de_teste. Print de comprovante aqui é só leitura: não congela reserva.
      </p>
    </div>
  );
};

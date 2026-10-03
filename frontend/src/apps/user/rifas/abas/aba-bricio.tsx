/**
 * Aba Bricio — conversa do DONO com o agente dedicado à rifa (Theus 2026-09-06).
 *
 * Diferença pra aba Testar: lá o dono simula um COMPRADOR (canal externo, motor
 * com modo_teste). Aqui ele fala como DONO — canal interno, cargo `Bricio`
 * (`cargos.tipologia='rifas'`), que carrega só as 15 tools de rifa e tem mente
 * exclusiva do app. Mesmo motor (`ragentic-processar-inline`), canal diferente:
 * o corpo `{ conversa_id, mensagem, canal: 'rifas' }` é o que troca a chave.
 *
 * O JWT do dono vai automático no header pelo cliente Supabase — é ele que o
 * motor usa pra provar que a conversa é interna (`detectarDonoLogado`).
 */

import { Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Botao } from "../componentes/botao";
import { AreaTexto } from "../componentes/campo";
import "./aba-bricio.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

interface Bolha {
  id: string;
  de: "voce" | "bricio" | "sistema";
  texto: string;
  ms?: number;
}

export interface AbaBricioProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

const SUGESTOES = [
  "como tá a rifa?",
  "tem comprovante pra validar?",
  "quem tá devendo?",
  "que horas é o sorteio?",
];

export const AbaBricio = ({ aoNotificar }: AbaBricioProps) => {
  const [bolhas, setBolhas] = useState<Bolha[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const refConvId = useRef<string | null>(null);
  const refFim = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    refFim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bolhas]);

  /**
   * Conversa do canal interno vive em `mentor_conversas` (owner_id = dono), NÃO
   * em `conversas` — esta é a tabela de lead, e o canal-interno valida a posse
   * pela outra. Errar a tabela devolve 404 "conversa não encontrada", que foi o
   * primeiro sintoma em produção. Mesmo cano do CommandBar e do App Marketing.
   * `canal='rifas'` separa o histórico do Bricio do histórico do Mentor.
   */
  const garantirConversa = async (): Promise<string | null> => {
    if (refConvId.current) return refConvId.current;
    const sb = supabase as Sb;
    const { data: ses } = await sb.auth.getSession();
    const uid = ses?.session?.user?.id;
    if (!uid) return null;

    const { data: existente } = await sb
      .from("mentor_conversas")
      .select("id")
      .eq("owner_id", uid)
      .eq("canal", "rifas")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existente?.id) {
      refConvId.current = String(existente.id);
      return refConvId.current;
    }

    const { data: nova, error } = await sb
      .from("mentor_conversas")
      .insert({ owner_id: uid, canal: "rifas", titulo: "Conversa com o Bricio" })
      .select("id")
      .single();
    if (error || !nova?.id) {
      aoNotificar(`Não consegui abrir a conversa com o Bricio: ${error?.message ?? "sem id"}`, "error");
      return null;
    }
    refConvId.current = String(nova.id);
    return refConvId.current;
  };

  const enviar = async (msgDireta?: string) => {
    const msg = (msgDireta ?? texto).trim();
    if (!msg || enviando) return;
    if (!msgDireta) setTexto("");
    setBolhas((b) => [...b, { id: `u-${Date.now()}`, de: "voce", texto: msg }]);
    setEnviando(true);
    const t0 = Date.now();
    try {
      const convId = await garantirConversa();
      if (!convId) return;
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; mensagem?: string; error?: string }>(
        "ragentic-processar-inline",
        { body: { conversa_id: convId, mensagem: msg, canal: "rifas" } },
      );
      if (error) throw new Error(error.message || "erro na edge");
      if (data?.error) throw new Error(data.error);
      const resposta = data?.mensagem?.trim();
      setBolhas((b) => [
        ...b,
        {
          id: `a-${Date.now()}`,
          de: resposta ? "bricio" : "sistema",
          texto: resposta || "(o Bricio ficou em silêncio neste turno)",
          ms: Date.now() - t0,
        },
      ]);
    } catch (e) {
      setBolhas((b) => [
        ...b,
        { id: `e-${Date.now()}`, de: "sistema", texto: `Erro: ${e instanceof Error ? e.message : String(e)}` },
      ]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      {/* Cabeçalho: marca roxa + título de tela */}
      <div className="flex items-start gap-3">
        <span className="ar-marca mt-0.5" aria-hidden>
          <Sparkles size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="ar-titulo-tela">Bricio</h2>
          <p className="text-sm ar-txt-3 mt-1">
            Seu rifeiro. Ele só cuida da rifa — pergunta o número, manda executar. Painel, comprovante,
            dívida, número fixo, sorteio, disparo e config, tudo pela conversa.
          </p>
        </div>
      </div>

      {/* Atalhos: chips roláveis, nunca quebram linha no celular */}
      {bolhas.length === 0 && (
        <div className="ar-scroll-x -mx-4 px-4">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void enviar(s)}
              disabled={enviando}
              className="ar-chip disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="ar-cartao brc-conversa">
        {bolhas.length === 0 && (
          <p className="text-sm ar-txt-4 text-center my-auto">
            Pergunte qualquer coisa da rifa — ele olha o painel e responde.
          </p>
        )}
        {bolhas.map((b) => (
          <div key={b.id} className={`brc-linha ${b.de === "voce" ? "brc-linha--voce" : ""}`}>
            <div
              className={`brc-balao ${
                b.de === "voce" ? "brc-balao--voce" : b.de === "bricio" ? "brc-balao--agente" : "brc-balao--erro"
              }`}
            >
              {b.texto}
              {b.ms !== undefined && <span className="brc-tempo">{(b.ms / 1000).toFixed(1)}s</span>}
            </div>
          </div>
        ))}
        {enviando && <span className="brc-digitando">Bricio está olhando a rifa…</span>}
        <div ref={refFim} />
      </div>

      <div className="ar-sticky-bottom brc-composer">
        <div className="brc-composer__linha">
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
              placeholder="Fala com o Bricio…"
              disabled={enviando}
              aria-label="Mensagem para o Bricio"
            />
          </div>
          <Botao variante="primario" onClick={() => void enviar()} disabled={enviando || !texto.trim()}>
            <Send size={16} />
            Enviar
          </Botao>
        </div>
      </div>
    </div>
  );
};

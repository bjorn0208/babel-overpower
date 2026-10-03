// Hook motor de replay — busca dados reais e controla a timeline
// Tabelas: traces (✅ RLS autenticado), mensagens (✅), caixa_saida_mensagens (✅)
// prompts_mensagem: ❌ só platform_admin — não consulta aqui

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  TraceReal,
  MensagemReal,
  BolhaSaidaReal,
  EstadoReplay,
} from "./tipos-replay";
import { montarTimeline } from "./replay-timeline";

const VELOCIDADES = [0.5, 1, 2, 99] as const;
export type Velocidade = (typeof VELOCIDADES)[number];

// ms base entre passos em velocidade 1x
const MS_POR_PASSO_BASE = 800;

const ESTADO_INICIAL: EstadoReplay = {
  conversaId: null,
  passos: [],
  indiceAtual: -1,
  estado: "parado",
  velocidade: 1,
  carregando: false,
  erro: null,
};

export function usePlayReplay() {
  const [replay, setReplay] = useState<EstadoReplay>(ESTADO_INICIAL);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indiceRef = useRef(-1); // espelho do indiceAtual pra usar no timer sem stale closure
  // Geração da cadeia de replay. Cada play/pause/troca incrementa: ticks agendados
  // com uma geração antiga viram órfãos e param sozinhos. Sem isso o StrictMode
  // (que roda updaters 2x) criava DUAS cadeias de timer e o replay pulava passos;
  // o Pause só matava o último timer e a cadeia órfã seguia rodando.
  const epocaRef = useRef(0);
  // Contador de pedidos de carregamento — descarta resultado de fetch obsoleto
  // quando o usuário troca de conversa no meio da busca (race troca-durante-fetch).
  const pedidoRef = useRef(0);
  // Espelho do estado pra o tick ler passos/velocidade sem reintroduzir side-effects
  // dentro do updater.
  const replayRef = useRef(replay);
  useEffect(() => {
    replayRef.current = replay;
  }, [replay]);

  // Mata qualquer cadeia de replay em voo (Pause, troca de conversa, unmount).
  const pararCadeia = useCallback(() => {
    epocaRef.current += 1;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Limpa a cadeia ao desmontar
  useEffect(() => {
    return () => {
      epocaRef.current += 1;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Carrega conversa ──────────────────────────────────────────────────────

  const carregarConversa = useCallback(async (conversaId: string) => {
    pararCadeia();
    const meuPedido = ++pedidoRef.current; // marca este pedido como o mais recente

    setReplay((s) => ({
      ...s,
      carregando: true,
      erro: null,
      estado: "parado",
      indiceAtual: -1,
      passos: [],
      conversaId,
    }));
    indiceRef.current = -1;

    try {
      // Busca em paralelo: traces + mensagens + caixa_saida
      const [resTraces, resMensagens, resBolhas] = await Promise.all([
        supabase
          .from("traces")
          .select(
            "id, conversa_id, tipo, modelo_llm, decisao, raciocinio_interno, prompt_resumo, latencia_ms, custo_tokens_in, custo_tokens_out, criado_em, turno_id"
          )
          .eq("conversa_id", conversaId)
          .order("criado_em", { ascending: true }),
        supabase
          .from("mensagens")
          .select("id, conversation_id, role, content, created_at, carga")
          .eq("conversation_id", conversaId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("caixa_saida_mensagens")
          .select(
            "id, conversation_id, content, status, bubble_order, created_at, scheduled_at"
          )
          .eq("conversation_id", conversaId)
          .order("created_at", { ascending: true }),
      ]);

      // Trocou de conversa durante o fetch → este resultado é obsoleto, descarta.
      if (meuPedido !== pedidoRef.current) return;

      // Coleta erros sem bloquear — cada tabela pode ter acesso ou não
      const avisos: string[] = [];
      if (resTraces.error) avisos.push(`traces: ${resTraces.error.message}`);
      if (resMensagens.error) avisos.push(`mensagens: ${resMensagens.error.message}`);
      if (resBolhas.error) avisos.push(`caixa_saida: ${resBolhas.error.message}`);

      const traces = (resTraces.data ?? []) as TraceReal[];
      const mensagens = (resMensagens.data ?? []) as MensagemReal[];
      const bolhas = (resBolhas.data ?? []) as BolhaSaidaReal[];

      if (traces.length === 0 && mensagens.length === 0 && bolhas.length === 0) {
        setReplay((s) => ({
          ...s,
          carregando: false,
          erro:
            avisos.length > 0
              ? `Sem dados. Erros de acesso: ${avisos.join("; ")}`
              : "Nenhum dado encontrado para esta conversa.",
        }));
        return;
      }

      const passos = montarTimeline(traces, mensagens, bolhas);

      setReplay((s) => ({
        ...s,
        passos,
        indiceAtual: -1,
        estado: "parado",
        carregando: false,
        erro: avisos.length > 0 ? `Aviso: ${avisos.join("; ")}` : null,
      }));
    } catch (e) {
      if (meuPedido !== pedidoRef.current) return; // pedido obsoleto
      const msg = e instanceof Error ? e.message : String(e);
      setReplay((s) => ({ ...s, carregando: false, erro: `Erro inesperado: ${msg}` }));
    }
  }, [pararCadeia]);

  // ── Controles Play/Pause/Passo ───────────────────────────────────────────

  // Executa 1 passo e agenda o próximo. TODO o side-effect (mutar indiceRef,
  // agendar timer) fica FORA do updater do setReplay — o updater é puro (só
  // aplica o índice já calculado), então o double-invoke do StrictMode não pula
  // passos. A geração (`epoca`) garante que só a cadeia atual segue viva.
  const tick = useCallback((epoca: number) => {
    if (epoca !== epocaRef.current) return; // cadeia órfã: pausou/trocou/desmontou
    const snap = replayRef.current;
    const proximo = indiceRef.current + 1;

    if (proximo >= snap.passos.length) {
      const ultimo = snap.passos.length - 1;
      indiceRef.current = ultimo;
      setReplay((s) => ({ ...s, indiceAtual: ultimo, estado: "fim" }));
      return;
    }

    indiceRef.current = proximo;
    setReplay((s) => ({ ...s, indiceAtual: proximo }));

    // Velocidade 99 = instantâneo (sem delay)
    const ms = snap.velocidade >= 99 ? 0 : Math.round(MS_POR_PASSO_BASE / snap.velocidade);
    timerRef.current = setTimeout(() => tick(epoca), ms);
  }, []);

  const play = useCallback(() => {
    // Guard + agendamento FORA do updater (evita cadeia dupla no StrictMode).
    if (replayRef.current.passos.length === 0) return;
    pararCadeia(); // mata cadeia anterior e abre uma geração nova
    const epoca = epocaRef.current;
    setReplay((s) => (s.passos.length === 0 ? s : { ...s, estado: "rodando" }));
    const ms = replayRef.current.velocidade >= 99 ? 0 : MS_POR_PASSO_BASE / replayRef.current.velocidade;
    timerRef.current = setTimeout(() => tick(epoca), ms);
  }, [pararCadeia, tick]);

  const pausar = useCallback(() => {
    pararCadeia();
    setReplay((s) => ({ ...s, estado: "pausado" }));
  }, [pararCadeia]);

  const passo = useCallback(() => {
    pararCadeia();
    // proximo deriva de s.indiceAtual (estado anterior), não de indiceRef, então é
    // idempotente sob o double-invoke do StrictMode. indiceRef é sincronizado fora.
    const alvo = indiceRef.current + 1;
    setReplay((s) => {
      if (s.passos.length === 0) return s;
      const proximo = s.indiceAtual + 1;
      if (proximo >= s.passos.length) return { ...s, estado: "fim" };
      return { ...s, indiceAtual: proximo, estado: "pausado" };
    });
    if (alvo < replayRef.current.passos.length) indiceRef.current = alvo;
  }, [pararCadeia]);

  const retroceder = useCallback(() => {
    pararCadeia();
    const anterior = Math.max(-1, indiceRef.current - 1);
    indiceRef.current = anterior;
    setReplay((s) => ({ ...s, indiceAtual: Math.max(-1, s.indiceAtual - 1), estado: "pausado" }));
  }, [pararCadeia]);

  const reiniciar = useCallback(() => {
    pararCadeia();
    indiceRef.current = -1;
    setReplay((s) => ({ ...s, indiceAtual: -1, estado: "parado" }));
  }, [pararCadeia]);

  const mudarVelocidade = useCallback((v: Velocidade) => {
    setReplay((s) => ({ ...s, velocidade: v }));
  }, []);

  const limpar = useCallback(() => {
    pararCadeia();
    indiceRef.current = -1;
    setReplay(ESTADO_INICIAL);
  }, [pararCadeia]);

  return {
    replay,
    carregarConversa,
    play,
    pausar,
    passo,
    retroceder,
    reiniciar,
    mudarVelocidade,
    limpar,
    VELOCIDADES,
  };
}

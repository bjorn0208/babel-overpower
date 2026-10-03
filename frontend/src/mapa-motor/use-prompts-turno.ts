// Hook da visão "Construção": busca os turnos de prompts_turno de uma conversa
// e controla a navegação passo-a-passo (região por região).
// RLS: prompts_turno tem policy SELECT pra authenticated (tenant dono OU super admin).

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PromptTurno, EstadoConstrucao } from "./tipos-construcao";
import type { MensagemReal } from "./tipos-replay";
import { REGIOES } from "./regioes-mapa";

const ESTADO_INICIAL: EstadoConstrucao = {
  turnos: [],
  mensagens: [],
  turnoIdx: -1,
  passoIdx: -1,
  carregando: false,
  erro: null,
};

const ULTIMO_PASSO = REGIOES.length - 1;

export function usePromptsTurno() {
  const [estado, setEstado] = useState<EstadoConstrucao>(ESTADO_INICIAL);
  // Descarta resultado de fetch obsoleto quando o usuário troca de conversa no
  // meio da busca (race troca-durante-fetch).
  const pedidoRef = useRef(0);

  const carregarConversa = useCallback(async (conversaId: string) => {
    const meuPedido = ++pedidoRef.current;
    setEstado((s) => ({ ...s, carregando: true, erro: null }));
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (meuPedido !== pedidoRef.current) return; // troca de conversa: obsoleto
      if (!sess?.session) {
        setEstado((s) => ({
          ...s,
          carregando: false,
          erro:
            "Sem sessão nesta origem. Abra o mapa na MESMA URL onde está logado (RLS).",
        }));
        return;
      }
      // Os tipos gerados do Supabase (integrations/supabase/types) ainda não
      // incluem `prompts_turno` (tabela criada na migration 2026-05-18).
      // Regenerar o types.ts global agora colidiria com a frente paralela —
      // cast local isolado é o menor blast radius (impact-analysis). Sem `any`.
      const consulta = (
        supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (
                col: string,
                val: string,
              ) => {
                order: (
                  col: string,
                  o: { ascending: boolean },
                ) => Promise<{
                  data: PromptTurno[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        }
      )
        .from("prompts_turno")
        .select(
          "id, conversa_id, agente_id, lead_id, modelo_llm, prompt_completo, blocos, criado_em",
        )
        .eq("conversa_id", conversaId.trim())
        .order("criado_em", { ascending: true });
      const { data, error } = await consulta;
      if (meuPedido !== pedidoRef.current) return; // troca de conversa: obsoleto

      if (error) {
        setEstado((s) => ({
          ...s,
          carregando: false,
          erro: `Erro ao buscar prompts_turno: ${error.message}`,
        }));
        return;
      }

      const turnos = (data ?? []) as PromptTurno[];
      if (turnos.length === 0) {
        setEstado({
          ...ESTADO_INICIAL,
          erro:
            "Nenhum prompt gravado para esta conversa. Só turnos a partir do motor v57 (2026-05-18) gravam aqui.",
        });
        return;
      }

      // Mensagens que o lead enviou (role='user') — pra mostrar o que gerou cada prompt.
      // role='user' = entrada do lead; role='human' no motor novo = eco/campanha (não é o lead).
      const { data: msgs } = await supabase
        .from("mensagens")
        .select("id, conversation_id, role, content, created_at, carga")
        .eq("conversation_id", conversaId.trim())
        .eq("role", "user")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (meuPedido !== pedidoRef.current) return; // troca de conversa: obsoleto

      // Abre no último turno, com a construção zerada (nada aceso ainda).
      setEstado({
        turnos,
        mensagens: (msgs ?? []) as unknown as MensagemReal[],
        turnoIdx: turnos.length - 1,
        passoIdx: -1,
        carregando: false,
        erro: null,
      });
    } catch (e) {
      if (meuPedido !== pedidoRef.current) return; // troca de conversa: obsoleto
      const msg = e instanceof Error ? e.message : String(e);
      setEstado((s) => ({ ...s, carregando: false, erro: `Erro inesperado: ${msg}` }));
    }
  }, []);

  const selecionarTurno = useCallback((idx: number) => {
    setEstado((s) => {
      if (idx < 0 || idx >= s.turnos.length) return s;
      return { ...s, turnoIdx: idx, passoIdx: -1 };
    });
  }, []);

  const proximo = useCallback(() => {
    setEstado((s) => ({
      ...s,
      passoIdx: Math.min(ULTIMO_PASSO, s.passoIdx + 1),
    }));
  }, []);

  const anterior = useCallback(() => {
    setEstado((s) => ({ ...s, passoIdx: Math.max(-1, s.passoIdx - 1) }));
  }, []);

  const irPara = useCallback((passoIdx: number) => {
    setEstado((s) => ({
      ...s,
      passoIdx: Math.max(-1, Math.min(ULTIMO_PASSO, passoIdx)),
    }));
  }, []);

  const reiniciar = useCallback(() => {
    setEstado((s) => ({ ...s, passoIdx: -1 }));
  }, []);

  const limpar = useCallback(() => setEstado(ESTADO_INICIAL), []);

  // A msg que gera o turno = a RAJADA que o buffer agrupou logo antes do
  // prompt ser gravado. NÃO usar "desde o turno anterior com prompt": numa
  // conversa que só começou a gravar prompt hoje (v57), o 1º turno engoliria
  // toda a história antiga e mostraria uma msg velha que não gerou nada.
  // Reconstrói a rajada: da msg mais recente <= turno, voltando enquanto o
  // gap entre msgs for de "mesma rajada" (≤ 3 min, folga sobre o debounce).
  const mensagensDoTurno = useCallback(
    (idx: number): MensagemReal[] => {
      const t = estado.turnos[idx];
      if (!t) return [];
      const JANELA_BUFFER_MS = 180_000; // 3 min
      const fim = new Date(t.criado_em).getTime();
      const pisoTurnoAnterior =
        idx > 0 ? new Date(estado.turnos[idx - 1].criado_em).getTime() : -Infinity;
      const candidatas = estado.mensagens
        .filter((m) => {
          if (!m.created_at) return false;
          const c = new Date(m.created_at).getTime();
          return c <= fim && c > pisoTurnoAnterior;
        })
        .sort(
          (a, b) =>
            new Date(b.created_at as string).getTime() -
            new Date(a.created_at as string).getTime(),
        );
      const rajada: MensagemReal[] = [];
      let anterior: number | null = null;
      for (const m of candidatas) {
        const c = new Date(m.created_at as string).getTime();
        if (anterior === null) {
          if (fim - c > JANELA_BUFFER_MS) break; // 1ª já longe = turno proativo
          rajada.push(m);
        } else if (anterior - c <= JANELA_BUFFER_MS) {
          rajada.push(m);
        } else {
          break; // gap grande = rajada de outro turno
        }
        anterior = c;
      }
      return rajada.reverse();
    },
    [estado.turnos, estado.mensagens],
  );

  return {
    estado,
    carregarConversa,
    selecionarTurno,
    proximo,
    anterior,
    irPara,
    reiniciar,
    limpar,
    mensagensDoTurno,
    ultimoPasso: ULTIMO_PASSO,
  };
}

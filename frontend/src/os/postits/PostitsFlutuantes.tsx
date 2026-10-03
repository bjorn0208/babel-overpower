// @ts-nocheck
/**
 * Camada de post-its flutuantes sobre o Desktop. Lê todas as notas com
 * cravada=true AND status='ativa' do user atual e renderiza N <Postit />.
 *
 * Reage a:
 * - ragentic-dados-hidratados (boot inicial)
 * - ragentic-notas-mudaram (após CRUD no app Notas)
 *
 * onMover/onAlternarCheck/onConcluir/onArquivar salvam direto no Supabase.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Postit, type PostitNota } from './Postit';
import './postits.css';

type NotaRaw = PostitNota & { status: string; cravada: boolean };

export function PostitsFlutuantes() {
  const [userId, setUserId] = useState<string | null>(null);
  const [notas, setNotas] = useState<NotaRaw[]>([]);
  // Espelho do userId atual — o handler onMudar é criado 1x (effect com deps []) e
  // fechava sobre o userId do 1º render (null), então nunca via o valor real.
  const userIdRef = useRef<string | null>(null);

  const recarregar = useCallback(async (uid: string | null) => {
    if (!uid) {
      setNotas([]);
      return;
    }
    const { data, error } = await supabase
      .from('notas_app')
      .select('id, titulo, conteudo, checks, data_lembrete, posicao, status, cravada')
      .eq('cravada', true)
      .eq('status', 'ativa');
    if (error) {
      console.warn('[PostitsFlutuantes] listar:', error);
      setNotas([]);
      return;
    }
    setNotas((data ?? []) as NotaRaw[]);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id ?? null;
      if (!vivo) return;
      userIdRef.current = uid;
      setUserId(uid);
      await recarregar(uid);
    })();

    const onMudar = () => {
      const uid = userIdRef.current;
      if (uid) { void recarregar(uid); return; }
      // userId ainda não setado → pega a sessão e recarrega
      void supabase.auth.getSession().then(({ data }) => {
        const novo = data?.session?.user?.id ?? null;
        userIdRef.current = novo;
        setUserId(novo);
        void recarregar(novo);
      });
    };
    window.addEventListener('ragentic-notas-mudaram', onMudar);
    window.addEventListener('ragentic-dados-hidratados', onMudar);
    return () => {
      vivo = false;
      window.removeEventListener('ragentic-notas-mudaram', onMudar);
      window.removeEventListener('ragentic-dados-hidratados', onMudar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMover = useCallback(
    async (id: string, posicao: { x: number; y: number; w: number; h: number }) => {
      // Atualiza local imediato
      setNotas((prev) => prev.map((n) => (n.id === id ? { ...n, posicao } : n)));
      const { error } = await supabase.from('notas_app').update({ posicao } as any).eq('id', id);
      if (error) console.warn('[PostitsFlutuantes] mover:', error);
    },
    [],
  );

  const onAlternarCheck = useCallback(
    async (id: string, idCheck: string, marcado: boolean) => {
      // Updater FUNCIONAL: compõe sobre o estado ANTERIOR (UI otimista), não sobre
      // um snapshot de `notas` do render — dois cliques rápidos em checks diferentes
      // não perdem mais um do outro no estado local.
      setNotas((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, checks: (n.checks || []).map((c) => (c.id === idCheck ? { ...c, marcado } : c)) }
            : n,
        ),
      );
      // Persistência ATÔMICA no servidor: a RPC altera SÓ o item do checklist via
      // jsonb (auditoria 2026-08-31), sob o lock da linha — dois writes concorrentes
      // de checks diferentes não se sobrescrevem mais (antes gravava o array inteiro).
      const { error } = await supabase.rpc('alternar_check_nota', {
        p_nota_id: id,
        p_check_id: idCheck,
        p_marcado: marcado,
      });
      if (error) console.warn('[PostitsFlutuantes] check:', error);
      try {
        window.dispatchEvent(new CustomEvent('ragentic-notas-mudaram'));
      } catch {
        /* noop */
      }
    },
    [],
  );

  const onConcluir = useCallback(async (id: string) => {
    const alvo = notas.find((n) => n.id === id);
    if (!alvo) return;
    const checksConcluidos = (alvo.checks || []).map((c) => ({ ...c, marcado: true }));
    setNotas((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase
      .from('notas_app')
      .update({ status: 'concluida', cravada: false, checks: checksConcluidos } as any)
      .eq('id', id);
    if (error) console.warn('[PostitsFlutuantes] concluir:', error);
    try {
      window.dispatchEvent(new CustomEvent('ragentic-notas-mudaram'));
    } catch {
      /* noop */
    }
  }, [notas]);

  const onArquivar = useCallback(async (id: string) => {
    setNotas((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase
      .from('notas_app')
      .update({ status: 'arquivada', cravada: false } as any)
      .eq('id', id);
    if (error) console.warn('[PostitsFlutuantes] arquivar:', error);
    try {
      window.dispatchEvent(new CustomEvent('ragentic-notas-mudaram'));
    } catch {
      /* noop */
    }
  }, []);

  const onAbrirApp = useCallback((_notaId: string) => {
    // Dispara abertura do app Notas; o bundle escuta esse evento e chama abrir('notas').
    // Selecionar a nota específica fica pra onda 2 (passar notaId via custom event).
    try {
      window.dispatchEvent(new CustomEvent('ragentic-abrir-app', { detail: { slug: 'notas' } }));
    } catch {
      /* noop */
    }
  }, []);

  if (!userId || notas.length === 0) return null;

  return (
    <div className="postits-camada" aria-hidden={false}>
      {notas.map((n) => (
        <Postit
          key={n.id}
          nota={n}
          onMover={onMover}
          onAlternarCheck={onAlternarCheck}
          onConcluir={onConcluir}
          onArquivar={onArquivar}
          onAbrirApp={onAbrirApp}
        />
      ))}
    </div>
  );
}

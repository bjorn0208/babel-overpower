// @ts-nocheck
/**
 * App "Notas" — segundo app instalável da Loja.
 *
 * Recursos:
 * - Lista de notas (Ativas / Concluídas / Arquivadas)
 * - Editor: título + data/hora opcional + conteúdo livre + checks inline
 * - Botão "Cravar no Desktop": vira post-it físico flutuante (drag+resize)
 * - Concluir: marca todos os checks, fecha (status='concluida'), sai do Desktop
 * - Arquivar: status='arquivada', sai do Desktop
 * - Reativar: volta pra ativa a partir de Concluídas/Arquivadas
 *
 * Auto-save: debounce 1.5s. Soft delete via deleted_at.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';
import './notas.css';

type Check = { id: string; texto: string; marcado: boolean };
type Status = 'ativa' | 'concluida' | 'arquivada';

type Nota = {
  id: string;
  titulo: string;
  conteudo: string;
  checks: Check[];
  data_lembrete: string | null;
  posicao: { x: number; y: number; w: number; h: number } | null;
  status: Status;
  cravada: boolean;
  cor: string;
  updated_at: string;
  created_at: string;
};

const DEBOUNCE_MS = 1500;
const POSTIT_DEFAULT = { x: 60, y: 80, w: 240, h: 220 };

const novoId = () => Math.random().toString(36).slice(2, 10);

const formatarData = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const formatarDataInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local quer YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const lembreteAtrasado = (iso: string | null) => {
  if (!iso) return false;
  try {
    return new Date(iso).getTime() < Date.now();
  } catch {
    return false;
  }
};

export function AppNotas() {
  const t = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [filtro, setFiltro] = useState<Status>('ativa');
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [status, setStatus] = useState<'pristine' | 'salvando' | 'salvo' | 'erro'>('pristine');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Boot
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: ses } = await supabase.auth.getSession();
      const uid = ses?.session?.user?.id ?? null;
      if (!vivo) return;
      setUserId(uid);
      if (!uid) {
        setNotas([]);
        return;
      }
      const { data, error } = await supabase
        .from('notas_app')
        .select('id, titulo, conteudo, checks, data_lembrete, posicao, status, cravada, cor, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (!vivo) return;
      if (error) {
        console.error('[Notas] listar:', error);
        t.error('Erro ao carregar notas.');
        setNotas([]);
        return;
      }
      setNotas((data ?? []) as Nota[]);
      const ativas = (data ?? []).filter((n: any) => n.status === 'ativa');
      if (ativas.length > 0) setAtivaId(ativas[0].id);
    })();
    return () => {
      vivo = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lista = useMemo(
    () => (notas || []).filter((n) => n.status === filtro),
    [notas, filtro],
  );

  const ativa = useMemo(() => (notas || []).find((n) => n.id === ativaId) || null, [notas, ativaId]);

  const atualizarLocal = (id: string, patch: Partial<Nota>) => {
    setNotas((prev) =>
      (prev || []).map((n) => (n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n)),
    );
  };

  const salvarAgora = useCallback(
    async (id: string, payload: Partial<Nota>) => {
      setStatus('salvando');
      const { error } = await supabase.from('notas_app').update(payload as any).eq('id', id);
      if (error) {
        console.error('[Notas] salvar:', error);
        setStatus('erro');
        return;
      }
      setStatus('salvo');
      // re-ordena lista (mais recente em cima)
      setNotas((prev) =>
        (prev || []).slice().sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
      );
      try {
        window.dispatchEvent(new CustomEvent('ragentic-notas-mudaram'));
      } catch {
        /* noop */
      }
    },
    [],
  );

  // Payload pendente acumulado (título, conteúdo, checks...) da MESMA nota. Antes
  // um único debounce servia todos os campos: editar o título e logo o conteúdo
  // fazia o segundo agendamento CANCELAR o primeiro, e o título nunca era salvo.
  // Pior: flushDebounce() só limpava o timer SEM salvar — ao marcar um check /
  // concluir, a edição de texto ainda no debounce era descartada. Agora o pendente
  // é mesclado e o flush realmente PERSISTE antes de qualquer save imediato, troca
  // de nota ou desmontagem.
  const pendenteRef = useRef<{ id: string; payload: Partial<Nota> } | null>(null);

  const flushDebounce = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const p = pendenteRef.current;
    pendenteRef.current = null;
    if (p) void salvarAgora(p.id, p.payload);
  }, [salvarAgora]);

  const agendar = (id: string, payload: Partial<Nota>) => {
    // Havia edição pendente de OUTRA nota → salva já, não deixa se perder.
    if (pendenteRef.current && pendenteRef.current.id !== id) {
      const anterior = pendenteRef.current;
      pendenteRef.current = null;
      void salvarAgora(anterior.id, anterior.payload);
    }
    pendenteRef.current = {
      id,
      payload: { ...(pendenteRef.current?.payload ?? {}), ...payload },
    };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus('salvando');
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const p = pendenteRef.current;
      pendenteRef.current = null;
      if (p) void salvarAgora(p.id, p.payload);
    }, DEBOUNCE_MS);
  };

  // Flush ao desmontar — edição parada no debounce não se perde.
  useEffect(() => flushDebounce, [flushDebounce]);

  const criar = async () => {
    if (!userId) return;
    flushDebounce();
    const { data, error } = await supabase
      .from('notas_app')
      .insert({
        user_id: userId,
        titulo: 'Sem título',
        conteudo: '',
        checks: [],
        status: 'ativa',
      })
      .select('*')
      .maybeSingle();
    if (error || !data) {
      console.error('[Notas] criar:', error);
      t.error('Falha ao criar nota.');
      return;
    }
    setNotas((prev) => [data as Nota, ...(prev || [])]);
    setFiltro('ativa');
    setAtivaId((data as Nota).id);
  };

  const setarTitulo = (novo: string) => {
    if (!ativa) return;
    atualizarLocal(ativa.id, { titulo: novo });
    agendar(ativa.id, { titulo: novo || 'Sem título' });
  };

  const setarConteudo = (novo: string) => {
    if (!ativa) return;
    atualizarLocal(ativa.id, { conteudo: novo });
    agendar(ativa.id, { conteudo: novo });
  };

  const setarLembrete = (valor: string) => {
    if (!ativa) return;
    const iso = valor ? new Date(valor).toISOString() : null;
    atualizarLocal(ativa.id, { data_lembrete: iso });
    flushDebounce();
    void salvarAgora(ativa.id, { data_lembrete: iso });
  };

  const adicionarCheck = () => {
    if (!ativa) return;
    const novo: Check = { id: novoId(), texto: '', marcado: false };
    const lista = [...(ativa.checks || []), novo];
    atualizarLocal(ativa.id, { checks: lista });
    agendar(ativa.id, { checks: lista });
  };

  const editarCheckTexto = (idCheck: string, texto: string) => {
    if (!ativa) return;
    const lista = (ativa.checks || []).map((c) => (c.id === idCheck ? { ...c, texto } : c));
    atualizarLocal(ativa.id, { checks: lista });
    agendar(ativa.id, { checks: lista });
  };

  const alternarCheck = (idCheck: string) => {
    if (!ativa) return;
    const lista = (ativa.checks || []).map((c) => (c.id === idCheck ? { ...c, marcado: !c.marcado } : c));
    atualizarLocal(ativa.id, { checks: lista });
    flushDebounce();
    void salvarAgora(ativa.id, { checks: lista });
  };

  const removerCheck = (idCheck: string) => {
    if (!ativa) return;
    const lista = (ativa.checks || []).filter((c) => c.id !== idCheck);
    atualizarLocal(ativa.id, { checks: lista });
    flushDebounce();
    void salvarAgora(ativa.id, { checks: lista });
  };

  const cravarNoDesktop = () => {
    if (!ativa) return;
    const proxima = !ativa.cravada;
    const posicao = proxima ? (ativa.posicao || POSTIT_DEFAULT) : ativa.posicao;
    atualizarLocal(ativa.id, { cravada: proxima, posicao });
    flushDebounce();
    void salvarAgora(ativa.id, { cravada: proxima, posicao });
    t.success(proxima ? 'Cravada no Desktop · ache no wallpaper' : 'Removida do Desktop');
  };

  const concluir = () => {
    if (!ativa) return;
    if (!window.confirm('Concluir essa nota? Todos os checks viram ✓ e ela sai do Desktop.')) return;
    const checksConcluidos = (ativa.checks || []).map((c) => ({ ...c, marcado: true }));
    flushDebounce();
    void salvarAgora(ativa.id, { status: 'concluida', cravada: false, checks: checksConcluidos });
    atualizarLocal(ativa.id, { status: 'concluida', cravada: false, checks: checksConcluidos });
    t.success('Nota concluída');
  };

  const arquivar = () => {
    if (!ativa) return;
    if (!window.confirm('Arquivar essa nota? Sai do Desktop e da lista ativa.')) return;
    flushDebounce();
    void salvarAgora(ativa.id, { status: 'arquivada', cravada: false });
    atualizarLocal(ativa.id, { status: 'arquivada', cravada: false });
    t.success('Nota arquivada');
  };

  const reativar = () => {
    if (!ativa) return;
    flushDebounce();
    void salvarAgora(ativa.id, { status: 'ativa' });
    atualizarLocal(ativa.id, { status: 'ativa' });
    setFiltro('ativa');
    t.success('Nota reativada');
  };

  const excluir = async () => {
    if (!ativa) return;
    if (!window.confirm(`Excluir definitivamente "${ativa.titulo}"?\nNão dá pra desfazer.`)) return;
    const { error } = await supabase
      .from('notas_app')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ativa.id);
    if (error) {
      console.error('[Notas] excluir:', error);
      t.error('Falha ao excluir.');
      return;
    }
    setNotas((prev) => (prev || []).filter((n) => n.id !== ativa.id));
    setAtivaId(null);
    t.success('Nota excluída');
    try {
      window.dispatchEvent(new CustomEvent('ragentic-notas-mudaram'));
    } catch {
      /* noop */
    }
  };

  if (notas === null) {
    return (
      <div className="notas-root">
        <div className="muted" style={{ padding: 40 }}>Carregando notas…</div>
      </div>
    );
  }

  const contagens = (notas || []).reduce(
    (acc, n) => {
      acc[n.status] = (acc[n.status] || 0) + 1;
      return acc;
    },
    {} as Record<Status, number>,
  );

  const statusTexto = {
    pristine: 'Sem alterações',
    salvando: 'Salvando…',
    salvo: 'Salvo',
    erro: 'Erro ao salvar',
  }[status];

  const podeEditar = ativa?.status === 'ativa';

  return (
    <div className="notas-root">
      <aside className="notas-sidebar">
        <div className="notas-sidebar-topo">
          <span className="notas-sidebar-titulo">Notas</span>
          <button className="btn btn-primary btn-sm" onClick={criar} title="Nova nota">
            <Icon name="plus" size={12} /> Nova
          </button>
        </div>
        <div className="notas-subtabs">
          {(['ativa', 'concluida', 'arquivada'] as Status[]).map((s) => (
            <span
              key={s}
              className={`notas-subtab ${filtro === s ? 'ativo' : ''}`}
              onClick={() => {
                flushDebounce();
                setFiltro(s);
                const primeira = (notas || []).find((n) => n.status === s);
                if (primeira) setAtivaId(primeira.id);
                else setAtivaId(null);
              }}
            >
              {s === 'ativa' ? 'Ativas' : s === 'concluida' ? 'Concluídas' : 'Arquivadas'} ({contagens[s] || 0})
            </span>
          ))}
        </div>
        <div className="notas-lista">
          {lista.length === 0 && (
            <div className="notas-vazio">
              <Icon name="note" size={28} stroke="rgba(255,255,255,0.35)" />
              <div>Nenhuma nota aqui.</div>
              {filtro === 'ativa' && <div style={{ opacity: 0.7 }}>Clique em "Nova" pra começar.</div>}
            </div>
          )}
          {lista.map((n) => {
            const atrasado = lembreteAtrasado(n.data_lembrete);
            return (
              <div
                key={n.id}
                className={`notas-item ${n.id === ativaId ? 'ativo' : ''}`}
                onClick={() => {
                  flushDebounce();
                  setAtivaId(n.id);
                }}
              >
                <div className="notas-item-linha1">
                  <span className="notas-item-titulo">{n.titulo || 'Sem título'}</span>
                  {n.cravada && (
                    <span className="notas-item-cravada" title="Cravada no Desktop">📌</span>
                  )}
                </div>
                <div className="notas-item-meta">
                  <span>{formatarData(n.updated_at)}</span>
                  {n.data_lembrete && (
                    <span className={`notas-item-lembrete ${atrasado ? 'atrasado' : ''}`}>
                      ⏰ {formatarData(n.data_lembrete)}
                    </span>
                  )}
                  {(n.checks?.length || 0) > 0 && (
                    <span style={{ opacity: 0.7 }}>
                      ✓ {n.checks.filter((c) => c.marcado).length}/{n.checks.length}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <main className="notas-editor">
        {!ativa && (
          <div className="notas-editor-vazio">
            <Icon name="note" size={48} stroke="rgba(255,255,255,0.3)" />
            <div className="h3">Nenhuma nota selecionada</div>
            <button className="btn btn-primary" onClick={criar}>
              <Icon name="plus" size={13} /> Criar primeira nota
            </button>
          </div>
        )}

        {ativa && (
          <>
            <div className="notas-editor-topo">
              <input
                className="notas-titulo-input"
                value={ativa.titulo}
                onChange={(e) => setarTitulo(e.target.value)}
                placeholder="Título…"
                disabled={!podeEditar}
              />
              <button className="btn btn-ghost btn-icon btn-sm" onClick={excluir} title="Excluir definitivamente">
                <Icon name="x" size={14} />
              </button>
            </div>

            <div className="notas-acoes">
              <label className="muted small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="clock" size={12} /> Lembrete:
                <input
                  type="datetime-local"
                  value={formatarDataInput(ativa.data_lembrete)}
                  onChange={(e) => setarLembrete(e.target.value)}
                  disabled={!podeEditar}
                />
                {ativa.data_lembrete && podeEditar && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setarLembrete('')}
                    title="Limpar lembrete"
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </label>

              <span className="spacer" />

              {podeEditar && (
                <button
                  className={`btn btn-sm ${ativa.cravada ? 'notas-btn-cravado' : ''}`}
                  onClick={cravarNoDesktop}
                  title="Cravar essa nota no Desktop como post-it"
                >
                  📌 {ativa.cravada ? 'Cravada' : 'Cravar no Desktop'}
                </button>
              )}

              {podeEditar && (
                <>
                  <button className="btn btn-sm" onClick={concluir}>
                    <Icon name="check" size={12} /> Concluir
                  </button>
                  <button className="btn btn-sm" onClick={arquivar}>
                    <Icon name="archive" size={12} /> Arquivar
                  </button>
                </>
              )}

              {!podeEditar && (
                <button className="btn btn-primary btn-sm" onClick={reativar}>
                  <Icon name="arrowRight" size={12} /> Reativar
                </button>
              )}
            </div>

            <div className="notas-conteudo-area">
              <textarea
                className="notas-conteudo"
                value={ativa.conteudo}
                onChange={(e) => setarConteudo(e.target.value)}
                placeholder="Escreva sua nota…"
                disabled={!podeEditar}
                rows={6}
              />

              <div className="notas-checks">
                <div className="notas-checks-titulo">Checks</div>
                {(ativa.checks || []).length === 0 && (
                  <div className="muted small" style={{ padding: '4px 0' }}>
                    Sem checks. Adicione tarefas pequenas pra marcar como feito.
                  </div>
                )}
                {(ativa.checks || []).map((c) => (
                  <div key={c.id} className="notas-check-item">
                    <button
                      type="button"
                      className={`notas-check-box ${c.marcado ? 'marcado' : ''}`}
                      onClick={() => alternarCheck(c.id)}
                      title={c.marcado ? 'Desmarcar' : 'Marcar como feito'}
                    />
                    <input
                      className={`notas-check-input ${c.marcado ? 'marcado' : ''}`}
                      value={c.texto}
                      onChange={(e) => editarCheckTexto(c.id, e.target.value)}
                      placeholder="Item da lista…"
                      disabled={!podeEditar}
                    />
                    {podeEditar && (
                      <button
                        type="button"
                        className="notas-check-remove"
                        onClick={() => removerCheck(c.id)}
                        title="Remover item"
                      >
                        <Icon name="x" size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {podeEditar && (
                  <button type="button" className="notas-check-add" onClick={adicionarCheck}>
                    <Icon name="plus" size={11} /> Adicionar item
                  </button>
                )}
              </div>
            </div>

            <div className="notas-rodape">
              <span>Editando · {formatarData(ativa.updated_at)}</span>
              <span>{statusTexto}</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// @ts-nocheck
/* eslint-disable */
/**
 * App Mentor · aba Histórico (2026-08-01).
 *
 * Tudo que foi conversado no commandbar (canal mentor), agrupado por dia,
 * cima→baixo — o "diário" da conversa contínua com o Mentor. Pagina pra trás
 * pelo criado_em (lotes de 100).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/bundle/bundle-shared';

const LOTE = 100;

const diaBonito = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};
const horaBonita = (iso) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const chaveDia = (iso) => new Date(iso).toLocaleDateString('pt-BR');

export function AbaHistoricoMentor() {
  const [mensagens, setMensagens] = useState([]); // ordem cronológica
  const [carregando, setCarregando] = useState(true);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState(null);
  const refConversaIds = useRef([]);
  const refMaisAntiga = useRef(null);
  const refFim = useRef(null);

  const buscarLote = useCallback(async (antesDe) => {
    const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
    if (refConversaIds.current.length === 0) {
      const { data: u } = await sb.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error('Sem sessão');
      const { data: convs, error } = await sb
        .from('mentor_conversas')
        .select('id')
        .eq('owner_id', uid)
        .eq('canal', 'mentor');
      if (error) throw error;
      refConversaIds.current = (convs ?? []).map((c) => c.id);
    }
    if (refConversaIds.current.length === 0) return [];
    let q = sb
      .from('mentor_mensagens')
      .select('id, papel, conteudo, criado_em')
      .in('conversa_id', refConversaIds.current)
      // Keyset por chave ESTÁVEL (criado_em, id). Antes paginava só por
      // `.lt('criado_em', ...)`: se duas mensagens tinham o MESMO criado_em, o
      // cursor as pulava (perdia mensagens no meio). O id como desempate resolve.
      .order('criado_em', { ascending: false })
      .order('id', { ascending: false })
      .limit(LOTE);
    if (antesDe) {
      q = q.or(
        `criado_em.lt.${antesDe.criado_em},and(criado_em.eq.${antesDe.criado_em},id.lt.${antesDe.id})`,
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const lote = await buscarLote(null);
        if (!ativo) return;
        const cronologica = lote.slice().reverse();
        refMaisAntiga.current = cronologica[0]
          ? { criado_em: cronologica[0].criado_em, id: cronologica[0].id }
          : null;
        setMensagens(cronologica);
        setTemMais(lote.length === LOTE);
        requestAnimationFrame(() => refFim.current?.scrollIntoView({ block: 'end' }));
      } catch (e) {
        if (ativo) setErro(e?.message ?? String(e));
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [buscarLote]);

  const verAnteriores = async () => {
    try {
      const lote = await buscarLote(refMaisAntiga.current);
      if (lote.length === 0) { setTemMais(false); return; }
      const cronologica = lote.slice().reverse();
      refMaisAntiga.current = cronologica[0]
        ? { criado_em: cronologica[0].criado_em, id: cronologica[0].id }
        : null;
      setMensagens((m) => [...cronologica, ...m]);
      setTemMais(lote.length === LOTE);
    } catch (e) {
      setErro(e?.message ?? String(e));
    }
  };

  if (carregando) return <div className="muted" style={{ padding: 22 }}>Carregando histórico…</div>;
  if (erro) return <div className="muted" style={{ padding: 22 }}>Falha ao carregar: {erro}</div>;
  if (mensagens.length === 0) {
    return (
      <div className="muted" style={{ padding: 22 }}>
        Nada conversado ainda. Fala com o Mentor pela barra do desktop — tudo fica registrado aqui, dia a dia.
      </div>
    );
  }

  let diaAnterior = null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '62vh', overflowY: 'auto', padding: '4px 2px' }} className="scroll">
      {temMais && (
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'center', fontSize: 11 }} onClick={verAnteriores}>
          ↑ Ver dias anteriores
        </button>
      )}
      {mensagens.map((m) => {
        const dia = chaveDia(m.criado_em);
        const mostraDia = dia !== diaAnterior;
        diaAnterior = dia;
        const ehUser = m.papel === 'user';
        return (
          <div key={m.id}>
            {mostraDia && (
              <div className="muted tiny" style={{ textAlign: 'center', margin: '14px 0 6px', textTransform: 'capitalize' }}>
                <Icon name="calendar" size={11} /> {diaBonito(m.criado_em)}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: ehUser ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '78%', padding: '8px 12px', borderRadius: 12, fontSize: 12.5, lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: ehUser ? 'rgba(98,148,255,.12)' : 'rgba(255,255,255,.04)',
                  border: '1px solid ' + (ehUser ? 'rgba(98,148,255,.25)' : 'rgba(255,255,255,.07)'),
                }}
              >
                <div className="muted tiny" style={{ marginBottom: 3 }}>
                  {ehUser ? 'Você' : 'Mentor'} · {horaBonita(m.criado_em)}
                </div>
                {String(m.conteudo ?? '')}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={refFim} />
    </div>
  );
}

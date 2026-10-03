// @ts-nocheck
/* eslint-disable */
/**
 * App Mentor · aba Memória (2026-08-01).
 *
 * Tudo que o Mentor aprendeu sobre o dono/empresa (`memoria_dono` — extrator
 * roda após cada turno do commandbar). O dono vê e pode mandar esquecer um
 * fato (ativa=false — some do recall na hora; RLS garante que só mexe no seu).
 */
import { useState, useEffect, useCallback } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';

const ROTULO_CATEGORIA = {
  negocio: 'Negócio',
  meta: 'Meta',
  preferencia: 'Preferência',
  equipe: 'Equipe',
  contexto: 'Contexto',
  geral: 'Geral',
};

export function AbaMemoriaMentor() {
  const [fatos, setFatos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const t = useToast();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data: u } = await sb.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error('Sem sessão');
      const { data, error } = await sb
        .from('memoria_dono')
        .select('id, fato, categoria, ativa, atualizado_em')
        .eq('owner_id', uid)
        .eq('ativa', true)
        .order('atualizado_em', { ascending: false })
        .limit(200);
      if (error) throw error;
      setFatos(data ?? []);
    } catch (e) {
      t.error('Falha ao carregar memória: ' + (e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const esquecer = async (id) => {
    const anterior = fatos;
    setFatos((f) => f.filter((x) => x.id !== id));
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { error } = await sb.from('memoria_dono').update({ ativa: false }).eq('id', id);
      if (error) throw error;
      t.success('Esquecido.');
    } catch (e) {
      setFatos(anterior);
      t.error('Falha ao esquecer: ' + (e?.message ?? e));
    }
  };

  if (carregando) return <div className="muted" style={{ padding: 22 }}>Carregando memória…</div>;
  if (fatos.length === 0) {
    return (
      <div className="muted" style={{ padding: 22 }}>
        O Mentor ainda não aprendeu nada sobre você. Conversa com ele pela barra — fatos duráveis
        sobre o seu negócio, metas e preferências vão aparecendo aqui.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8, maxHeight: '62vh', overflowY: 'auto', padding: '4px 2px' }} className="scroll">
      {fatos.map((f) => (
        <div
          key={f.id}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
            background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10,
          }}
        >
          <div style={{ flex: 1 }}>
            <div className="muted tiny" style={{ marginBottom: 3 }}>
              <Icon name="brain" size={11} /> {ROTULO_CATEGORIA[f.categoria] ?? f.categoria} ·{' '}
              {new Date(f.atualizado_em).toLocaleDateString('pt-BR')}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{f.fato}</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            title="Esquecer este fato"
            onClick={() => esquecer(f.id)}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

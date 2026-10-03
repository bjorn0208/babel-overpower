// @ts-nocheck
/**
 * Seletor de convidados do evento da Agenda.
 * Carrega contatos (leads do tenant, por `nome_exibicao`) e a equipe
 * (`profiles` com `parent_user_id` = dono). Multi-select com busca.
 *
 * Props:
 *   convidados — array [{ tipo: 'contato'|'equipe', id, nome }]
 *   onChange   — (novoArray) => void
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function SeletorConvidados({ convidados, onChange }) {
  const [contatos, setContatos] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) return;

      const [{ data: leads }, { data: membros }] = await Promise.all([
        supabase
          .from('leads')
          .select('id, nome_exibicao, name, phone')
          .is('deleted_at', null)
          .order('nome_exibicao', { ascending: true })
          .limit(500),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('parent_user_id', uid)
          .is('deleted_at', null),
      ]);

      setContatos(
        (leads ?? []).map((l) => ({
          tipo: 'contato',
          id: l.id,
          nome: l.nome_exibicao || l.name || l.phone || 'Contato',
        })),
      );
      setEquipe(
        (membros ?? []).map((m) => ({
          tipo: 'equipe',
          id: m.id,
          nome: m.full_name || m.email || 'Membro',
        })),
      );
    })();
  }, []);

  const selecionados = Array.isArray(convidados) ? convidados : [];
  const jaTem = (c) => selecionados.some((s) => s.tipo === c.tipo && s.id === c.id);

  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const todos = [...contatos, ...equipe].filter((c) => !jaTem(c));
    if (!termo) return todos.slice(0, 30);
    return todos.filter((c) => c.nome.toLowerCase().includes(termo)).slice(0, 30);
  }, [busca, contatos, equipe, selecionados]);

  function adicionar(c) {
    onChange([...selecionados, { tipo: c.tipo, id: c.id, nome: c.nome }]);
    setBusca('');
  }

  function remover(c) {
    onChange(selecionados.filter((s) => !(s.tipo === c.tipo && s.id === c.id)));
  }

  const corTipo = (tipo) => (tipo === 'equipe' ? 'oklch(0.70 0.16 280)' : 'oklch(0.72 0.15 195)');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {selecionados.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selecionados.map((c) => (
            <span
              key={`${c.tipo}-${c.id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                padding: '4px 8px', borderRadius: 999,
                background: `${corTipo(c.tipo)}22`, color: corTipo(c.tipo),
                border: `1px solid ${corTipo(c.tipo)}44`,
              }}
            >
              {c.tipo === 'equipe' ? '👤' : '📇'} {c.nome}
              <button
                type="button"
                onClick={() => remover(c)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, padding: 0, lineHeight: 1 }}
                title="Remover convidado"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <input
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          placeholder="Buscar contato ou pessoa da equipe…"
          style={{
            background: 'oklch(0.18 0.03 264)', border: '1px solid oklch(0.32 0.05 264 / 0.5)',
            borderRadius: 8, padding: '8px 10px', color: 'oklch(0.88 0.02 264)', fontSize: 13,
            width: '100%', boxSizing: 'border-box',
          }}
        />
        {aberto && candidatos.length > 0 && (
          <div
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
              maxHeight: 220, overflowY: 'auto', background: 'oklch(0.16 0.03 264)',
              border: '1px solid oklch(0.32 0.05 264 / 0.6)', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {candidatos.map((c) => (
              <button
                key={`${c.tipo}-${c.id}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); adicionar(c); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'oklch(0.85 0.02 264)', fontSize: 13,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: corTipo(c.tipo), minWidth: 58 }}>
                  {c.tipo === 'equipe' ? 'Equipe' : 'Contato'}
                </span>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

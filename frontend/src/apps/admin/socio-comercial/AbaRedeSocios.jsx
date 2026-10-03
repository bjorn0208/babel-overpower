// @ts-nocheck
/* eslint-disable */
/**
 * AbaRedeSocios — lista de sócios ativos com indicados diretos e totais.
 * Queries sem N+1: profiles uma vez + comissões em batch + contagem client-side.
 */
import { useState, useEffect } from 'react';
import { Icon } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

const fmtBRL = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

const iniciais = (nome, email) =>
  (nome || email || '?').replace(/\s+/, ' ').trim().split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

export function AbaRedeSocios() {
  const [socios, setSocios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);

      // Query A — sócios ativos
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, saldo_multinivel, referral_code, referred_by, created_at')
        .eq('multinivel_ativo', true)
        .order('created_at', { ascending: false });

      if (!vivo) return;
      if (!profiles || profiles.length === 0) { setSocios([]); setCarregando(false); return; }

      const ids = profiles.map((p) => p.id);

      // Query B — indicados diretos (quem tem referred_by = id de algum sócio)
      const { data: indicadosRows } = await supabase
        .from('profiles')
        .select('referred_by')
        .in('referred_by', ids);

      // Query C — comissões acumuladas
      const { data: comissoesRows } = await supabase
        .from('multinivel_comissoes')
        .select('beneficiario_id, valor_comissao')
        .in('beneficiario_id', ids);

      if (!vivo) return;

      // Agregar client-side (sem N+1)
      const contIndicados = {};
      for (const row of (indicadosRows || [])) {
        if (row.referred_by) contIndicados[row.referred_by] = (contIndicados[row.referred_by] || 0) + 1;
      }
      const somaComissoes = {};
      for (const row of (comissoesRows || [])) {
        if (row.beneficiario_id) somaComissoes[row.beneficiario_id] = (somaComissoes[row.beneficiario_id] || 0) + Number(row.valor_comissao || 0);
      }

      const enriquecidos = profiles.map((s) => ({
        ...s,
        indicados_diretos: contIndicados[s.id] || 0,
        total_ganho: somaComissoes[s.id] || 0,
      }));

      setSocios(enriquecidos);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const filtrados = socios.filter((s) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (s.full_name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q);
  });

  if (carregando) {
    return (
      <div className="col" style={{ alignItems: 'center', padding: '40px 0' }}>
        <div className="muted small">Carregando rede…</div>
      </div>
    );
  }

  return (
    <div className="col gap-3">
      {/* Busca */}
      <div style={{ position: 'relative', maxWidth: 360 }}>
        <Icon name="search" size={13} stroke="var(--txt-4)" style={{ position: 'absolute', left: 10, top: 11 }} />
        <input
          className="input"
          placeholder="Buscar por nome ou e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ paddingLeft: 32 }}
        />
      </div>

      {/* Estado vazio */}
      {filtrados.length === 0 ? (
        <div className="os-card col" style={{ alignItems: 'center', padding: '40px 0' }}>
          <Icon name="users" size={32} stroke="var(--txt-4)" />
          <div className="muted" style={{ marginTop: 8 }}>Nenhum sócio ativo</div>
        </div>
      ) : (
        <div className="os-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Sócio</th>
                <th>Código</th>
                <th style={{ textAlign: 'center' }}>Indicados</th>
                <th style={{ textAlign: 'right' }}>Total ganho</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((s) => {
                const ini = iniciais(s.full_name, s.email);
                return (
                  <tr key={s.id}>
                    <td>
                      {s.avatar_url ? (
                        <img
                          src={s.avatar_url}
                          alt=""
                          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <div className="avatar" style={{ width: 32, height: 32, background: '#7c5ce0' }}>{ini}</div>
                      )}
                    </td>
                    <td>
                      <div className="h3" style={{ fontSize: 13 }}>{s.full_name || '—'}</div>
                      <div className="muted tiny mono">{s.email}</div>
                    </td>
                    <td>
                      <span className="mono small">{s.referral_code || '—'}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-info">{s.indicados_diretos}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="mono small">{fmtBRL(s.total_ganho)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span
                        className="mono small"
                        style={{ color: (s.saldo_multinivel || 0) > 0 ? 'oklch(0.72 0.18 142)' : 'var(--txt-4)' }}
                      >
                        {fmtBRL(Number(s.saldo_multinivel) || 0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

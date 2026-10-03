// @ts-nocheck
/**
 * App Jurídico (admin) — gestão do catálogo de serviços jurídicos + interessados.
 * Aba Serviços: CRUD de `juridico_servicos` (soft delete via deleted_at).
 * Aba Interessados: leads de `juridico_interesses` com pipeline de status.
 */
import { useState } from 'react';
import { Icon } from '@/bundle/bundle-shared';
import { AbaServicos } from './aba-servicos';
import { AbaInteressados } from './aba-interessados';

export function JuridicoAdmin() {
  const [tab, setTab] = useState('servicos');

  return (
    <div className="col" style={{ height: '100%' }}>
      <div className="row" style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
        <div>
          <div className="h2">Jurídico</div>
          <div className="muted small">Catálogo de serviços e interessados.</div>
        </div>
        <div className="flex-1" />
        <div className="tabs">
          {[['servicos', 'Serviços', 'briefcase'], ['interessados', 'Interessados', 'users']].map(([k, l, ic]) => (
            <span key={k} className={`tab ${tab === k ? 'tab-on' : ''}`} onClick={() => setTab(k)}>
              <Icon name={ic} size={12} /> {l}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 scroll" style={{ overflowY: 'auto', padding: 22 }}>
        {tab === 'servicos' && <AbaServicos />}
        {tab === 'interessados' && <AbaInteressados />}
      </div>
    </div>
  );
}

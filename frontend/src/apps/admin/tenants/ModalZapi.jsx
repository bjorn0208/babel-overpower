import { useState, useEffect } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';

// Modal de configuração Z-API do tenant — compartilhado entre os apps Tenants e Controle.
// Extraído de Tenants.jsx em 2026-07-14 pra reuso + atalhos externos (OpenRouter / Z-API).

const ATALHOS = [
  { rotulo: 'OpenRouter', url: 'https://openrouter.ai/settings/credits', titulo: 'Abrir painel OpenRouter (créditos)' },
  { rotulo: 'Z-API', url: 'https://app.z-api.io', titulo: 'Abrir painel Z-API (instâncias)' },
];

export function ModalZapi({ tenant, onClose }) {
  const t = useToast();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showSec, setShowSec] = useState(false);
  const [form, setForm] = useState({
    is_active: true,
    zapi_instance_id: '',
    zapi_token: '',
    zapi_security_token: '',
    zapi_api_url: 'https://api.z-api.io',
    whatsapp_phone: '',
    url_foto_perfil: '',
    chip_maturity_tier: 'novo',
    chip_connected_since: '',
    chip_observacao: '',
    max_messages_per_hour_override: 0,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await window.RAGENTIC_HOOKS?.carregarCanalZapiAdmin?.(tenant.id);
      if (!vivo) return;
      if (r) {
        setForm({
          is_active: r.is_active !== false,
          zapi_instance_id: r.zapi_instance_id || '',
          zapi_token: r.zapi_token || '',
          zapi_security_token: r.zapi_security_token || '',
          zapi_api_url: r.zapi_api_url || 'https://api.z-api.io',
          whatsapp_phone: r.whatsapp_phone || '',
          url_foto_perfil: r.url_foto_perfil || '',
          chip_maturity_tier: r.chip_maturity_tier || 'novo',
          chip_connected_since: (r.chip_connected_since || '').slice(0, 10),
          chip_observacao: r.chip_observacao || '',
          max_messages_per_hour_override: r.max_messages_per_hour_override || 0,
        });
      }
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [tenant.id]);

  const salvar = async () => {
    setSalvando(true);
    const patch = {
      ...form,
      chip_connected_since: form.chip_connected_since || null,
      max_messages_per_hour_override: form.max_messages_per_hour_override
        ? Number(form.max_messages_per_hour_override) : null,
    };
    const r = await window.RAGENTIC_HOOKS?.salvarCanalZapi?.(tenant.id, patch);
    setSalvando(false);
    if (r?.erro) { alert('Falha: ' + r.erro); return; }
    t.success('Z-API atualizada');
    onClose();
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal" style={{ width: 640, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="row" style={{ justifyContent:'space-between', marginBottom: 8 }}>
          <div>
            <div className="muted small">Tenant · {tenant.nome}</div>
            <div className="h2 row gap-2"><Icon name="whatsapp" size={20} /> Configuração Z-API</div>
          </div>
          <div className="row gap-2">
            {ATALHOS.map(a => (
              <a key={a.rotulo} className="btn btn-sm" href={a.url} target="_blank" rel="noreferrer" title={a.titulo}>
                {a.rotulo} ↗
              </a>
            ))}
            <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" size={14} /></button>
          </div>
        </div>

        {carregando ? (
          <div className="muted" style={{ padding: 24, textAlign:'center' }}>Carregando…</div>
        ) : (
          <>
            <div className="os-vidro row gap-3" style={{ padding: 12, marginBottom: 16, background:'rgba(255,255,255,0.03)' }}>
              <span className={`dot dot-${form.is_active ? 'on' : 'off'}`}></span>
              <div style={{ flex: 1 }}>
                <div className="h3" style={{ fontSize: 13 }}>{form.is_active ? 'Ativa' : 'Desativada'}</div>
                <div className="muted tiny">{form.whatsapp_phone || 'sem número'} · {form.zapi_api_url}</div>
              </div>
              <label className="row gap-2" style={{ cursor:'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                <span className="small">Canal ativo</span>
              </label>
            </div>

            <div className="col gap-3">
              <div className="row gap-3">
                <div style={{ flex: 1 }}>
                  <label className="label">Instance ID</label>
                  <input className="input mono" value={form.zapi_instance_id} onChange={(e) => set('zapi_instance_id', e.target.value)} placeholder="3D4F2B..." />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">API URL</label>
                  <input className="input mono" value={form.zapi_api_url} onChange={(e) => set('zapi_api_url', e.target.value)} />
                </div>
              </div>

              <div>
                <label className="label">Token</label>
                <div style={{ position:'relative' }}>
                  <input className="input mono" type={showToken ? 'text' : 'password'} value={form.zapi_token}
                    onChange={(e) => set('zapi_token', e.target.value)} style={{ paddingRight: 38 }} />
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowToken(s => !s)} style={{ position:'absolute', right:4, top:4 }}>
                    <Icon name={showToken ? 'eyeOff' : 'eye'} size={13} />
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Security Token (Client-Token / header)</label>
                <div style={{ position:'relative' }}>
                  <input className="input mono" type={showSec ? 'text' : 'password'} value={form.zapi_security_token}
                    onChange={(e) => set('zapi_security_token', e.target.value)} style={{ paddingRight: 38 }} />
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowSec(s => !s)} style={{ position:'absolute', right:4, top:4 }}>
                    <Icon name={showSec ? 'eyeOff' : 'eye'} size={13} />
                  </button>
                </div>
              </div>

              <div className="row gap-3">
                <div style={{ flex: 1 }}>
                  <label className="label">Telefone conectado</label>
                  <input className="input mono" value={form.whatsapp_phone} onChange={(e) => set('whatsapp_phone', e.target.value)} placeholder="+55 11 9XXXX-XXXX" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">URL Foto de Perfil</label>
                  <input className="input mono" value={form.url_foto_perfil} onChange={(e) => set('url_foto_perfil', e.target.value)} placeholder="https://..." />
                </div>
              </div>

              <div className="row gap-3">
                <div style={{ width: 180 }}>
                  <label className="label">Maturidade do chip</label>
                  <select className="input" value={form.chip_maturity_tier} onChange={(e) => set('chip_maturity_tier', e.target.value)}>
                    <option value="novo" style={{ background:'#1a1530' }}>Novo</option>
                    <option value="intermediario" style={{ background:'#1a1530' }}>Intermediário</option>
                    <option value="maduro" style={{ background:'#1a1530' }}>Maduro</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">Conectado desde</label>
                  <input className="input" type="date" value={form.chip_connected_since} onChange={(e) => set('chip_connected_since', e.target.value)} />
                </div>
                <div style={{ width: 200 }}>
                  <label className="label">Limite msg/h (override)</label>
                  <input className="input mono" type="number" min="0" value={form.max_messages_per_hour_override}
                    onChange={(e) => set('max_messages_per_hour_override', e.target.value)} placeholder="0 = padrão" />
                </div>
              </div>

              <div>
                <label className="label">Observação do chip</label>
                <textarea className="input" rows={2} value={form.chip_observacao} onChange={(e) => set('chip_observacao', e.target.value)} />
              </div>
            </div>

            <div className="row gap-2" style={{ marginTop: 20, justifyContent:'flex-end' }}>
              <button className="btn" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" disabled={salvando} onClick={salvar}>
                <Icon name="check" size={13} /> {salvando ? 'Salvando…' : 'Salvar conexão'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

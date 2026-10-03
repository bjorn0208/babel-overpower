// @ts-nocheck
/* eslint-disable */
/**
 * App Configurações. Abas: Conta (real — profiles/avatars/RPCs LGPD) ·
 * Notificações · Aparência. WhatsApp/Empresa saíram (app próprio/plataforma).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';
import { ConfigNotificacoes } from './notificacoes-config';

export function AppConfiguracoes() {
  const [tab, setTab] = useState('conta');
  useAbaAlvo("configuracoes", (v) => setTab(v));
  return (
    <div className="col" style={{ height: '100%' }}>
      <div className="row" style={{ padding: '16px 22px', borderBottom:'1px solid rgba(255,255,255,0.06)', alignItems:'center' }}>
        <div>
          <div className="h2">Configurações</div>
          <div className="muted small">Seus dados, privacidade e aparência do desktop.</div>
        </div>
        <div className="flex-1" />
        <div className="tabs">
          <span className={`tab ${tab==='conta'?'tab-on':''}`} onClick={() => setTab('conta')}><Icon name="users" size={12}/> Conta</span>
          <span className={`tab ${tab==='notificacoes'?'tab-on':''}`} onClick={() => setTab('notificacoes')}><Icon name="bell" size={12}/> Notificações</span>
          <span className={`tab ${tab==='aparencia'?'tab-on':''}`} onClick={() => setTab('aparencia')}><Icon name="palette" size={12}/> Aparência</span>
        </div>
      </div>

      <div className="flex-1 scroll" style={{ overflowY:'auto', padding: 22 }}>
        {tab === 'conta' && <ConfigConta />}
        {tab === 'notificacoes' && <ConfigNotificacoes />}
        {tab === 'aparencia' && <ConfigAparencia />}
      </div>
    </div>
  );
}

function ConfigConta() {
  const t = useToast();
  const fileRef = useRef(null);

  const [userId, setUserId] = useState(null);
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ full_name: '', cargo: '', phone: '', document: '' });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) { setCarregando(false); return; }
      setUserId(uid);
      setEmail(u.user.email || '');
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, cargo, phone, document, avatar_url, email')
        .eq('id', uid)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setForm({
          full_name: data.full_name || '',
          cargo: data.cargo || '',
          phone: data.phone || '',
          document: data.document || '',
        });
        setAvatarUrl(data.avatar_url || null);
        if (data.email) setEmail(data.email);
      }
    } catch (e) {
      console.error('[Configuracoes/Conta] carregar falhou:', e);
      t.error('Não foi possível carregar seus dados.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  function setCampo(chave, valor) {
    setForm((prev) => ({ ...prev, [chave]: valor }));
  }

  async function enviarFoto(e) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith('image/')) { t.error('Selecione uma imagem válida.'); return; }
    setEnviandoFoto(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = urlData.publicUrl;
      const { error: upErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
      if (upErr) throw upErr;
      setAvatarUrl(url);
      t.success('Foto atualizada');
    } catch (err) {
      console.error('[Configuracoes/Conta] upload de foto falhou:', err);
      t.error('Erro ao enviar foto.');
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function removerFoto() {
    if (!userId) return;
    try {
      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
      if (error) throw error;
      setAvatarUrl(null);
      t.success('Foto removida');
    } catch (err) {
      console.error('[Configuracoes/Conta] remover foto falhou:', err);
      t.error('Erro ao remover foto.');
    }
  }

  async function salvar() {
    if (!userId) { t.error('Sessão expirada.'); return; }
    setSalvando(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: form.full_name,
        cargo: form.cargo || null,
        phone: form.phone || null,
        document: form.document || null,
      }).eq('id', userId);
      if (error) throw error;
      t.success('Dados salvos');
    } catch (err) {
      console.error('[Configuracoes/Conta] salvar falhou:', err);
      t.error('Erro ao salvar seus dados.');
    } finally {
      setSalvando(false);
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const { data, error } = await supabase.rpc('exportar_meus_dados');
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meus-dados-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      t.success('Dados exportados');
    } catch (err) {
      console.error('[Configuracoes/Conta] exportar falhou:', err);
      t.error('Erro ao exportar dados.');
    } finally {
      setExportando(false);
    }
  }

  async function solicitarExclusao() {
    const ok = window.confirm(
      'Sua conta será marcada para exclusão. Um administrador processará a solicitação. Esta ação não pode ser desfeita. Confirmar?'
    );
    if (!ok) return;
    try {
      const { error } = await supabase.rpc('solicitar_exclusao_conta');
      if (error) throw error;
      t.success('Solicitação de exclusão enviada');
    } catch (err) {
      console.error('[Configuracoes/Conta] solicitar exclusão falhou:', err);
      t.error('Erro ao solicitar exclusão.');
    }
  }

  if (carregando) {
    return <div className="muted small" style={{ padding: 8 }}>Carregando seus dados…</div>;
  }

  const iniciais = (form.full_name || email || '').replace(/[^a-zA-ZÀ-ÿ]/g, '').slice(0, 2).toUpperCase() || '··';

  return (
    <div className="col gap-3" style={{ maxWidth: 620 }}>
      <div className="os-card" style={{ padding: 22 }}>
        <div className="title-section" style={{ marginBottom: 14 }}>Foto de perfil</div>
        <div className="row gap-3" style={{ alignItems:'center' }}>
          <div style={{ position:'relative' }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="Foto de perfil" style={{ width: 64, height: 64, borderRadius:'50%', objectFit:'cover' }} />
              : <div className="avatar" style={{ background:'linear-gradient(135deg, var(--os-acento-1), var(--os-acento-2))', width: 64, height: 64, fontSize: 20 }}>{iniciais}</div>}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={enviandoFoto}
              title="Trocar foto"
              style={{ position:'absolute', bottom:-2, right:-2, width: 28, height: 28, borderRadius:'50%', border:'2px solid var(--os-fundo, #0b0b0f)', background:'var(--os-acento-1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <Icon name={enviandoFoto ? 'refresh' : 'camera'} size={12} stroke="white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={enviarFoto} style={{ display:'none' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="h3">{form.full_name || email || 'Sem nome'}</div>
            <div className="muted small mono">{email}</div>
            {avatarUrl && (
              <button onClick={removerFoto} className="row gap-1" style={{ marginTop: 6, background:'transparent', border:'none', color:'oklch(0.72 0.18 25)', cursor:'pointer', fontSize: 12, padding: 0 }}>
                <Icon name="x" size={11} stroke="oklch(0.72 0.18 25)" /> Remover foto
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="os-card col gap-3" style={{ padding: 22 }}>
        <div className="title-section">Dados pessoais</div>
        <div className="row gap-3">
          <div className="flex-1"><label className="label">Nome</label>
            <input className="input" value={form.full_name} onChange={(e) => setCampo('full_name', e.target.value)} placeholder="Seu nome completo" />
          </div>
          <div className="flex-1"><label className="label">Cargo</label>
            <input className="input" value={form.cargo} onChange={(e) => setCampo('cargo', e.target.value)} placeholder="Ex: Consultor de vendas" />
          </div>
        </div>
        <div className="row gap-3">
          <div className="flex-1"><label className="label">WhatsApp</label>
            <input className="input mono" value={form.phone} onChange={(e) => setCampo('phone', e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div className="flex-1"><label className="label">CPF</label>
            <input className="input mono" value={form.document} onChange={(e) => setCampo('document', e.target.value)} placeholder="000.000.000-00" />
          </div>
        </div>
        <div><label className="label">Email</label>
          <input className="input mono" value={email} readOnly tabIndex={-1} style={{ opacity: 0.55, cursor:'not-allowed' }} />
        </div>
        <div className="row" style={{ justifyContent:'flex-end', marginTop: 4 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : <><Icon name="check" size={13}/> Salvar</>}
          </button>
        </div>
      </div>

      <div className="os-card col gap-2" style={{ padding: 22 }}>
        <div className="title-section" style={{ marginBottom: 4 }}>Privacidade e dados (LGPD)</div>
        <button className="btn" onClick={exportar} disabled={exportando} style={{ justifyContent:'flex-start' }}>
          <Icon name={exportando ? 'refresh' : 'download'} size={13}/> {exportando ? 'Exportando…' : 'Exportar meus dados'}
        </button>
        <button className="btn" onClick={solicitarExclusao} style={{ justifyContent:'flex-start', color:'oklch(0.72 0.18 25)' }}>
          <Icon name="trash" size={13} stroke="oklch(0.72 0.18 25)"/> Solicitar exclusão da conta
        </button>
      </div>
    </div>
  );
}

function ConfigAparencia() {
  const t = useToast();
  const wallpapers = window.RAGENTIC_WALLPAPERS;
  const [sel, setSel] = useState(() => (window.RAGENTIC_PREFERENCIAS_UI?.papel_parede_id) || 'aurora');
  const aplicar = (id) => {
    setSel(id);
    const w = window.aplicarPapelParede(id);
    try { window.RAGENTIC_HOOKS?.salvarPreferenciasUi?.({ papel_parede_id: id }); } catch (e) { /* ignore */ }
    t.success(`Tema ${w.nome} aplicado`);
  };

  return (
    <div>
      <div className="h2" style={{ marginBottom: 4 }}>Aparência do desktop</div>
      <div className="muted small" style={{ marginBottom: 22 }}>O papel de parede define o fundo e as cores de acento do sistema inteiro — botões, widgets, glow do command bar, tudo.</div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {wallpapers.map(w => (
          <button key={w.id} onClick={() => aplicar(w.id)}
            className={`os-card lift ${sel === w.id ? 'glow-aurora' : ''}`}
            style={{ padding: 0, overflow:'hidden', border: sel === w.id ? '1px solid var(--os-acento-1)' : '1px solid var(--os-vidro-borda)', cursor:'pointer', background:'transparent' }}>
            <div style={{ height: 130, background: w.bg, position:'relative' }}>
              {sel === w.id && (
                <div style={{ position:'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius:'50%', background:`linear-gradient(135deg, ${w.acento1}, ${w.acento2})`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon name="check" size={12} stroke="white" />
                </div>
              )}
                      <div style={{ position:'absolute', bottom: 8, left: 8, display:'flex', gap: 4 }}>
                <span style={{ width: 14, height: 14, borderRadius:'50%', background: w.acento1, boxShadow:'0 0 0 1px rgba(255,255,255,0.2)' }}></span>
                <span style={{ width: 14, height: 14, borderRadius:'50%', background: w.acento2, boxShadow:'0 0 0 1px rgba(255,255,255,0.2)' }}></span>
              </div>
            </div>
            <div className="row" style={{ padding: '10px 14px', justifyContent:'space-between' }}>
              <span className="h3" style={{ fontSize: 13 }}>{w.nome}</span>
              {sel === w.id && <span className="badge badge-aurora" style={{ fontSize: 10 }}>atual</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

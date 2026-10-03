import { useState, useEffect } from 'react';
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { Icon, useToast, MiniChart } from '@/bundle/bundle-shared';
import { ModalZapi } from './ModalZapi';
import { ModalCriarTenant } from './ModalCriarTenant';

// Utilitário local (capitalize não está no bundle-shared)
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

function ModalInstagram({ tenant, onClose }) {
  const t = useToast();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({
    is_active: true,
    ig_account_id: '',
    ig_token: '',
    ig_username: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await window.RAGENTIC_HOOKS?.carregarCanalInstagramAdmin?.(tenant.id);
      if (!vivo) return;
      if (r) {
        setForm({
          is_active: r.is_active !== false,
          ig_account_id: r.ig_account_id || '',
          ig_token: r.ig_token || '',
          ig_username: r.ig_username || '',
        });
      }
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [tenant.id]);

  const salvar = async () => {
    setSalvando(true);
    const r = await window.RAGENTIC_HOOKS?.salvarCanalInstagram?.(tenant.id, form);
    setSalvando(false);
    if (r?.erro) { t.error('Falha ao salvar: ' + r.erro); return false; }
    t.success('Instagram atualizado');
    return true;
  };

  const salvarEFechar = async () => {
    if (await salvar()) onClose();
  };

  const testar = async () => {
    setTestando(true);
    const salvou = await salvar();
    if (!salvou) { setTestando(false); return; }
    const r = await window.RAGENTIC_HOOKS?.instagramTestarConexao?.(tenant.id);
    setTestando(false);
    if (r?.ok) t.success(`Conectado: @${r.username || form.ig_username || 'conta'}`);
    else t.error(r?.erro || 'Token recusado pelo Instagram — confira as credenciais');
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal" style={{ width: 560, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="row" style={{ justifyContent:'space-between', marginBottom: 8 }}>
          <div>
            <div className="muted small">Tenant · {tenant.nome}</div>
            <div className="h2 row gap-2"><Icon name="instagram" size={20} /> Configuração Instagram</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        {carregando ? (
          <div className="muted" style={{ padding: 24, textAlign:'center' }}>Carregando…</div>
        ) : (
          <>
            <div className="os-vidro row gap-3" style={{ padding: 12, marginBottom: 16, background:'rgba(255,255,255,0.03)' }}>
              <span className={`dot dot-${form.is_active ? 'on' : 'off'}`}></span>
              <div style={{ flex: 1 }}>
                <div className="h3" style={{ fontSize: 13 }}>{form.is_active ? 'Ativo' : 'Desativado'}</div>
                <div className="muted tiny">{form.ig_username ? '@' + form.ig_username.replace('@','') : 'sem conta conectada'}</div>
              </div>
              <label className="row gap-2" style={{ cursor:'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                <span className="small">Canal ativo</span>
              </label>
            </div>

            <div className="col gap-3">
              <div className="row gap-3">
                <div style={{ flex: 1 }}>
                  <label className="label">ID da conta (IGID)</label>
                  <input className="input mono" value={form.ig_account_id} onChange={(e) => set('ig_account_id', e.target.value)} placeholder="17841400..." />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">Usuário (@)</label>
                  <input className="input mono" value={form.ig_username} onChange={(e) => set('ig_username', e.target.value)} placeholder="@conta" />
                </div>
              </div>

              <div>
                <label className="label">Token de acesso (longa duração)</label>
                <div style={{ position:'relative' }}>
                  <input className="input mono" type={showToken ? 'text' : 'password'} value={form.ig_token}
                    onChange={(e) => set('ig_token', e.target.value)} style={{ paddingRight: 38 }} placeholder="IGAA..." />
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowToken(s => !s)} style={{ position:'absolute', right:4, top:4 }}>
                    <Icon name={showToken ? 'eyeOff' : 'eye'} size={13} />
                  </button>
                </div>
                <div className="muted tiny" style={{ marginTop: 4 }}>Expira em ~60 dias — gerar de novo no painel da Meta quando o teste falhar.</div>
              </div>
            </div>

            <div className="row gap-2" style={{ marginTop: 20, justifyContent:'flex-end' }}>
              <button className="btn" onClick={onClose}>Cancelar</button>
              <button className="btn" disabled={testando || salvando || !form.ig_token} onClick={testar}>
                <Icon name="zap" size={13} /> {testando ? 'Testando…' : 'Salvar e testar'}
              </button>
              <button className="btn btn-primary" disabled={salvando || testando} onClick={salvarEFechar}>
                <Icon name="check" size={13} /> {salvando ? 'Salvando…' : 'Salvar conexão'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function TenantEquipeTab({ tenantId }) {
  const [list, setList] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await window.RAGENTIC_HOOKS?.carregarMembrosTenant?.(tenantId);
      if (!vivo) return;
      setList(r || []);
    })();
    return () => { vivo = false; };
  }, [tenantId]);

  const impersonar = async (m) => {
    const r = await window.RAGENTIC_HOOKS?.impersonar?.(m.id, 'admin via aba equipe');
    if (r?.erro) { setErro(r.erro); return; }
    if (r?.url) window.location.href = r.url;
  };

  if (list === null) return <div className="muted" style={{ padding: 24, textAlign:'center' }}>Carregando…</div>;
  if (!list.length) return (
    <div className="os-vidro" style={{ padding: 22, textAlign:'center' }}>
      <div className="muted">Este tenant ainda não tem membros de equipe.</div>
    </div>
  );
  return (
    <div className="col gap-2">
      {erro && <div className="badge badge-err">{erro}</div>}
      <div className="muted small">{list.length} membro(s) de equipe deste tenant.</div>
      {list.map((m) => (
        <div key={m.id} className="os-vidro row gap-3" style={{ padding: 12, alignItems:'center' }}>
          {m.avatar_url
            ? <img src={m.avatar_url} alt="" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover' }} />
            : <div className="avatar" style={{ width:36, height:36, background:'#3aa6c9' }}>
                {(m.full_name || m.email || '?').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}
              </div>}
          <div style={{ flex:1, minWidth: 0 }}>
            <div className="row gap-2">
              <div className="h3" style={{ fontSize: 13 }}>{m.full_name || '— sem nome —'}</div>
              {m.is_active === false && <span className="badge badge-err">inativo</span>}
              {m.cargo && <span className="badge badge-info">{m.cargo}</span>}
            </div>
            <div className="muted tiny mono" style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{m.email}</div>
          </div>
          <button className="btn btn-sm" onClick={() => impersonar(m)} title="Impersonar membro" disabled={m.is_active === false}>
            <Icon name="shield" size={12} /> Impersonar
          </button>
        </div>
      ))}
    </div>
  );
}

function CardExcluirTenant({ tenant, onExcluido }) {
  const t = useToast();
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');
  // Confirma digitando o e-mail (ou o nome, se não tiver e-mail) — evita clique acidental.
  const chave = (tenant.email || tenant.nome || '').trim();
  const confere = !!chave && confirmacao.trim().toLowerCase() === chave.toLowerCase();

  const excluir = async () => {
    if (!confere || excluindo) return;
    setExcluindo(true); setErro('');
    const r = await window.RAGENTIC_HOOKS?.excluirTenant?.(tenant.id, 'excluir');
    setExcluindo(false);
    if (r?.erro) { setErro(r.erro); return; }
    if (r?.aviso) t.error(r.aviso);
    t.success(`Tenant excluído · ${r?.contas ?? 1} conta(s), ${r?.canais ?? 0} canal(is) desligado(s)`);
    onExcluido?.();
  };

  return (
    <div className="os-vidro" style={{ padding: 14, borderColor: 'rgba(229,72,77,0.35)' }}>
      <div className="row gap-3" style={{ alignItems:'center' }}>
        <Icon name="trash" size={20} stroke="#e5484d" />
        <div style={{ flex: 1 }}>
          <div className="h3" style={{ fontSize: 13, color: '#e5484d' }}>Excluir tenant</div>
          <div className="muted tiny">Bloqueia o login do dono e da equipe e desliga WhatsApp/Instagram. Conversas e leads ficam guardados — dá pra restaurar na aba Excluídos.</div>
        </div>
        {!aberto && <button className="btn" style={{ color: '#e5484d' }} onClick={() => setAberto(true)}>Excluir</button>}
      </div>
      {aberto && (
        <div className="col gap-2" style={{ marginTop: 12 }}>
          <label className="label">Para confirmar, digite <span className="mono">{chave}</span></label>
          <input
            className="input mono"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            placeholder={chave}
            autoCapitalize="none"
            spellCheck={false}
          />
          {erro && <div className="badge badge-err" style={{ whiteSpace:'normal' }}>{erro}</div>}
          <div className="row gap-2" style={{ justifyContent:'flex-end' }}>
            <button className="btn btn-sm" onClick={() => { setAberto(false); setConfirmacao(''); setErro(''); }} disabled={excluindo}>Cancelar</button>
            <button className="btn btn-sm" disabled={!confere || excluindo} onClick={excluir}
              style={{ background: confere ? '#e5484d' : undefined, color: confere ? '#fff' : undefined }}>
              <Icon name="trash" size={12} /> {excluindo ? 'Excluindo…' : 'Excluir tenant'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CardRedefinirSenha({ tenantId }) {
  const t = useToast();
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const senhaValida = senha.length >= 6;

  const gerarSenha = () => {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    const arr = new Uint32Array(14);
    crypto.getRandomValues(arr);
    let s = '';
    for (let i = 0; i < 14; i++) s += alfabeto[arr[i] % alfabeto.length];
    setSenha(s);
    setShowSenha(true);
  };

  const copiarSenha = async () => {
    try { await navigator.clipboard.writeText(senha); t.success('Senha copiada'); }
    catch { /* clipboard pode estar bloqueado pelo navegador */ }
  };

  const redefinir = async () => {
    if (!senhaValida || salvando) return;
    setSalvando(true); setErro('');
    const r = await window.RAGENTIC_HOOKS?.redefinirSenhaTenant?.(tenantId, senha);
    setSalvando(false);
    if (r?.erro) { setErro(r.erro); return; }
    t.success('Senha redefinida');
    setSenha(''); setAberto(false);
  };

  return (
    <div className="os-vidro" style={{ padding: 14 }}>
      <div className="row gap-3" style={{ alignItems:'center' }}>
        <Icon name="lock" size={20} />
        <div style={{ flex: 1 }}>
          <div className="h3" style={{ fontSize: 13 }}>Redefinir senha</div>
          <div className="muted tiny">A senha atual fica guardada só como hash — não dá pra ver, só trocar.</div>
        </div>
        {!aberto && <button className="btn" onClick={() => setAberto(true)}>Redefinir</button>}
      </div>
      {aberto && (
        <div className="col gap-2" style={{ marginTop: 12 }}>
          <div className="row gap-2">
            <div style={{ flex: 1, position:'relative' }}>
              <input
                className="input mono"
                type={showSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="nova senha · mínimo 6 caracteres"
                autoCapitalize="none"
                spellCheck={false}
                style={{ paddingRight: 38 }}
              />
              <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => setShowSenha(s => !s)} style={{ position:'absolute', right:4, top:4 }}>
                <Icon name={showSenha ? 'eyeOff' : 'eye'} size={13} />
              </button>
            </div>
            <button className="btn btn-sm" type="button" onClick={gerarSenha}>Gerar</button>
            <button className="btn btn-sm" type="button" onClick={copiarSenha} disabled={!senha}>Copiar</button>
          </div>
          {senha && !senhaValida && (
            <div className="muted tiny" style={{ color: 'oklch(0.7 0.2 25)' }}>A senha precisa de no mínimo 6 caracteres.</div>
          )}
          {erro && <div className="badge badge-err" style={{ whiteSpace:'normal' }}>{erro}</div>}
          <div className="row gap-2" style={{ justifyContent:'flex-end' }}>
            <button className="btn btn-sm" onClick={() => { setAberto(false); setSenha(''); setErro(''); }} disabled={salvando}>Cancelar</button>
            <button className="btn btn-primary btn-sm" disabled={!senhaValida || salvando} onClick={redefinir}>
              <Icon name="check" size={12} /> {salvando ? 'Trocando…' : 'Trocar senha'}
            </button>
          </div>
          <div className="muted tiny">O tenant continua logado nas sessões antigas até elas expirarem. Anote e repasse a senha com segurança.</div>
        </div>
      )}
    </div>
  );
}

function ModalTenantDetalhe({ tenant, onClose, onAtualizado, onAbrirZapi, onAbrirInstagram, onExcluido }) {
  const t = useToast();
  const [tab, setTab] = useState('perfil');
  const [form, setForm] = useState({
    full_name: tenant.nome || '',
    email: tenant.email || '',
    phone: tenant.phone || '',
    cargo: tenant.cargo || '',
    cnpj: tenant.cnpj || '',
    tipo_pessoa: tenant.tipo_pessoa || 'pf',
    chave_pix: tenant.chave_pix || '',
    apelido: tenant.apelido || '',
    is_active: tenant.is_active !== false,
  });
  const [salvando, setSalvando] = useState(false);
  const [planoSel, setPlanoSel] = useState('');
  const [ativando, setAtivando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [zerando, setZerando] = useState(false);
  const [dataExp, setDataExp] = useState(tenant.data_expiracao || '');
  const [maxConv, setMaxConv] = useState(tenant.max_conversas ? String(tenant.max_conversas) : '');
  const [maxCiclos, setMaxCiclos] = useState('');
  const [precoSel, setPrecoSel] = useState('');
  const [obs, setObs] = useState('');
  const [lancarComissao, setLancarComissao] = useState(true);
  const [planos, setPlanos] = useState([]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await window.RAGENTIC_HOOKS?.lojaListar?.('loja_planos');
      if (!vivo) return;
      const ativos = (r || []).filter(p => p.is_active !== false).map(p => ({
        id: p.id, nome: p.nome, preco: Number(p.preco_mensal || 0),
        max_conversas: p.max_conversas || 0, max_ciclos: p.max_ciclos_por_conversa || 30, dias: p.dias_expiracao || 30,
      }));
      setPlanos(ativos);
    })();
    return () => { vivo = false; };
  }, []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    setSalvando(true);
    const r = await window.RAGENTIC_HOOKS?.salvarTenant?.(tenant.id, form);
    setSalvando(false);
    if (r?.erro) { t.success?.(''); alert('Falha: ' + r.erro); return; }
    t.success('Tenant atualizado');
    onAtualizado?.({
      nome: form.full_name, email: form.email, phone: form.phone, cargo: form.cargo,
      cnpj: form.cnpj, tipo_pessoa: form.tipo_pessoa, chave_pix: form.chave_pix,
      is_active: form.is_active,
      status: form.is_active ? (tenant.account_status === 'pending' ? 'pendente' : 'ativo') : 'inativo',
    });
  };

  const selecionarPlano = (id) => {
    setPlanoSel(id);
    const p = planos.find(pp => pp.id === id);
    if (p) {
      setDataExp(new Date(Date.now() + (p.dias || 30) * 86400000).toISOString().slice(0, 10));
      setMaxConv(String(p.max_conversas || ''));
      setMaxCiclos(String(p.max_ciclos || ''));
      setPrecoSel(String(p.preco || ''));
    }
  };

  const ativarPlano = async () => {
    if (!planoSel) return;
    setAtivando(true);
    const opts = {
      dataExpiracaoISO: dataExp ? new Date(dataExp + 'T23:59:59').toISOString() : undefined,
      maxConversas: maxConv !== '' ? parseInt(maxConv, 10) : undefined,
      maxCiclos: maxCiclos !== '' ? parseInt(maxCiclos, 10) : undefined,
      preco: precoSel !== '' ? parseFloat(precoSel) : undefined,
      observacao: obs || undefined,
      lancarComissao,
    };
    const r = await window.RAGENTIC_HOOKS?.ativarPlanoTenant?.(tenant.id, planoSel, opts);
    setAtivando(false);
    if (r?.erro) { alert('Falha: ' + r.erro); return; }
    const p = planos.find(pp => pp.id === planoSel);
    t.success(`Plano ${p?.nome || ''} ativado`);
    onAtualizado?.({
      plano: p?.nome || '—',
      max_conversas: maxConv !== '' ? parseInt(maxConv, 10) : (p?.max_conversas || 0),
      conversas: 0, plano_status: 'ativa', plano_expirado: false, data_expiracao: dataExp || '',
    });
  };

  const cancelarPlano = async () => {
    if (!confirm('Inativar o plano deste tenant? Ele para de contar como ativo.')) return;
    setCancelando(true);
    const r = await window.RAGENTIC_HOOKS?.cancelarPlanoTenant?.(tenant.id);
    setCancelando(false);
    if (r?.erro) { alert('Falha: ' + r.erro); return; }
    t.success('Plano inativado');
    onAtualizado?.({ plano_status: 'cancelada', plano_expirado: true });
  };

  const zerarContador = async () => {
    if (!confirm('Zerar o contador de conversas do ciclo atual? Mantém a data de expiração.')) return;
    setZerando(true);
    const r = await window.RAGENTIC_HOOKS?.zerarContadorTenant?.(tenant.id);
    setZerando(false);
    if (r?.erro) { alert('Falha: ' + r.erro); return; }
    t.success('Contador zerado');
    onAtualizado?.({ conversas: 0 });
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal" style={{ width: 720, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="row" style={{ justifyContent:'space-between', marginBottom: 12 }}>
          <div className="row gap-3" style={{ alignItems:'center' }}>
            {tenant.avatar_url ? (
              <img src={tenant.avatar_url} alt={form.full_name || 'Tenant'} onError={(e) => { e.currentTarget.style.display='none'; }}
                style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover', display:'block' }} />
            ) : (
              <div className="avatar" style={{ background:'#7c5ce0', width: 44, height: 44 }}>{tenant.avatar}</div>
            )}
            <div>
              <div className="h2">{form.full_name || 'Tenant'}</div>
              <div className="muted small mono"><span style={{ opacity: 0.6 }}>ID do tenant · </span>{tenant.id}</div>
            </div>
          </div>
          <div className="row gap-2" style={{ alignItems:'center' }}>
            <button className="btn btn-primary" onClick={async () => {
              const r = await window.RAGENTIC_HOOKS?.impersonar?.(tenant.id, 'admin via modal de tenant');
              if (r?.erro) { alert('Falha ao impersonar: ' + r.erro + (r.detail ? '\n' + r.detail : '')); return; }
              if (r?.url) window.location.href = r.url;
            }} title="Abrir nova aba logado como este usuário">
              <Icon name="shield" size={13} /> Impersonar
            </button>
            <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" size={14} /></button>
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: 16 }}>
          {[['perfil','Perfil'],['plano','Plano'],['equipe','Equipe'],['seguranca','Acesso & Z-API']].map(([k,l]) => (
            <span key={k} className={`tab ${tab===k?'tab-on':''}`} onClick={() => setTab(k)}>{l}</span>
          ))}
        </div>

        {tab === 'equipe' && <TenantEquipeTab tenantId={tenant.id} />}

        {tab === 'perfil' && (
          <div className="col gap-3">
            <div className="row gap-3">
              <div style={{ flex: 1 }}><label className="label">Nome completo</label>
                <input className="input" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="label">E-mail</label>
                <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
            </div>
            <div className="row gap-3">
              <div style={{ flex: 1 }}><label className="label">Telefone</label>
                <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="label">Cargo</label>
                <input className="input" value={form.cargo} onChange={(e) => set('cargo', e.target.value)} /></div>
            </div>
            <div className="row gap-3">
              <div style={{ width: 180 }}><label className="label">Tipo de pessoa</label>
                <select className="input" value={form.tipo_pessoa} onChange={(e) => set('tipo_pessoa', e.target.value)}>
                  <option value="pf" style={{ background:'#1a1530' }}>Física</option>
                  <option value="pj" style={{ background:'#1a1530' }}>Jurídica</option>
                </select></div>
              <div style={{ flex: 1 }}><label className="label">CNPJ / CPF</label>
                <input className="input mono" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="label">Chave PIX</label>
                <input className="input mono" value={form.chave_pix} onChange={(e) => set('chave_pix', e.target.value)} /></div>
            </div>
            <div className="row gap-3">
              <div style={{ flex: 1 }}>
                <label className="label">Apelido (login conversacional do Porteiro)</label>
                <input
                  className="input mono"
                  value={form.apelido}
                  onChange={(e) => set('apelido', e.target.value.trim())}
                  placeholder="ex: joaosilva"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <div className="muted tiny" style={{ marginTop: 4 }}>
                  {form.apelido && !/^[a-zA-Z0-9_.\-]{2,32}$/.test(form.apelido)
                    ? <span style={{ color: 'oklch(0.7 0.2 25)' }}>2-32 caracteres · só letras, números, _ . -</span>
                    : 'Único na plataforma. O tenant usa pra entrar no commandbar do login.'}
                </div>
              </div>
            </div>
            <div className="row gap-3" style={{ alignItems:'center', marginTop: 8 }}>
              <label className="row gap-2" style={{ cursor:'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                <span>Conta ativa</span>
              </label>
              <span className="muted tiny">Desativar bloqueia login do tenant.</span>
            </div>
          </div>
        )}

        {tab === 'plano' && (
          <div className="col gap-3">
            <div className="os-vidro" style={{ padding: 14 }}>
              <div className="row gap-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="muted tiny">Plano atual</div>
                {tenant.plano_status && (
                  <span className={`badge ${tenant.plano_status === 'ativa' ? 'badge-info' : 'badge-warn'}`}>
                    {tenant.plano_status === 'ativa' ? 'Ativo' : tenant.plano_status === 'expirada' ? 'Expirado' : 'Inativo'}
                  </span>
                )}
              </div>
              <div className="row gap-3" style={{ alignItems: 'baseline', marginTop: 4 }}>
                <div className="h2 os-aurora-text">{tenant.plano || '—'}</div>
                {tenant.max_conversas > 0 && (
                  <span className="mono small">{tenant.conversas}/{tenant.max_conversas} conversas</span>
                )}
                {tenant.data_expiracao && (
                  <span className="muted small">
                    expira {tenant.data_expiracao}
                    {(() => {
                      const d = Math.ceil((new Date(tenant.data_expiracao + 'T23:59:59').getTime() - Date.now()) / 86400000);
                      return ' · ' + (d > 0 ? d + 'd restantes' : 'vencido');
                    })()}
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="label">Atribuir / renovar plano</label>
              <select className="input" value={planoSel} onChange={(e) => selecionarPlano(e.target.value)}>
                <option value="" style={{ background:'#1a1530' }}>Selecionar plano…</option>
                {planos.map(p => (
                  <option key={p.id} value={p.id} style={{ background:'#1a1530' }}>
                    {p.nome} — R$ {p.preco}/mês · {p.max_conversas} conversas
                  </option>
                ))}
              </select>
            </div>
            <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 130 }}>
                <label className="label">Max conversas</label>
                <input className="input" type="number" value={maxConv} onChange={(e) => setMaxConv(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <label className="label">Max ciclos/conversa</label>
                <input className="input" type="number" value={maxCiclos} onChange={(e) => setMaxCiclos(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <label className="label">Data de expiração</label>
                <input className="input" type="date" value={dataExp} onChange={(e) => setDataExp(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <label className="label">Preço (R$)</label>
                <input className="input" type="number" step="0.01" value={precoSel} onChange={(e) => setPrecoSel(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Observação</label>
              <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: agrado, desconto especial" />
              <div className="muted tiny" style={{ marginTop: 6 }}>
                Estenda a data pra reativar um vencido por mais tempo. Os limites vêm do plano, mas dá pra sobrescrever aqui. Ativar / renovar zera o contador de conversas.
              </div>
            </div>
            <label className="row gap-2" style={{ alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={lancarComissao} onChange={(e) => setLancarComissao(e.target.checked)} />
              <span className="small">Lançar comissão multinível (venda real) — desmarque se for só correção</span>
            </label>
            <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={!planoSel || ativando} onClick={ativarPlano}>
                <Icon name="check" size={13} /> {ativando ? 'Salvando…' : 'Ativar / Renovar'}
              </button>
              <button className="btn btn-ghost" disabled={zerando} onClick={zerarContador}>
                {zerando ? '…' : 'Zerar contador'}
              </button>
              <button className="btn btn-ghost" disabled={cancelando} onClick={cancelarPlano} style={{ color: '#e5484d' }}>
                <Icon name="x" size={13} /> {cancelando ? '…' : 'Inativar plano'}
              </button>
            </div>
          </div>
        )}

        {tab === 'seguranca' && (
          <div className="col gap-3">
            <div className="os-vidro" style={{ padding: 14 }}>
              <div className="row gap-3" style={{ alignItems:'center' }}>
                <Icon name="whatsapp" size={20} />
                <div style={{ flex: 1 }}>
                  <div className="h3" style={{ fontSize: 13 }}>Integração Z-API</div>
                  <div className="muted tiny">Credenciais do WhatsApp deste tenant.</div>
                </div>
                <button className="btn" onClick={onAbrirZapi}>Configurar</button>
              </div>
            </div>
            <div className="os-vidro" style={{ padding: 14 }}>
              <div className="row gap-3" style={{ alignItems:'center' }}>
                <Icon name="instagram" size={20} />
                <div style={{ flex: 1 }}>
                  <div className="h3" style={{ fontSize: 13 }}>Integração Instagram</div>
                  <div className="muted tiny">Credenciais de DM do Instagram deste tenant.</div>
                </div>
                <button className="btn" onClick={onAbrirInstagram}>Configurar</button>
              </div>
            </div>
            <CardRedefinirSenha tenantId={tenant.id} />
            <div className="os-vidro" style={{ padding: 14 }}>
              <div className="row gap-3" style={{ alignItems:'center' }}>
                <Icon name="shield" size={20} />
                <div style={{ flex: 1 }}>
                  <div className="h3" style={{ fontSize: 13 }}>Impersonar tenant</div>
                  <div className="muted tiny">Abre nova aba logado como este usuário (auditado em impersonation_log).</div>
                </div>
                <button className="btn btn-primary" onClick={async () => {
                  const r = await window.RAGENTIC_HOOKS?.impersonar?.(tenant.id, 'admin via modal de tenant');
                  if (r?.erro) { alert('Falha: ' + r.erro); return; }
                  if (r?.url) window.location.href = r.url;
                }}>
                  <Icon name="shield" size={13} /> Impersonar
                </button>
              </div>
            </div>
            <CardExcluirTenant tenant={tenant} onExcluido={onExcluido} />
          </div>
        )}

        <div className="row gap-2" style={{ marginTop: 20, justifyContent:'flex-end' }}>
          <button className="btn" onClick={onClose}>Fechar</button>
          {tab === 'perfil' && (
            <button className="btn btn-primary" disabled={salvando} onClick={salvar}>
              <Icon name="check" size={13} /> {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function Tenants({ tenants: tenantsProp } = {}) {
  const [list, setList] = useState(tenantsProp || window.RAGENTIC_DATA.TENANTS);
  useEffect(() => { if (tenantsProp) setList(tenantsProp); }, [tenantsProp]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('todos');
  useAbaAlvo("tenants", (v) => setFilter(v));
  const [criar, setCriar] = useState(false);
  const [zapiTenant, setZapiTenant] = useState(null);
  const [instagramTenant, setInstagramTenant] = useState(null);
  const [detalheTenant, setDetalheTenant] = useState(null);
  const [restaurando, setRestaurando] = useState(null);
  const t = useToast();

  const restaurar = async (tt) => {
    if (!confirm(`Restaurar ${tt.nome}? O login volta a funcionar e os canais que estavam ligados são religados.`)) return;
    setRestaurando(tt.id);
    const r = await window.RAGENTIC_HOOKS?.excluirTenant?.(tt.id, 'restaurar');
    setRestaurando(null);
    if (r?.erro) { alert('Falha: ' + r.erro); return; }
    t.success(`${tt.nome} restaurado`);
    // O status real (ativo/inativo) volta do banco no próximo carregamento; aqui assume ativo.
    setList(xs => xs.map(x => x.id === tt.id ? { ...x, status: 'ativo', is_active: true, excluido_em: '' } : x));
  };

  // Apresentação = conta de mentoria em degustação (ponte Babel Central).
  // Fica numa aba própria pra não poluir a lista de clientes de verdade.
  // Excluídos só aparecem na aba própria — nem em "Todos", nem em Apresentação.
  const filtered = list.filter(x =>
    (filter === 'excluido' ? x.status === 'excluido'
      : x.status !== 'excluido' && (filter === 'apresentacao' ? !!x.apresentacao : (filter === 'todos' || x.status === filter) && !x.apresentacao)) &&
    (!q || x.nome.toLowerCase().includes(q.toLowerCase()) || x.email.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent:'space-between', marginBottom: 16 }}>
        <div>
          <div className="h1">Tenants</div>
          <div className="muted small" style={{ marginTop: 4 }}>{filtered.length} de {list.filter(x => x.status !== 'excluido').length} clientes na plataforma.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCriar(true)}>
          <Icon name="plus" size={14} /> Criar tenant
        </button>
      </div>

      <div className="row gap-3" style={{ marginBottom: 14 }}>
        <div className="row gap-2" style={{ flex: 1, position:'relative' }}>
          <Icon name="search" size={14} stroke="var(--txt-4)" style={{ position:'absolute', left:12, top:11 }} />
          <input className="input" placeholder="Buscar por nome ou e-mail…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <div className="tabs">
          {['todos','ativo','pendente','inativo','apresentacao','excluido'].map(f => (
            <span key={f} className={`tab ${filter===f?'tab-on':''}`} onClick={() => setFilter(f)}>
              {f === 'todos' ? 'Todos' : f === 'apresentacao' ? '🎓 Apresentação' : f === 'excluido' ? 'Excluídos' : capitalize(f)}
            </span>
          ))}
        </div>
      </div>

      <div className="os-card" style={{ padding: 0, overflow:'hidden' }}>
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 40 }}></th>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Plano</th>
            <th>Status</th>
            <th>Criado em</th>
            <th>Uso</th>
            <th style={{ width: 40 }}></th>
          </tr></thead>
          <tbody>
            {filtered.map((tt, i) => {
              const cor = ['#7c5ce0','#3aa6c9','#3ac9a0','#c97a3a','#c93a8a','#5b8bea','#e0a23a'][i % 7];
              return (
                <tr key={tt.id} style={{ cursor: tt.status === 'excluido' ? 'default' : 'pointer', opacity: tt.status === 'excluido' ? 0.7 : 1 }}
                  onClick={() => { if (tt.status !== 'excluido') setDetalheTenant(tt); }}>
                  <td>
                    {tt.avatar_url ? (
                      <img src={tt.avatar_url} alt={tt.nome} onError={(e) => { e.currentTarget.style.display='none'; }}
                        style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', display:'block' }} />
                    ) : (
                      <div className="avatar" style={{ background: cor, width:32, height:32 }}>{tt.avatar}</div>
                    )}
                  </td>
                  <td><div className="h3" style={{ fontSize:13 }}>{tt.nome}</div><div className="muted tiny mono">{tt.phone}</div></td>
                  <td className="mono small">{tt.email}</td>
                  <td>
                    <span className="badge badge-info">{tt.plano}</span>
                    {tt.plano_expirado && <span className="badge badge-warn" style={{ marginLeft: 4 }}>expirado</span>}
                  </td>
                  <td>
                    {tt.status === 'excluido' ? (
                      <span className="badge badge-err" title="Excluído pelo admin — login bloqueado e canais desligados">
                        <span className="dot dot-off"></span>
                        Excluído{tt.excluido_em ? ` · ${tt.excluido_em.slice(8,10)}/${tt.excluido_em.slice(5,7)}` : ''}
                      </span>
                    ) : tt.apresentacao ? (
                      <span className="badge badge-info" title="Conta de mentoria (Babel Central) em degustação">
                        🎓 Apresentação{tt.degustacao_ate ? ` · até ${tt.degustacao_ate.slice(8,10)}/${tt.degustacao_ate.slice(5,7)}` : ''}
                      </span>
                    ) : (
                      <span className={`badge ${tt.status==='ativo'?'badge-success':tt.status==='pendente'?'badge-warn':'badge-err'}`}>
                        <span className={`dot dot-${tt.status==='ativo'?'on':tt.status==='pendente'?'warn':'off'}`}></span>
                        {capitalize(tt.status)}
                      </span>
                    )}
                  </td>
                  <td className="muted small mono">{tt.created}</td>
                  <td>
                    <div className="row gap-2"><span className="mono small">{tt.conversas}</span> <div style={{width:60}}><MiniChart data={Array.from({length:6},()=>Math.random()*100+20)} height={20} /></div></div>
                  </td>
                  <td>
                    {tt.status === 'excluido' ? (
                      <button className="btn btn-sm" disabled={restaurando === tt.id} onClick={(e) => { e.stopPropagation(); restaurar(tt); }}>
                        <Icon name="refresh" size={12} /> {restaurando === tt.id ? '…' : 'Restaurar'}
                      </button>
                    ) : (
                    <div className="row gap-1">
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={async (e) => {
                        e.stopPropagation();
                        const r = await window.RAGENTIC_HOOKS?.impersonar?.(tt.id, 'admin acessou via tabela de tenants');
                        if (r?.erro) { alert('Falha: ' + r.erro); return; }
                        if (r?.url) window.location.href = r.url;
                      }} title="Impersonar">
                        <Icon name="shield" size={14} />
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); setDetalheTenant(tt); }} title="Abrir tenant">
                        <Icon name="more" size={14} />
                      </button>
                    </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {criar && <ModalCriarTenant onClose={() => setCriar(false)} onCriar={(novo) => {
        // Não fecha o modal: fluxo em carrossel — fica pronto pro próximo PDF.
        setList(xs => [{ id: novo.id || ('t' + Math.random().toString(36).slice(2,5)), avatar: (novo.nome || '?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(), status: 'ativo', created: new Date().toISOString().slice(0,10), tokens: 0, conversas: 0, max_conversas: 0, ...novo }, ...xs]);
      }} />}

      {detalheTenant && (
        <ModalTenantDetalhe
          tenant={detalheTenant}
          onClose={() => setDetalheTenant(null)}
          onAtualizado={(patch) => {
            setList(xs => xs.map(x => x.id === detalheTenant.id ? { ...x, ...patch } : x));
            setDetalheTenant(d => d ? { ...d, ...patch } : d);
          }}
          onAbrirZapi={() => setZapiTenant(detalheTenant)}
          onAbrirInstagram={() => setInstagramTenant(detalheTenant)}
          onExcluido={() => {
            const hoje = new Date().toISOString().slice(0, 10);
            setList(xs => xs.map(x => x.id === detalheTenant.id ? { ...x, status: 'excluido', is_active: false, excluido_em: hoje } : x));
            setDetalheTenant(null);
          }}
        />
      )}

      {/* Renderizado DEPOIS do detalhe de propósito: mesmo z-index (95) pros dois
          modais — irmão posterior no DOM pinta por cima, senão o detalhe cobre o Z-API. */}
      {zapiTenant && <ModalZapi tenant={zapiTenant} onClose={() => setZapiTenant(null)} />}
      {instagramTenant && <ModalInstagram tenant={instagramTenant} onClose={() => setInstagramTenant(null)} />}
    </div>
  );
}

// @ts-nocheck
/* eslint-disable */
/**
 * App Equipe — extraído de bundle.jsx (era L3959-L4099).
 * Gestão de membros e permissões de acesso por app.
 *
 * Fonte de dados: busca DIRETO no Supabase os subordinados do tenant logado
 * (`profiles` com parent_user_id = uid) — mesmo padrão do app Conversas
 * (useConversasLive). NÃO depende mais de window.RAGENTIC_DATA.EQUIPE (mock
 * global que era sobrescrito/descartado no boot e prendia a UI no mock).
 * Escrita (ativo/permissões) continua via window.RAGENTIC_HOOKS (Supabase).
 */
import { useState, useEffect, useCallback } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

const APPS_PERMS = ['atendimento','contratos','base','campanhas','financeiro','loja','equipe','socio-comercial','agente','curadoria','clientes','empresa','configuracoes'];

// App Gestão (2026-09-24, pedido do Theus): só existe no tenant do Diego. Na Equipe DELE, o app "gestao" aparece na
// grade de acessos e, ao marcar, o dono escolhe a função do membro dentro da Gestão — sem login nem pedido à parte.
// O banco grava pela função estreita gestao_definir_acesso_membro (plano-integracao/2026-09-24/GESTAO-PELA-EQUIPE.sql),
// que também coloca o membro na lista da área (funcionário da Implementação/P&D, equipe de Suporte).
// Mesma lista do bundle.jsx (APPS_SO_PARA_TENANTS.gestao).
const TENANTS_COM_GESTAO = ['1ec3f624-6555-482f-9b38-59579efd8016'];
const FUNCOES_GESTAO = [
  ['financeiro', 'Financeiro'],
  ['comercial', 'Comercial'],
  ['implementacao', 'Implementação'],
  ['programador', 'P&D'],
  ['suporte', 'Suporte'],
  ['admin', 'Admin (tudo)'],
];
const rotuloFuncao = (k) => (FUNCOES_GESTAO.find(([id]) => id === k) || [k, k])[1];

function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

function traduzErroConvite(erro) {
  const e = String(erro || '').toLowerCase();
  // Códigos da função convidar-membro (2026-09-24): antes a tela recebia só "non-2xx status code" e caía na genérica.
  if (e === 'email_em_uso') return 'Esse e-mail já tem uma conta ativa (nesta equipe ou em outra empresa). Use outro e-mail.';
  if (e === 'apelido_de_membro_removido') return 'Esse apelido é de um membro que foi removido da sua equipe. Para trazê-lo de volta, cadastre com o e-mail dele; ou escolha outro apelido.';
  if (e === 'erro_reativar_login' || e === 'erro_reativar_perfil') return 'Não foi possível reativar esse membro. Tente de novo; se continuar, avise o suporte.';
  if (e === 'no_auth' || e === 'invalid_token') return 'Sua sessão expirou. Entre de novo e tente outra vez.';
  // 2026-09-25: os 4 códigos que ainda caíam na frase genérica (aviso A-PP1 do Serjão).
  if (e === 'erro_criar_usuario') return 'Não foi possível criar o login desse membro. Tente de novo em alguns segundos; se continuar, avise o suporte.';
  if (e === 'erro_gravar_perfil') return 'O cadastro do membro não foi concluído. Tente de novo; se continuar, avise o suporte.';
  if (e === 'erro_consulta' || e === 'erro_interno') return 'O servidor não conseguiu concluir agora. Tente de novo em alguns segundos; se continuar, avise o suporte.';
  if (e.includes('already') || e.includes('exists') || e.includes('registr')) return 'Já existe um usuário com esse e-mail.';
  if (e.includes('email_invalido') || e.includes('invalid')) return 'E-mail inválido.';
  if (e.includes('senha_curta') || e.includes('password')) return 'A senha precisa ter ao menos 6 caracteres.';
  if (e.includes('campos_obrigatorios')) return 'Preencha nome, e-mail, senha e apelido.';
  if (e.includes('apelido_em_uso') || e.includes('unique') || e.includes('duplicate') || e.includes('apelido_unico')) return 'Esse apelido já está em uso. Escolha outro.';
  if (e.includes('apelido_invalido') || e.includes('apelido')) return 'Apelido: 2 a 64 caracteres, sem espaço ou acento.';
  return 'Não foi possível adicionar o membro.';
}

export function Equipe() {
  const [tab, setTab] = useState('membros');
  const [list, setList] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [criar, setCriar] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', senha: '', apelido: '' });
  const [salvando, setSalvando] = useState(false);
  const t = useToast();
  // Gestão: o dono logado é um tenant com Gestão? Funções atuais de cada membro e o modal de escolha.
  const [temGestao, setTemGestao] = useState(false);
  const [funcoes, setFuncoes] = useState({}); // membroId -> ['suporte', ...]
  const [editFuncao, setEditFuncao] = useState(null); // { membro, marcadas: [] }
  const appsDaGrade = temGestao ? [...APPS_PERMS, 'gestao'] : APPS_PERMS;

  const carregarFuncoes = useCallback(async () => {
    const { data, error } = await supabase.rpc('gestao_acessos_da_minha_equipe');
    if (error) { console.warn('[Equipe] funções da Gestão:', error.message); return; }
    const mapa = {};
    (data || []).forEach((r) => { mapa[r.id] = Array.isArray(r.papeis) ? r.papeis : []; });
    setFuncoes(mapa);
  }, []);

  // Busca os membros reais direto do banco (igual app Conversas). Sem mock,
  // sem window global, sem evento de hidratação.
  const carregar = useCallback(async () => {
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const uid = sessao?.session?.user?.id;
      if (!uid) { setList([]); setCarregando(false); return; }
      const comGestao = TENANTS_COM_GESTAO.includes(uid);
      setTemGestao(comGestao);
      if (comGestao) void carregarFuncoes();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, cargo, apelido, avatar_url, page_permissions, is_active, created_at')
        .eq('parent_user_id', uid)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[Equipe] falha ao buscar membros:', error.message);
        setList([]);
      } else {
        setList((data || []).map((m) => ({
          id: m.id,
          nome: m.full_name || m.email || 'Sem nome',
          email: m.email || '',
          foto_url: m.avatar_url || null,
          avatar: iniciais(m.full_name || m.email),
          cargo: m.cargo || 'Membro',
          apelido: m.apelido || '',
          permissions: Array.isArray(m.page_permissions) ? m.page_permissions : [],
          ativo: m.is_active !== false,
        })));
      }
    } catch (e) {
      console.warn('[Equipe] erro ao carregar:', e?.message || e); setList([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // Cria o membro de verdade: edge convidar-membro (auth + profile vinculado).
  // A senha é definida aqui; o cargo o próprio membro ajusta em Configurações.
  async function adicionar() {
    const nome = form.nome.trim();
    const email = form.email.trim();
    const senha = form.senha;
    const apelido = form.apelido.trim();
    if (!nome || !email || !senha || !apelido) { t.error('Preencha nome, e-mail, senha e apelido.'); return; }
    if (senha.length < 6) { t.error('A senha precisa ter ao menos 6 caracteres.'); return; }
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(apelido)) { t.error('Apelido: 2 a 64 caracteres, sem espaço ou acento.'); return; }
    setSalvando(true);
    try {
      // Sem o hook, antes a tela dizia "Membro adicionado" sem ter feito nada (aviso A-PP2 do Serjão, 2026-09-25).
      const convidar = window.RAGENTIC_HOOKS?.convidarMembro;
      if (!convidar) { t.error('O sistema ainda não terminou de carregar. Recarregue a página e tente de novo.'); return; }
      const r = await convidar({ nome, email, senha, apelido });
      if (r?.erro) { t.error(traduzErroConvite(r.erro)); return; }
      t.success(r?.reativado
        ? 'Membro reativado (ele já tinha sido da equipe). Entra no Porteiro com o apelido e a senha novos; marque de novo os apps dele.'
        : 'Membro adicionado. Ele entra no Porteiro com o apelido e a senha.');
      setCriar(false);
      setForm({ nome: '', email: '', senha: '', apelido: '' });
      setCarregando(true);
      await carregar();
    } catch (e) {
      console.warn('[Equipe] adicionar falhou:', e?.message || e);
      t.error('Não foi possível adicionar o membro.');
    } finally {
      setSalvando(false);
    }
  }

  // Soft-delete do membro (botão lixeira). Confirma antes; tira da lista na hora.
  async function remover(m) {
    const ok = window.confirm(`Remover ${m.nome} da equipe? O login dele é bloqueado e os acessos são revogados. Para trazê-lo de volta, cadastre de novo com o mesmo e-mail.`);
    if (!ok) return;
    // Sem o hook, antes a tela dizia "removido" sem ter feito nada (aviso A-PP2 do Serjão, 2026-09-25). Confere antes
    // de mexer em qualquer coisa, inclusive na função da Gestão.
    const removerHook = window.RAGENTIC_HOOKS?.removerMembro;
    if (!removerHook) { t.error('O sistema ainda não terminou de carregar. Recarregue a página e tente de novo.'); return; }
    // Gestão (só no tenant que tem o app): tira a função antes, pela função do banco que também o tira da lista da
    // área e do rodízio do Suporte. O servidor (remover-membro) ainda revoga o acesso, por garantia.
    if (temGestao && (funcoes[m.id] || []).length > 0) {
      const { error: gErr } = await supabase.rpc('gestao_definir_acesso_membro', { p_membro: m.id, p_papeis: [] });
      if (gErr) { t.error('Não foi possível tirar a função dele na Gestão. Nada foi removido; tente de novo.'); return; }
      setFuncoes((f) => ({ ...f, [m.id]: [] }));
    }
    setList((xs) => xs.filter((x) => x.id !== m.id));
    const r = await removerHook(m.id);
    if (r?.erro) { t.error('Não foi possível remover. Recarregue e tente de novo.'); setCarregando(true); await carregar(); return; }
    t.success(`${m.nome} removido da equipe. O login dele foi bloqueado.`);
  }

  // Define/edita o apelido de acesso de um membro (login no Porteiro). Salva no blur.
  async function salvarApelido(m, valor) {
    const apelido = String(valor || '').trim();
    if (apelido === (m.apelido || '')) return; // nada mudou
    if (apelido && !/^[A-Za-z0-9._-]{2,64}$/.test(apelido)) {
      t.error('Apelido: 2 a 64 caracteres, sem espaço ou acento.');
      return;
    }
    const r = await window.RAGENTIC_HOOKS?.salvarApelidoMembro?.(m.id, apelido);
    if (r?.erro) {
      const e = String(r.erro).toLowerCase();
      t.error(e.includes('unique') || e.includes('duplicate') ? 'Esse apelido já está em uso.' : 'Não foi possível salvar o apelido.');
      return;
    }
    setList((xs) => xs.map((x) => (x.id === m.id ? { ...x, apelido } : x)));
    t.success('Apelido salvo.');
  }

  // Await + checagem de retorno: só marca/desmarca na UI se o hook confirmou
  // a gravação. Sem await, um membro (sem policy pra escrever no dono) via
  // "salvo" na tela mas nada persistia (revogar permissão fantasma).
  const togglePerm = async (memberId, slug) => {
    const membro = list.find((m) => m.id === memberId);
    if (!membro) return;
    const has = membro.permissions.includes(slug);
    // Gestão: marcar abre a escolha da função; desmarcar tira a função no banco antes de tirar o app.
    if (slug === 'gestao') {
      if (!has) { setEditFuncao({ membro, marcadas: funcoes[memberId] || [] }); return; }
      await salvarFuncoes(membro, []);
      return;
    }
    const novas = has ? membro.permissions.filter(p => p !== slug) : [...membro.permissions, slug];
    const r = await window.RAGENTIC_HOOKS?.salvarPermissoesMembro?.(memberId, novas);
    if (r?.erro) {
      t.error('Não foi possível salvar as permissões. Recarregue e tente de novo.');
      return;
    }
    setList(xs => xs.map(m => (m.id === memberId ? { ...m, permissions: novas } : m)));
  };

  // Gestão: grava a função no banco (acesso + lista da área) e, só se deu certo, liga/desliga o app no membro.
  const salvarFuncoes = async (membro, papeis) => {
    const { error } = await supabase.rpc('gestao_definir_acesso_membro', { p_membro: membro.id, p_papeis: papeis });
    if (error) {
      t.error('Não foi possível salvar a função na Gestão: ' + (error.message || 'erro desconhecido'));
      return false;
    }
    const ligar = papeis.length > 0;
    const tem = membro.permissions.includes('gestao');
    if (ligar !== tem) {
      const novas = ligar ? [...membro.permissions, 'gestao'] : membro.permissions.filter((p) => p !== 'gestao');
      const r = await window.RAGENTIC_HOOKS?.salvarPermissoesMembro?.(membro.id, novas);
      if (r?.erro) {
        t.error('A função foi salva, mas o app Gestão não foi ligado no membro. Tente de novo.');
      } else {
        setList((xs) => xs.map((m) => (m.id === membro.id ? { ...m, permissions: novas } : m)));
      }
    }
    setFuncoes((f) => ({ ...f, [membro.id]: papeis }));
    t.success(ligar ? `${membro.nome}: ${papeis.map(rotuloFuncao).join(', ')} na Gestão.` : `${membro.nome} saiu da Gestão.`);
    return true;
  };

  // Ativa/desativa membro. Await + checagem: só reflete na UI se aplicou de fato.
  const toggleAtivo = async (m) => {
    const novo = !m.ativo;
    const r = await window.RAGENTIC_HOOKS?.toggleMembroAtivo?.(m.id, novo);
    if (r?.erro) {
      t.error('Não foi possível alterar o status do membro. Recarregue e tente de novo.');
      return;
    }
    setList(xs => xs.map(x => (x.id === m.id ? { ...x, ativo: novo } : x)));
  };

  return (
    <div className="col" style={{ height: '100%' }}>
      <div className="row" style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
        <div>
          <div className="h2">Equipe</div>
          <div className="muted small">{carregando ? 'carregando…' : `${list.length} membros · ${list.filter(m => m.ativo).length} ativos`}</div>
        </div>
        <div className="flex-1" />
        <div className="tabs">
          <span className={`tab ${tab === 'membros' ? 'tab-on' : ''}`} onClick={() => setTab('membros')}><Icon name="users" size={12} /> Membros</span>
          <span className={`tab ${tab === 'acessos' ? 'tab-on' : ''}`} onClick={() => setTab('acessos')}><Icon name="shield" size={12} /> Acessos</span>
        </div>
        <button className="btn btn-primary" onClick={() => setCriar(true)}><Icon name="plus" size={13} /> Adicionar membro</button>
      </div>

      <div className="flex-1 scroll" style={{ overflow: 'auto' }}>
        {tab === 'membros' && (
          <div style={{ padding: 22 }}>
            {carregando && <div className="muted small">Carregando equipe…</div>}
            {!carregando && list.length === 0 && (
              <div className="muted small">Nenhum membro na equipe ainda. Use “Adicionar membro”.</div>
            )}
            <div className="col gap-2">
              {list.map(m => (
                <div key={m.id} className="os-card row gap-3" style={{ padding: 14, alignItems: 'center' }}>
                  {m.foto_url ? (
                    <img src={m.foto_url} alt={m.nome} loading="lazy"
                         style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.10)' }}
                         onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }} />
                  ) : null}
                  <div className="avatar" style={{ background: '#5b8bea', width: 40, height: 40, display: m.foto_url ? 'none' : 'flex' }}>{m.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div className="row gap-2">
                      <div className="h3" style={{ fontSize: 14 }}>{m.nome}</div>
                      <span className="badge">{m.cargo}</span>
                    </div>
                    <div className="muted small mono">{m.email}</div>
                    <div className="row gap-1" style={{ marginTop: 4, alignItems: 'center' }}>
                      <span className="muted tiny">apelido:</span>
                      <input className="input" defaultValue={m.apelido} placeholder="definir p/ acesso"
                        onBlur={(e) => salvarApelido(m, e.target.value)}
                        title="Apelido de login no Porteiro"
                        style={{ height: 24, padding: '2px 8px', fontSize: 12, maxWidth: 170 }} />
                    </div>
                  </div>
                  <div className="col" style={{ textAlign: 'right' }}>
                    <div className="muted tiny">Acessos</div>
                    <div className="mono small">{m.permissions.length} apps</div>
                  </div>
                  <div className={`switch ${m.ativo ? 'on' : ''}`} onClick={() => toggleAtivo(m)}><i></i></div>
                  <button className="btn btn-sm" onClick={() => setTab('acessos')}><Icon name="edit" size={12} /> Acessos</button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remover(m)} title="Remover da equipe"><Icon name="trash" size={13} stroke="oklch(0.82 0.20 25)" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'acessos' && (
          <div style={{ padding: 22 }}>
            <div className="os-card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="muted small">Marque os apps que cada membro pode acessar. As mudanças são salvas em tempo real.</div>
            </div>
            <div className="os-card scroll" style={{ padding: 0, overflow: 'auto' }}>
              <table className="tbl">
                <thead><tr>
                  <th style={{ position: 'sticky', left: 0, background: 'rgba(15,12,30,0.95)', zIndex: 2 }}>Membro</th>
                  {appsDaGrade.map(s => (
                    <th key={s} style={{ textAlign: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 110, padding: '10px 4px' }}>{s}</th>
                  ))}
                  {temGestao && <th>Função na Gestão</th>}
                </tr></thead>
                <tbody>
                  {list.map(m => (
                    <tr key={m.id}>
                      <td style={{ position: 'sticky', left: 0, background: 'rgba(15,12,30,0.95)', zIndex: 1 }}>
                        <div className="row gap-2">
                          {m.foto_url ? (
                            <img src={m.foto_url} alt={m.nome} loading="lazy"
                                 style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.10)' }} />
                          ) : (
                            <div className="avatar" style={{ background: '#5b8bea', width: 24, height: 24, fontSize: 9 }}>{m.avatar}</div>
                          )}
                          <div><div className="h3" style={{ fontSize: 12 }}>{m.nome.split(' ')[0]}</div><div className="muted tiny">{m.cargo}</div></div>
                        </div>
                      </td>
                      {appsDaGrade.map(s => {
                        const on = m.permissions.includes(s);
                        return (
                          <td key={s} style={{ textAlign: 'center' }}>
                            <span className={`chk ${on ? 'on' : ''}`} onClick={() => togglePerm(m.id, s)}>
                              {on && <Icon name="check" size={11} stroke="white" />}
                            </span>
                          </td>
                        );
                      })}
                      {temGestao && (
                        <td>
                          {(funcoes[m.id] || []).length > 0 ? (
                            <div className="row gap-1" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                              {(funcoes[m.id] || []).map((k) => <span key={k} className="badge badge-aurora">{rotuloFuncao(k)}</span>)}
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditFuncao({ membro: m, marcadas: funcoes[m.id] || [] })}>
                                <Icon name="edit" size={11} /> mudar
                              </button>
                            </div>
                          ) : (
                            <span className="muted tiny">{m.permissions.includes('gestao') ? 'sem função: marque de novo' : '—'}</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editFuncao && (
        <>
          <div className="modal-backdrop" onClick={() => setEditFuncao(null)}></div>
          <div className="modal">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="h2">Função na Gestão</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditFuncao(null)}><Icon name="x" size={14} /></button>
            </div>
            <div className="muted small" style={{ marginBottom: 12 }}>
              {editFuncao.membro.nome} vai ver no app Gestão só as abas da função escolhida (e as Tarefas do time).
              Implementação e P&D entram na lista de responsáveis da área; Suporte entra no rodízio do suporte.
            </div>
            <div className="col gap-2">
              {FUNCOES_GESTAO.map(([k, rotulo]) => {
                const on = editFuncao.marcadas.includes(k);
                return (
                  <label key={k} className="row gap-2" style={{ alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => setEditFuncao((e) => ({ ...e, marcadas: on ? e.marcadas.filter((x) => x !== k) : [...e.marcadas, k] }))}>
                    <span className={`chk ${on ? 'on' : ''}`}>{on && <Icon name="check" size={11} stroke="white" />}</span>
                    <span>{rotulo}</span>
                  </label>
                );
              })}
            </div>
            <div className="row gap-2" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn" onClick={() => setEditFuncao(null)} disabled={salvando}>Cancelar</button>
              <button className="btn btn-primary" disabled={salvando}
                onClick={async () => {
                  setSalvando(true);
                  const ok = await salvarFuncoes(editFuncao.membro, editFuncao.marcadas);
                  setSalvando(false);
                  if (ok) setEditFuncao(null);
                }}>
                {salvando ? 'Salvando…' : editFuncao.marcadas.length ? 'Salvar' : 'Tirar da Gestão'}
              </button>
            </div>
          </div>
        </>
      )}

      {criar && (
        <>
          <div className="modal-backdrop" onClick={() => setCriar(false)}></div>
          <div className="modal">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="h2">Adicionar membro</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setCriar(false)}><Icon name="x" size={14} /></button>
            </div>
            <div className="col gap-3">
              <div><label className="label">Nome completo</label>
                <input className="input" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Joana Pereira" /></div>
              <div><label className="label">E-mail</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="joana@empresa.com" /></div>
              <div><label className="label">Senha de acesso</label>
                <input className="input" type="password" value={form.senha} onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))} placeholder="mínimo 6 caracteres" /></div>
              <div><label className="label">Apelido de acesso</label>
                <input className="input" value={form.apelido} onChange={(e) => setForm((f) => ({ ...f, apelido: e.target.value }))} placeholder="Ex: joana — login no Porteiro" /></div>
              <div className="muted tiny">O membro entra no Porteiro com o apelido + senha. O cargo ele define depois em Configurações.</div>
            </div>
            <div className="row gap-2" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn" onClick={() => setCriar(false)} disabled={salvando}>Cancelar</button>
              <button className="btn btn-primary" onClick={adicionar} disabled={salvando}>{salvando ? 'Adicionando…' : 'Adicionar'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

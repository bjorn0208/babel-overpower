// @ts-nocheck
/* eslint-disable */
/**
 * Aba Notificações da Configuração (2026-05-18).
 * Lê/grava `preferencias_notificacao_usuario` e lista `sons_notificacao`.
 * Por enquanto só os tipos do app Conversas (decisão Theus): mensagem do
 * contato, pedido de atendimento humano (handoff), atendimento humano.
 * On/off por tipo via `modulos_silenciados[]` (chave silenciada = desligado).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

const TIPOS = [
  { chave: 'conversas:mensagem', nome: 'Lead mandou mensagem', desc: 'Um contato respondeu o agente' },
  { chave: 'conversas:handoff', nome: 'Lead pediu atendimento humano', desc: 'O lead quer falar com uma pessoa' },
  { chave: 'conversas:humano', nome: 'Mensagem em atendimento humano', desc: 'Conversa em modo humano' },
];

const PREF_VAZIA = {
  som_id: 'sino', som_handoff_id: 'campainha',
  som_ativo: true, som_handoff_ativo: true,
  navegador_ativo: false, titulo_piscante_ativo: true,
  modulos_silenciados: [],
};

export function ConfigNotificacoes() {
  const t = useToast();
  const audioRef = useRef(null);
  const [userId, setUserId] = useState(null);
  const [sons, setSons] = useState([]);
  const [pref, setPref] = useState(PREF_VAZIA);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) { setCarregando(false); return; }
      setUserId(uid);
      const [{ data: cat }, { data: p }] = await Promise.all([
        supabase.from('sons_notificacao').select('id, nome, arquivo, estilo').eq('ativo', true).order('ordem'),
        supabase.from('preferencias_notificacao_usuario').select('*').eq('user_id', uid).maybeSingle(),
      ]);
      setSons(cat || []);
      if (p) {
        setPref({
          som_id: p.som_id || 'sino',
          som_handoff_id: p.som_handoff_id || 'campainha',
          som_ativo: p.som_ativo !== false,
          som_handoff_ativo: p.som_handoff_ativo !== false,
          navegador_ativo: !!p.navegador_ativo,
          titulo_piscante_ativo: p.titulo_piscante_ativo !== false,
          modulos_silenciados: p.modulos_silenciados || [],
        });
      }
    } catch (e) {
      console.error('[ConfigNotificacoes] carregar falhou:', e);
      t.error('Não foi possível carregar as preferências.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  function ligado(chave) {
    return !pref.modulos_silenciados.includes(chave);
  }
  function alternarTipo(chave) {
    setPref((prev) => {
      const s = new Set(prev.modulos_silenciados);
      if (s.has(chave)) s.delete(chave); else s.add(chave);
      return { ...prev, modulos_silenciados: [...s] };
    });
  }
  function setCampo(k, v) {
    setPref((prev) => ({ ...prev, [k]: v }));
  }
  function ouvir(somId) {
    const som = sons.find((s) => s.id === somId);
    if (!som) return;
    try {
      if (audioRef.current) audioRef.current.pause();
      const a = new Audio(`/sons-notificacao/${som.arquivo}`);
      audioRef.current = a;
      void a.play();
    } catch (e) { /* navegador pode bloquear autoplay sem gesto; aqui há clique */ }
  }

  async function salvar() {
    if (!userId) { t.error('Sessão expirada.'); return; }
    setSalvando(true);
    try {
      const { error } = await supabase.from('preferencias_notificacao_usuario').upsert({
        user_id: userId,
        som_id: pref.som_id,
        som_handoff_id: pref.som_handoff_id,
        som_ativo: pref.som_ativo,
        som_handoff_ativo: pref.som_handoff_ativo,
        navegador_ativo: pref.navegador_ativo,
        titulo_piscante_ativo: pref.titulo_piscante_ativo,
        modulos_silenciados: pref.modulos_silenciados,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      t.success('Preferências salvas');
    } catch (e) {
      console.error('[ConfigNotificacoes] salvar falhou:', e);
      t.error('Erro ao salvar preferências.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className="muted small" style={{ padding: 8 }}>Carregando preferências…</div>;
  }

  const Switch = ({ on, onClick }) => (
    <div className={`switch ${on ? 'on' : ''}`} onClick={onClick} role="switch"
      aria-checked={on} tabIndex={0} style={{ cursor: 'pointer' }}><i></i></div>
  );

  return (
    <div className="col gap-3" style={{ maxWidth: 620 }}>
      <div className="os-card col gap-2" style={{ padding: 22 }}>
        <div className="title-section" style={{ marginBottom: 4 }}>Notificações do Atendimento</div>
        <div className="muted small" style={{ marginBottom: 8 }}>O que o sistema te avisa no app Conversas.</div>
        {TIPOS.map((tp) => (
          <div key={tp.chave} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>{tp.nome}</div>
              <div className="muted tiny">{tp.desc}</div>
            </div>
            <Switch on={ligado(tp.chave)} onClick={() => alternarTipo(tp.chave)} />
          </div>
        ))}
      </div>

      <div className="os-card col gap-3" style={{ padding: 22 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="title-section">Som ao chegar notificação</div>
          <Switch on={pref.som_ativo} onClick={() => setCampo('som_ativo', !pref.som_ativo)} />
        </div>
        <div className="row gap-2" style={{ alignItems: 'flex-end', opacity: pref.som_ativo ? 1 : 0.5 }}>
          <div className="flex-1">
            <label className="label">Som padrão</label>
            <select className="input" value={pref.som_id} disabled={!pref.som_ativo}
              onChange={(e) => setCampo('som_id', e.target.value)}>
              {sons.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <button className="btn" disabled={!pref.som_ativo} onClick={() => ouvir(pref.som_id)}>
            <Icon name="play" size={13} /> Ouvir
          </button>
        </div>
        <div className="row gap-2" style={{ alignItems: 'flex-end', opacity: pref.som_handoff_ativo ? 1 : 0.5 }}>
          <div className="flex-1">
            <label className="label">Som do pedido de humano (handoff)</label>
            <select className="input" value={pref.som_handoff_id} disabled={!pref.som_handoff_ativo}
              onChange={(e) => setCampo('som_handoff_id', e.target.value)}>
              {sons.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <button className="btn" disabled={!pref.som_handoff_ativo} onClick={() => ouvir(pref.som_handoff_id)}>
            <Icon name="play" size={13} /> Ouvir
          </button>
          <Switch on={pref.som_handoff_ativo} onClick={() => setCampo('som_handoff_ativo', !pref.som_handoff_ativo)} />
        </div>
      </div>

      <div className="os-card col gap-2" style={{ padding: 22 }}>
        <div className="title-section" style={{ marginBottom: 4 }}>Avisos extras</div>
        <div className="row" style={{ justifyContent: 'space-between', padding: '8px 0' }}>
          <span className="small">Piscar o título da aba quando tem nova</span>
          <Switch on={pref.titulo_piscante_ativo} onClick={() => setCampo('titulo_piscante_ativo', !pref.titulo_piscante_ativo)} />
        </div>
        <div className="row" style={{ justifyContent: 'space-between', padding: '8px 0' }}>
          <span className="small">Notificação do navegador</span>
          <Switch on={pref.navegador_ativo} onClick={() => setCampo('navegador_ativo', !pref.navegador_ativo)} />
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : <><Icon name="check" size={13} /> Salvar</>}
        </button>
      </div>
    </div>
  );
}

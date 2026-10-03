// @ts-nocheck
/**
 * Aba Configuração — agenda operada pelo agente.
 * Toggle `agente_pode_agendar` + horários disponíveis (tabela `disponibilidade`,
 * lida pela RPC `slots_disponiveis`) + lembrete pro contato (dias/horas antes ou desativado).
 * Branding do link público é AUTOMÁTICO (config_contrato/consultas/empresa) — nada se configura aqui.
 */
import { useEffect, useState } from 'react';
import { Icon } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const LINHA_NOVA = { weekday: 1, hora_inicio: '09:00', hora_fim: '18:00', duracao_slot_min: 30, buffer_min: 10, ativo: true };

const estiloInput = {
  background: 'oklch(0.14 0.02 264 / 0.6)', border: '1px solid oklch(0.25 0.04 264 / 0.5)',
  borderRadius: 8, color: 'var(--txt-1)', padding: '6px 8px', fontSize: 12,
};

export default function AbaConfiguracao({ aoNotificar }) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ativo, setAtivo] = useState(false);
  const [duracaoPadrao, setDuracaoPadrao] = useState(30);
  const [lembreteModo, setLembreteModo] = useState('horas');
  const [lembreteQtd, setLembreteQtd] = useState(2);
  const [mesesAFrente, setMesesAFrente] = useState(1);
  const [linhas, setLinhas] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: cfg } = await supabase.from('agenda_config_tenant').select('*').maybeSingle();
      if (cfg) {
        setAtivo(cfg.agente_pode_agendar === true);
        setDuracaoPadrao(cfg.duracao_padrao_min ?? 30);
        setLembreteModo(cfg.lembrete?.modo ?? 'horas');
        setLembreteQtd(cfg.lembrete?.quantidade ?? 2);
        setMesesAFrente(cfg.meses_a_frente ?? 1);
      }
      const { data: disp } = await supabase.from('disponibilidade')
        .select('id, weekday, hora_inicio, hora_fim, duracao_slot_min, buffer_min, ativo')
        .order('weekday');
      setLinhas((disp ?? []).map((d) => ({ ...d, hora_inicio: String(d.hora_inicio).slice(0, 5), hora_fim: String(d.hora_fim).slice(0, 5) })));
      setCarregando(false);
    })();
  }, []);

  function mudarLinha(i, campo, valor) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }

  async function salvar() {
    setSalvando(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('sem sessão');

      const { error: e1 } = await supabase.from('agenda_config_tenant').upsert({
        tenant_id: uid,
        agente_pode_agendar: ativo,
        duracao_padrao_min: Number(duracaoPadrao) || 30,
        meses_a_frente: Number(mesesAFrente) || 1,
        lembrete: { modo: lembreteModo, quantidade: Number(lembreteQtd) || 0 },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });
      if (e1) throw e1;

      // Horários: substitui o conjunto inteiro (simples e idempotente; RLS limita ao tenant).
      const { error: e2 } = await supabase.from('disponibilidade').delete().gte('weekday', 0);
      if (e2) throw e2;
      if (linhas.length) {
        const { error: e3 } = await supabase.from('disponibilidade').insert(
          linhas.map((l) => ({
            tenant_id: uid, weekday: Number(l.weekday),
            hora_inicio: l.hora_inicio, hora_fim: l.hora_fim,
            duracao_slot_min: Number(l.duracao_slot_min) || 30,
            buffer_min: Number(l.buffer_min) || 0,
            ativo: l.ativo !== false,
          })),
        );
        if (e3) throw e3;
      }
      aoNotificar?.('Configuração da agenda salva.');
    } catch (e) {
      aoNotificar?.(`Erro ao salvar: ${e.message}`, true);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <div className="muted" style={{ padding: 24 }}>Carregando…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', maxWidth: 760 }}>
      <p className="muted" style={{ fontSize: 12, marginBottom: 18 }}>
        Com a opção ativa, quando o contato pedir uma reunião o agente envia o LINK de
        agendamento — o contato escolhe um horário livre na página, preenche os dados e
        recebe o link da sala. A reunião entra no calendário e o lembrete sai sozinho.
      </p>

      {/* Toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, cursor: 'pointer' }}>
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Agente pode enviar o link de agendamento</span>
      </label>

      {/* Duração + lembrete */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <label style={{ fontSize: 12 }}>
          <div className="muted tiny" style={{ marginBottom: 4 }}>Duração padrão (min)</div>
          <input type="number" min="10" max="240" value={duracaoPadrao} onChange={(e) => setDuracaoPadrao(e.target.value)} style={{ ...estiloInput, width: 90 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          <div className="muted tiny" style={{ marginBottom: 4 }}>Mostrar no link</div>
          <select value={String(mesesAFrente)} onChange={(e) => setMesesAFrente(Number(e.target.value))} style={{ ...estiloInput, width: 150 }}>
            <option value="1">Só o mês atual</option>
            <option value="2">2 meses</option>
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          <div className="muted tiny" style={{ marginBottom: 4 }}>Avisar o contato</div>
          <select value={lembreteModo} onChange={(e) => setLembreteModo(e.target.value)} style={{ ...estiloInput, width: 150 }}>
            <option value="desativado">Não avisar</option>
            <option value="horas">Horas antes</option>
            <option value="dias">Dias antes</option>
          </select>
        </label>
        {lembreteModo !== 'desativado' && (
          <label style={{ fontSize: 12 }}>
            <div className="muted tiny" style={{ marginBottom: 4 }}>Quanto tempo antes</div>
            <input type="number" min="1" max="30" value={lembreteQtd} onChange={(e) => setLembreteQtd(e.target.value)} style={{ ...estiloInput, width: 80 }} />
          </label>
        )}
      </div>

      {/* Horários */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Horários disponíveis</span>
        <button className="btn btn-sm" onClick={() => setLinhas((ls) => [...ls, { ...LINHA_NOVA }])}>
          <Icon name="plus" size={12} /> Adicionar horário
        </button>
      </div>
      {!linhas.length && (
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Nenhum horário configurado — sem horários, o link aceita qualquer horário futuro que o contato escolher.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {linhas.map((l, i) => (
          <div key={l.id ?? `nova-${i}`} style={{
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            padding: '8px 10px', borderRadius: 10,
            background: 'oklch(0.16 0.02 264 / 0.5)', border: '1px solid oklch(0.25 0.04 264 / 0.35)',
            opacity: l.ativo === false ? 0.55 : 1,
          }}>
            <select value={l.weekday} onChange={(e) => mudarLinha(i, 'weekday', e.target.value)} style={{ ...estiloInput, width: 110 }}>
              {DIAS.map((d, w) => <option key={w} value={w}>{d}</option>)}
            </select>
            <input type="time" value={l.hora_inicio} onChange={(e) => mudarLinha(i, 'hora_inicio', e.target.value)} style={estiloInput} />
            <span className="muted tiny">até</span>
            <input type="time" value={l.hora_fim} onChange={(e) => mudarLinha(i, 'hora_fim', e.target.value)} style={estiloInput} />
            <span className="muted tiny">slot</span>
            <input type="number" min="10" max="240" value={l.duracao_slot_min} onChange={(e) => mudarLinha(i, 'duracao_slot_min', e.target.value)} style={{ ...estiloInput, width: 60 }} title="Duração de cada horário (min)" />
            <span className="muted tiny">intervalo</span>
            <input type="number" min="0" max="120" value={l.buffer_min} onChange={(e) => mudarLinha(i, 'buffer_min', e.target.value)} style={{ ...estiloInput, width: 56 }} title="Intervalo entre reuniões (min)" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginLeft: 'auto', cursor: 'pointer' }}>
              <input type="checkbox" checked={l.ativo !== false} onChange={(e) => mudarLinha(i, 'ativo', e.target.checked)} /> ativo
            </label>
            <button className="btn btn-ghost btn-icon btn-sm" title="Remover" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" disabled={salvando} onClick={salvar}>
        {salvando ? 'Salvando…' : 'Salvar configuração'}
      </button>
    </div>
  );
}

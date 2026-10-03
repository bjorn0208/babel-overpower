// @ts-nocheck
/**
 * App Agenda — calendário mensal com eventos reais do banco.
 * Lê/grava em `eventos_agenda` via Supabase.
 * Cria eventos via RPC `criar_evento_agenda`.
 * Edita/exclui/conclui/cancela via update direto (RLS cobre).
 * Reuniões com sala: botão "Entrar na reunião" e "Copiar link".
 */
import { useState } from 'react';
import { Icon } from '@/bundle/bundle-shared';
import { diasNoMes, primeiroDiaSemana, resolverCor, mesmodia } from './agenda-datas.js';
import { useAgenda } from './use-agenda.js';
import ModalEvento from './ModalEvento.jsx';
import PainelDia from './PainelDia.jsx';
import AbaConfiguracao from './AbaConfiguracao.jsx';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_PILULAS = 3;

function pilulasNoDia(eventos, ano, mes, dia) {
  return eventos
    .filter((e) => mesmodia(e.inicio_em, ano, mes, dia))
    .sort((a, b) => {
      if (a.dia_inteiro) return -1;
      if (b.dia_inteiro) return 1;
      return new Date(a.inicio_em).getTime() - new Date(b.inicio_em).getTime();
    });
}

export function Agenda() {
  const {
    agora, mesAtual, diaSel, setDiaSel,
    eventos, salasMap, carregando,
    irParaMes, irParaHoje,
    salvarEvento, excluirEvento, concluirEvento, cancelarEvento,
  } = useAgenda();

  const [modalAberto,    setModalAberto]    = useState(false);
  const [eventoEditando, setEventoEditando] = useState(null);
  const [visao,          setVisao]          = useState('calendario'); // 'calendario' | 'configuracao'
  const [aviso,          setAviso]          = useState(null);
  const [filtroOrigem,   setFiltroOrigem]   = useState('todos'); // 'todos' | 'agente' | 'humanos'

  // Origem do evento: compromissos do agente vêm com _origem='agente' (use-agenda)
  // e eventos criados pelo link de agendamento vêm com origem='agente' (coluna).
  const ehDoAgente = (e) => e._origem === 'agente' || e.origem === 'agente';
  const eventosFiltrados = filtroOrigem === 'todos'
    ? eventos
    : eventos.filter((e) => (filtroOrigem === 'agente' ? ehDoAgente(e) : !ehDoAgente(e)));

  const { ano, mes } = mesAtual;

  const totalDias    = diasNoMes(ano, mes);
  const offsetInicio = primeiroDiaSemana(ano, mes);
  const celulas      = [
    ...Array(offsetInicio).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ];
  while (celulas.length % 7 !== 0) celulas.push(null);

  const nomeMes = new Date(ano, mes, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const ehHoje = (d) => d === agora.dia && mes === agora.mes && ano === agora.ano;

  function abrirNovo()         { setEventoEditando(null);   setModalAberto(true); }
  function abrirEditar(evento) { setEventoEditando(evento); setModalAberto(true); }
  function fecharModal()       { setModalAberto(false);     setEventoEditando(null); }

  async function handleSalvar(dados) {
    await salvarEvento(dados, eventoEditando);
    setEventoEditando(null);
  }

  // Abas no padrão dos demais apps (ex.: Consulta): nav superior com indicador inferior.
  const abas = [
    { id: 'calendario', rotulo: 'Calendário' },
    { id: 'configuracao', rotulo: 'Configuração' },
  ];
  const estiloAba = (ativa) => ({
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: ativa ? 600 : 500,
    color: ativa ? 'oklch(0.98 0 0)' : 'oklch(0.98 0 0 / 0.55)',
    background: ativa
      ? 'linear-gradient(180deg, oklch(0.7 0.18 220 / 0.12), oklch(0.65 0.22 280 / 0.08))'
      : 'transparent',
    border: 'none',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottom: ativa ? '2px solid oklch(0.7 0.18 220)' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'color 180ms ease',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid oklch(0.98 0 0 / 0.08)', margin: '12px 20px 0' }}>
        {abas.map((a) => (
          <button key={a.id} type="button" style={estiloAba(visao === a.id)} onClick={() => setVisao(a.id)}>
            {a.rotulo}
          </button>
        ))}
        {aviso && <span className="muted tiny" style={{ alignSelf: 'center', marginLeft: 8 }}>{aviso}</span>}
      </nav>

      {visao === 'configuracao' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          <AbaConfiguracao aoNotificar={(msg) => { setAviso(msg); setTimeout(() => setAviso(null), 4000); }} />
        </div>
      ) : (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Grade mensal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '18px 20px', minWidth: 0 }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="h2" style={{ textTransform: 'capitalize' }}>{nomeMes}</span>
            {carregando && (
              <span style={{ fontSize: 11, color: 'oklch(0.55 0.04 264)', marginLeft: 4 }}>Carregando…</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* Filtro de origem: com muitos eventos do agente, isola os humanos (e vice-versa) */}
            <div style={{ display: 'flex', gap: 2, marginRight: 8, padding: 2, borderRadius: 9, background: 'oklch(0.14 0.02 264 / 0.6)', border: '1px solid oklch(0.25 0.04 264 / 0.35)' }}>
              {[['todos', 'Todos'], ['agente', 'Agente'], ['humanos', 'Humanos']].map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltroOrigem(id)}
                  style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 7,
                    cursor: 'pointer', transition: 'background 140ms, color 140ms',
                    background: filtroOrigem === id
                      ? 'linear-gradient(135deg, var(--os-acento-1, oklch(0.55 0.18 264)), var(--os-acento-2, oklch(0.50 0.18 220)))'
                      : 'transparent',
                    color: filtroOrigem === id ? '#fff' : 'oklch(0.98 0 0 / 0.55)',
                  }}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => irParaMes(-1)} title="Mês anterior">
              <Icon name="arrowLeft" size={13} />
            </button>
            <button className="btn btn-sm" onClick={irParaHoje}>Hoje</button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => irParaMes(1)} title="Próximo mês">
              <Icon name="arrowRight" size={13} />
            </button>
            <button className="btn btn-primary btn-sm" onClick={abrirNovo} style={{ marginLeft: 6 }}>
              <Icon name="plus" size={13} /> Novo evento
            </button>
          </div>
        </div>

        {/* Cabeçalho dias da semana */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="muted tiny" style={{
              textAlign: 'center', padding: '4px 0',
              fontWeight: 700, fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase',
            }}>{d}</div>
          ))}
        </div>

        {/* Células do calendário */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, flex: 1, minHeight: 0 }}>
          {celulas.map((c, i) => {
            if (c === null) return (
              <div key={`pad-${i}`} style={{ background: 'oklch(0.12 0.02 264 / 0.3)', borderRadius: 8 }} />
            );

            const ativo   = c === diaSel;
            const hj      = ehHoje(c);
            const pilulas = pilulasNoDia(eventosFiltrados, ano, mes, c);
            const extra   = pilulas.length - MAX_PILULAS;

            return (
              <button key={c} onClick={() => setDiaSel(c)} style={{
                borderRadius: 8,
                background: ativo
                  ? 'linear-gradient(135deg, var(--os-acento-1, oklch(0.55 0.18 264)), var(--os-acento-2, oklch(0.50 0.18 220)))'
                  : pilulas.length > 0 ? 'oklch(0.18 0.03 264 / 0.7)' : 'oklch(0.14 0.02 264 / 0.4)',
                border: hj && !ativo
                  ? '1px solid var(--os-acento-1, oklch(0.55 0.18 264))'
                  : '1px solid oklch(0.25 0.04 264 / 0.3)',
                color: ativo ? '#fff' : 'var(--txt-1)', cursor: 'pointer',
                padding: '6px 4px 4px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 2, minHeight: 64,
                transition: 'background 140ms', overflow: 'hidden',
              }}>
                <span style={{ fontSize: 13, fontWeight: hj || ativo ? 700 : 500, lineHeight: 1 }}>{c}</span>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, padding: '0 3px' }}>
                  {pilulas.slice(0, MAX_PILULAS).map((e) => (
                    <div key={e.id} style={{
                      fontSize: 10, fontWeight: 600, lineHeight: 1.2,
                      padding: '2px 4px', borderRadius: 4,
                      background: ativo ? 'rgba(255,255,255,0.22)' : resolverCor(e.cor) + '33',
                      color: ativo ? '#fff' : resolverCor(e.cor),
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                    }}>
                      {!e.dia_inteiro && (
                        <span style={{ opacity: 0.8, marginRight: 2 }}>
                          {new Date(e.inicio_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {e.titulo}
                    </div>
                  ))}
                  {extra > 0 && (
                    <div style={{ fontSize: 10, fontWeight: 600, padding: '1px 4px',
                      color: ativo ? 'rgba(255,255,255,0.7)' : 'oklch(0.60 0.04 264)' }}>
                      +{extra}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel lateral */}
      <PainelDia
        ano={ano} mes={mes} dia={diaSel}
        eventos={eventosFiltrados} salasMap={salasMap}
        onNovoEvento={abrirNovo}
        onEditarEvento={abrirEditar}
        onExcluirEvento={excluirEvento}
        onConcluirEvento={concluirEvento}
        onCancelarEvento={cancelarEvento}
      />

      {/* Modal criar/editar */}
      {modalAberto && (
        <ModalEvento
          evento={eventoEditando}
          diaInicial={{ ano, mes, dia: diaSel }}
          onSalvar={handleSalvar}
          onFechar={fecharModal}
        />
      )}
      </div>
      )}
    </div>
  );
}

export default Agenda;

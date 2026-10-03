// @ts-nocheck
/**
 * PainelDia — painel lateral com eventos do dia selecionado.
 * Props:
 *   ano, mes, dia        — data selecionada
 *   eventos              — array de eventos do mês (filtrado aqui pelo dia)
 *   salasMap             — Map<sala_id, { chave_publica, status }> para reuniões
 *   onNovoEvento         — () => void
 *   onEditarEvento       — (evento) => void
 *   onExcluirEvento      — async (id) => void
 *   onConcluirEvento     — async (id) => void
 *   onCancelarEvento     — async (id) => void
 */
import { Icon } from '@/bundle/bundle-shared';
import { toast } from 'sonner';
import { urlSala } from '@/lib/url-app';
import { formatarHora, formatarDataLonga, resolverCor, mesmodia } from './agenda-datas.js';

const TIPO_LABEL = {
  reuniao:     'Reunião',
  compromisso: 'Compromisso',
  tarefa:      'Tarefa',
  lembrete:    'Lembrete',
  outro:       'Outro',
};

const STATUS_LABEL = {
  pendente:  'Pendente',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

// Link pra MANDAR pro participante — domínio canônico.
function linkSala(chave) {
  return urlSala(chave);
}

function EntradaEvento({ evento, sala, onEditar, onExcluir, onConcluir, onCancelar }) {
  const cor = resolverCor(evento.cor);
  const concluido = evento.status === 'concluido';
  const cancelado = evento.status === 'cancelado';
  const inativo = concluido || cancelado;

  async function copiarLink() {
    if (!sala?.chave_publica) return;
    try {
      await navigator.clipboard.writeText(linkSala(sala.chave_publica));
      toast.success('Link da reunião copiado!');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  }

  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 10,
      background: 'oklch(0.18 0.03 264 / 0.7)',
      borderLeft: `3px solid ${cor}`,
      opacity: inativo ? 0.55 : 1,
      transition: 'opacity 120ms',
    }}>
      {/* Hora + tipo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: cor, fontFamily: 'monospace' }}>
          {formatarHora(evento.inicio_em, evento.dia_inteiro)}
          {evento.fim_em && !evento.dia_inteiro && (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' – '}{formatarHora(evento.fim_em, false)}
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {evento._origem === 'agente' && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'oklch(0.72 0.15 195)',
              background: 'oklch(0.72 0.15 195 / 0.16)', borderRadius: 4, padding: '2px 6px' }}>
              Agente
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 600, color: 'oklch(0.55 0.04 264)',
            background: 'oklch(0.25 0.04 264)', borderRadius: 4, padding: '2px 6px' }}>
            {TIPO_LABEL[evento.tipo] ?? evento.tipo}
          </span>
        </span>
      </div>

      {/* Título */}
      <div style={{ fontSize: 13, fontWeight: 600, color: inativo ? 'oklch(0.55 0.02 264)' : 'var(--txt-1)',
        textDecoration: concluido ? 'line-through' : 'none', marginBottom: 2 }}>
        {evento.titulo}
      </div>

      {/* Status */}
      {inativo && (
        <div style={{ fontSize: 11, color: 'oklch(0.55 0.04 264)', marginBottom: 4 }}>
          {STATUS_LABEL[evento.status]}
        </div>
      )}

      {/* Descrição */}
      {evento.descricao && (
        <div style={{ fontSize: 12, color: 'oklch(0.65 0.03 264)', marginBottom: 6, lineHeight: 1.45 }}>
          {evento.descricao}
        </div>
      )}

      {/* Convidados */}
      {Array.isArray(evento.convidados) && evento.convidados.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {evento.convidados.map((c, i) => (
            <span key={`${c.tipo}-${c.id}-${i}`} style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 999,
              background: c.tipo === 'equipe' ? 'oklch(0.70 0.16 280 / 0.16)' : 'oklch(0.72 0.15 195 / 0.16)',
              color: c.tipo === 'equipe' ? 'oklch(0.74 0.14 280)' : 'oklch(0.74 0.13 195)',
            }}>
              {c.tipo === 'equipe' ? '👤' : '📇'} {c.nome}
            </span>
          ))}
        </div>
      )}

      {/* Botões reunião */}
      {evento.tipo === 'reuniao' && sala?.chave_publica && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button
            onClick={() => window.open(`/sala/${sala.chave_publica}`, '_blank')}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'oklch(0.55 0.18 155)', border: 'none', color: '#fff' }}>
            Entrar na reunião
          </button>
          <button
            onClick={copiarLink}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'oklch(0.22 0.04 264)', border: '1px solid oklch(0.35 0.05 264 / 0.5)', color: 'oklch(0.82 0.03 264)' }}>
            Copiar link
          </button>
        </div>
      )}

      {/* Compromisso do agente: read-only — gerenciado no fluxo da conversa */}
      {evento._readonly && !inativo && (
        <div style={{ fontSize: 11, color: 'oklch(0.55 0.04 264)', marginTop: 6, fontStyle: 'italic' }}>
          Marcado pelo agente — gerencie pela conversa.
        </div>
      )}

      {/* Ações */}
      {!inativo && !evento._readonly && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button onClick={() => onEditar(evento)}
            title="Editar" style={btnAcao}>
            <Icon name="pencil" size={12} />
          </button>
          <button onClick={() => onConcluir(evento.id)}
            title="Concluir" style={btnAcao}>
            <Icon name="check" size={12} />
          </button>
          <button onClick={() => onCancelar(evento.id)}
            title="Cancelar" style={btnAcao}>
            <Icon name="x" size={12} />
          </button>
          <button onClick={() => onExcluir(evento.id)}
            title="Excluir" style={{ ...btnAcao, color: 'oklch(0.65 0.18 25)' }}>
            <Icon name="trash" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

const btnAcao = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: 'oklch(0.22 0.04 264)', border: '1px solid oklch(0.32 0.05 264 / 0.4)',
  color: 'oklch(0.78 0.03 264)', transition: 'background 120ms',
};

export default function PainelDia({ ano, mes, dia, eventos, salasMap, onNovoEvento, onEditarEvento, onExcluirEvento, onConcluirEvento, onCancelarEvento }) {
  const eventosNoDia = eventos.filter((e) => mesmodia(e.inicio_em, ano, mes, dia));
  eventosNoDia.sort((a, b) => {
    if (a.dia_inteiro && !b.dia_inteiro) return -1;
    if (!a.dia_inteiro && b.dia_inteiro) return 1;
    return new Date(a.inicio_em).getTime() - new Date(b.inicio_em).getTime();
  });

  const dataBr = new Date(ano, mes, dia).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div style={{ width: 300, borderLeft: '1px solid oklch(0.25 0.05 264 / 0.5)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Cabeçalho */}
      <div style={{ padding: '16px 18px 10px', borderBottom: '1px solid oklch(0.25 0.05 264 / 0.3)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.55 0.04 264)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
          {new Date(ano, mes, dia).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--txt-1)', textTransform: 'capitalize' }}>
          {new Date(ano, mes, dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Lista de eventos */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {eventosNoDia.length === 0 && (
          <div style={{ textAlign: 'center', color: 'oklch(0.55 0.03 264)', fontSize: 13, padding: '32px 0' }}>
            <div style={{ marginBottom: 8, opacity: 0.5 }}>Nenhum evento aqui.</div>
            <button onClick={onNovoEvento} style={{
              fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
              background: 'oklch(0.22 0.04 264)', border: '1px solid oklch(0.35 0.05 264 / 0.5)',
              color: 'oklch(0.78 0.03 264)',
            }}>
              + Criar evento neste dia
            </button>
          </div>
        )}
        {eventosNoDia.map((e) => (
          <EntradaEvento
            key={e.id}
            evento={e}
            sala={e.sala_reuniao_id ? salasMap.get(e.sala_reuniao_id) : null}
            onEditar={onEditarEvento}
            onExcluir={onExcluirEvento}
            onConcluir={onConcluirEvento}
            onCancelar={onCancelarEvento}
          />
        ))}
      </div>

      {/* Botão novo evento */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid oklch(0.25 0.05 264 / 0.3)' }}>
        <button onClick={onNovoEvento} style={{
          width: '100%', padding: '9px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
          background: 'linear-gradient(135deg, var(--os-acento-1, oklch(0.6 0.18 264)), var(--os-acento-2, oklch(0.55 0.18 220)))',
          border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <Icon name="plus" size={13} /> Novo evento
        </button>
      </div>
    </div>
  );
}

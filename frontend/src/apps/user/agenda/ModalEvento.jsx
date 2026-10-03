// @ts-nocheck
/**
 * Modal criar / editar evento da Agenda.
 * Props:
 *   evento      — objeto do evento pra editar (null = criação)
 *   diaInicial  — { ano, mes, dia } para pré-preencher data na criação
 *   onSalvar    — async (dados) => void
 *   onFechar    — () => void
 */
import { useEffect, useState } from 'react';
import { Icon } from '@/bundle/bundle-shared';
import { paraDatetimeLocal, datetimeLocalParaISO } from './agenda-datas.js';
import SeletorConvidados from './seletor-convidados.jsx';

const TIPOS = [
  { valor: 'reuniao',     label: 'Reunião' },
  { valor: 'compromisso', label: 'Compromisso' },
  { valor: 'tarefa',      label: 'Tarefa' },
  { valor: 'lembrete',    label: 'Lembrete' },
  { valor: 'outro',       label: 'Outro' },
];

const CORES = [
  { valor: 'azul',     label: 'Azul',     css: 'oklch(0.70 0.18 220)' },
  { valor: 'verde',    label: 'Verde',    css: 'oklch(0.72 0.18 145)' },
  { valor: 'vermelho', label: 'Vermelho', css: 'oklch(0.65 0.22 25)'  },
  { valor: 'roxo',     label: 'Roxo',     css: 'oklch(0.65 0.22 280)' },
  { valor: 'amarelo',  label: 'Amarelo',  css: 'oklch(0.78 0.18 80)'  },
];

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: 'oklch(0.14 0.03 264)',
    border: '1px solid oklch(0.30 0.05 264 / 0.6)',
    borderRadius: 16,
    padding: 24,
    width: 420,
    maxWidth: '92vw',
    maxHeight: '90vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  label: { fontSize: 12, fontWeight: 600, color: 'oklch(0.65 0.04 264)', marginBottom: 4, display: 'block' },
  input: {
    background: 'oklch(0.18 0.03 264)',
    border: '1px solid oklch(0.32 0.05 264 / 0.5)',
    borderRadius: 8, padding: '8px 10px',
    color: 'oklch(0.88 0.02 264)', fontSize: 13, width: '100%', boxSizing: 'border-box',
  },
  select: {
    background: 'oklch(0.18 0.03 264)',
    border: '1px solid oklch(0.32 0.05 264 / 0.5)',
    borderRadius: 8, padding: '8px 10px',
    color: 'oklch(0.88 0.02 264)', fontSize: 13, width: '100%', boxSizing: 'border-box',
    cursor: 'pointer',
  },
  textarea: {
    background: 'oklch(0.18 0.03 264)',
    border: '1px solid oklch(0.32 0.05 264 / 0.5)',
    borderRadius: 8, padding: '8px 10px',
    color: 'oklch(0.88 0.02 264)', fontSize: 13, width: '100%', boxSizing: 'border-box',
    resize: 'vertical', minHeight: 72,
  },
  btnPrimario: {
    padding: '9px 18px', background: 'oklch(0.55 0.18 155)',
    border: 'none', borderRadius: 8, color: '#fff',
    fontWeight: 600, fontSize: 13, cursor: 'pointer', flex: 1,
  },
  btnSecundario: {
    padding: '9px 14px', background: 'oklch(0.22 0.04 264 / 0.8)',
    border: '1px solid oklch(0.35 0.06 264 / 0.5)', borderRadius: 8,
    color: 'oklch(0.82 0.03 264)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
  },
};

function inicioParaInput(evento, diaInicial) {
  if (evento?.inicio_em) return paraDatetimeLocal(evento.inicio_em);
  if (diaInicial) {
    const { ano, mes, dia } = diaInicial;
    const pad = (n) => String(n).padStart(2, '0');
    return `${ano}-${pad(mes + 1)}-${pad(dia)}T09:00`;
  }
  return '';
}

export default function ModalEvento({ evento, diaInicial, onSalvar, onFechar }) {
  const editando = !!evento;
  const [titulo,     setTitulo]     = useState(evento?.titulo     ?? '');
  const [tipo,       setTipo]       = useState(evento?.tipo       ?? 'tarefa');
  const [inicio,     setInicio]     = useState(() => inicioParaInput(evento, diaInicial));
  const [fim,        setFim]        = useState(evento?.fim_em ? paraDatetimeLocal(evento.fim_em) : '');
  const [diaInteiro, setDiaInteiro] = useState(evento?.dia_inteiro ?? false);
  const [descricao,  setDescricao]  = useState(evento?.descricao  ?? '');
  const [cor,        setCor]        = useState(evento?.cor        ?? 'azul');
  const [convidados, setConvidados] = useState(() => (Array.isArray(evento?.convidados) ? evento.convidados : []));
  const [criarSala,  setCriarSala]  = useState(false);
  const [salvando,   setSalvando]   = useState(false);

  // fecha com Esc
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onFechar]);

  async function handleSalvar(e) {
    e.preventDefault();
    if (!titulo.trim()) return;
    if (!inicio) return;
    setSalvando(true);
    try {
      await onSalvar({
        titulo: titulo.trim(),
        tipo,
        inicio_em: datetimeLocalParaISO(inicio),
        fim_em: fim ? datetimeLocalParaISO(fim) : null,
        dia_inteiro: diaInteiro,
        descricao: descricao.trim() || null,
        cor,
        convidados,
        criar_sala: criarSala && tipo === 'reuniao',
      });
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <form style={s.modal} onSubmit={handleSalvar}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{editando ? 'Editar evento' : 'Novo evento'}</span>
          <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'oklch(0.65 0.04 264)', padding: 4 }} onClick={onFechar}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Título */}
        <div>
          <label style={s.label}>Título *</label>
          <input style={s.input} value={titulo} onChange={(e) => setTitulo(e.target.value)}
            placeholder="Nome do evento" required autoFocus />
        </div>

        {/* Tipo */}
        <div>
          <label style={s.label}>Tipo</label>
          <select style={s.select} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
        </div>

        {/* Sala do app Reunião (só em reunião) */}
        {tipo === 'reuniao' && !editando && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={criarSala} onChange={(e) => setCriarSala(e.target.checked)} />
            Gerar sala de reunião (link do app Reunião)
          </label>
        )}
        {tipo === 'reuniao' && editando && evento?.sala_reuniao_id && (
          <div className="muted" style={{ fontSize: 12 }}>
            Sala de reunião já vinculada — o link fica no painel do dia.
          </div>
        )}

        {/* Dia inteiro */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} />
          Dia inteiro
        </label>

        {/* Início */}
        {!diaInteiro && (
          <div>
            <label style={s.label}>Início *</label>
            <input style={s.input} type="datetime-local" value={inicio}
              onChange={(e) => setInicio(e.target.value)} required />
          </div>
        )}
        {diaInteiro && (
          <div>
            <label style={s.label}>Data *</label>
            <input style={s.input} type="date" value={inicio.slice(0, 10)}
              onChange={(e) => setInicio(e.target.value + 'T00:00')} required />
          </div>
        )}

        {/* Fim (só se não for dia inteiro) */}
        {!diaInteiro && (
          <div>
            <label style={s.label}>Fim (opcional)</label>
            <input style={s.input} type="datetime-local" value={fim}
              onChange={(e) => setFim(e.target.value)} />
          </div>
        )}

        {/* Descrição */}
        <div>
          <label style={s.label}>Descrição (opcional)</label>
          <textarea style={s.textarea} value={descricao}
            onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes, links, observações…" />
        </div>

        {/* Convidados: contatos da plataforma + equipe */}
        <div>
          <label style={s.label}>Convidados</label>
          <SeletorConvidados convidados={convidados} onChange={setConvidados} />
        </div>

        {/* Cor */}
        <div>
          <label style={s.label}>Cor</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CORES.map((c) => (
              <button key={c.valor} type="button"
                title={c.label}
                onClick={() => setCor(c.valor)}
                style={{
                  width: 28, height: 28, borderRadius: '50%', background: c.css,
                  border: cor === c.valor ? '3px solid #fff' : '2px solid transparent',
                  cursor: 'pointer', transition: 'border 120ms',
                }} />
            ))}
          </div>
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" style={s.btnSecundario} onClick={onFechar}>Cancelar</button>
          <button type="submit" style={{ ...s.btnPrimario, opacity: salvando ? 0.6 : 1 }} disabled={salvando}>
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar evento'}
          </button>
        </div>
      </form>
    </div>
  );
}

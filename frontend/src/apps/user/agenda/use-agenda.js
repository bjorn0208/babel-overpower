// @ts-nocheck
/**
 * Hook `useAgenda` — toda a lógica de dados do app Agenda.
 * Isola fetch, realtime, create, edit, delete, concluir, cancelar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { inicioMes, fimMes } from './agenda-datas.js';

function hoje() {
  const d = new Date();
  return { ano: d.getFullYear(), mes: d.getMonth(), dia: d.getDate() };
}

// Mapeia um compromisso do AGENTE (tabela `compromissos`, marcado com lead na conversa)
// pro formato de evento da Agenda. Read-only: a UI não deixa editar/excluir — quem
// manda neles é o fluxo do agente. Distinguido pela cor 'agente' + flag _origem.
const STATUS_COMPROMISSO = { pendente: 'pendente', cumprido: 'concluido', cancelado: 'cancelado' };

function mapearCompromisso(c) {
  const fimEm = c.duracao_min && c.scheduled_at
    ? new Date(new Date(c.scheduled_at).getTime() + c.duracao_min * 60000).toISOString()
    : null;
  const detalhes = [
    c.local_presencial ? `Local: ${c.local_presencial}` : null,
    c.link_call ? `Link: ${c.link_call}` : null,
  ].filter(Boolean).join(' · ');
  return {
    id: `compromisso-${c.id}`,
    _origem: 'agente',
    _readonly: true,
    titulo: c.descricao,
    descricao: detalhes || null,
    tipo: 'compromisso',
    inicio_em: c.scheduled_at,
    fim_em: fimEm,
    dia_inteiro: false,
    cor: 'agente',
    status: STATUS_COMPROMISSO[c.status] ?? 'pendente',
    sala_reuniao_id: null,
  };
}

export function useAgenda() {
  const agora = hoje();

  const [mesAtual, setMesAtual]   = useState({ ano: agora.ano, mes: agora.mes });
  const [diaSel,   setDiaSel]     = useState(agora.dia);
  const [eventos,  setEventos]    = useState([]);
  const [salasMap, setSalasMap]   = useState(new Map());
  const [carregando, setCarregando] = useState(true);

  const canalRef = useRef(null);

  // ── carregar eventos ────────────────────────────────────────────────────

  const carregarEventos = useCallback(async (ano, mes) => {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from('eventos_agenda')
        .select('*')
        .is('deleted_at', null)
        .gte('inicio_em', inicioMes(ano, mes))
        .lte('inicio_em', fimMes(ano, mes))
        .order('inicio_em');

      if (error) {
        console.error('[Agenda] carregar:', error);
        toast.error('Erro ao carregar eventos da agenda.');
        return;
      }

      const lista = data ?? [];

      // Compromissos marcados pelo agente (tabela própria) — read-only no calendário.
      // RLS já isola por tenant + equipe (mesmo padrão de eventos_agenda).
      const { data: comps } = await supabase
        .from('compromissos')
        .select('id, descricao, scheduled_at, duracao_min, status, local_presencial, link_call, lead_id')
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', inicioMes(ano, mes))
        .lte('scheduled_at', fimMes(ano, mes));

      setEventos([...lista, ...(comps ?? []).map(mapearCompromisso)]);

      // buscar salas referenciadas
      const idsReuniao = [...new Set(
        lista
          .filter((e) => e.tipo === 'reuniao' && e.sala_reuniao_id)
          .map((e) => e.sala_reuniao_id),
      )];

      if (idsReuniao.length > 0) {
        const { data: salas } = await supabase
          .from('salas_reuniao')
          .select('id, chave_publica, status')
          .in('id', idsReuniao);

        const mapa = new Map();
        (salas ?? []).forEach((s) => mapa.set(s.id, s));
        setSalasMap(mapa);
      } else {
        setSalasMap(new Map());
      }
    } finally {
      setCarregando(false);
    }
  }, []);

  // ── realtime + carga inicial ────────────────────────────────────────────

  useEffect(() => {
    const { ano, mes } = mesAtual;
    carregarEventos(ano, mes);

    const canal = supabase
      .channel(`agenda-${ano}-${mes}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_agenda' }, () => {
        carregarEventos(ano, mes);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compromissos' }, () => {
        carregarEventos(ano, mes);
      })
      .subscribe();

    canalRef.current = canal;

    return () => {
      if (canalRef.current) {
        supabase.removeChannel(canalRef.current);
        canalRef.current = null;
      }
    };
  }, [mesAtual, carregarEventos]);

  // ── navegação ───────────────────────────────────────────────────────────

  function irParaMes(delta) {
    setMesAtual(({ ano, mes }) => {
      const d = new Date(ano, mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
    setDiaSel(1);
  }

  function irParaHoje() {
    setMesAtual({ ano: agora.ano, mes: agora.mes });
    setDiaSel(agora.dia);
  }

  // ── criar / editar ──────────────────────────────────────────────────────

  async function salvarEvento(dados, eventoEditando) {
    if (eventoEditando) {
      const { error } = await supabase
        .from('eventos_agenda')
        .update({
          titulo:      dados.titulo,
          tipo:        dados.tipo,
          inicio_em:   dados.inicio_em,
          fim_em:      dados.fim_em,
          dia_inteiro: dados.dia_inteiro,
          descricao:   dados.descricao,
          cor:         dados.cor,
          convidados:  Array.isArray(dados.convidados) ? dados.convidados : [],
        })
        .eq('id', eventoEditando.id);

      if (error) {
        console.error('[Agenda] editar:', error);
        toast.error('Erro ao salvar alterações.');
        throw error;
      }
      toast.success('Evento atualizado.');
    } else {
      const { error } = await supabase.rpc('criar_evento_agenda', {
        p_titulo:      dados.titulo,
        p_inicio_em:   dados.inicio_em,
        p_tipo:        dados.tipo,
        p_fim_em:      dados.fim_em ?? null,
        p_descricao:   dados.descricao ?? null,
        p_dia_inteiro: dados.dia_inteiro,
        p_cor:         dados.cor,
        p_convidados:  Array.isArray(dados.convidados) ? dados.convidados : [],
        p_criar_sala:  dados.criar_sala === true,
      });

      if (error) {
        console.error('[Agenda] criar:', error);
        toast.error('Erro ao criar evento.');
        throw error;
      }
      toast.success('Evento criado!');
    }

    await carregarEventos(mesAtual.ano, mesAtual.mes);
  }

  // ── excluir (soft delete) ───────────────────────────────────────────────

  async function excluirEvento(id) {
    if (!window.confirm('Excluir este evento? Não dá pra desfazer.')) return;
    const { error } = await supabase
      .from('eventos_agenda')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[Agenda] excluir:', error);
      toast.error('Erro ao excluir evento.');
      return;
    }
    toast.success('Evento excluído.');
    setEventos((prev) => prev.filter((e) => e.id !== id));
  }

  // ── concluir ────────────────────────────────────────────────────────────

  async function concluirEvento(id) {
    const { error } = await supabase
      .from('eventos_agenda')
      .update({ status: 'concluido' })
      .eq('id', id);

    if (error) {
      console.error('[Agenda] concluir:', error);
      toast.error('Erro ao concluir evento.');
      return;
    }
    toast.success('Evento concluído.');
    setEventos((prev) => prev.map((e) => e.id === id ? { ...e, status: 'concluido' } : e));
  }

  // ── cancelar ────────────────────────────────────────────────────────────

  async function cancelarEvento(id) {
    const { error } = await supabase
      .from('eventos_agenda')
      .update({ status: 'cancelado' })
      .eq('id', id);

    if (error) {
      console.error('[Agenda] cancelar:', error);
      toast.error('Erro ao cancelar evento.');
      return;
    }
    toast.success('Evento cancelado.');
    setEventos((prev) => prev.map((e) => e.id === id ? { ...e, status: 'cancelado' } : e));
  }

  return {
    agora,
    mesAtual, setMesAtual,
    diaSel,   setDiaSel,
    eventos,  salasMap,
    carregando,
    irParaMes, irParaHoje,
    salvarEvento, excluirEvento, concluirEvento, cancelarEvento,
  };
}

// @ts-nocheck
/**
 * Helpers de datas para o app Agenda.
 * Trabalha em horário local (BRT para o Theus).
 * Sem dependências externas.
 */

/** Retorna a data de início do mês (dia 1, 00:00:00 local) como ISO. */
export function inicioMes(ano, mes) {
  return new Date(ano, mes, 1, 0, 0, 0, 0).toISOString();
}

/** Retorna a data de fim do mês (último dia, 23:59:59 local) como ISO. */
export function fimMes(ano, mes) {
  const ultimo = new Date(ano, mes + 1, 0); // dia 0 do mês seguinte = último do mês atual
  ultimo.setHours(23, 59, 59, 999);
  return ultimo.toISOString();
}

/** Quantidade de dias no mês. */
export function diasNoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

/** Dia da semana do primeiro dia do mês (0=Dom, 6=Sáb). */
export function primeiroDiaSemana(ano, mes) {
  return new Date(ano, mes, 1).getDay();
}

/** Formata data ISO para exibição curta: "09:30" ou "dia todo". */
export function formatarHora(isoString, diaInteiro) {
  if (diaInteiro) return 'dia todo';
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Formata data ISO para datetime-local input (YYYY-MM-DDTHH:mm). */
export function paraDatetimeLocal(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

/** Converte datetime-local string para ISO (horário local → UTC). */
export function datetimeLocalParaISO(valor) {
  if (!valor) return null;
  try {
    return new Date(valor).toISOString();
  } catch {
    return null;
  }
}

/** Verifica se duas datas ISO são do mesmo dia (local). */
export function mesmodia(isoA, ano, mes, dia) {
  if (!isoA) return false;
  try {
    const d = new Date(isoA);
    return d.getFullYear() === ano && d.getMonth() === mes && d.getDate() === dia;
  } catch {
    return false;
  }
}

/** Retorna cor CSS OKLch para cada cor nomeada do evento. */
export const COR_EVENTO = {
  azul:      'oklch(0.70 0.18 220)',
  verde:     'oklch(0.72 0.18 145)',
  vermelho:  'oklch(0.65 0.22 25)',
  roxo:      'oklch(0.65 0.22 280)',
  amarelo:   'oklch(0.78 0.18 80)',
  agente:    'oklch(0.72 0.15 195)', // compromisso marcado pelo agente (ciano — read-only)
};

/** Cor padrão se não estiver no mapa. */
export function resolverCor(cor) {
  return COR_EVENTO[cor] ?? COR_EVENTO.azul;
}

/** Formata data/hora para exibição longa: "ter, 13 mai · 09:30". */
export function formatarDataLonga(isoString, diaInteiro) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const data = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
    if (diaInteiro) return data + ' · dia todo';
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${data} · ${hora}`;
  } catch {
    return '';
  }
}

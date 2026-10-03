// Tipos locais do app Sócio Comercial (multinível)

export type SaqueRegras = {
  saque_regras_ativo: boolean
  saque_dia_semana: number
  saque_hora_inicio: string
  saque_hora_fim: string
  saque_valor_minimo: number
}

export type Comissao = {
  id: string
  origem_id: string
  nivel: number
  percentual: number
  valor_base: number
  valor_comissao: number
  status: string
  created_at: string
  origem_nome?: string
}

export type Saque = {
  id: string
  valor: number
  status: 'pendente' | 'pago' | 'recusado'
  chave_pix: string
  created_at: string
}

export type Indicado = {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  created_at: string
  multinivel_ativo: boolean
  sub_indicados?: number
}

export type PerfilSocio = {
  id: string
  parent_user_id: string | null
  full_name: string | null
  email: string | null
  referral_code: string | null
  saldo_multinivel: number
  multinivel_ativo: boolean
  chave_pix: string | null
  tipo_pessoa: 'pf' | 'pj' | null
  document: string | null
  cnpj: string | null
  razao_social: string | null
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function checkSaquePermitido(regras: SaqueRegras | null): { permitido: boolean; motivo: string } {
  if (!regras || !regras.saque_regras_ativo) return { permitido: true, motivo: '' }
  const now = new Date()
  const diaSemana = now.getDay()
  const horaAtual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (diaSemana !== regras.saque_dia_semana) {
    return { permitido: false, motivo: `Saques somente ${DIAS[regras.saque_dia_semana]}` }
  }
  if (horaAtual < regras.saque_hora_inicio || horaAtual > regras.saque_hora_fim) {
    return { permitido: false, motivo: `Horário: ${regras.saque_hora_inicio} - ${regras.saque_hora_fim}` }
  }
  return { permitido: true, motivo: '' }
}

export function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function iniciais(nome: string | null | undefined): string {
  const p = String(nome || '?').trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?'
}

// Roteiro da ligação — o padrão de fábrica. O time pode reescrever tudo em
// Gestão → Mentoria → Roteiro da ligação (config `roteiro_call`), sem depender
// de código: as duas partes, os passos e quem fala cada frase.
//
// Marcadores que o sistema troca na hora da ligação:
//   {vendedor} → primeiro nome de quem está ligando
//   {decisor}  → dono levantado no dossiê (ou quem atendeu)
//   {empresa}  → empresa do lead
export const ROTEIRO_PADRAO = [
  {
    id: 'atendente',
    rotulo: 'Atendente',
    resumo: 'passar pelo filtro',
    passos: [
      { de: 'eles', titulo: 'O alô da atendente', fala: '{empresa}, bom dia.', exemplo: true },
      { de: 'voce', titulo: 'Sua abordagem', fala: 'Bom dia. Aqui é o {vendedor}. O {decisor} está, por favor?' },
      { de: 'eles', titulo: 'O filtro dela', fala: 'Qual o assunto?' },
      { de: 'voce', titulo: 'Sua resposta executiva',
        fala: 'É referente ao processo de automação do atendimento de vocês. '
          + 'Preciso fazer um alinhamento rápido diretamente com ele.' },
      { de: 'voce', titulo: 'O comando de transferência',
        fala: 'Consegue transferir um minuto para ele, por favor?' },
    ],
  },
  {
    id: 'decisor',
    rotulo: 'Dono / Gerente / Comercial',
    resumo: 'agendar a apresentação',
    passos: [
      { de: 'eles', titulo: 'O alô do decisor', fala: 'Alô, pois não?', exemplo: true },
      { de: 'voce', titulo: 'Abertura de impacto',
        fala: 'Olá, {decisor}. Aqui é o {vendedor}. Sei que seu dia é corrido, então serei bem direto. '
          + 'Posso tomar 1 minuto do seu tempo?' },
      { de: 'voce', titulo: 'O gancho — a dor',
        fala: 'Estou ligando porque notei que vocês podem estar perdendo vendas por não terem '
          + 'um atendimento imediato e inteligente para os clientes no WhatsApp.' },
      { de: 'voce', titulo: 'A promessa',
        fala: 'Nós implementamos agentes de inteligência artificial que atendem, qualificam e vendem '
          + 'para os seus clientes 24 horas por dia, de forma automática.' },
      { de: 'voce', titulo: 'O agendamento',
        fala: 'O objetivo dessa ligação não é te vender o sistema agora, mas sim te mostrar como ele '
          + 'funciona na prática. Podemos fazer uma chamada de vídeo rápida de 15 minutos? '
          + 'Tenho disponibilidade amanhã às 10h ou às 14h. Qual horário fica melhor para você?' },
    ],
  },
]

// Um roteiro salvo pela Gestão pode vir de qualquer jeito (campo apagado,
// passo sem fala). Aqui ele volta ao formato que a tela de ligação espera —
// vendedor no meio de uma chamada não pode ver a tela quebrar.
export function normalizarRoteiro(bruto) {
  if (!Array.isArray(bruto)) return null
  const partes = bruto
    .map((p, i) => ({
      id: String(p?.id || `parte${i + 1}`),
      rotulo: String(p?.rotulo || '').trim(),
      resumo: String(p?.resumo || '').trim(),
      passos: Array.isArray(p?.passos)
        ? p.passos
          .filter((s) => String(s?.fala || '').trim())
          .map((s) => ({
            de: s?.de === 'eles' ? 'eles' : 'voce',
            titulo: String(s?.titulo || '').trim(),
            fala: String(s.fala).trim(),
            exemplo: !!s?.exemplo,
          }))
        : [],
    }))
    .filter((p) => p.rotulo && p.passos.length)
  return partes.length ? partes : null
}

// o roteiro da EQUIPE (Gestão → Mentoria), que é de onde todo mundo parte
export async function carregarRoteiro(supabase) {
  try {
    const { data } = await supabase.from('config').select('valor')
      .eq('chave', 'roteiro_call').maybeSingle()
    const partes = normalizarRoteiro(JSON.parse(data?.valor || ''))
    if (partes) return partes
  } catch { /* sem config válida → padrão de fábrica */ }
  return ROTEIRO_PADRAO
}

// O que a tela de ligação usa: MEU script; sem ele, o da equipe; sem ele, o de
// fábrica. Devolve também de onde veio, para a tela poder dizer isso à pessoa.
export async function carregarRoteiroDaLigacao(supabase, userId) {
  if (userId) {
    try {
      const { data } = await supabase.from('roteiros_call').select('partes')
        .eq('user_id', userId).maybeSingle()
      const meu = normalizarRoteiro(data?.partes)
      if (meu) return { partes: meu, origem: 'meu' }
    } catch { /* sem script pessoal → segue para o da equipe */ }
  }
  const equipe = await carregarRoteiro(supabase)
  return { partes: equipe, origem: equipe === ROTEIRO_PADRAO ? 'fabrica' : 'equipe' }
}

export async function salvarMeuRoteiro(supabase, userId, partes) {
  const limpo = normalizarRoteiro(partes)
  if (!limpo) return { error: { message: 'Cada parte precisa de um nome e ao menos uma fala.' } }
  const { error } = await supabase.from('roteiros_call').upsert(
    { user_id: userId, partes: limpo, atualizado_em: new Date().toISOString() },
    { onConflict: 'user_id' })
  return { error, partes: limpo }
}

// volta a seguir o script da equipe: some a linha pessoal
export async function apagarMeuRoteiro(supabase, userId) {
  return supabase.from('roteiros_call').delete().eq('user_id', userId)
}

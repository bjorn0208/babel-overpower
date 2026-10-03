import { useState } from 'react'

// Prancheta do lead — o dossiê inteiro organizado em seções, no estilo da
// Ficha Unificada da Babel OS: o mentor entra na call e vê tudo de uma vez.
const SECOES = [
  ['Resumo e diagnóstico', [['resumo', 'Resumo'], ['diagnostico', 'Diagnóstico']]],
  ['Dados cadastrais', [['razao_social', 'Razão social'], ['cnpj', 'CNPJ'],
    ['situacao_cadastral', 'Situação'], ['data_abertura', 'Abertura']]],
  ['Presença digital', [['presenca', 'Visão geral'], ['site', 'Site'],
    ['google_meu_negocio', 'Google Meu Negócio'], ['avaliacao_google', 'Avaliação Google'],
    ['reclame_aqui', 'Reclame Aqui']]],
  ['Instagram', [['instagram', 'Perfil'], ['instagram_bio', 'Bio'],
    ['instagram_seguidores', 'Seguidores'], ['posts_recentes', 'Posts recentes']]],
  ['Quem atende e decide', [['nome_atendente', 'Contato'], ['cargo', 'Cargo'],
    ['cargo_atendente', 'Cargo'], ['nome_dono', 'Dono'], ['canal_contato', 'Canal preferido']]],
  ['Como atendem hoje', [['como_atendem', 'Atendimento'], ['sistema_atual', 'Sistema'],
    ['ferramentas_atuais', 'Ferramentas']]],
  ['Dor e desejo', [['dor', 'Dor'], ['desejo', 'Desejo']]],
  ['O que os clientes dizem', [['elogios', 'Elogios'], ['reclamacoes', 'Reclamações'],
    ['melhores_avaliacoes', 'Melhores avaliações']]],
  ['Qualificação da call', [['ambicao', 'Ambição'], ['concorrentes', 'Concorrentes'],
    ['empresas_inspiram', 'Empresas que inspiram'], ['qtd_funcionarios', 'Funcionários'],
    ['maiores_dificuldades', 'Maiores dificuldades'],
    ['principais_capacidades', 'Principais capacidades'],
    ['experiencias_ia', 'Experiências com IA']]],
]

function texto(v) {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' · ')
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(' · ')
  return String(v)
}

function Secao({ titulo, linhas }) {
  const [aberta, setAberta] = useState(true)
  return (
    <div className="rounded-xl border border-line bg-surface-2/60">
      <button onClick={() => setAberta(!aberta)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-2">
        {titulo}
        <span className="text-ink-3">{aberta ? '▲' : '▼'}</span>
      </button>
      {aberta && (
        <div className="px-3 pb-2.5 space-y-1">
          {linhas.map(([rotulo, valor]) => (
            <p key={rotulo + valor.slice(0, 12)} className="text-xs leading-relaxed">
              <span className="text-ink-3">{rotulo}:</span>{' '}
              <span className="whitespace-pre-wrap">{valor}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Prancheta({ dossie, contatoNome, empresa, extras }) {
  const d = { ...(dossie || {}) }
  if (contatoNome && !d.nome_atendente) d.nome_atendente = contatoNome
  // `extras` = perguntas configuradas [[chave, rotulo]] — substituem a lista
  // fixa da seção de qualificação para refletir o que a Gestão escolheu
  const base = extras?.length
    ? SECOES.map(([t, c]) => (t === 'Qualificação da call' ? [t, extras] : [t, c]))
    : SECOES
  const secoes = base.map(([titulo, campos]) => {
    const vistos = new Set()
    const linhas = campos
      .filter(([chave]) => {
        if (vistos.has(chave) || !texto(d[chave])) return false
        vistos.add(chave)
        return true
      })
      .map(([chave, rotulo]) => [rotulo, texto(d[chave])])
    return [titulo, linhas]
  }).filter(([, linhas]) => linhas.length > 0)

  if (!secoes.length) {
    return (
      <p className="text-xs text-ink-3 px-1">
        Nada levantado ainda — rode o levantamento na ficha do lead (CRM) antes da call.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {empresa && <p className="text-sm font-bold px-1">{empresa}</p>}
      {secoes.map(([titulo, linhas]) => (
        <Secao key={titulo} titulo={titulo} linhas={linhas} />
      ))}
    </div>
  )
}

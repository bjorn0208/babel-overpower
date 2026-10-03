import { cn } from './ui'

// Dossiê de prospecção organizado para quem vai ligar: 5 blocos, na ordem
// em que o mentor precisa deles durante a conversa.
export const BLOCOS_DOSSIE = [
  ['Para abrir a ligação', [
    ['gancho', 'Gancho'],
    ['diagnostico', 'Onde a Babel ajuda'],
  ]],
  ['Quem é a empresa', [
    ['razao_social', 'Razão social'],
    ['cnpj', 'CNPJ'],
    ['situacao_cadastral', 'Situação'],
    ['nome_dono', 'Dono'],
    ['socios', 'Quadro societário'],
    ['atividade', 'Atividade principal'],
    ['porte', 'Porte'],
    ['data_abertura', 'Abertura'],
    ['capital_social', 'Capital social'],
  ]],
  ['Como atendem hoje', [
    ['canal_contato', 'Canal de contato'],
    ['sistema_atual', 'Sistema em uso'],
    ['como_atendem', 'Como funciona'],
  ]],
  ['Reputação', [
    ['avaliacao_google', 'Nota no Google'],
    ['avaliacoes_lidas', 'Amostra'],
    ['elogios', 'O que elogiam'],
    ['reclamacoes', 'O que reclamam'],
    ['piores_avaliacoes', 'Piores avaliações (texto real)'],
    ['melhores_avaliacoes', 'Melhores avaliações (texto real)'],
    ['reclame_aqui', 'Reclame Aqui'],
    ['processos_judiciais', 'JusBrasil'],
  ]],
  ['Presença digital', [
    ['instagram', 'Instagram'],
    ['instagram_seguidores', 'Seguidores'],
    ['instagram_bio', 'Bio'],
    ['link_bio', 'Link da bio'],
    ['posts_recentes', 'Posts recentes'],
    ['site', 'Site'],
    ['google_meu_negocio', 'Google Meu Negócio'],
    ['presenca', 'Resumo da presença'],
  ]],
  ['Da conversa', [
    ['nome_atendente', 'Quem atendeu'],
    ['cargo_atendente', 'Cargo'],
    ['telefone_contato', 'Telefone de contato'],
    ['email_contato', 'E-mail de contato'],
    ['nome_dono', 'Nome do dono'],
    ['dor', 'Dor da empresa'],
    ['desejo', 'Desejo da empresa'],
    ['ferramentas_atuais', 'Usa hoje'],
    ['orcamento', 'Orçamento'],
    ['objecoes', 'Objeções'],
    ['melhor_horario', 'Melhor horário'],
    ['proximo_passo', 'Próximo passo'],
    ['temperatura', 'Temperatura'],
    ['resumo', 'Resumo'],
  ]],
]

// Rótulos do dossiê na ordem em que fazem sentido ler
export const CAMPOS_DOSSIE = [
  ['nome_atendente', 'Quem atendeu'],
  ['cargo_atendente', 'Cargo'],
  ['nome_dono', 'Nome do dono'],
  ['empresa', 'Empresa'],
  ['dor', 'Dor da empresa'],
  ['desejo', 'Desejo da empresa'],
  ['ferramentas_atuais', 'Usa hoje'],
  ['orcamento', 'Orçamento'],
  ['objecoes', 'Objeções'],
  ['melhor_horario', 'Melhor horário'],
  ['proximo_passo', 'Próximo passo'],
  ['temperatura', 'Temperatura'],
  ['resumo', 'Resumo'],
  // dossiê de prospecção — dados públicos levantados pelo botão Levantar dados
  ['razao_social', 'Razão social'],
  ['cnpj', 'CNPJ'],
  ['situacao_cadastral', 'Situação'],
  ['data_abertura', 'Abertura'],
  ['capital_social', 'Capital social'],
  ['porte', 'Porte'],
  ['socios', 'Sócios'],
  ['instagram', 'Instagram'],
  ['instagram_seguidores', 'Seguidores'],
  ['site', 'Site'],
  ['avaliacao_google', 'Google'],
  ['elogios', 'O que os clientes elogiam'],
  ['reclamacoes', 'O que reclamam'],
  ['posts_recentes', 'Posts recentes'],
  ['presenca', 'Presença digital'],
  ['diagnostico', 'Onde a Babel ajuda'],
]

const COR_TEMPERATURA = { quente: 'text-danger', morno: 'text-amber', frio: 'text-sky' }

// Empresa baixada/inapta é ligação perdida: o vendedor precisa ver isso antes
// de discar, não depois de dois minutos de conversa.
const ATIVA = /ativa/i
function corSituacao(v) {
  return ATIVA.test(v) ? 'text-ink-2' : 'text-amber font-semibold'
}

function valorTexto(v) {
  return Array.isArray(v) ? v.filter(Boolean).join(' · ') : String(v ?? '').trim()
}

/** Dossiê de prospecção em blocos — o que o mentor precisa antes/durante a call. */
export function DossieBlocos({ dossie, compacto = false }) {
  if (!dossie || Object.keys(dossie).length === 0) return null
  const blocos = BLOCOS_DOSSIE
    .map(([titulo, campos]) => [
      titulo,
      campos.map(([c, r]) => [c, r, valorTexto(dossie[c])]).filter(([, , v]) => v),
    ])
    .filter(([, campos]) => campos.length > 0)
  if (blocos.length === 0) return null

  return (
    <div className="space-y-2.5">
      <GaleriaFotos fotos={dossie.fotos} />
      {blocos.map(([titulo, campos]) => (
        <div key={titulo} className="rounded-lg bg-surface-2 border border-line px-3 py-2 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-3">{titulo}</p>
          {campos.map(([chave, rotulo, valor]) => {
            const destaque = chave === 'gancho'
            const alerta = ['reclamacoes', 'reclame_aqui', 'processos_judiciais'].includes(chave)
            return (
              <div key={chave} className={cn('text-sm leading-snug', compacto && 'text-[13px]')}>
                <span className="text-[10px] uppercase tracking-wide text-ink-3">{rotulo}: </span>
                {chave === 'cnpj' ? (
                  // buscar o CNPJ na internet resolve o que o dossiê não trouxe
                  // (sócios, endereço, processos) sem sair da tela da ligação
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(valor)}`}
                    target="_blank" rel="noopener noreferrer"
                    title="Buscar este CNPJ na internet"
                    className="text-sinal underline underline-offset-2 decoration-sinal/40
                      hover:decoration-sinal tnum">
                    {valor}
                  </a>
                ) : (
                  <span className={cn(
                    destaque && 'text-sinal font-medium',
                    alerta && 'text-amber',
                    ['piores_avaliacoes', 'melhores_avaliacoes'].includes(chave) && 'whitespace-pre-line block mt-0.5',
                    chave === 'piores_avaliacoes' && 'text-amber',
                    chave === 'situacao_cadastral' && corSituacao(valor),
                    chave === 'nome_dono' && 'text-ink font-semibold',
                    chave === 'temperatura' && (COR_TEMPERATURA[valor.toLowerCase()] || 'text-ink') + ' font-semibold',
                  )}>
                    {valor}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
      {dossie.dados_levantados_em && (
        <p className="text-[10px] text-ink-3">
          Levantado em {new Date(dossie.dados_levantados_em).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}

/** Galeria de fotos do lugar (dossie.fotos) — thumbs roláveis. */
export function GaleriaFotos({ fotos }) {
  if (!Array.isArray(fotos) || fotos.length === 0) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {fotos.map((f, i) => (
        <a key={i} href={f} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={f} alt="" loading="lazy"
            className="h-16 w-24 object-cover rounded-lg border border-line" />
        </a>
      ))}
    </div>
  )
}

/** Transcrição dividida por falante. O lead vira o nome real quando descoberto. */
export function Transcricao({ turnos, texto, nomeLead }) {
  if (Array.isArray(turnos) && turnos.length > 0) {
    return (
      <div className="space-y-2">
        {turnos.map((t, i) => {
          const ehVendedor = t.falante === 'vendedor'
          return (
            <div key={i} className={cn('flex gap-2', ehVendedor ? '' : 'flex-row-reverse')}>
              <span className={cn('shrink-0 text-[10px] font-bold uppercase tracking-wide pt-1.5 w-16',
                ehVendedor ? 'text-sinal text-right' : 'text-sky')}>
                {ehVendedor ? 'Mentor' : (nomeLead || 'Lead')}
              </span>
              <p className={cn('flex-1 text-sm leading-relaxed rounded-xl px-3 py-2 border',
                ehVendedor
                  ? 'bg-sinal/5 border-sinal/20 text-ink-2'
                  : 'bg-sky/5 border-sky-500/20 text-ink')}>
                {t.texto}
              </p>
            </div>
          )
        })}
      </div>
    )
  }
  if (!texto) return null
  // ligações antigas: texto corrido, sem separação de falantes
  return (
    <div>
      <p className="text-[11px] text-ink-3 mb-1">
        Ligação antiga — gravada antes da separação por voz.
      </p>
      <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{texto}</p>
    </div>
  )
}

/** Painel do dossiê: o que a IA descobriu sobre o contato. */
export function Dossie({ dossie, titulo = 'Dossiê do contato', vazio }) {
  const campos = CAMPOS_DOSSIE
    .map(([chave, rotulo]) => [chave, rotulo, valorTexto(dossie?.[chave])])
    .filter(([, , v]) => v)

  if (campos.length === 0) {
    return vazio === null ? null : (
      <p className="text-xs text-ink-3">{vazio || 'Nada capturado ainda nesta conversa.'}</p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-3">{titulo}</p>
      <dl className="grid sm:grid-cols-2 gap-1.5">
        {campos.map(([chave, rotulo, valor]) => (
          <div key={chave}
            className={cn('rounded-lg bg-surface-2 border border-line px-3 py-2',
              ['dor', 'desejo', 'resumo', 'presenca', 'diagnostico', 'elogios', 'reclamacoes', 'posts_recentes'].includes(chave) && 'sm:col-span-2')}>
            <dt className="text-[10px] uppercase tracking-wide text-ink-3">{rotulo}</dt>
            <dd className={cn('text-sm',
              chave === 'temperatura' ? (COR_TEMPERATURA[valor.toLowerCase()] || 'text-ink') + ' font-semibold'
                : 'text-ink')}>
              {valor}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

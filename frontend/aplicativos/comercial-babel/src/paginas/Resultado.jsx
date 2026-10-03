import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Agenda from '../componentes/Agenda'
import { Marca, Halo } from '../componentes/Marca'
import { Salto, Eixos, Funil, Confronto, Coerencia, Ladrilhos, Cascata, HOJE, PLANO }
  from '../componentes/Graficos'

// O diagnóstico do LEAD — a continuação da conversa que ele acabou de ter com a
// Babel, no mesmo fundo e na mesma tipografia. Rola como um documento, e o
// mesmo documento é o PDF.
//
// O que NUNCA aparece: o score comercial, o nível A/B/C escrito, a ação de
// roteamento e a isca do mentor. Isso é leitura do time.
// O número que ele vê é o da OPERAÇÃO — saúde, não vontade de comprar.

const JANELA_MIN = 15
const CHAVE_PRAZO = 'babel-diagnostico-prazo'

// O fundo do PDF vai como IMAGEM, não como background-color: a caixinha
// "gráficos de plano de fundo" do Chrome vem desmarcada, e sem isso o PDF sairia
// com texto claro em papel branco. Imagem é conteúdo — imprime sempre. E como é
// position:fixed, o Chrome repete em toda página.
const FUNDO_PDF =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="170" preserveAspectRatio="none">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0.18" y2="1">
        <stop offset="0" stop-color="#0C0820"/><stop offset="0.42" stop-color="#0A0A22"/>
        <stop offset="0.78" stop-color="#071427"/><stop offset="1" stop-color="#061020"/>
      </linearGradient></defs>
      <rect width="120" height="170" fill="url(#g)"/>
    </svg>`)

const brl = (n) => Number(n).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})
const soDigitos = (s) => String(s ?? '').replace(/\D/g, '')

export default function Resultado({ codigo }) {
  const [insc, setInsc] = useState(undefined)
  const [pessoa, setPessoa] = useState(null)
  const [perguntas, setPerguntas] = useState([])
  const [tentativas, setTentativas] = useState(0)
  const [restam, setRestam] = useState(JANELA_MIN * 60)
  const [marcado, setMarcado] = useState(false)
  const [aVista, setAVista] = useState(false)
  // o endereço novo traz o código; o antigo (?i=uuid) segue funcionando
  const id = new URLSearchParams(window.location.search).get('i')

  const buscar = useCallback(async () => {
    if (!id && !codigo) return
    const campos = 'id, codigo, nome, empresa, whatsapp, respostas, score, nivel, coerencia, analise, pessoa_id'
    const consulta = supabase.from('comercial_inscricoes').select(campos)
    const { data: i } = await (codigo
      ? consulta.eq('codigo', codigo).maybeSingle()
      : consulta.eq('id', id).maybeSingle())
    setInsc(i ?? null)
    if (!i) return
    const [{ data: p }, { data: q }] = await Promise.all([
      supabase.from('comercial_pessoas')
        .select('id, nome, slug, whatsapp, foto_url, descricao, grade').eq('id', i.pessoa_id).maybeSingle(),
      supabase.from('comercial_perguntas').select('id, rotulo, chave, capitulo').order('id'),
    ])
    setPessoa(p ?? null)
    setPerguntas(q ?? [])
  }, [id, codigo])

  useEffect(() => { buscar() }, [buscar])

  useEffect(() => {
    if (!insc || insc.score != null || tentativas > 20) return
    const t = setTimeout(() => { setTentativas((n) => n + 1); buscar() }, 2000)
    return () => clearTimeout(t)
  }, [insc, tentativas, buscar])

  // A contagem cria urgência, mas não tranca a porta: lead que leu o
  // diagnóstico inteiro (ou voltou no dia seguinte pela mesma aba) precisa
  // conseguir marcar do mesmo jeito — fechar a agenda na cara de quem quer
  // agendar custou lead de verdade. Prazo vencido renova a cada visita.
  useEffect(() => {
    let fim
    try {
      fim = Number(sessionStorage.getItem(CHAVE_PRAZO))
      if (!fim || fim <= Date.now()) {
        fim = Date.now() + JANELA_MIN * 60e3
        sessionStorage.setItem(CHAVE_PRAZO, String(fim))
      }
    } catch { fim = Date.now() + JANELA_MIN * 60e3 }
    const tique = () => setRestam(Math.max(0, Math.round((fim - Date.now()) / 1000)))
    tique()
    const t = setInterval(tique, 1000)
    return () => clearInterval(t)
  }, [])

  // O painel abre o diagnóstico com ?imprimir=1 quando o mentor clica em
  // "baixar PDF" — a página monta e chama a impressão sozinha.
  useEffect(() => {
    if (!insc?.score) return
    if (new URLSearchParams(window.location.search).get('imprimir') !== '1') return
    const t = setTimeout(() => window.print(), 1200)
    return () => clearTimeout(t)
  }, [insc])

  useEffect(() => {
    const alvo = document.getElementById('mentoria')
    if (!alvo || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setAVista(e.isIntersecting),
      { rootMargin: '-100px 0px -35% 0px' })
    obs.observe(alvo)
    return () => obs.disconnect()
  }, [insc, pessoa])

  const a = insc?.analise
  const nome1 = (insc?.nome ?? '').trim().split(/\s+/)[0]
  const janelaAberta = restam > 0

  const preenchidos = useMemo(() => {
    if (!insc?.respostas) return []
    return perguntas.map((q) => {
      const v = insc.respostas[q.chave]
      const t = Array.isArray(v) ? v.join(', ') : v
      return t ? { rotulo: q.rotulo, valor: String(t), capitulo: q.capitulo } : null
    }).filter(Boolean)
  }, [insc, perguntas])

  if (insc === undefined) return <Espera texto="abrindo seu diagnóstico…" />
  if (!insc) return <Espera texto="não achei esse diagnóstico." />
  if (insc.score == null && tentativas <= 20) return <Espera texto="lendo sua operação…" pulsando />

  const op = a?.operacao
  const num = a?.numeros ?? {}
  const leadsMes = num.leads_dia ? Math.round(num.leads_dia * 30) : null
  const contratos = num.contratos_mes ?? null

  // Nível C não ganha agenda: é a régua que o próprio Marcelo desenhou
  // (curioso ou sem porte recebe o diagnóstico, não a mentoria). Por isso
  // "seu diagnóstico liberou" é verdade, e não frase de efeito.
  const liberou = insc.nivel === 'A' || insc.nivel === 'B'
  const zap = soDigitos(pessoa?.whatsapp)

  // Os problemas, na ordem em que doem, para o convite citar.
  const problemas = [
    ...(a?.coerencia?.conflitos ?? []).map((c) => c.titulo),
    ...(a?.mentoria?.dores ?? []).map((d) => d.dor),
  ].slice(0, 4)

  return (
    <div className="min-h-full relative">
      <Halo />
      <img src={FUNDO_PDF} alt="" aria-hidden className="fundo-pdf" />

      <div className="relative z-10 mx-auto max-w-3xl px-5 py-10 sm:py-14 doc">
        <header className="flex items-start justify-between gap-4">
          <Marca />
          <p className="text-[10px] uppercase tracking-[0.2em] text-tinta-3 text-right pt-1">
            diagnóstico de operação<br />{new Date().toLocaleDateString('pt-BR')}
          </p>
        </header>

        {/* ---- abertura ---- */}
        <section className="mt-14 sobe">
          <p className="text-[11px] uppercase tracking-[0.26em] text-tinta-3">
            {insc.empresa || 'sua operação'}
          </p>
          <h1 className="fala text-4xl sm:text-5xl mt-3 leading-[1.1]">
            {nome1 ? `${nome1}, ` : ''}aqui está o que os seus números dizem.
          </h1>
          {a?.resumo && <p className="mt-6 text-tinta-2 text-lg leading-relaxed max-w-2xl">{a.resumo}</p>}
        </section>

        {/* ---- o salto ---- */}
        {op && (
          <Painel titulo="saúde da sua operação" primeiro>
            <Salto hoje={op.hoje} projetado={op.projetado} />
          </Painel>
        )}

        {insc.coerencia != null && (
          <Painel titulo="os seus números fecham entre si?">
            <Coerencia nota={insc.coerencia} />
          </Painel>
        )}

        {/* ---- o que não fecha ---- */}
        {a?.coerencia?.conflitos?.length > 0 && (
          <Secao titulo="o que eu encontrei nos seus números">
            <div className="space-y-4">
              {a.coerencia.conflitos.map((c, k) => (
                <div key={k} className="rounded-2xl border border-linha bg-superficie/50 p-5 sm:p-6 evitar-quebra">
                  <p className="fala text-xl text-tinta">{c.titulo}</p>
                  <p className="mt-2 text-tinta-2 text-[15px] leading-relaxed">{c.achado}</p>
                  {c.visual && (
                    <div className="mt-5"><Confronto visual={c.visual} /></div>
                  )}
                  {c.pergunta && (
                    <p className="mt-5 pt-4 border-t border-linha text-[14px] leading-relaxed"
                      style={{ color: PLANO }}>↳ {c.pergunta}</p>
                  )}
                </div>
              ))}
            </div>
          </Secao>
        )}


        {op?.eixos && (
          <Painel titulo="onde cada ponto está">
            <Eixos eixos={op.eixos} />
          </Painel>
        )}

        {/* ---- o funil ---- */}
        {leadsMes && contratos ? (
          <Painel titulo="o caminho dos seus leads">
            <Funil leadsMes={leadsMes} contratos={contratos} ticket={num.ticket_medio} />
          </Painel>
        ) : null}

        {/* ---- dinheiro ---- */}
        {a?.ganho?.linhas?.length > 0 && (
          <Painel titulo="o que isso vale por mês">
            <p className="fala text-5xl sm:text-6xl" style={{ color: PLANO }}>
              +{brl(a.ganho.total)}<span className="text-2xl text-tinta-3">/mês</span>
            </p>
            {a.ganho.cascata && (
              <div className="mt-7">
                <Cascata base={a.ganho.cascata.base} passos={a.ganho.cascata.passos}
                  fim={a.ganho.cascata.fim} />
              </div>
            )}
            <div className="mt-7 space-y-4">
              {a.ganho.linhas.map((l, k) => (
                <div key={k} className="border-l-2 pl-4" style={{ borderColor: HOJE }}>
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <span className="text-tinta text-[15px]">{l.rotulo}</span>
                    <span className="tabular-nums ml-auto" style={{ color: PLANO }}>{brl(l.valor)}</span>
                  </div>
                  <p className="text-[12px] text-tinta-3 mt-1">premissa: {l.premissa}</p>
                </div>
              ))}
            </div>
            {a.ganho.horas_devolvidas > 0 && (
              <p className="mt-5 text-[14px] text-tinta-2">
                Mais <span style={{ color: PLANO }}>{Math.round(a.ganho.horas_devolvidas)} horas por mês</span>{' '}
                que a sua equipe deixa de gastar com cobrança.
              </p>
            )}
          </Painel>
        )}

        {/* ---- o plano ---- */}
        {a?.plano?.acoes?.length > 0 && (
          <Secao titulo="o plano de ação">
            <div className="space-y-7">
              {a.plano.acoes.map((x, k) => (
                <div key={k} className="flex gap-5 evitar-quebra">
                  <div className="shrink-0 w-10 h-10 rounded-full grid place-items-center fala text-lg"
                    style={{ border: `1px solid ${HOJE}`, color: PLANO }}>{k + 1}</div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <p className="fala text-xl text-tinta">{x.titulo}</p>
                      {x.prazo && (
                        <span className="text-[10px] uppercase tracking-[0.16em] text-tinta-3
                                         border border-linha rounded-full px-2.5 py-0.5">{x.prazo}</span>
                      )}
                    </div>
                    {x.por_que && <p className="mt-2 text-tinta-2 text-[15px] leading-relaxed">{x.por_que}</p>}
                    {x.como && <p className="mt-2 text-tinta-3 text-[14px] leading-relaxed">{x.como}</p>}
                  </div>
                </div>
              ))}
            </div>
            {a.plano.primeiro_movimento && (
              <div className="mt-8 rounded-2xl p-5 evitar-quebra"
                style={{ border: `1px solid ${PLANO}55`, background: 'rgba(57,196,255,.05)' }}>
                <p className="text-[11px] uppercase tracking-[0.22em]" style={{ color: PLANO }}>
                  comece por aqui — sem contratar nada
                </p>
                <p className="mt-2 text-tinta text-[15px] leading-relaxed">{a.plano.primeiro_movimento}</p>
              </div>
            )}
          </Secao>
        )}

        {/* ---- o que apuramos por fora ---- */}
        {a?.dossie && (
          <Secao titulo="o que eu vi por fora, sem você me contar">
            <div className="grid gap-3 sm:grid-cols-2">
              {a.dossie.receita && (
                <Ficha titulo="na Receita Federal">
                  <Par r="razão social" v={a.dossie.receita.razao_social} />
                  <Par r="situação" v={`${a.dossie.receita.situacao} desde ${a.dossie.receita.abertura}`} />
                  <Par r="porte" v={a.dossie.receita.porte} />
                  <Par r="regime" v={a.dossie.receita.simples === true ? 'Simples Nacional'
                    : a.dossie.receita.mei === true ? 'MEI' : 'fora do Simples'} />
                  <Par r="atividade" v={a.dossie.receita.cnae} />
                </Ficha>
              )}

              {a.dossie.instagram && (
                <Ficha titulo={`no instagram · @${a.dossie.instagram.arroba}`}>
                  <Par r="seguidores" v={a.dossie.instagram.seguidores?.toLocaleString('pt-BR')} />
                  <Par r="publicações" v={a.dossie.instagram.posts_total} />
                  {a.dossie.instagram.ritmo && (
                    <>
                      <Par r="ritmo" v={a.dossie.instagram.ritmo.leitura} destaque />
                      <Par r="último post"
                        v={`há ${a.dossie.instagram.ritmo.dias_desde_o_ultimo} dias — você postava a cada ${a.dossie.instagram.ritmo.intervalo_mediano_dias}`} />
                      {a.dossie.instagram.ritmo.engajamento_pct != null && (
                        <Par r="engajamento"
                          v={`${a.dossie.instagram.ritmo.engajamento_pct}% dos seguidores curtem o post mediano`}
                          destaque={a.dossie.instagram.ritmo.engajamento_pct < 1} />
                      )}
                    </>
                  )}
                </Ficha>
              )}
            </div>

            {a.dossie.reclame_aqui?.achados > 0 && (
              <div className="mt-3 rounded-2xl border p-5 evitar-quebra"
                style={{ borderColor: `${HOJE}55`, background: 'rgba(122,69,232,.06)' }}>
                <p className="text-[11px] uppercase tracking-[0.22em]" style={{ color: HOJE }}>
                  no reclame aqui · {a.dossie.reclame_aqui.achados}{' '}
                  {a.dossie.reclame_aqui.achados === 1 ? 'reclamação pública' : 'reclamações públicas'}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {(a.dossie.reclame_aqui.itens ?? []).slice(0, 4).map((i, k) => (
                    <li key={k} className="text-[14px] text-tinta-2">· {i.titulo}</li>
                  ))}
                </ul>
                <p className="mt-3 text-[13px] text-tinta-3 leading-relaxed">
                  Reclamação pública é atendimento que escapou. É o mesmo buraco que aparece
                  nos seus números — só que agora com nome e sobrenome.
                </p>
              </div>
            )}
          </Secao>
        )}

        {/* ---- inferidos ---- */}
        {a?.inferidos?.length > 0 && (
          <Secao titulo="o que os seus dados dizem sem você ter escrito">
            <Ladrilhos itens={a.inferidos} />
          </Secao>
        )}

        {/* ---- respostas ---- */}
        {preenchidos.length > 0 && (
          <Secao titulo="o que você me contou">
            <div className="grid gap-3 sm:grid-cols-2">
              {preenchidos.map((p, k) => (
                <div key={k} className="evitar-quebra">
                  <p className="text-[11px] text-tinta-3">{p.rotulo}</p>
                  <p className="text-[14px] text-tinta-2">{p.valor}</p>
                </div>
              ))}
            </div>
          </Secao>
        )}

        {/* ---- a revelação ---- */}
        {pessoa && (
          <section className="mt-20 sobe" id="mentoria">
            <div className="rounded-3xl p-6 sm:p-9 evitar-quebra"
              style={{ border: `1px solid ${HOJE}66`, background: 'rgba(122,69,232,.07)' }}>

              {liberou ? (
                <>
                  <p className="text-[11px] uppercase tracking-[0.26em]" style={{ color: PLANO }}>
                    o seu diagnóstico liberou
                  </p>
                  <p className="fala text-4xl sm:text-5xl mt-3 leading-tight">
                    uma mentoria gratuita de 30 minutos.
                  </p>
                  <p className="mt-5 text-tinta-2 text-[16px] leading-relaxed max-w-2xl">
                    Um mentor entra em videochamada com você e monta, na sua frente, o plano
                    para resolver o que apareceu aqui:
                  </p>
                  {problemas.length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {problemas.map((p, k) => (
                        <li key={k} className="flex gap-3 text-[15px] text-tinta">
                          <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full"
                            style={{ background: PLANO }} />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] uppercase tracking-[0.26em]" style={{ color: PLANO }}>
                    seu diagnóstico está pronto
                  </p>
                  <p className="fala text-4xl mt-3 leading-tight">
                    leve esse plano e comece por ele.
                  </p>
                  <p className="mt-5 text-tinta-2 text-[16px] leading-relaxed max-w-2xl">
                    Baixe o documento e faça o primeiro movimento. Quando os números
                    estiverem no lugar, chame {(pessoa.nome ?? '').split(' ')[0]} — é aí que a conversa rende.
                  </p>
                </>
              )}

              {/* o mentor */}
              <div className="mt-8 pt-8 border-t border-linha flex items-center gap-5">
                {pessoa.foto_url ? (
                  <img src={pessoa.foto_url} alt={pessoa.nome}
                    className="w-20 h-20 rounded-full object-cover shrink-0"
                    style={{ border: `1px solid ${HOJE}`, boxShadow: '0 0 28px rgba(122,69,232,.35)' }} />
                ) : (
                  <div className="w-20 h-20 rounded-full grid place-items-center fala text-2xl shrink-0"
                    style={{ border: `1px solid ${HOJE}`, color: PLANO }}>{(pessoa.nome ?? '?')[0]}</div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-tinta-3">seu mentor</p>
                  <p className="fala text-2xl text-tinta mt-1">{pessoa.nome}</p>
                  {pessoa.descricao && (
                    <p className="mt-2 text-tinta-2 text-[14px] leading-relaxed">{pessoa.descricao}</p>
                  )}
                </div>
              </div>

              {a?.convite && (
                <p className="mt-6 fala text-xl text-tinta leading-snug">{a.convite}</p>
              )}
              <p className="mt-4 text-[14px] text-tinta-3 leading-relaxed">
                Sem custo e sem compromisso. Você sai com o plano na mão — feche com a gente ou não.
              </p>

              {/* agenda */}
              {liberou && (
                <div className="mt-8 pt-8 border-t border-linha sem-impressao">
                  {/* A contagem some quando zera, mas a agenda fica: quem quer
                      marcar, marca — o cronômetro é empurrão, não cadeado. */}
                  {janelaAberta && (
                    <div className="flex items-center gap-3 mb-5 flex-wrap">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-tinta-3">
                        agenda aberta para você por
                      </span>
                      <span className="tabular-nums text-lg" style={{ color: PLANO }}>
                        {String(Math.floor(restam / 60)).padStart(2, '0')}:{String(restam % 60).padStart(2, '0')}
                      </span>
                    </div>
                  )}
                  <Agenda pessoa={pessoa} inscricaoId={insc.id} nome={insc.nome}
                    whatsapp={insc.whatsapp} aoMarcar={() => setMarcado(true)} />
                </div>
              )}

              {/* WhatsApp — no papel também, e clicável no PDF */}
              {zap && (
                <div className="mt-8 pt-8 border-t border-linha">
                  <a href={`https://wa.me/55${zap}?text=${encodeURIComponent(
                        `Oi ${(pessoa.nome ?? '').split(' ')[0]}, acabei de receber meu diagnóstico da Babel e quero conversar.`)}`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-3 rounded-full px-7 py-3.5
                               text-[15px] font-medium hover:opacity-90 transition-opacity"
                    style={{ background: `linear-gradient(90deg, ${HOJE}, ${PLANO})`, color: '#061020' }}>
                    <ZapIcone />
                    falar com {(pessoa.nome ?? '').split(' ')[0]} no WhatsApp
                  </a>
                  <p className="so-impressao mt-3 text-[12px] text-tinta-3">
                    Toque no botão acima neste PDF para abrir a conversa.
                  </p>
                </div>
              )}

              <button type="button" onClick={() => window.print()}
                className="sem-impressao mt-6 rounded-full border border-linha-forte px-6 py-3
                           text-[15px] text-tinta-2 hover:text-tinta hover:border-violeta/60 transition-colors">
                baixar este diagnóstico em PDF
              </button>
            </div>
          </section>
        )}

        {pessoa && !marcado && liberou && (
          <div className="h-24 sem-impressao" aria-hidden />
        )}

        <footer className="mt-14 pt-8 border-t border-linha flex items-baseline justify-between gap-4 flex-wrap">
          <p className="text-[11px] text-tinta-3">babel · consciência artificial</p>
          <p className="text-[11px] text-tinta-3">
            gerado em {new Date().toLocaleDateString('pt-BR')}
            {pessoa ? ` · mentoria com ${pessoa.nome}` : ''}
          </p>
        </footer>
      </div>

      {/* ---- barra que persegue ---- */}
      {pessoa && !marcado && liberou && !aVista && (
        <div className="sem-impressao fixed inset-x-0 bottom-0 z-20 border-t border-linha
                        bg-[#0A0A22]/90 backdrop-blur-xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="mx-auto max-w-3xl px-5 py-4 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-tinta leading-tight truncate">
                Mentoria gratuita com {(pessoa.nome ?? '').split(' ')[0]}
              </p>
              <p className="text-[11px] text-tinta-3 mt-0.5">
                {janelaAberta ? (
                  <>
                    agenda aberta por{' '}
                    <span className="tabular-nums" style={{ color: PLANO }}>
                      {String(Math.floor(restam / 60)).padStart(2, '0')}:{String(restam % 60).padStart(2, '0')}
                    </span>
                  </>
                ) : 'escolha um horário na agenda'}
              </p>
            </div>
            <button type="button"
              onClick={() => document.getElementById('mentoria')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="shrink-0 rounded-full px-6 py-3 text-[15px] font-medium transition-opacity hover:opacity-90"
              style={{ background: `linear-gradient(90deg, ${HOJE}, ${PLANO})`, color: '#061020' }}>
              agendar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const Ficha = ({ titulo, children }) => (
  <div className="rounded-2xl border border-linha bg-superficie/50 p-5 evitar-quebra">
    <p className="text-[11px] uppercase tracking-[0.2em] text-tinta-3 mb-3">{titulo}</p>
    <div className="space-y-2">{children}</div>
  </div>
)

const Par = ({ r, v, destaque }) => (v == null || v === '' ? null : (
  <div className="flex items-baseline gap-3">
    <span className="text-[11px] text-tinta-3 w-24 shrink-0">{r}</span>
    <span className={'text-[14px] ' + (destaque ? '' : 'text-tinta-2')}
      style={destaque ? { color: PLANO } : undefined}>{v}</span>
  </div>
))

const Secao = ({ titulo, children }) => (
  <section className="mt-16 sobe">
    <p className="text-[11px] uppercase tracking-[0.26em] text-tinta-3 mb-5">{titulo}</p>
    {children}
  </section>
)

const Painel = ({ titulo, children, primeiro }) => (
  <section className={(primeiro ? 'mt-12' : 'mt-8') + ' sobe evitar-quebra'}>
    <div className="rounded-3xl border border-linha bg-superficie/50 p-6 sm:p-8">
      <p className="text-[11px] uppercase tracking-[0.26em] text-tinta-3 mb-6">{titulo}</p>
      {children}
    </div>
  </section>
)

const ZapIcone = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.25.69-1.45 1.32-1.99 1.36-.53.04-.53.42-3.34-.83-2.81-1.25-4.51-4.24-4.65-4.44-.13-.2-1.09-1.53-1.05-2.9.04-1.36.75-2 1.02-2.27.26-.28.57-.34.76-.34.19 0 .38 0 .55.01.18.01.42-.07.65.55.24.64.8 2.2.87 2.36.07.16.11.34.01.54-.1.2-.15.33-.3.5-.15.18-.31.39-.44.52-.15.15-.3.31-.14.6.16.28.72 1.28 1.55 2.07 1.07 1.02 1.98 1.35 2.26 1.5.28.15.45.13.62-.06.18-.19.72-.79.91-1.06.19-.28.37-.22.62-.13.25.09 1.58.79 1.85.93.27.14.45.21.51.32.07.11.07.63-.18 1.32Z" />
  </svg>
)

function Espera({ texto, pulsando }) {
  return (
    <div className="min-h-full relative grid place-items-center px-5">
      <Halo />
      <div className="relative z-10 text-center">
        <Marca centro />
        <p className={'fala text-3xl mt-8 ' + (pulsando ? 'animate-pulse' : '')}>{texto}</p>
      </div>
    </div>
  )
}

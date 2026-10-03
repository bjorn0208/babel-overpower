import { useEffect } from 'react'
import Icone from '../componentes/Icone'

// Proposta comercial pública (spec 2026-08-07): o link que o vendedor manda
// por e-mail/WhatsApp depois da ligação. Não exige login — abre para qualquer
// um com a URL, igual à sala de reunião (?sala=).
//
// O posicionamento é o mesmo da landing oficial (lp1.babel-os.com): a Babel OS
// é a MENTE da empresa — um sistema operacional autônomo que entende, memoriza,
// decide e executa. Não é o discador que a equipe usa por dentro; vender a
// ferramenta errada aqui contradiria o vendedor na call seguinte.

const CAPACIDADES = [
  {
    icone: 'busca',
    titulo: 'Entende',
    texto: 'Lê as conversas e o contexto de cada cliente — onde parou, o que já foi combinado, '
      + 'o que ficou pendente.',
  },
  {
    icone: 'hist',
    titulo: 'Memoriza',
    texto: 'Guarda cliente, histórico e as regras do seu negócio. A informação para de morar '
      + 'na cabeça de uma pessoa só.',
  },
  {
    icone: 'alvo',
    titulo: 'Decide',
    texto: 'Age dentro do escopo e das permissões que você definir. Nada fora do combinado, '
      + 'nada sem rastro.',
  },
  {
    icone: 'raio',
    titulo: 'Executa',
    texto: 'Faz a ação nas ferramentas que você já usa: responde, atualiza o CRM, agenda, '
      + 'registra e segue o fluxo.',
  },
]

const NA_PRATICA = [
  'Recupera o histórico do cliente sozinha, sem ninguém procurar',
  'Atualiza o CRM sem intervenção manual',
  'Retoma conversas que ficaram pela metade',
  'Deixa registro e rastreabilidade de tudo que fez',
  'Integra com o ecossistema que a sua empresa já tem',
]

// WhatsApp oficial da Babel (aparece para o cliente junto do vendedor).
// Trocado em 19/08: +55 21 97256-0636.
const ZAP_BABEL = '5521972560636'

// A proposta é material de MARCA, não a ferramenta interna: fundo preto e azul
// da landing oficial (lp1.babel-os.com), fixos — o cliente vê sempre igual,
// mesmo com o celular dele no tema claro. Redefinir os tokens aqui troca a cor
// de tudo que já usa bg-sinal/text-sinal/border-line dentro da página.
const TEMA_MARCA = {
  '--bg': '#000000',
  '--surface': '#0a0f1f',
  '--surface-2': '#0f1629',
  '--line': 'rgba(255,255,255,.12)',
  '--line-soft': 'rgba(255,255,255,.07)',
  '--ink': '#ffffff',
  '--ink-2': '#a8b3cf',
  '--ink-3': '#6b7899',
  '--sinal': '#3080ff',
  '--sinal-2': '#22d3ee',
  colorScheme: 'dark',
}

export default function Proposta({ para, de, email, zap }) {
  // quem abre o link é o CLIENTE — a aba dele não pode dizer "BabelPhone".
  // O fundo do documento vai junto: sem isso, cliente com o celular no tema
  // claro veria faixas brancas na borda e no overscroll.
  useEffect(() => {
    const tituloAntes = document.title
    const fundoAntes = document.body.style.background
    const esquemaAntes = document.documentElement.style.colorScheme
    document.title = para ? `Proposta Babel OS — ${para}` : 'Proposta Comercial — Babel OS'
    document.body.style.background = '#000000'
    document.documentElement.style.colorScheme = 'dark'
    return () => {
      document.title = tituloAntes
      document.body.style.background = fundoAntes
      document.documentElement.style.colorScheme = esquemaAntes
    }
  }, [para])

  const empresa = (para || '').trim()
  const vendedor = (de || '').trim()
  const zapLimpo = String(zap || '').replace(/\D/g, '').replace(/^55/, '')
  const msg = `Olá${vendedor ? `, ${vendedor}` : ''}! Vi a proposta da Babel OS`
    + `${empresa ? ` para a ${empresa}` : ''} e quero agendar o diagnóstico.`
  const linkZap = zapLimpo.length >= 10
    ? `https://wa.me/55${zapLimpo}?text=${encodeURIComponent(msg)}`
    : null
  const linkZapBabel = `https://wa.me/${ZAP_BABEL}?text=${encodeURIComponent(msg)}`
  const linkEmail = email
    ? `mailto:${email}?subject=${encodeURIComponent('Quero agendar o diagnóstico — Babel OS')}`
      + `&body=${encodeURIComponent(msg)}`
    : null

  return (
    <div className="min-h-full bg-bg text-ink overflow-y-auto" style={TEMA_MARCA}>
      {/* ───────── capa ───────── */}
      <header className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute -top-32 -right-24 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, var(--sinal), transparent 60%)' }} />
        <div className="relative max-w-3xl mx-auto px-6 py-14 md:py-20">
          <p className="text-[11px] md:text-xs font-bold uppercase tracking-[0.28em] text-sinal mb-5">
            Proposta comercial
          </p>
          <h1 className="font-extrabold uppercase leading-[0.86] tracking-tight
            text-[clamp(3rem,16vw,8rem)]">
            Babel <span className="text-sinal">OS</span>
          </h1>
          <p className="mt-2 text-sm md:text-base font-bold uppercase tracking-[0.2em] text-ink-3">
            A mente da sua empresa
          </p>
          <p className="mt-6 text-xl md:text-3xl font-bold leading-[1.15] max-w-xl">
            Sua empresa já tem as ferramentas.<br />
            <span className="text-sinal">Falta a mente.</span>
          </p>
          {empresa && (
            <p className="mt-7 inline-flex items-center gap-2 rounded-full border border-sinal/40 bg-sinal/10
              px-4 py-2 text-sm font-semibold text-sinal">
              <Icone nome="bandeira" tam={14} />
              Preparado para {empresa}
            </p>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 md:py-16 space-y-14 md:space-y-20">
        {/* ───────── o problema ───────── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-ink-3 mb-4">O problema</h2>
          <p className="text-lg md:text-2xl leading-snug font-medium">
            Sua empresa funciona porque <span className="text-sinal">alguém lembra de tudo</span>.
          </p>
          <p className="mt-4 text-ink-2 leading-relaxed max-w-2xl">
            A operação vive espalhada entre CRM, WhatsApp, agenda, contrato e planilha. Cada sistema
            guarda um pedaço, e é uma pessoa que carrega a informação de um lado para o outro. Quando
            ela falta, sai de férias ou troca de time, o contexto vai junto — e o cliente sente.
          </p>
        </section>

        {/* ───────── o que a Babel OS faz ───────── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-ink-3 mb-2">
            O que a Babel OS é
          </h2>
          <p className="text-ink-2 leading-relaxed mb-6 max-w-2xl">
            Um sistema operacional autônomo que conecta contexto, memória, regras e ações — dentro
            do fluxo que você configurar.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAPACIDADES.map((c) => (
              <div key={c.titulo} className="rounded-2xl border border-line bg-surface p-5">
                <span className="inline-grid place-items-center w-10 h-10 rounded-xl
                  bg-sinal/12 border border-sinal/30 text-sinal mb-3">
                  <Icone nome={c.icone} tam={18} />
                </span>
                <h3 className="font-bold mb-1.5 uppercase tracking-wide text-sm">{c.titulo}</h3>
                <p className="text-sm text-ink-2 leading-relaxed">{c.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ───────── na prática ───────── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-ink-3 mb-5">Na prática</h2>
          <ul className="space-y-2.5">
            {NA_PRATICA.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 grid place-items-center w-5 h-5 rounded-full shrink-0
                  bg-sinal/15 border border-sinal/40 text-sinal">
                  <Icone nome="check" tam={11} traco={3} />
                </span>
                <span className="text-ink-2 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ───────── o compromisso ───────── */}
        <section className="rounded-2xl border border-sinal/40 bg-sinal/[0.07] p-6 md:p-9">
          <p className="text-xl md:text-3xl font-bold leading-tight">
            Você cuida do crescimento.
          </p>
          <p className="text-xl md:text-3xl font-bold leading-tight text-sinal">
            O resto? Deixa com a Babel.
          </p>
        </section>

        {/* ───────── investimento ─────────
            Sem número nenhum de propósito (decisão de 19/08): preço na peça
            ancorava a conversa antes da hora. O valor é revelado na reunião,
            depois de mostrar o que a Babel assume — a peça só abre a porta. */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-ink-3 mb-5">Investimento</h2>
          <div className="rounded-2xl border border-line bg-surface p-6 md:p-8">
            <p className="text-xl md:text-2xl font-bold leading-tight">
              Sob medida para a sua operação.
            </p>
            <p className="mt-3 text-ink-2 leading-relaxed">
              Cada empresa tem um tamanho, um fluxo e um desenho diferentes — número solto
              aqui seria chute. <b className="text-ink">Os valores são revelados na reunião</b>,
              junto com o plano exato do que a Babel OS vai assumir no seu negócio.
            </p>
            <p className="mt-4 text-sm font-bold text-sinal">
              Agende abaixo — 15 minutos, online, sem compromisso.
            </p>
          </div>
        </section>

        {/* ───────── próximo passo ───────── */}
        <section className="rounded-2xl border border-line bg-surface p-6 md:p-9">
          <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-ink-3 mb-3">Próximo passo</h2>
          <p className="text-xl md:text-2xl font-bold leading-tight mb-3">
            Um diagnóstico gratuito de 15 minutos.
          </p>
          <p className="text-ink-2 leading-relaxed mb-6">
            Online, no horário que você escolher. A gente mapeia junto onde a sua operação trava
            hoje e mostra a Babel OS funcionando ao vivo. Sem compromisso nenhum.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {/* WhatsApp de quem ligou (quando cadastrado) é o caminho mais curto;
                o número oficial da Babel fica sempre disponível ao lado. */}
            <a href={linkZap || linkZapBabel} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sinal
                px-6 py-3.5 font-bold text-white">
              <Icone nome="whatsapp" tam={16} />
              Descobrir onde minha operação trava
            </a>
            {linkZap && (
              <a href={linkZapBabel} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl
                  border border-sinal/50 text-sinal px-6 py-3.5 font-bold">
                <Icone nome="whatsapp" tam={16} />
                Falar com a Babel
              </a>
            )}
            {linkEmail && (
              <a href={linkEmail}
                className="inline-flex items-center justify-center gap-2 rounded-xl
                  border border-line text-ink-2 px-6 py-3.5 font-bold">
                <Icone nome="email" tam={16} />
                Responder por e-mail
              </a>
            )}
          </div>
          {vendedor && (
            <p className="mt-5 text-sm text-ink-3">
              Falou com <b className="text-ink-2">{vendedor}</b> · Babel OS
            </p>
          )}
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3">
          <span className="font-extrabold uppercase tracking-tight text-lg">
            Babel <span className="text-sinal">OS</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
            <a href={linkZapBabel} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sinal font-semibold">
              <Icone nome="whatsapp" tam={13} />
              (51) 92005-4188
            </a>
            <span>babel-os.com</span>
          </span>
        </div>
      </footer>
    </div>
  )
}

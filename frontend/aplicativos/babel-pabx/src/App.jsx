import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { Avatar, Chip, Sinal, cn } from './componentes/ui'
import Icone from './componentes/Icone'
import Login from './paginas/Login'
import Telefone from './paginas/Telefone'
import Historico from './paginas/Historico'
import Leads from './paginas/Leads'
import Agenda from './paginas/Agenda'
import Gestao from './paginas/Gestao'
import Ia from './paginas/Ia'
import Listas from './paginas/Listas'
import Contatos from './paginas/Contatos'
import Bmail from './paginas/Bmail'
import Reuniao from './paginas/Reuniao'
import Proposta from './paginas/Proposta'
import Placar from './paginas/Placar'
import Analise from './paginas/Analise'
import Contratos from './paginas/Contratos'
import Carteira from './paginas/Carteira'
import Compromissos from './componentes/Compromissos'
import Relatos from './paginas/Relatos'
import MeusScripts from './paginas/MeusScripts'
import Whatsapp from './paginas/Whatsapp'
import Notificacoes from './componentes/Notificacoes'

// Navegação do novo fluxo (spec 2026-08-06): o dia inteiro do vendedor nas
// 4 primeiras abas; o resto vive em "Mais". No celular, menu fixo de 5 itens.
const ABAS = [
  { id: 'telefone', rotulo: 'Discador', icone: 'fone' },
  { id: 'listas', rotulo: 'Listas', icone: 'lista' },
  { id: 'agenda', rotulo: 'Agenda', icone: 'cal' },
  { id: 'contatos', rotulo: 'Contatos', icone: 'cartao' },
  { id: 'compromissos', rotulo: 'Compromissos', curto: 'Hoje', icone: 'calcheck' },
  { id: 'placar', rotulo: 'Placar', icone: 'trofeu' },
  { id: 'whatsapp', rotulo: 'WhatsApp', curto: 'Zap', icone: 'whatsapp', mais: true },
  { id: 'bmail', rotulo: 'B-Mail', icone: 'email', mais: true },
  { id: 'leads', rotulo: 'CRM', icone: 'alvo', mais: true },
  { id: 'historico', rotulo: 'Histórico', icone: 'hist', mais: true },
  { id: 'contratos', rotulo: 'Contratos', icone: 'doc', mais: true },
  { id: 'carteira', rotulo: 'Carteira', icone: 'cifra', mais: true },
  { id: 'scripts-meus', rotulo: 'Meus Scripts', curto: 'Scripts', icone: 'lapis', mais: true },
  { id: 'relatos', rotulo: 'Bugs e ideias', curto: 'Bugs', icone: 'bandeira', mais: true },
  { id: 'ia', rotulo: 'IA', icone: 'robo', admin: true, mais: true },
  { id: 'analise', rotulo: 'Análise', icone: 'grafico', admin: true, mais: true },
  { id: 'gestao', rotulo: 'Gestão', icone: 'ajuste', admin: true, mais: true },
]

// Barra fixa do celular, nesta ordem. O que não estiver aqui vai para o
// "Mais" — no computador a sidebar mostra tudo, independente desta lista.
const BARRA_CELULAR = ['telefone', 'listas', 'placar', 'agenda', 'contatos', 'compromissos']

export default function App() {
  const [sessao, setSessao] = useState(undefined) // undefined = carregando
  const [perfil, setPerfil] = useState(null)
  const [estadoTel, setEstadoTel] = useState('conectando') // estado do webphone
  const [aba, setAba] = useState('telefone')
  const [leadParaLigar, setLeadParaLigar] = useState(null)
  const [leadParaAbrir, setLeadParaAbrir] = useState(null) // id → CRM abre direto na ficha
  const [analiseUser, setAnaliseUser] = useState(null)
  const [versaoNova, setVersaoNova] = useState(false)
  const [maisAberto, setMaisAberto] = useState(false)      // gaveta "Mais" do menu mobile
  const [listaSessao, setListaSessao] = useState(null)     // lista → Discador em modo sessão
  const [compromissosHoje, setCompromissosHoje] = useState(0) // selo da aba Compromissos

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    // O Supabase dispara este ouvinte também quando só renova o token — e ele
    // renova ao voltar de outra aba. Se trocarmos o objeto da sessão nessas
    // horas, o perfil recarrega em cascata e o telefone é recriado no meio da
    // ligação. Mesma pessoa = mesma sessão, não mexe.
    const { data: ouvinte } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSessao((atual) => (atual && s && atual.user?.id === s.user?.id ? atual : s))
    })
    return () => ouvinte.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessao?.user) { setPerfil(null); return }
    supabase.from('profiles').select('*').eq('user_id', sessao.user.id).single()
      .then(({ data }) => setPerfil(data))
  }, [sessao])

  // Versão nova publicada: sem isto, uma correção de telefonia só chegava a
  // quem recarregasse a página por conta própria — e a equipe fica o dia
  // inteiro com a mesma aba aberta. Compara o hash do bundle a cada 2 min.
  useEffect(() => {
    let bundleAtual = null
    async function conferir() {
      try {
        const r = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' })
        const marca = (await r.text()).match(/assets\/index-([A-Za-z0-9_-]+)\.js/)?.[1]
        if (!marca) return
        if (bundleAtual && bundleAtual !== marca) setVersaoNova(true)
        bundleAtual = marca
      } catch { /* offline: tenta de novo no próximo ciclo */ }
    }
    conferir()
    const t = setInterval(conferir, 120000)
    return () => clearInterval(t)
  }, [])

  // Recarrega sozinho quando o telefone está ocioso — nunca no meio de uma
  // ligação, que é o único momento em que perder a página custa caro.
  useEffect(() => {
    if (!versaoNova) return
    if (['chamando', 'tocando', 'em-chamada'].includes(estadoTel)) return
    const t = setTimeout(() => window.location.reload(), 4000)
    return () => clearTimeout(t)
  }, [versaoNova, estadoTel])

  // Selo da aba Compromissos: quantos itens pedem ação ATÉ hoje (vencidos
  // inclusos). Só conta (head:true) — não baixa linha nenhuma. Fica ANTES dos
  // early-returns (regra dos hooks); o guard interno cobre perfil ausente.
  useEffect(() => {
    if (!perfil) return
    let vivo = true
    async function contar() {
      const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999)
      const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0)
      const [rets, evs, pos] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('atribuido_a', perfil.user_id)
          .not('proxima_acao_em', 'is', null)
          .not('status', 'in', '(convertido,descartado)')
          .lte('proxima_acao_em', fimHoje.toISOString()),
        supabase.from('agenda_eventos').select('id', { count: 'exact', head: true })
          .eq('status', 'marcado')
          .gte('inicio', inicioHoje.toISOString()).lte('inicio', fimHoje.toISOString())
          .or(`vendedor.eq.${perfil.user_id},criado_por.eq.${perfil.user_id}`),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('atribuido_a', perfil.user_id).eq('status', 'convertido')
          .not('posvenda_proximo_em', 'is', null)
          .lte('posvenda_proximo_em', fimHoje.toISOString()),
      ])
      if (vivo) setCompromissosHoje((rets.count || 0) + (evs.count || 0) + (pos.count || 0))
    }
    contar()
    const timer = setInterval(contar, 60000)
    return () => { vivo = false; clearInterval(timer) }
  }, [perfil, aba])

  // Links públicos (cliente entra sem login): sala de reunião e proposta.
  // O domínio proposta.babel-os.com é SEMPRE a proposta, com ou sem parâmetro:
  // cliente que abrir o endereço puro não pode cair na tela de login do PABX.
  const params = new URLSearchParams(window.location.search)
  const salaUrl = params.get('sala')
  const verProposta = params.get('proposta')
    || (window.location.hostname === 'proposta.babel-os.com' ? '1' : null)

  if (verProposta) {
    return <Proposta para={params.get('para')} de={params.get('de')}
      email={params.get('mail')} zap={params.get('zap')} />
  }
  if (sessao === undefined) return null
  if (salaUrl) return <Reuniao sala={salaUrl} logado={!!sessao} />
  if (!sessao) return <Login />
  if (!perfil) {
    return <div className="min-h-full grid place-items-center text-ink-2">Carregando perfil…</div>
  }
  if (!perfil.ativo) {
    return (
      <div className="min-h-full grid place-items-center p-10">
        <div className="text-center space-y-4">
          <p className="text-ink-2">Seu acesso está desativado. Fale com o administrador.</p>
          <button onClick={() => supabase.auth.signOut()} className="text-sm text-ink-3 underline">Sair</button>
        </div>
      </div>
    )
  }

  const ehAdmin = perfil.papel === 'admin'
  const abas = ABAS.filter((a) => !a.admin || ehAdmin)
  const barraCelular = BARRA_CELULAR
    .map((id) => abas.find((a) => a.id === id)).filter(Boolean)
  const maisCelular = abas.filter((a) => !BARRA_CELULAR.includes(a.id))
  const abaAtual = ABAS.find((a) => a.id === aba)

  function ligarParaLead(lead) {
    setLeadParaLigar(lead)
    setAba('telefone')
  }

  // De qualquer tela (agenda, telefone, placar…), tocar num lead abre a
  // ficha completa dele no CRM — ver o contato nunca exige caçar na lista.
  function abrirLead(leadId) {
    setLeadParaAbrir(leadId)
    setAba('leads')
  }

  async function enviarFoto(e) {
    const arq = e.target.files?.[0]
    if (!arq) return
    const caminho = `${perfil.user_id}.jpg`
    const { error } = await supabase.storage.from('avatares')
      .upload(caminho, arq, { upsert: true, contentType: arq.type })
    if (error) { alert(`Não deu para subir a foto: ${error.message}`); return }
    const { data } = supabase.storage.from('avatares').getPublicUrl(caminho)
    const url = `${data.publicUrl}?v=${Date.now()}`
    const { error: erroPerfil } = await supabase.rpc('atualizar_avatar', { _url: url })
    if (erroPerfil) { alert(`Foto subiu mas não salvou no perfil: ${erroPerfil.message}`); return }
    setPerfil({ ...perfil, avatar_url: url })
  }

  // O telefone fica MONTADO o tempo todo, só escondido quando a aba é outra.
  // Antes ele era desmontado ao trocar de aba, e o cleanup fazia unregister:
  // o ramal saía do ar (dezenas de quedas por hora), não recebia ligação de
  // entrada e, ao voltar, ficava alguns segundos reconectando — nesse intervalo
  // o botão de ligar não respondia e o mentor achava que tinha discado.
  // Se uma chamada estiver em curso, ele aparece mesmo estando em outra aba.
  const telefoneAtivo = ['chamando', 'tocando', 'em-chamada'].includes(estadoTel)
  const verTelefone = aba === 'telefone' || telefoneAtivo

  const conteudo = (
    <>
      <div className={verTelefone ? 'anim-in' : 'hidden'}>
        <Telefone perfil={perfil} leadParaLigar={leadParaLigar} aoMudarEstado={setEstadoTel}
          aoLimparLead={() => setLeadParaLigar(null)} aoPuxarLead={setLeadParaLigar}
          listaSessao={listaSessao} aoConsumirListaSessao={() => setListaSessao(null)}
          aoEditarRoteiro={() => setAba('scripts-meus')} />
      </div>
      <div key={aba} className={verTelefone ? 'hidden' : 'anim-in'}>
      {aba === 'listas' && (
        <Listas perfil={perfil} aoAbrirLead={abrirLead}
          aoVoltarDiscador={() => setAba('telefone')}
          aoSessaoLista={(l) => { setListaSessao(l); setAba('telefone') }} />
      )}
      {aba === 'contatos' && (
        <Contatos perfil={perfil} ehAdmin={ehAdmin} aoLigar={ligarParaLead} aoAbrirLead={abrirLead} />
      )}
      {aba === 'bmail' && <Bmail />}
      {aba === 'leads' && (
        <Leads perfil={perfil} ehAdmin={ehAdmin} aoLigar={ligarParaLead}
          aoVoltarDiscador={() => setAba('telefone')}
          leadInicial={leadParaAbrir} aoConsumirLeadInicial={() => setLeadParaAbrir(null)} />
      )}
      {aba === 'agenda' && (
        <Agenda perfil={perfil} ehAdmin={ehAdmin} aoLigar={ligarParaLead} aoAbrirLead={abrirLead} />
      )}
      {aba === 'compromissos' && (
        <div className="max-w-2xl mx-auto p-4 md:p-6">
          <Compromissos perfil={perfil} aoLigar={ligarParaLead} aoAbrirLead={abrirLead} />
        </div>
      )}
      {aba === 'contratos' && <Contratos perfil={perfil} ehAdmin={ehAdmin} />}
      {aba === 'carteira' && <Carteira perfil={perfil} ehAdmin={ehAdmin} />}
      {aba === 'placar' && (
        <Placar perfil={perfil} ehAdmin={ehAdmin} aoAbrirLead={abrirLead}
          aoAbrirAnalise={ehAdmin ? (uid) => { setAnaliseUser(uid); setAba('analise') } : null} />
      )}
      {aba === 'historico' && <Historico ehAdmin={ehAdmin} />}
      {aba === 'relatos' && <Relatos perfil={perfil} ehAdmin={ehAdmin} />}
      {aba === 'scripts-meus' && <MeusScripts perfil={perfil} />}
      {aba === 'whatsapp' && (
        <Whatsapp aoAbrirLead={abrirLead} aoLigar={ligarParaLead} />
      )}
      {aba === 'ia' && ehAdmin && <Ia />}
      {aba === 'analise' && ehAdmin && (
        <Analise usuarioInicial={analiseUser} aoConsumirInicial={() => setAnaliseUser(null)} />
      )}
      {aba === 'gestao' && ehAdmin && <Gestao />}
      </div>
    </>
  )

  const cartaoPerfil = (
    <label className="cursor-pointer shrink-0 relative group" title="Trocar sua foto">
      <Avatar url={perfil.avatar_url} nome={perfil.nome} tam={38} />
      <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 grid place-items-center text-white transition"><Icone nome="cam" tam={13} /></span>
      <input type="file" accept="image/*" className="hidden" onChange={enviarFoto} />
    </label>
  )

  return (
    // Shell de app: a moldura (cabeçalho, sidebar, menu de baixo) fica PRESA
    // na tela — só o conteúdo rola, no celular e no desktop. Sem isso a página
    // inteira rolava e o menu/sidebar iam junto.
    <div className="h-full md:flex overflow-hidden">
      <Notificacoes />
      {versaoNova && (
        <div className="fixed inset-x-0 top-0 z-50 bg-sinal text-white text-center text-sm font-bold py-2 px-3">
          Versão nova do sistema —{' '}
          {['chamando', 'tocando', 'em-chamada'].includes(estadoTel)
            ? 'atualiza assim que você desligar'
            : 'atualizando…'}
        </div>
      )}
      {/* ───────── SIDEBAR (desktop) ───────── */}
      <aside className="hidden md:flex md:flex-col md:w-60 lg:w-64 shrink-0 border-r border-line bg-surface/60 backdrop-blur">
        <div className="px-5 py-5 flex items-center gap-2">
          <img src="/babel-logo.png" alt="Babel" className="w-8 h-8 rounded-xl object-cover" />
          <span className="font-extrabold text-lg tracking-tight uppercase">Babel<span className="text-sinal">Phone</span></span>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {barraCelular.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={cn('w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition',
                aba === a.id ? 'bg-sinal/12 text-sinal' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
              <Icone nome={a.icone} tam={18} className="w-6 shrink-0" />
              {a.rotulo}
              {a.id === 'compromissos' && compromissosHoje > 0 ? (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-sinal text-white text-[10px] font-bold grid place-items-center tnum">
                  {compromissosHoje}
                </span>
              ) : (
                aba === a.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sinal" />
              )}
            </button>
          ))}
          <p className="px-3.5 pt-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-3">Mais</p>
          {abas.filter((a) => a.mais).map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={cn('w-full flex items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-medium transition',
                aba === a.id ? 'bg-sinal/12 text-sinal' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
              <Icone nome={a.icone} tam={17} className="w-6 shrink-0" />
              {a.rotulo}
              {aba === a.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sinal" />}
            </button>
          ))}
        </nav>
        <div className="p-3 m-3 rounded-2xl border border-line bg-surface flex items-center gap-3">
          {cartaoPerfil}
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-sm truncate">{perfil.nome}</span>
              {ehAdmin && <Chip cor="amber" className="!text-[9px] !px-1.5 tracking-widest">ADMIN</Chip>}
            </span>
            <span className="tnum block text-[11px] text-ink-3">ramal {perfil.ramal}</span>
          </span>
          <button onClick={() => supabase.auth.signOut()} title="Sair" className="text-ink-3 hover:text-danger transition"><Icone nome="sair" tam={15} /></button>
        </div>
      </aside>

      {/* ───────── ÁREA PRINCIPAL ───────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* topbar mobile */}
        <header className="md:hidden flex items-center gap-3 px-4 py-2.5 border-b border-line bg-surface/70 backdrop-blur sticky top-0 z-10">
          {cartaoPerfil}
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="font-bold truncate">{perfil.nome}</span>
              {ehAdmin && <Chip cor="amber" className="!text-[9px] !px-1.5 tracking-widest">ADMIN</Chip>}
            </span>
            <span className="block text-[11px] text-ink-3 uppercase">Babel<span className="text-sinal-2">Phone</span> · <span className="tnum">ramal {perfil.ramal}</span></span>
          </span>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-ink-3 underline shrink-0">sair</button>
        </header>

        {/* topbar desktop — contexto da tela */}
        <header className="hidden md:flex items-center gap-3 px-6 py-3.5 border-b border-line bg-surface/40">
          <Icone nome={abaAtual?.icone} tam={18} className="text-sinal" />
          <h1 className="text-lg font-bold tracking-tight uppercase">{abaAtual?.rotulo}</h1>
          <span className="ml-auto flex items-center gap-2 text-xs text-ink-3">
            <Sinal cor="sinal" pulsa /> PABX conectado
          </span>
        </header>

        {/* overflow-x-hidden: nada dentro de uma tela pode esticar a página
            de lado no celular — tabela larga rola no próprio bloco */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 md:pb-8">
          {conteudo}
        </main>
      </div>

      {/* ───────── BOTTOM TABS (mobile) ───────── */}
      {/* Menu FIXO de 6 itens (specs 2026-08-06): Discador · Listas · Agenda ·
          Compromissos · Placar · Mais. O "Mais" abre uma gaveta — nada rola. */}
      {maisAberto && (
        <div className="md:hidden fixed inset-0 z-20" onClick={() => setMaisAberto(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute bottom-[3.6rem] inset-x-0 mb-[env(safe-area-inset-bottom)] bg-surface border-t border-line rounded-t-2xl p-3 anim-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-4 gap-2">
              {maisCelular.map((a) => (
                <button key={a.id} onClick={() => { setAba(a.id); setMaisAberto(false) }}
                  className={cn('flex flex-col items-center gap-1 rounded-xl border py-3 text-[10px] font-semibold transition',
                    aba === a.id ? 'border-sinal/50 bg-sinal/10 text-sinal' : 'border-line text-ink-2')}>
                  <Icone nome={a.icone} tam={18} />
                  <span className="max-w-full truncate px-1">{a.curto || a.rotulo}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 flex border-t border-line bg-surface/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {barraCelular.map((a) => (
          <button key={a.id} onClick={() => { setAba(a.id); setMaisAberto(false) }}
            className={cn('flex-1 min-w-0 px-0 py-2 flex flex-col items-center gap-0.5 font-medium transition',
              'text-[9px]',
              aba === a.id && !maisAberto ? 'text-sinal' : 'text-ink-3')}>
            <span className="relative">
              <Icone nome={a.icone} tam={18}
                className={cn('transition-transform', aba === a.id && !maisAberto && 'scale-110')} />
              {a.id === 'compromissos' && compromissosHoje > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-sinal text-white text-[9px] font-bold grid place-items-center tnum">
                  {compromissosHoje}
                </span>
              )}
            </span>
            {/* rótulo curto no celular (a barra tem ~53px por item em 320px) e
                fonte que cresce junto com a tela — nada quebra em duas linhas */}
            <span className="max-w-full text-center leading-[1.05] whitespace-nowrap">{a.curto || a.rotulo}</span>
          </button>
        ))}
        <button onClick={() => setMaisAberto(!maisAberto)}
          className={cn('flex-1 min-w-0 px-0 py-2 flex flex-col items-center gap-0.5 font-medium transition',
            'text-[9px]',
            maisAberto || !BARRA_CELULAR.includes(aba) ? 'text-sinal' : 'text-ink-3')}>
          <Icone nome="menu" tam={18} />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  )
}

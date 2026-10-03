import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'

const caixa = 'rounded-xl bg-surface border border-line'
const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal'

// Ficha opcional do cliente no compromisso — os campos que o vendedor já tem
// na mão quando marca a mentoria.
const FICHA_VAZIA = { contato_nome: '', empresa: '', cnpj: '', telefone: '', email: '' }

// Sobe a logo no bucket público e devolve a URL (null se falhar — nem o
// agendamento nem a edição podem quebrar por causa de uma imagem).
async function subirLogoArquivo(arquivo) {
  if (!arquivo) return null
  const ext = (arquivo.name.split('.').pop() || 'png').toLowerCase()
  const caminho = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('logos')
    .upload(caminho, arquivo, { contentType: arquivo.type || 'image/png' })
  if (error) return null
  return supabase.storage.from('logos').getPublicUrl(caminho).data.publicUrl
}

// 00.000.000/0000-00 conforme digita; deixa passar incompleto (é opcional)
function mascaraCnpj(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

// "2026-08-04" no fuso local — a chave que liga cada compromisso ao seu dia
function chaveDia(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// Grade do mês em semanas (domingo → sábado), só as semanas que tocam o mês
function gradeDoMes(mes) {
  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const ini = new Date(primeiro)
  ini.setDate(1 - primeiro.getDay())
  const semanas = []
  for (let s = 0; s < 6; s++) {
    const linha = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(ini)
      dt.setDate(ini.getDate() + s * 7 + d)
      linha.push(dt)
    }
    if (linha.some((dt) => dt.getMonth() === mes.getMonth())) semanas.push(linha)
  }
  return semanas
}

export default function Agenda({ perfil, ehAdmin, aoLigar, aoAbrirLead }) {
  const [eventos, setEventos] = useState([])
  const [retornos, setRetornos] = useState([])
  const [posvendas, setPosvendas] = useState([])
  const [equipe, setEquipe] = useState([])
  const [mes, setMes] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [diaSel, setDiaSel] = useState(() => chaveDia(new Date()))
  const [mentorFiltro, setMentorFiltro] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('') // '' = tudo | agenda | retorno | posvenda
  const [criando, setCriando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [quando, setQuando] = useState('')
  const [tipo, setTipo] = useState('apresentacao')
  const [apresentadores, setApresentadores] = useState([])
  const [apresentador, setApresentador] = useState('')
  const [dia, setDia] = useState('')
  const [slots, setSlots] = useState([])
  const [slotEscolhido, setSlotEscolhido] = useState(null)
  const [erroAgendar, setErroAgendar] = useState('')
  // Ficha do cliente — tudo opcional. Fica recolhida para não assustar quem
  // só quer marcar a hora e sair.
  const [verFicha, setVerFicha] = useState(false)
  const [ficha, setFicha] = useState(FICHA_VAZIA)
  const [logo, setLogo] = useState(null)      // {arquivo, previa}
  const [subindoLogo, setSubindoLogo] = useState(false)
  const mudarFicha = (chave) => (e) => setFicha((f) => ({ ...f, [chave]: e.target.value }))

  function escolherLogo(e) {
    const arq = e.target.files?.[0]
    if (!arq) return
    setLogo({ arquivo: arq, previa: URL.createObjectURL(arq) })
  }

  async function subirLogo() {
    if (!logo?.arquivo) return null
    setSubindoLogo(true)
    const url = await subirLogoArquivo(logo.arquivo)
    setSubindoLogo(false)
    return url
  }

  // nomes de todo mundo — para dizer QUEM agendou, quem retorna, quem cuida
  useEffect(() => {
    supabase.from('profiles').select('user_id, nome')
      .then(({ data }) => setEquipe(data || []))
  }, [])
  const nome = (uid) => equipe.find((m) => m.user_id === uid)?.nome?.split(' ').slice(0, 2).join(' ') || ''

  // carrega o MÊS visível inteiro: eventos de agenda + retornos + pós-vendas
  async function carregar() {
    const ini = new Date(mes)
    const fim = new Date(mes.getFullYear(), mes.getMonth() + 1, 0, 23, 59, 59, 999)
    let qe = supabase.from('agenda_eventos')
      .select('*, leads(empresa, telefone), profiles!agenda_eventos_vendedor_fkey(nome)')
      .neq('status', 'cancelado')
      .gte('inicio', ini.toISOString()).lte('inicio', fim.toISOString())
      .order('inicio').limit(300)
    if (!ehAdmin) qe = qe.or(`vendedor.eq.${perfil.user_id},criado_por.eq.${perfil.user_id}`)

    let qr = supabase.from('leads')
      .select('id, empresa, telefone, proxima_acao_em, atribuido_a, status')
      .not('proxima_acao_em', 'is', null)
      .not('status', 'in', '(convertido,descartado)')
      .gte('proxima_acao_em', ini.toISOString()).lte('proxima_acao_em', fim.toISOString())
      .order('proxima_acao_em').limit(300)
    if (!ehAdmin) qr = qr.eq('atribuido_a', perfil.user_id)

    let qp = supabase.from('leads')
      .select('id, empresa, telefone, posvenda_proximo_em, atribuido_a, status')
      .eq('status', 'convertido').not('posvenda_proximo_em', 'is', null)
      .gte('posvenda_proximo_em', ini.toISOString()).lte('posvenda_proximo_em', fim.toISOString())
      .order('posvenda_proximo_em').limit(300)
    if (!ehAdmin) qp = qp.eq('atribuido_a', perfil.user_id)

    const [{ data: evs }, { data: rets }, { data: pos }] = await Promise.all([qe, qr, qp])
    setEventos(evs || [])
    setRetornos(rets || [])
    setPosvendas(pos || [])
  }
  useEffect(() => { carregar() }, [mes])

  // mentores com mentorias ativas (para o fluxo de agendamento de mentoria)
  useEffect(() => {
    supabase.from('apresentadores_config')
      .select('user_id, duracao_min, profiles(nome, ramal)')
      .eq('ativo', true)
      .then(({ data }) => setApresentadores(data || []))
  }, [criando])

  // slots do dia escolhido (livres e ocupados — ocupado aparece bloqueado)
  useEffect(() => {
    setSlots([]); setSlotEscolhido(null)
    if (!apresentador || !dia) return
    supabase.rpc('horarios_disponiveis', { _apresentador: apresentador, _dia: dia })
      .then(({ data }) => setSlots(data || []))
  }, [apresentador, dia])

  async function criar(e) {
    e.preventDefault()
    setErroAgendar('')
    // só manda o que foi preenchido — campo vazio vira null, não string vazia
    const dados = Object.fromEntries(
      Object.entries(ficha).map(([k, v]) => [k, v.trim() || null]),
    )
    if (tipo === 'apresentacao') {
      if (!slotEscolhido) { setErroAgendar('Escolha um horário livre.'); return }
      // A logo sobe ANTES de ocupar o horário: se a imagem falhar, ninguém
      // fica com um slot preso por causa disso.
      const logoUrl = await subirLogo()
      const { data: novoId, error } = await supabase.rpc('agendar_apresentacao', {
        _apresentador: apresentador, _inicio: slotEscolhido, _titulo: titulo,
      })
      if (error) {
        setErroAgendar(error.message)
        // atualiza a grade — o horário pode ter acabado de ser ocupado
        const { data } = await supabase.rpc('horarios_disponiveis', { _apresentador: apresentador, _dia: dia })
        setSlots(data || []); setSlotEscolhido(null)
        return
      }
      // a RPC só recebe título e horário; a ficha entra logo em seguida
      if (novoId) {
        await supabase.from('agenda_eventos')
          .update({ ...dados, logo_url: logoUrl }).eq('id', novoId)
      }
    } else {
      const inicio = new Date(quando)
      const logoUrl = await subirLogo()
      await supabase.from('agenda_eventos').insert({
        titulo,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + 30 * 60000).toISOString(),
        vendedor: perfil.user_id,
        criado_por: perfil.user_id,
        tipo,
        ...dados,
        logo_url: logoUrl,
      })
    }
    setCriando(false); setTitulo(''); setQuando(''); setTipo('apresentacao')
    setApresentador(''); setDia(''); setSlots([]); setSlotEscolhido(null)
    setFicha(FICHA_VAZIA); setLogo(null); setVerFicha(false)
    carregar()
  }

  async function marcar(ev, status) {
    await supabase.from('agenda_eventos').update({ status }).eq('id', ev.id)
    carregar()
  }

  async function criarSala(ev) {
    const codigo = ev.id.replace(/-/g, '').slice(0, 10)
    await supabase.from('agenda_eventos').update({ sala_reuniao: codigo }).eq('id', ev.id)
    carregar()
  }

  // ───── CRUD do novo fluxo (spec 2026-08-06): editar, remarcar e apagar ─────
  async function salvarEdicao(ev, titulo, quandoIso, dados) {
    if (ev._tipo === 'retorno') {
      await supabase.rpc('agendar_retorno', { _lead_id: ev.lead_id, _quando: quandoIso })
    } else if (ev._tipo === 'posvenda') {
      await supabase.from('leads').update({ posvenda_proximo_em: quandoIso }).eq('id', ev.lead_id)
    } else {
      const dur = ev.fim ? new Date(ev.fim) - new Date(ev.inicio) : 30 * 60000
      await supabase.from('agenda_eventos').update({
        titulo, inicio: quandoIso,
        fim: new Date(new Date(quandoIso).getTime() + dur).toISOString(),
        ...(dados || {}),
      }).eq('id', ev.id)
    }
    carregar()
  }
  async function apagar(ev) {
    const nomeDe = { retorno: 'o retorno de', posvenda: 'o pós-venda de' }[ev._tipo] || 'o compromisso'
    if (!window.confirm(`Apagar ${nomeDe} "${ev.titulo}"? Isso não tem volta.`)) return
    if (ev._tipo === 'retorno') {
      await supabase.from('leads').update({ proxima_acao_em: null }).eq('id', ev.lead_id)
    } else if (ev._tipo === 'posvenda') {
      await supabase.from('leads').update({ posvenda_proximo_em: null }).eq('id', ev.lead_id)
    } else {
      await supabase.from('agenda_eventos').delete().eq('id', ev.id)
    }
    carregar()
  }

  // ───── junta tudo num só formato e aplica o filtro por pessoa ─────
  const dono = (x) => x.vendedor || x.atribuido_a
  let itens = [
    ...eventos.map((ev) => ({ ...ev, _tipo: ev.tipo === 'apresentacao' ? 'mentoria' : 'outro', _quando: ev.inicio })),
    ...retornos.map((l) => ({
      id: 'r' + l.id, _tipo: 'retorno', _quando: l.proxima_acao_em, lead_id: l.id,
      titulo: l.empresa, leads: { empresa: l.empresa, telefone: l.telefone }, atribuido_a: l.atribuido_a,
    })),
    ...posvendas.map((l) => ({
      id: 'pv' + l.id, _tipo: 'posvenda', _quando: l.posvenda_proximo_em, lead_id: l.id,
      titulo: l.empresa, leads: { empresa: l.empresa, telefone: l.telefone }, atribuido_a: l.atribuido_a,
    })),
  ]
  if (ehAdmin && mentorFiltro) {
    itens = itens.filter((x) => dono(x) === mentorFiltro || x.criado_por === mentorFiltro)
  }
  // filtro por tipo: "agenda" = compromissos marcados (mentoria + outro)
  if (tipoFiltro === 'agenda') itens = itens.filter((x) => x._tipo === 'mentoria' || x._tipo === 'outro')
  else if (tipoFiltro) itens = itens.filter((x) => x._tipo === tipoFiltro)

  // contagem por dia para desenhar o calendário
  const porDia = {}
  for (const x of itens) {
    const k = chaveDia(x._quando)
    porDia[k] = porDia[k] || { mentoria: 0, retorno: 0, posvenda: 0, outro: 0 }
    porDia[k][x._tipo]++
  }

  const doDia = itens.filter((x) => chaveDia(x._quando) === diaSel)
    .sort((a, b) => new Date(a._quando) - new Date(b._quando))

  const preenchidos = Object.values(ficha).filter((v) => v.trim()).length + (logo ? 1 : 0)
  const hojeK = chaveDia(new Date())
  const nomeMes = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const mudarMes = (n) => setMes((m) => { const d = new Date(m); d.setMonth(d.getMonth() + n); return d })

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <button onClick={() => setCriando(!criando)} className={`w-full ${caixa} py-3 font-semibold text-sm`}>
        + Novo compromisso
      </button>
      {criando && (
        <form onSubmit={criar} className={`${caixa} p-3 space-y-2`}>
          <div className="flex gap-1.5">
            {[['apresentacao', 'Mentoria'], ['outro', 'Outro']].map(([id, rotulo]) => (
              <button type="button" key={id} onClick={() => setTipo(id)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold border ${
                  tipo === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
                {rotulo}
              </button>
            ))}
          </div>
          <input required placeholder={tipo === 'apresentacao' ? 'Título (empresa / cliente)' : 'Título'}
            value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
          {tipo === 'apresentacao' ? (
            <>
              <select required value={apresentador} onChange={(e) => setApresentador(e.target.value)} className={campo}>
                <option value="">Quem dá a mentoria?</option>
                {apresentadores.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.profiles?.nome} · call de {a.duracao_min} min
                  </option>
                ))}
              </select>
              {apresentadores.length === 0 && (
                <p className="text-[11px] text-amber px-1">Ninguém com mentorias ativas — o admin ativa em Gestão → Equipe.</p>
              )}
              {apresentador && (
                <input required type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={campo} />
              )}
              {apresentador && dia && slots.length === 0 && (
                <p className="text-[11px] text-ink-3 px-1">Este mentor não atende neste dia — escolha outra data.</p>
              )}
              {slots.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {slots.map((s) => (
                    <button type="button" key={s.inicio} disabled={!s.livre}
                      onClick={() => setSlotEscolhido(s.inicio)}
                      title={s.livre ? 'Horário livre' : 'Horário ocupado'}
                      className={`rounded-lg py-1.5 text-xs font-semibold border tnum ${
                        slotEscolhido === s.inicio
                          ? 'border-sinal bg-sinal text-white'
                          : s.livre
                            ? 'border-sinal/40 text-sinal'
                            : 'border-danger/30 text-danger/60 line-through cursor-not-allowed'}`}>
                      {new Date(s.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-ink-3 px-1">Mentoria agendada conta pontos no placar — riscados em vermelho já estão ocupados.</p>
            </>
          ) : (
            <input required type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className={campo} />
          )}
          {/* ───── ficha do cliente: tudo opcional, recolhida por padrão ───── */}
          <button type="button" onClick={() => setVerFicha(!verFicha)}
            className="w-full flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2">
            <span>
              Dados do cliente <span className="text-ink-3 font-normal">· opcional</span>
              {preenchidos > 0 && <span className="text-sinal"> · {preenchidos} preenchido{preenchidos > 1 ? 's' : ''}</span>}
            </span>
            <span className="text-ink-3">{verFicha ? '▲' : '▼'}</span>
          </button>
          {verFicha && (
            <div className="space-y-2 anim-in">
              <input placeholder="Nome de quem você fala" value={ficha.contato_nome}
                onChange={mudarFicha('contato_nome')} className={campo} />
              <input placeholder="Nome da empresa" value={ficha.empresa}
                onChange={mudarFicha('empresa')} className={campo} />
              <div className="flex gap-2">
                <input placeholder="CNPJ" value={ficha.cnpj} inputMode="numeric"
                  onChange={(ev) => setFicha((f) => ({ ...f, cnpj: mascaraCnpj(ev.target.value) }))}
                  className={`${campo} flex-1 min-w-0 tnum`} />
                <input placeholder="Telefone" value={ficha.telefone} inputMode="tel"
                  onChange={mudarFicha('telefone')} className={`${campo} flex-1 min-w-0 tnum`} />
              </div>
              <input placeholder="E-mail" type="email" value={ficha.email}
                onChange={mudarFicha('email')} className={campo} />
              <div className="flex items-center gap-2">
                {logo?.previa && (
                  <img src={logo.previa} alt="" className="w-12 h-12 rounded-lg object-contain bg-surface-2 border border-line shrink-0" />
                )}
                <label className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-2 text-center cursor-pointer hover:border-sinal hover:text-sinal transition">
                  <Icone nome="cam" tam={13} className="inline mr-1.5 -mt-0.5" />
                  {logo ? 'Trocar logo' : 'Logo da empresa'}
                  <input type="file" accept="image/*" className="hidden" onChange={escolherLogo} />
                </label>
                {logo && (
                  <button type="button" onClick={() => setLogo(null)} title="Tirar a logo"
                    className="shrink-0 rounded-lg border border-line px-2.5 py-2 text-ink-3 hover:text-danger hover:border-danger/50 transition">
                    <Icone nome="lixo" tam={14} />
                  </button>
                )}
              </div>
            </div>
          )}
          {erroAgendar && <p className="text-sm text-danger px-1">{erroAgendar}</p>}
          <button disabled={subindoLogo} className="w-full rounded-lg bg-sinal py-2 font-semibold text-white disabled:opacity-50">
            {subindoLogo ? 'Enviando a logo…' : tipo === 'apresentacao' ? 'Agendar mentoria' : 'Criar'}
          </button>
        </form>
      )}

      {/* ───── filtro por pessoa (admin) ───── */}
      {ehAdmin && (
        <select value={mentorFiltro} onChange={(e) => setMentorFiltro(e.target.value)}
          className="w-full rounded-lg bg-surface-2 border border-line px-2 py-2 text-sm outline-none">
          <option value="">Agenda de todo mundo</option>
          {equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
        </select>
      )}

      {/* ───── filtro por tipo: tudo · só agenda · só retornos · só pós-venda ───── */}
      <div className="flex gap-1.5">
        {[['', 'Tudo'], ['agenda', 'Agenda'], ['retorno', 'Retornos'], ['posvenda', 'Pós-venda']].map(([id, rotulo]) => (
          <button key={id} onClick={() => setTipoFiltro(id)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold border transition ${
              tipoFiltro === id ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}>
            {rotulo}
          </button>
        ))}
      </div>

      {/* ───── calendário ───── */}
      <div className={`${caixa} p-3 space-y-2`}>
        <div className="flex items-center justify-between">
          <button onClick={() => mudarMes(-1)} className="w-9 h-9 rounded-lg border border-line text-ink-2 font-bold">‹</button>
          <button onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMes(d); setDiaSel(hojeK) }}
            className="text-sm font-semibold capitalize">
            {nomeMes}
          </button>
          <button onClick={() => mudarMes(1)} className="w-9 h-9 rounded-lg border border-line text-ink-2 font-bold">›</button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 md:gap-1 text-center text-[10px] text-ink-3 font-semibold">
          {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => <span key={d}>{d}</span>)}
        </div>
        {gradeDoMes(mes).map((semana, i) => (
          <div key={i} className="grid grid-cols-7 gap-0.5 md:gap-1">
            {semana.map((dt) => {
              const k = chaveDia(dt)
              const c = porDia[k]
              const doMes = dt.getMonth() === mes.getMonth()
              return (
                <button key={k} onClick={() => setDiaSel(k)}
                  className={`min-w-0 rounded-lg border px-0.5 pt-1 pb-0.5 min-h-[3.4rem] flex flex-col items-center gap-0.5 transition ${
                    diaSel === k ? 'border-sinal bg-sinal/10'
                      : k === hojeK ? 'border-sinal/40'
                      : 'border-line'} ${doMes ? '' : 'opacity-30'}`}>
                  <span className={`text-[11px] md:text-xs tnum ${diaSel === k ? 'font-bold text-sinal' : 'text-ink-2'}`}>{dt.getDate()}</span>
                  {/* gap generoso: com gap mínimo o "·outro" grudava no número
                      anterior e "○4 ·1" virava ilegível "○41" */}
                  {c && (
                    <span className="flex flex-wrap justify-center gap-x-1.5 gap-y-0.5 leading-tight text-[8px] md:text-[9px] tnum">
                      {c.mentoria > 0 && <span className="text-sinal font-bold">●{c.mentoria}</span>}
                      {c.retorno > 0 && <span className="text-sinal/70">○{c.retorno}</span>}
                      {c.posvenda > 0 && <span className="text-ink-2">◆{c.posvenda}</span>}
                      {c.outro > 0 && <span className="text-ink-3">▪{c.outro}</span>}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
        <p className="text-[10px] text-ink-3 text-center">
          ● mentoria · ○ retorno · ◆ pós-venda · &middot; outro
        </p>
      </div>

      {/* ───── compromissos do dia escolhido ───── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">
          {diaSel === hojeK ? 'Hoje' : new Date(`${diaSel}T12:00:00`).toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long' })} · {doDia.length} compromisso{doDia.length === 1 ? '' : 's'}
        </p>
        {doDia.length === 0 && <p className="text-xs text-ink-3">Nada neste dia.</p>}
        {doDia.map((ev) => (
          <CartaoDia key={ev.id} ev={ev} ehAdmin={ehAdmin} meuId={perfil.user_id}
            nome={nome} aoMarcar={marcar} aoCriarSala={criarSala} aoLigar={aoLigar}
            aoAbrirLead={aoAbrirLead} aoEditar={salvarEdicao} aoApagar={apagar} />
        ))}
      </div>
    </div>
  )
}

// Um compromisso do dia — mentoria, retorno, pós-venda ou outro.
// Sempre diz QUEM: quem apresenta e quem agendou (mentoria), quem retorna
// (retorno), quem cuida do cliente (pós-venda).
// Uma linha do cartão: rótulo à esquerda, valor à direita.
function LinhaCartao({ rotulo, valor, destaque, alerta }) {
  if (!valor) return null
  return (
    <span className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-ink-3 shrink-0">{rotulo}</span>
      <b className={`text-right truncate ${alerta ? 'text-sinal' : destaque ? 'text-sinal' : 'text-ink'}`}>{valor}</b>
    </span>
  )
}

// Os dados que o vendedor levantou na hora de marcar. Cada linha só aparece
// se foi preenchida — cartão de compromisso sem dado nenhum continua limpo.
function FichaCliente({ ev }) {
  if (!ev.contato_nome && !ev.cnpj && !ev.telefone && !ev.email) return null
  return (
    <>
      <LinhaCartao rotulo="Contato" valor={ev.contato_nome} />
      <LinhaCartao rotulo="CNPJ" valor={ev.cnpj} />
      <LinhaCartao rotulo="Telefone" valor={ev.telefone ? formatarFone(ev.telefone) : ''} />
      <LinhaCartao rotulo="E-mail" valor={ev.email} />
    </>
  )
}

// "2026-08-06T14:30" no fuso local — valor do input datetime-local
function paraInputLocal(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function CartaoDia({ ev, nome, aoMarcar, aoCriarSala, aoLigar, aoAbrirLead, aoEditar, aoApagar }) {
  const hora = new Date(ev._quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const vencido = (ev._tipo === 'retorno' || ev._tipo === 'posvenda') && new Date(ev._quando) <= new Date()
  const [editando, setEditando] = useState(false)
  const [tit, setTit] = useState(ev.titulo || '')
  const [qdo, setQdo] = useState(() => paraInputLocal(ev._quando))
  const podeTitulo = ev._tipo === 'mentoria' || ev._tipo === 'outro'
  // Ficha do cliente também se corrige aqui: CNPJ digitado errado não pode
  // obrigar a apagar o compromisso e remarcar o horário do zero.
  const [fichaEd, setFichaEd] = useState(() => ({
    contato_nome: ev.contato_nome || '', empresa: ev.empresa || '', cnpj: ev.cnpj || '',
    telefone: ev.telefone || '', email: ev.email || '',
  }))
  const [verFichaEd, setVerFichaEd] = useState(false)
  const [logoEd, setLogoEd] = useState(null)
  const [salvandoEd, setSalvandoEd] = useState(false)
  const mudarEd = (chave) => (e) => setFichaEd((f) => ({ ...f, [chave]: e.target.value }))

  async function salvar() {
    if (!qdo) return
    setSalvandoEd(true)
    const dados = podeTitulo
      ? Object.fromEntries(Object.entries(fichaEd).map(([k, v]) => [k, v.trim() || null]))
      : null
    if (dados && logoEd?.arquivo) {
      const url = await subirLogoArquivo(logoEd.arquivo)
      if (url) dados.logo_url = url
    }
    await aoEditar(ev, tit.trim() || ev.titulo, new Date(qdo).toISOString(), dados)
    setSalvandoEd(false)
    setEditando(false)
  }

  const estilo = {
    mentoria: 'bg-surface border-line',
    outro: 'bg-surface border-line',
    retorno: vencido ? 'bg-sinal/10 border-sinal/50' : 'bg-sinal/5 border-sinal/25',
    posvenda: 'bg-surface border-line',
  }[ev._tipo]
  const icone = { mentoria: 'calcheck', outro: 'pino', retorno: 'relogio', posvenda: 'equipe' }[ev._tipo]
  const botaoMini = 'text-xs border rounded-full px-2.5 py-0.5 inline-flex items-center gap-1'

  // Tem lead vinculado → o cartão inteiro abre a ficha do contato no CRM.
  // Os botões internos (ligar, marcar feito…) seguram o clique para si.
  const abreLead = ev.lead_id && aoAbrirLead ? () => aoAbrirLead(ev.lead_id) : null

  return (
    <div onClick={abreLead || undefined} role={abreLead ? 'button' : undefined}
      title={abreLead ? 'Ver o contato deste lead' : undefined}
      className={`rounded-xl border px-4 py-3 space-y-1.5 ${estilo} ${abreLead ? 'cursor-pointer active:opacity-80 transition' : ''}`}>
      <div className="flex justify-between gap-2">
        <span className="font-medium text-sm flex items-center gap-1.5 min-w-0">
          {ev.logo_url ? (
            <img src={ev.logo_url} alt="" loading="lazy"
              className="w-7 h-7 rounded-md object-contain bg-surface-2 border border-line shrink-0" />
          ) : (
            <Icone nome={icone} tam={13} className={`shrink-0 ${vencido ? 'text-sinal' : 'text-ink-2'}`} />
          )}
          <span className="truncate">{ev.titulo}</span>
          {abreLead ? <span className="text-ink-3 text-xs shrink-0">›</span> : null}
        </span>
        <span className={`text-xs whitespace-nowrap tnum ${vencido ? 'text-sinal font-semibold' : 'text-ink-2'}`}>{hora}</span>
      </div>

      {/* ficha do compromisso: uma informação por linha, com rótulo claro */}
      <div className="space-y-0.5">
        {ev._tipo === 'mentoria' && (
          <>
            <LinhaCartao rotulo="Cliente" valor={ev.empresa || ev.leads?.empresa || ev.titulo} />
            <FichaCliente ev={ev} />
            <LinhaCartao rotulo="Quem agendou" valor={nome(ev.criado_por)} />
            <LinhaCartao rotulo="Quem apresenta" valor={ev.profiles?.nome || nome(ev.vendedor)} destaque />
            {ev.status !== 'marcado' && (
              <LinhaCartao rotulo="Situação" valor={
                { feito: 'feita', faltou: 'cliente faltou' }[ev.status] || ev.status} />
            )}
          </>
        )}
        {ev._tipo === 'outro' && (
          <>
            {ev.empresa && <LinhaCartao rotulo="Cliente" valor={ev.empresa} />}
            <FichaCliente ev={ev} />
            <LinhaCartao rotulo="Criado por" valor={nome(ev.vendedor)} />
            {ev.status !== 'marcado' && <LinhaCartao rotulo="Situação" valor={ev.status} />}
          </>
        )}
        {ev._tipo === 'retorno' && (
          <>
            <LinhaCartao rotulo="Quem retorna" valor={nome(ev.atribuido_a)} destaque />
            <LinhaCartao rotulo="Situação"
              valor={vencido ? 'vencido — ligar agora' : 'retorno agendado'} alerta={vencido} />
          </>
        )}
        {ev._tipo === 'posvenda' && (
          <>
            <LinhaCartao rotulo="Cliente (comprou)" valor={ev.leads?.empresa} />
            <LinhaCartao rotulo="Quem cuida" valor={nome(ev.atribuido_a)} destaque />
            <LinhaCartao rotulo="Situação"
              valor={vencido ? 'hora de falar com o cliente' : 'contato programado'} alerta={vencido} />
          </>
        )}
      </div>

      {/* editor embutido: editar título e remarcar data/hora sem sair da tela */}
      {editando && (
        <div className="space-y-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
          {podeTitulo && (
            <input value={tit} onChange={(e) => setTit(e.target.value)} placeholder="Título"
              className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
          )}
          <input type="datetime-local" value={qdo} onChange={(e) => setQdo(e.target.value)}
            className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
          {podeTitulo && (
            <>
              <button type="button" onClick={() => setVerFichaEd(!verFichaEd)}
                className="w-full flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2">
                <span>Dados do cliente <span className="text-ink-3 font-normal">· opcional</span></span>
                <span className="text-ink-3">{verFichaEd ? '▲' : '▼'}</span>
              </button>
              {verFichaEd && (
                <div className="space-y-1.5">
                  <input placeholder="Nome de quem você fala" value={fichaEd.contato_nome}
                    onChange={mudarEd('contato_nome')} className={`${campo} text-sm`} />
                  <input placeholder="Nome da empresa" value={fichaEd.empresa}
                    onChange={mudarEd('empresa')} className={`${campo} text-sm`} />
                  <div className="flex gap-1.5">
                    <input placeholder="CNPJ" value={fichaEd.cnpj} inputMode="numeric"
                      onChange={(e) => setFichaEd((f) => ({ ...f, cnpj: mascaraCnpj(e.target.value) }))}
                      className={`${campo} text-sm flex-1 min-w-0 tnum`} />
                    <input placeholder="Telefone" value={fichaEd.telefone} inputMode="tel"
                      onChange={mudarEd('telefone')} className={`${campo} text-sm flex-1 min-w-0 tnum`} />
                  </div>
                  <input placeholder="E-mail" type="email" value={fichaEd.email}
                    onChange={mudarEd('email')} className={`${campo} text-sm`} />
                  <div className="flex items-center gap-2">
                    {(logoEd?.previa || ev.logo_url) && (
                      <img src={logoEd?.previa || ev.logo_url} alt=""
                        className="w-10 h-10 rounded-lg object-contain bg-surface-2 border border-line shrink-0" />
                    )}
                    <label className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2 text-center cursor-pointer hover:border-sinal hover:text-sinal transition">
                      <Icone nome="cam" tam={12} className="inline mr-1.5 -mt-0.5" />
                      {ev.logo_url || logoEd ? 'Trocar logo' : 'Logo da empresa'}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => {
                          const arq = e.target.files?.[0]
                          if (arq) setLogoEd({ arquivo: arq, previa: URL.createObjectURL(arq) })
                        }} />
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
          <div className="flex gap-1.5">
            <button onClick={salvar} disabled={salvandoEd}
              className="flex-1 rounded-lg bg-sinal py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {salvandoEd ? 'Salvando…' : 'Salvar'}
            </button>
            <button onClick={() => setEditando(false)}
              className="flex-1 rounded-lg border border-line py-1.5 text-xs font-semibold text-ink-2">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {ev._tipo === 'mentoria' && ev.status === 'marcado' && !editando && (
        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          {ev.sala_reuniao ? (
            <>
              <a href={`/?sala=${ev.sala_reuniao}`}
                className={`${botaoMini} border-sinal/50 bg-sinal/10 text-sinal font-semibold`}>
                <Icone nome="play" tam={10} /> Entrar na sala
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?sala=${ev.sala_reuniao}`)}
                className={`${botaoMini} border-line text-ink-2`}>
                Copiar link do cliente
              </button>
            </>
          ) : (
            <button onClick={() => aoCriarSala(ev)} className={`${botaoMini} border-sinal/40 text-sinal`}>
              <Icone nome="play" tam={10} /> Criar sala
            </button>
          )}
          <button onClick={() => aoMarcar(ev, 'feito')} className={`${botaoMini} border-sinal/40 text-sinal`}>
            <Icone nome="check" tam={10} /> Feito
          </button>
          <button onClick={() => aoMarcar(ev, 'faltou')} className={`${botaoMini} border-amber/40 text-amber`}>Faltou</button>
          <button onClick={() => setEditando(true)} className={`${botaoMini} border-line text-ink-2`}>
            <Icone nome="lapis" tam={10} /> Editar
          </button>
          <button onClick={() => aoApagar(ev)} className={`${botaoMini} border-line text-ink-3 hover:text-danger hover:border-danger/40`}>
            <Icone nome="lixo" tam={10} /> Apagar
          </button>
        </div>
      )}

      {ev._tipo === 'outro' && !editando && (
        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          {ev.status === 'marcado' && (
            <button onClick={() => aoMarcar(ev, 'feito')} className={`${botaoMini} border-sinal/40 text-sinal`}>
              <Icone nome="check" tam={10} /> Concluir
            </button>
          )}
          <button onClick={() => setEditando(true)} className={`${botaoMini} border-line text-ink-2`}>
            <Icone nome="lapis" tam={10} /> Editar
          </button>
          <button onClick={() => aoApagar(ev)} className={`${botaoMini} border-line text-ink-3 hover:text-danger hover:border-danger/40`}>
            <Icone nome="lixo" tam={10} /> Apagar
          </button>
        </div>
      )}

      {(ev._tipo === 'retorno' || ev._tipo === 'posvenda') && !editando && (
        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {ev.leads?.telefone && (
            <p className="text-[11px] text-ink-3 flex-1 tnum min-w-full sm:min-w-0">{formatarFone(ev.leads.telefone)}</p>
          )}
          {aoLigar && ev.leads?.telefone && (
            <button
              onClick={() => aoLigar({ id: ev.lead_id, empresa: ev.leads.empresa, telefone: ev.leads.telefone })}
              className={`${botaoMini} border-transparent bg-sinal text-white font-bold px-3 py-1`}>
              <Icone nome="fone" tam={10} /> Ligar agora
            </button>
          )}
          <button onClick={() => setEditando(true)} className={`${botaoMini} border-line text-ink-2`}>
            <Icone nome="cal" tam={10} /> Remarcar
          </button>
          <button onClick={() => aoApagar(ev)} className={`${botaoMini} border-line text-ink-3 hover:text-danger hover:border-danger/40`}>
            <Icone nome="lixo" tam={10} /> Remover
          </button>
        </div>
      )}
    </div>
  )
}

function formatarFone(f) {
  const n = (f || '').replace(/\D/g, '').replace(/^55/, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return f
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const SEMANA = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00']
const CFG_PADRAO = {
  ativo: false, duracao_min: 30, dias: [1, 2, 3, 4, 5, 6],
  horarios: { 1: SEMANA, 2: SEMANA, 3: SEMANA, 4: SEMANA, 5: SEMANA,
    6: ['09:00', '10:00', '11:00', '12:00'] },
}

export default function Equipe() {
  const [equipe, setEquipe] = useState([])
  const [euId, setEuId] = useState(null)
  const [configs, setConfigs] = useState({})
  const [configAberta, setConfigAberta] = useState(null)
  const [comissaoAberta, setComissaoAberta] = useState(null)
  const [zapAberto, setZapAberto] = useState(null)
  const [zapValor, setZapValor] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEuId(data.user?.id))
  }, [])
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    const [{ data }, { data: cfgs }] = await Promise.all([
      supabase.from('profiles').select('*').order('ramal'),
      supabase.from('apresentadores_config').select('*'),
    ])
    setEquipe(data || [])
    setConfigs(Object.fromEntries((cfgs || []).map((c) => [c.user_id, c])))
  }

  useEffect(() => { carregar() }, [])

  async function cadastrar(e) {
    e.preventDefault()
    setMensagem('')
    setSalvando(true)
    const { data, error } = await supabase.functions.invoke('criar-vendedor', {
      body: { nome, email, senha },
    })
    if (error) {
      setMensagem('Erro ao cadastrar. Confira se o e-mail já não está em uso.')
    } else {
      setMensagem(`${nome} cadastrado no ramal ${data.ramal}.`)
      setNome(''); setEmail(''); setSenha('')
      carregar()
    }
    setSalvando(false)
  }

  async function alternarAtivo(pessoa) {
    await supabase.from('profiles').update({ ativo: !pessoa.ativo }).eq('user_id', pessoa.user_id)
    carregar()
  }

  async function alternarAdmin(pessoa) {
    const novoPapel = pessoa.papel === 'admin' ? 'vendedor' : 'admin'
    const pergunta = novoPapel === 'admin'
      ? `Tornar ${pessoa.nome} ADMIN? Vai enxergar e gerenciar TUDO de todos.`
      : `Remover o admin de ${pessoa.nome}? Volta a ver apenas o próprio trabalho.`
    if (!confirm(pergunta)) return
    await supabase.from('profiles').update({ papel: novoPapel }).eq('user_id', pessoa.user_id)
    carregar()
  }

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <form onSubmit={cadastrar} className="rounded-xl bg-surface border border-line p-4 space-y-3">
        <h2 className="font-semibold">Cadastrar mentor</h2>
        <input required placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)}
          className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal" />
        <input required type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal" />
        <input required type="text" minLength={8} placeholder="Senha de acesso (mín. 8)" value={senha} onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal" />
        {mensagem && <p className="text-sm text-sinal">{mensagem}</p>}
        <button disabled={salvando} className="w-full rounded-lg bg-sinal py-2.5 font-semibold text-white disabled:opacity-50">
          {salvando ? 'Cadastrando…' : 'Cadastrar'}
        </button>
      </form>

      <div className="space-y-2">
        {equipe.map((p) => (
          <div key={p.user_id} className="rounded-xl bg-surface border border-line">
          <div className="flex items-center gap-3 px-4 py-3">
            {p.avatar_url ? (
              <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-line shrink-0" />
            ) : (
              <span className="w-9 h-9 rounded-full bg-surface-2 border border-line flex items-center justify-center font-bold text-ink-2 shrink-0">
                {p.nome?.[0]?.toUpperCase()}
              </span>
            )}
            <span className="flex-1">
              <span className="block font-medium">
                {p.nome}{' '}
                {p.papel === 'admin' && (
                  <span className="text-[9px] font-bold bg-amber/15 border border-amber/40 text-amber rounded px-1.5 py-px tracking-widest align-middle">ADMIN</span>
                )}
                {configs[p.user_id]?.ativo && (
                  <span className="text-[9px] font-bold bg-sinal/15 border border-sinal/40 text-sinal rounded px-1.5 py-px tracking-widest align-middle ml-1">MENTORIAS</span>
                )}
                {p.eh_socio && (
                  <span className="text-[9px] font-bold bg-violet/15 border border-violet/40 text-violet rounded px-1.5 py-px tracking-widest align-middle ml-1">SÓCIO</span>
                )}
              </span>
              <span className="block text-xs text-ink-2">Ramal {p.ramal}</span>
            </span>
            <button onClick={() => setConfigAberta(configAberta === p.user_id ? null : p.user_id)}
              className={`rounded-lg px-2.5 py-1 text-xs border ${configAberta === p.user_id ? 'border-sinal/50 text-sinal' : 'border-line text-ink-2'}`}
              title="Configurar mentorias (dias e horários)">
              <Icone nome="cal" tam={14} />
            </button>
            <button onClick={() => {
                setZapAberto(zapAberto === p.user_id ? null : p.user_id)
                setZapValor(p.whatsapp || '')
              }}
              className={`rounded-lg px-2.5 py-1 text-xs border ${
                zapAberto === p.user_id ? 'border-sinal/50 text-sinal'
                  : p.whatsapp ? 'border-sinal/30 text-sinal/70' : 'border-line text-ink-2'}`}
              title="WhatsApp que aparece na proposta enviada ao cliente">
              <Icone nome="whatsapp" tam={14} />
            </button>
            <button onClick={() => setComissaoAberta(comissaoAberta === p.user_id ? null : p.user_id)}
              className={`rounded-lg px-2.5 py-1 text-xs border ${comissaoAberta === p.user_id ? 'border-amber/50 text-amber' : 'border-line text-ink-2'}`}
              title="Lucro ao fechar (carteira)">
              <Icone nome="cifra" tam={14} />
            </button>
            <button
              onClick={async () => {
                await supabase.from('profiles').update({ eh_socio: !p.eh_socio }).eq('user_id', p.user_id)
                carregar()
              }}
              className={`rounded-lg px-2.5 py-1 text-xs border ${p.eh_socio ? 'border-violet/50 text-violet' : 'border-line text-ink-2'}`}
              title={p.eh_socio ? 'Remover marca de sócio comercial' : 'Marcar como sócio comercial (vende a Babel)'}>
              <Icone nome="equipe" tam={14} />
            </button>
            <span className="flex flex-col gap-1 items-end">
              <button
                onClick={() => alternarAtivo(p)}
                disabled={p.papel === 'admin'}
                className={`rounded-lg px-3 py-1 text-xs font-semibold border disabled:opacity-30 ${p.ativo ? 'border-sinal/50 text-sinal' : 'border-danger/50 text-danger'}`}
              >
                {p.ativo ? 'Ativo' : 'Inativo'}
              </button>
              <button
                onClick={() => alternarAdmin(p)}
                disabled={p.user_id === euId}
                title={p.user_id === euId ? 'Você não pode remover o próprio admin' : ''}
                className={`rounded-lg px-3 py-1 text-[10px] font-semibold border disabled:opacity-30 ${
                  p.papel === 'admin' ? 'border-amber/50 text-amber' : 'border-line text-ink-2'}`}
              >
                {p.papel === 'admin' ? 'Tirar admin' : 'Tornar admin'}
              </button>
            </span>
          </div>
          {configAberta === p.user_id && (
            <ConfigAgendamento
              cfg={configs[p.user_id] || CFG_PADRAO}
              aoSalvar={async (cfg) => {
                await supabase.from('apresentadores_config').upsert({
                  user_id: p.user_id, ...cfg, atualizado_em: new Date().toISOString(),
                })
                setConfigAberta(null)
                carregar()
              }}
            />
          )}
          {zapAberto === p.user_id && (
            <div className="mt-3 pt-3 border-t border-line space-y-2">
              <p className="text-xs font-semibold">WhatsApp de {p.nome.split(' ')[0]}</p>
              <p className="text-[11px] text-ink-3 leading-snug">
                É o número que o cliente usa para responder a proposta que {p.nome.split(' ')[0]} enviar.
                Com DDD, só números.
              </p>
              <div className="flex gap-1.5">
                <input value={zapValor} onChange={(e) => setZapValor(e.target.value)}
                  inputMode="tel" placeholder="11 98765-4321"
                  className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
                <button onClick={async () => {
                    const limpo = zapValor.replace(/\D/g, '')
                    await supabase.from('profiles')
                      .update({ whatsapp: limpo || null }).eq('user_id', p.user_id)
                    setZapAberto(null); carregar()
                  }}
                  className="rounded-lg bg-sinal px-4 text-sm font-bold text-white">Salvar</button>
              </div>
            </div>
          )}

          {comissaoAberta === p.user_id && (
            <ConfigComissao userId={p.user_id} aoFechar={() => setComissaoAberta(null)} />
          )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Painel do admin: ativa as mentorias do mentor e define dias, janela e duração
// Grade de horários: o admin liga e desliga cada hora, por dia da semana.
// É literal — o que estiver aceso aqui é exatamente o que o cliente vê na
// hora de escolher. (Antes era calculado por início/fim/almoço, o que não
// dava conta de "sábado tem 12h e a semana não" e escondia erros como o
// horário de meia-noite.)
const HORAS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']

function ConfigAgendamento({ cfg, aoSalvar }) {
  const [ativo, setAtivo] = useState(cfg.ativo)
  const [duracao, setDuracao] = useState(cfg.duracao_min || 30)
  const [grade, setGrade] = useState(() => {
    if (cfg.horarios && typeof cfg.horarios === 'object') {
      return Object.fromEntries(DIAS_SEMANA.map((_, d) => [d, cfg.horarios[d] || cfg.horarios[String(d)] || []]))
    }
    return Object.fromEntries(DIAS_SEMANA.map((_, d) => [d, []]))
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const alternarHora = (d, h) => setGrade((g) => ({
    ...g,
    [d]: g[d].includes(h) ? g[d].filter((x) => x !== h) : [...g[d], h].sort(),
  }))
  const copiarParaSemana = (d) => setGrade((g) =>
    ({ ...g, 1: [...g[d]], 2: [...g[d]], 3: [...g[d]], 4: [...g[d]], 5: [...g[d]] }))

  const total = Object.values(grade).reduce((n, l) => n + l.length, 0)

  async function salvar() {
    setErro('')
    if (ativo && total === 0) { setErro('Escolha ao menos um horário.'); return }
    setSalvando(true)
    const dias = DIAS_SEMANA.map((_, d) => d).filter((d) => grade[d].length > 0)
    await aoSalvar({
      ativo, duracao_min: Number(duracao),
      horarios: Object.fromEntries(Object.entries(grade).filter(([, l]) => l.length)),
      dias: dias.length ? dias : [1, 2, 3, 4, 5],
    })
    setSalvando(false)
  }

  return (
    <div className="border-t border-line px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Mentorias — horários por dia</p>
        <button onClick={() => setAtivo(!ativo)}
          className={`rounded-lg px-3 py-1 text-xs font-semibold border ${
            ativo ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-3'}`}>
          {ativo ? 'Ativado' : 'Desativado'}
        </button>
      </div>

      {ativo && (
        <>
          <div className="space-y-2">
            {DIAS_SEMANA.map((rotulo, d) => (
              <div key={d} className="rounded-lg border border-line p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-bold ${grade[d].length ? 'text-ink' : 'text-ink-3'}`}>
                    {rotulo}
                    <span className="font-normal text-ink-3">
                      {grade[d].length ? ` · ${grade[d].length} horário${grade[d].length > 1 ? 's' : ''}` : ' · não atende'}
                    </span>
                  </span>
                  {grade[d].length > 0 && (
                    <button onClick={() => copiarParaSemana(d)}
                      className="text-[10px] text-sinal underline" title="Repetir de segunda a sexta">
                      usar de seg a sex
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {HORAS.map((h) => {
                    const on = grade[d].includes(h)
                    return (
                      <button key={h} onClick={() => alternarHora(d, h)}
                        className={`rounded-md px-2 py-1 text-[11px] font-bold tnum border ${
                          on ? 'border-sinal bg-sinal text-white' : 'border-line text-ink-3'}`}>
                        {h.slice(0, 2)}h
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <label className="block">
            <span className="block text-[11px] text-ink-3 mb-0.5">Duração da call</span>
            <select value={duracao} onChange={(e) => setDuracao(e.target.value)}
              className="w-full rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-sm">
              {[15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
          <p className="text-[11px] text-ink-3">
            {total} horário{total === 1 ? '' : 's'} na semana. O cliente vê exatamente estes.
          </p>
        </>
      )}
      {erro && <p className="text-xs text-danger">{erro}</p>}
      <button onClick={salvar} disabled={salvando}
        className="w-full rounded-lg bg-sinal py-2 text-sm font-semibold text-white disabled:opacity-50">
        {salvando ? 'Salvando…' : 'Salvar horários'}
      </button>
    </div>
  )
}

// Lucro ao fechar (carteira): o admin define quanto cada pessoa ganha por
// venda validada — valor fixo em R$ ou porcentagem do total vendido.
function ConfigComissao({ userId, aoFechar }) {
  const [tipo, setTipo] = useState('fixo')
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('comissoes_config').select('tipo, valor').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data) { setTipo(data.tipo); setValor(String(data.valor)) }
      })
  }, [userId])

  async function salvar() {
    setSalvando(true); setMsg('')
    const { error } = await supabase.from('comissoes_config').upsert({
      user_id: userId, tipo, valor: Number(valor) || 0, atualizado_em: new Date().toISOString(),
    })
    setSalvando(false)
    if (error) { setMsg(error.message); return }
    aoFechar()
  }

  return (
    <div className="border-t border-line px-4 py-3 space-y-2">
      <p className="text-sm font-semibold">Lucro ao fechar</p>
      <div className="flex gap-1.5">
        {[['fixo', 'R$ fixo por venda'], ['percentual', '% do valor vendido']].map(([id, rotulo]) => (
          <button key={id} onClick={() => setTipo(id)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold border ${
              tipo === id ? 'border-amber/50 text-amber bg-amber/10' : 'border-line text-ink-2'}`}>
            {rotulo}
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)}
          placeholder={tipo === 'fixo' ? 'Ex.: 300' : 'Ex.: 10'}
          className="flex-1 rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal text-sm" />
        <span className="text-xs text-ink-3 w-14">{tipo === 'fixo' ? 'R$/venda' : '% venda'}</span>
      </div>
      <p className="text-[11px] text-ink-3">
        Credita na Carteira quando a venda é validada na call. Zero = não credita.
      </p>
      {msg && <p className="text-xs text-danger">{msg}</p>}
      <button onClick={salvar} disabled={salvando}
        className="w-full rounded-lg bg-sinal py-2 text-sm font-semibold text-white disabled:opacity-50">
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  )
}

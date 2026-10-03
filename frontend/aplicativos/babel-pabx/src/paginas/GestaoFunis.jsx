import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'

const caixa = 'rounded-xl bg-surface border border-line'
const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal text-sm'

// Gestão → Mentoria: funis configuráveis que guiam o cockpit da Reunião
// (cronômetro por fase, objetivo e material de apoio do mentor).
export default function GestaoFunis() {
  const [funis, setFunis] = useState([])
  const [fasesPor, setFasesPor] = useState({})
  const [aberto, setAberto] = useState(null)
  const [msg, setMsg] = useState('')

  async function carregar() {
    const [{ data: fs }, { data: ff }] = await Promise.all([
      supabase.from('funis').select('*').order('criado_em'),
      supabase.from('funil_fases').select('*').order('ordem'),
    ])
    setFunis(fs || [])
    const mapa = {}
    for (const f of ff || []) (mapa[f.funil_id] = mapa[f.funil_id] || []).push(f)
    setFasesPor(mapa)
  }
  useEffect(() => { carregar() }, [])

  async function criarFunil() {
    const { data, error } = await supabase.from('funis')
      .insert({ nome: 'Novo funil', descricao: '' }).select().single()
    if (!error && data) { await carregar(); setAberto(data.id) }
  }

  async function alternarAtivo(f) {
    await supabase.from('funis').update({ ativo: !f.ativo }).eq('id', f.id)
    carregar()
  }

  async function excluirFunil(f) {
    if (!confirm(`Excluir o funil "${f.nome}" e todas as fases?`)) return
    await supabase.from('funis').delete().eq('id', f.id)
    carregar()
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-ink-2">
        O funil guia a mentoria na Reunião: cada fase tem duração, objetivo e material de apoio.
        O cronômetro avisa a hora de avançar — o mentor confirma a troca.
      </p>
      <button onClick={criarFunil} className={`w-full ${caixa} py-2.5 text-sm font-semibold`}>
        + Novo funil
      </button>

      {funis.map((f) => {
        const fases = fasesPor[f.id] || []
        const total = fases.reduce((s, x) => s + (x.duracao_min || 0), 0)
        return (
          <div key={f.id} className={caixa}>
            <div className="flex items-center gap-2 px-4 py-3">
              <button onClick={() => setAberto(aberto === f.id ? null : f.id)} className="flex-1 text-left">
                <span className="block font-medium text-sm">{f.nome}</span>
                <span className="block text-[11px] text-ink-3">
                  {fases.length} fases · {total} min {f.ativo ? '' : '· inativo'}
                </span>
              </button>
              <button onClick={() => alternarAtivo(f)}
                className={`rounded-lg px-2.5 py-1 text-xs border ${f.ativo ? 'border-sinal/50 text-sinal' : 'border-line text-ink-3'}`}>
                {f.ativo ? 'Ativo' : 'Inativo'}
              </button>
              <button onClick={() => excluirFunil(f)} className="text-ink-3 hover:text-danger text-sm px-1"><Icone nome="lixo" tam={13} /></button>
            </div>
            {aberto === f.id && (
              <EditorFunil funil={f} fasesIniciais={fases}
                aoSalvar={async () => { setMsg('Funil salvo.'); setTimeout(() => setMsg(''), 3000); await carregar() }} />
            )}
          </div>
        )
      })}
      {msg && <p className="text-xs text-sinal">{msg}</p>}
    </div>
  )
}

function EditorFunil({ funil, fasesIniciais, aoSalvar }) {
  const [nome, setNome] = useState(funil.nome)
  const [descricao, setDescricao] = useState(funil.descricao || '')
  const [fases, setFases] = useState(fasesIniciais.map((f) => ({ ...f })))
  const [faseAberta, setFaseAberta] = useState(null)
  const [salvando, setSalvando] = useState(false)

  function mudar(i, chave, valor) {
    setFases(fases.map((f, j) => (j === i ? { ...f, [chave]: valor } : f)))
  }
  function mover(i, delta) {
    const j = i + delta
    if (j < 0 || j >= fases.length) return
    const novo = [...fases]
    ;[novo[i], novo[j]] = [novo[j], novo[i]]
    setFases(novo)
  }
  function adicionar() {
    setFases([...fases, {
      id: crypto.randomUUID(), funil_id: funil.id, nome: 'Nova fase',
      duracao_min: 5, objetivo: '', material: '', _nova: true,
    }])
    setFaseAberta(fases.length)
  }
  function remover(i) {
    setFases(fases.filter((_, j) => j !== i))
    setFaseAberta(null)
  }

  async function salvar() {
    setSalvando(true)
    await supabase.from('funis').update({ nome, descricao }).eq('id', funil.id)
    // apaga as fases que saíram e regrava as presentes com a ordem nova
    const idsAtuais = fases.map((f) => f.id)
    const removidas = fasesIniciais.filter((f) => !idsAtuais.includes(f.id))
    if (removidas.length) {
      await supabase.from('funil_fases').delete().in('id', removidas.map((f) => f.id))
    }
    // duas passadas para não bater na trava de ordem única durante a reordenação
    await supabase.from('funil_fases').upsert(
      fases.map((f, i) => ({
        id: f.id, funil_id: funil.id, ordem: 1000 + i, nome: f.nome,
        duracao_min: Number(f.duracao_min) || 5, objetivo: f.objetivo || '', material: f.material || '',
      })),
    )
    await supabase.from('funil_fases').upsert(
      fases.map((f, i) => ({ id: f.id, funil_id: funil.id, ordem: i + 1 })),
    )
    setSalvando(false)
    aoSalvar()
  }

  const total = fases.reduce((s, f) => s + (Number(f.duracao_min) || 0), 0)

  return (
    <div className="border-t border-line px-4 py-3 space-y-2.5">
      <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} placeholder="Nome do funil" />
      <textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
        className={campo} placeholder="Descrição (o espírito desta mentoria)" />

      {fases.map((f, i) => (
        <div key={f.id} className="rounded-lg bg-surface-2 border border-line">
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="text-[10px] text-ink-3 w-5 text-center">{i + 1}º</span>
            <input value={f.nome} onChange={(e) => mudar(i, 'nome', e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm font-medium min-w-0" />
            <input type="number" min={1} max={120} value={f.duracao_min}
              onChange={(e) => mudar(i, 'duracao_min', e.target.value)}
              className="w-14 rounded bg-surface border border-line px-1.5 py-0.5 text-center text-xs tnum" />
            <span className="text-[10px] text-ink-3">min</span>
            <button onClick={() => mover(i, -1)} className="text-ink-3 text-xs px-0.5">↑</button>
            <button onClick={() => mover(i, 1)} className="text-ink-3 text-xs px-0.5">↓</button>
            <button onClick={() => setFaseAberta(faseAberta === i ? null : i)}
              className="text-xs text-ink-2 px-1">{faseAberta === i ? '▲' : '▼'}</button>
            <button onClick={() => remover(i)} className="text-ink-3 hover:text-danger text-xs px-0.5"><Icone nome="lixo" tam={13} /></button>
          </div>
          {faseAberta === i && (
            <div className="px-3 pb-3 space-y-2">
              <input value={f.objetivo || ''} onChange={(e) => mudar(i, 'objetivo', e.target.value)}
                className={campo} placeholder="Objetivo da fase (1 frase)" />
              <textarea rows={4} value={f.material || ''} onChange={(e) => mudar(i, 'material', e.target.value)}
                className={campo} placeholder="Material de apoio — o que o mentor vê nesta fase (fala pronta, perguntas, lembretes)" />
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button onClick={adicionar} className="text-xs border border-line text-ink-2 rounded-full px-3 py-1.5">
          + Fase
        </button>
        <span className="flex-1 text-right text-[11px] text-ink-3 tnum">total: {total} min</span>
      </div>

      <button onClick={salvar} disabled={salvando || fases.length === 0}
        className="w-full rounded-lg bg-sinal py-2 font-semibold text-white disabled:opacity-50">
        {salvando ? 'Salvando…' : 'Salvar funil'}
      </button>
    </div>
  )
}

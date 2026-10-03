import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'
import { cn } from '../componentes/ui'
import {
  carregarRoteiro, carregarRoteiroDaLigacao, salvarMeuRoteiro, apagarMeuRoteiro,
} from '../lib/roteiro-call'

// Meus Scripts: cada vendedor escreve as falas do jeito que ele fala.
//
// Começa igual ao roteiro da equipe (o que o admin definiu em Gestão). No
// instante em que a pessoa salva, ela passa a ter o script dela, e a tela de
// ligação usa esse. "Voltar ao da equipe" apaga o pessoal e devolve o padrão —
// ninguém fica preso a um texto que escreveu num dia ruim.

const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal'

export default function MeusScripts({ perfil }) {
  const [partes, setPartes] = useState(null)
  const [origem, setOrigem] = useState('equipe')   // meu | equipe | fabrica
  const [aviso, setAviso] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!perfil?.user_id) return
    carregarRoteiroDaLigacao(supabase, perfil.user_id).then((r) => {
      setPartes(r.partes)
      setOrigem(r.origem)
    })
  }, [perfil?.user_id])

  const trocarParte = (i, k, v) => setPartes(partes.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  const trocarPasso = (i, j, k, v) => setPartes(partes.map((p, x) => (x !== i ? p : {
    ...p, passos: p.passos.map((s, y) => (y === j ? { ...s, [k]: v } : s)),
  })))
  function moverPasso(i, j, dir) {
    const k = j + dir
    const p = partes[i]
    if (k < 0 || k >= p.passos.length) return
    const passos = [...p.passos]; [passos[j], passos[k]] = [passos[k], passos[j]]
    setPartes(partes.map((x, y) => (y === i ? { ...x, passos } : x)))
  }
  const removerPasso = (i, j) => setPartes(partes.map((p, x) => (
    x === i ? { ...p, passos: p.passos.filter((_, y) => y !== j) } : p)))
  const novoPasso = (i) => setPartes(partes.map((p, x) => (
    x === i ? { ...p, passos: [...p.passos, { de: 'voce', titulo: '', fala: '' }] } : p)))

  async function salvar() {
    setSalvando(true); setAviso('')
    const { error, partes: limpo } = await salvarMeuRoteiro(supabase, perfil.user_id, partes)
    setSalvando(false)
    if (error) { setAviso(error.message); return }
    setPartes(limpo)
    setOrigem('meu')
    setAviso('Salvo — é este texto que aparece nas suas ligações.')
    setTimeout(() => setAviso(''), 5000)
  }

  async function voltarAoDaEquipe() {
    if (!window.confirm('Apagar o seu script e voltar a usar o da equipe? O que você escreveu se perde.')) return
    await apagarMeuRoteiro(supabase, perfil.user_id)
    const equipe = await carregarRoteiro(supabase)
    setPartes(equipe)
    setOrigem('equipe')
    setAviso('Pronto — suas ligações voltaram a usar o script da equipe.')
    setTimeout(() => setAviso(''), 5000)
  }

  if (!partes) {
    return <p className="text-center text-ink-3 py-16 text-sm">Carregando seus scripts…</p>
  }

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-3">
      <div className="rounded-2xl bg-surface border border-line p-4 space-y-1">
        <p className="font-bold">Meus scripts da ligação</p>
        <p className="text-xs text-ink-2 leading-relaxed">
          As falas que aparecem na sua tela durante a chamada, nos dois botões:
          o que você diz para <b>passar pela atendente</b> e o que diz para
          <b> quem decide</b>. Escreva do seu jeito — vale só para você.
        </p>
        <p className="text-[11px] text-ink-3 leading-relaxed pt-1">
          Nas frases você pode usar <b>{'{vendedor}'}</b> (seu primeiro nome),
          <b> {'{decisor}'}</b> (o dono, do dossiê do lead) e <b>{'{empresa}'}</b> —
          o sistema troca na hora da ligação.
        </p>
        <p className={cn('text-[11px] font-semibold pt-1.5',
          origem === 'meu' ? 'text-sinal' : 'text-ink-3')}>
          {origem === 'meu'
            ? '● Você está usando o seu script.'
            : '● Você está usando o script da equipe. Salve para ter o seu.'}
        </p>
      </div>

      {partes.map((parte, i) => (
        <div key={parte.id || i} className="rounded-2xl bg-surface border border-line p-3 space-y-2.5">
          <div className="flex gap-2">
            <input value={parte.rotulo} placeholder="Nome do botão (ex.: Atendente)"
              onChange={(e) => trocarParte(i, 'rotulo', e.target.value)}
              className={`${campo} flex-[2] min-w-0 text-sm font-semibold`} />
            <input value={parte.resumo} placeholder="Objetivo (ex.: passar pelo filtro)"
              onChange={(e) => trocarParte(i, 'resumo', e.target.value)}
              className={`${campo} flex-[2] min-w-0 text-xs`} />
          </div>

          {parte.passos.map((passo, j) => (
            <div key={j} className="flex gap-2 items-start">
              <select value={passo.de} onChange={(e) => trocarPasso(i, j, 'de', e.target.value)}
                title="Quem fala esta linha"
                className="shrink-0 rounded-lg bg-surface-2 border border-line px-2 py-2 text-xs">
                <option value="voce">eu falo</option>
                <option value="eles">ele(a) fala</option>
              </select>
              <div className="flex-1 min-w-0 space-y-1.5">
                <input value={passo.titulo} placeholder="Título do passo (ex.: Abertura de impacto)"
                  onChange={(e) => trocarPasso(i, j, 'titulo', e.target.value)}
                  className={`${campo} py-1.5 text-xs`} />
                <textarea value={passo.fala} rows={2} placeholder="A frase"
                  onChange={(e) => trocarPasso(i, j, 'fala', e.target.value)}
                  className={`${campo} text-sm resize-y`} />
              </div>
              <div className="shrink-0 flex flex-col items-center">
                <button onClick={() => moverPasso(i, j, -1)} title="Subir" className="text-ink-3 text-xs px-1">↑</button>
                <button onClick={() => moverPasso(i, j, 1)} title="Descer" className="text-ink-3 text-xs px-1">↓</button>
                <button onClick={() => removerPasso(i, j)} title="Apagar passo" className="text-danger text-sm px-1">✕</button>
              </div>
            </div>
          ))}

          <button onClick={() => novoPasso(i)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2">+ Passo</button>
        </div>
      ))}

      <div className="flex gap-2">
        {origem === 'meu' && (
          <button onClick={voltarAoDaEquipe}
            className="rounded-lg border border-line px-3 py-2.5 text-sm text-ink-2">
            Voltar ao da equipe
          </button>
        )}
        <button onClick={salvar} disabled={salvando}
          className="flex-1 rounded-lg bg-sinal py-2.5 font-bold text-sm text-white disabled:opacity-40">
          <Icone nome="check" tam={13} className="inline mr-1.5 -mt-0.5" />
          {salvando ? 'Salvando…' : 'Salvar meus scripts'}
        </button>
      </div>
      {aviso && <p className="text-xs text-sinal px-1">{aviso}</p>}
    </div>
  )
}

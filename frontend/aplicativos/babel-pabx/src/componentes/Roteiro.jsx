import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cn } from './ui'
import Icone from './Icone'
import { ROTEIRO_PADRAO, carregarRoteiroDaLigacao } from '../lib/roteiro-call'

// Roteiro da ligação em duas partes: passar pela atendente e falar com quem
// decide. O vendedor toca na parte em que está e ela fica VERMELHA — durante a
// ligação ninguém tem tempo de ler título; a cor diz onde você está.
//
// Cada passo marca QUEM fala: o que a outra pessoa diz é deixa (apagada, em
// itálico), o que você fala é frase pronta para ler em voz alta.
//
// Duas formas, mesmo estado:
//   • computador → a lista inteira, que a coluna alta comporta;
//   • celular    → UM passo por vez, com ‹ ›. É o que faz caber na tela sem
//     rolagem — e ler um passo de cada vez é o que se faz numa ligação mesmo.

// Só o primeiro nome: "Aqui é o Matheus Silveira Pro" soa a telemarketing.
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || ''

export default function Roteiro({ perfil, lead, dados, className, aoEditar }) {
  const [parte, setParte] = useState(null)
  const [passo, setPasso] = useState(0)   // só o celular usa
  // começa com o padrão na tela e troca pelo configurado assim que o banco
  // responde — em ligação não pode existir um segundo de tela vazia
  const [partes, setPartes] = useState(ROTEIRO_PADRAO)
  useEffect(() => {
    carregarRoteiroDaLigacao(supabase, perfil?.user_id).then((r) => setPartes(r.partes))
  }, [perfil?.user_id])

  const d = lead?.dossie || {}
  const empresa = lead?.empresa || dados?.empresa || 'a empresa'
  // quem decide: o dono levantado no dossiê, senão quem atendeu, senão genérico
  const decisor = primeiroNome(d.nome_dono || d.nome_atendente || lead?.contato_nome)
    || 'o responsável'
  const vendedor = primeiroNome(perfil?.nome) || 'da Babel'

  const trocar = (t) => String(t)
    .replaceAll('{empresa}', empresa)
    .replaceAll('{decisor}', decisor)
    .replaceAll('{vendedor}', vendedor)

  const atual = partes.find((p) => p.id === parte)
  const passos = atual?.passos || []

  // Celular: a fala DELES e a MINHA resposta andam juntas, num cartão só —
  // ler a deixa e a resposta na mesma tela é o que se faz no telefone; separar
  // obrigava a voltar um passo para lembrar o que a atendente tinha dito.
  const blocos = useMemo(() => {
    const saida = []
    for (let j = 0; j < passos.length; j++) {
      const atualPasso = passos[j]
      const proximo = passos[j + 1]
      if (atualPasso.de === 'eles' && proximo && proximo.de === 'voce') {
        saida.push({ deles: atualPasso, meu: proximo })
        j++
      } else if (atualPasso.de === 'eles') {
        saida.push({ deles: atualPasso })
      } else {
        saida.push({ meu: atualPasso })
      }
    }
    return saida
  }, [passos])

  const i = Math.min(passo, Math.max(0, blocos.length - 1))
  const b = blocos[i]

  function escolher(id) {
    setParte((atualId) => (atualId === id ? null : id))
    setPasso(0)
  }

  return (
    <div className={cn('rounded-2xl bg-surface border border-line p-3 flex flex-col min-h-0', className)}>
      <div className="flex gap-2 shrink-0">
        {partes.map((x) => {
          const ativa = parte === x.id
          return (
            <button key={x.id} onClick={() => escolher(x.id)}
              title={ativa ? 'Tocar de novo fecha o roteiro' : `Roteiro para ${x.resumo}`}
              className={cn('flex-1 min-w-0 rounded-xl px-2.5 py-2 border transition text-left',
                ativa
                  ? 'bg-danger border-danger text-white'
                  : 'bg-surface-2 border-line text-ink-2 hover:border-danger/40')}>
              <span className="block text-[13px] font-bold leading-[1.15]">{x.rotulo}</span>
              <span className={cn('block text-[10px] leading-tight truncate',
                ativa ? 'text-white/80' : 'text-ink-3')}>
                {ativa ? 'você está aqui' : x.resumo}
              </span>
            </button>
          )
        })}
      </div>

      {!atual && (
        <div className="pt-2.5 flex items-start justify-between gap-2">
          <p className="text-[11px] text-ink-3 leading-relaxed">
            Toque na parte em que a ligação está — o roteiro aparece e o botão fica vermelho.
          </p>
          {aoEditar && (
            <button onClick={aoEditar} title="Editar as suas falas em Meus Scripts"
              className="shrink-0 text-[11px] text-ink-3 underline whitespace-nowrap">
              editar meus scripts
            </button>
          )}
        </div>
      )}

      {/* ---------- computador: a lista inteira ---------- */}
      {atual && (
        <ol className="hidden md:block space-y-2 pt-2.5 min-h-0 overflow-y-auto pr-0.5">
          {passos.map((s, j) => (
            <li key={`${j}-${s.titulo}`} className="flex gap-2.5">
              <span className={cn('shrink-0 w-5 h-5 mt-0.5 rounded-full grid place-items-center text-[10px] font-bold tnum',
                s.de === 'voce' ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-ink-3')}>
                {j + 1}
              </span>
              <div className="min-w-0">
                <p className={cn('text-[10px] font-bold uppercase tracking-wide',
                  s.de === 'voce' ? 'text-danger' : 'text-ink-3')}>
                  {s.titulo}{s.de === 'eles' && s.exemplo ? ' · exemplo' : ''}
                </p>
                <p className={cn('leading-relaxed',
                  s.de === 'voce' ? 'text-[13.5px] text-ink font-medium' : 'text-xs text-ink-3 italic')}>
                  {s.de === 'voce' ? `“${trocar(s.fala)}”` : `— “${trocar(s.fala)}”`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* ---------- celular: a deixa e a resposta juntas ---------- */}
      {atual && b && (
        <div className="md:hidden flex flex-col flex-1 min-h-0 pt-2.5">
          {/* a frase encolhe conforme cresce, para caber inteira até em tela
              pequena (360×640). A rolagem interna é rede: se alguém escrever um
              parágrafo no editor, ela aparece — cortar a frase no meio de uma
              ligação seria pior do que rolar. */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {b.deles && (
              <div className="rounded-lg bg-surface-2 border border-line px-2.5 py-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-3">
                  {b.deles.titulo || 'ele(a) diz'}
                </p>
                <p className="text-[13px] leading-snug text-ink-3 italic">— “{trocar(b.deles.fala)}”</p>
              </div>
            )}
            {b.meu && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-danger">
                  {b.meu.titulo || 'você responde'}
                </p>
                <p className={cn('leading-snug pt-0.5 text-ink font-medium',
                  b.meu.fala.length > 200 ? 'text-[14.5px]'
                    : b.meu.fala.length > 120 ? 'text-[15.5px]' : 'text-[17px]')}>
                  “{trocar(b.meu.fala)}”
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 shrink-0">
            <button onClick={() => setPasso(Math.max(0, i - 1))} disabled={i === 0}
              className="rounded-lg border border-line px-3 py-2 text-ink-2 disabled:opacity-30">
              <Icone nome="seta" tam={13} className="rotate-180" />
            </button>
            <span className="flex-1 text-center text-[11px] text-ink-3 tnum">
              passo {i + 1} de {blocos.length}
            </span>
            <button onClick={() => setPasso(Math.min(blocos.length - 1, i + 1))}
              disabled={i >= blocos.length - 1}
              className="rounded-lg bg-danger px-4 py-2 text-white font-bold text-xs disabled:opacity-30">
              Próximo <Icone nome="seta" tam={12} className="inline -mt-0.5 ml-0.5" />
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

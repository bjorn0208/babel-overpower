import { useRef } from 'react'

// O cartão que o lead vê e a grade de atendimento do mentor.
// Mora em um componente só porque aparece em dois lugares — no cadastro e no
// painel. Duas cópias divergiriam na primeira mudança.

const CAIXA = 'w-full rounded-2xl bg-superficie-2 border border-linha px-4 py-3.5 ' +
  'text-tinta placeholder:text-tinta-3 transition-colors focus:border-violeta/70'
const NOMES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export const GRADE_PADRAO = {
  dias: [1, 2, 3, 4, 5],
  faixas: [['09:00', '12:00'], ['14:00', '18:00']],
  duracao: 30,
}

export default function EditorPerfil({ valor, aoMudar, aoEscolherFoto, previaFoto }) {
  const inputFoto = useRef(null)
  const grade = valor.grade ?? GRADE_PADRAO
  const [manha, tarde] = grade.faixas ?? GRADE_PADRAO.faixas

  const mudar = (campo, v) => aoMudar({ ...valor, [campo]: v })
  const mudarGrade = (campo, v) => aoMudar({ ...valor, grade: { ...grade, [campo]: v } })
  const mudarFaixa = (indice, nova) => {
    const faixas = [manha, tarde].map((f, k) => (k === indice ? nova : f))
    mudarGrade('faixas', faixas)
  }

  return (
    <>
      {/* ---- o cartão ---- */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.24em] text-tinta-3">
          como o lead te vê no fim do diagnóstico
        </p>

        <div className="mt-5 flex items-center gap-5">
          <button
            type="button" onClick={() => inputFoto.current?.click()}
            className="w-20 h-20 rounded-full border border-violeta/40 bg-superficie-2
                       overflow-hidden grid place-items-center hover:border-violeta/70
                       transition-colors shrink-0"
          >
            {previaFoto || valor.foto_url
              ? <img src={previaFoto || valor.foto_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-[11px] text-tinta-3 px-2 text-center">sua foto</span>}
          </button>
          <input ref={inputFoto} type="file" accept="image/*"
            className="hidden" onChange={aoEscolherFoto} />
          <p className="text-[13px] text-tinta-3 leading-relaxed">
            Uma foto sua de rosto. É ela que aparece quando o lead termina o
            diagnóstico e decide se marca a call.
          </p>
        </div>

        <div className="mt-5">
          <Campo rotulo="Seu WhatsApp">
            <input className={CAIXA} placeholder="(00) 00000-0000"
              value={valor.whatsapp ?? ''} onChange={(e) => mudar('whatsapp', e.target.value)} />
          </Campo>
          <p className="mt-2 text-[12px] text-tinta-3">
            É este número que o botão de WhatsApp do diagnóstico chama — inclusive dentro do PDF.
          </p>
        </div>

        <div className="mt-5">
          <Campo rotulo="Sua apresentação, em duas linhas">
            <textarea
              rows={3} className={CAIXA + ' resize-none'}
              placeholder="ex.: 8 anos ajudando operações de serviço a organizar vendas e cobrança."
              value={valor.descricao ?? ''} onChange={(e) => mudar('descricao', e.target.value)}
            />
          </Campo>
        </div>
      </div>

      {/* ---- a grade ---- */}
      <div className="pt-6 border-t border-linha">
        <p className="text-[11px] uppercase tracking-[0.24em] text-tinta-3">
          quando você atende
        </p>
        <p className="mt-2 text-[13px] text-tinta-3">
          O lead só enxerga o que existe aqui. Horário já marcado some da lista sozinho.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {NOMES_DIA.map((d, k) => {
            const on = (grade.dias ?? []).includes(k)
            return (
              <button
                key={d} type="button"
                onClick={() => mudarGrade('dias',
                  on ? grade.dias.filter((x) => x !== k) : [...(grade.dias ?? []), k].sort())}
                className={'rounded-full border px-4 py-2 text-sm transition-colors ' + (on
                  ? 'border-violeta/70 bg-violeta/15 text-violeta-claro'
                  : 'border-linha bg-superficie-2 text-tinta-3 hover:border-linha-forte')}
              >
                {d}
              </button>
            )
          })}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Faixa rotulo="manhã" valor={manha} aoMudar={(v) => mudarFaixa(0, v)} />
          <Faixa rotulo="tarde" valor={tarde} aoMudar={(v) => mudarFaixa(1, v)} />
        </div>

        <div className="mt-5">
          <Campo rotulo="Duração de cada conversa">
            <select className={CAIXA} value={grade.duracao ?? 30}
              onChange={(e) => mudarGrade('duracao', Number(e.target.value))}>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>1 hora</option>
            </select>
          </Campo>
        </div>
      </div>
    </>
  )
}

export const Campo = ({ rotulo, children }) => (
  <div>
    <label className="block text-[12px] text-tinta-2 mb-2">{rotulo}</label>
    {children}
  </div>
)

const Faixa = ({ rotulo, valor, aoMudar }) => (
  <div>
    <label className="block text-[12px] text-tinta-2 mb-2">{rotulo}</label>
    <div className="flex items-center gap-2">
      <input type="time" value={valor?.[0] ?? '09:00'}
        onChange={(e) => aoMudar([e.target.value, valor?.[1] ?? '12:00'])}
        className="flex-1 rounded-xl bg-superficie-2 border border-linha px-3 py-2.5
                   text-tinta focus:border-violeta/70 transition-colors" />
      <span className="text-tinta-3 text-sm">às</span>
      <input type="time" value={valor?.[1] ?? '12:00'}
        onChange={(e) => aoMudar([valor?.[0] ?? '09:00', e.target.value])}
        className="flex-1 rounded-xl bg-superficie-2 border border-linha px-3 py-2.5
                   text-tinta focus:border-violeta/70 transition-colors" />
    </div>
  </div>
)

export { CAIXA }

import { useState } from 'react'
import Icone from './Icone'

// O essencial da empresa para usar AO VIVO, no meio da ligação: quem assina
// pela empresa (quadro societário da Receita) e no máximo cinco informações do
// Google Maps. Pedir a pessoa pelo nome muda a recepção da ligação — em vez de
// "posso falar com o responsável?", o mentor já diz quem procura.

// Prioridade do que vale mais numa ligação. Mostra as cinco primeiras que
// existirem no dossiê, então um lead pouco levantado ainda entrega as melhores.
const DO_MAPS = [
  ['avaliacao_google', 'Nota no Google'],
  ['reclamacoes', 'O que reclamam'],
  ['como_atendem', 'Como atendem'],
  ['canal_contato', 'Canal de contato'],
  ['sistema_atual', 'Sistema em uso'],
  ['elogios', 'O que elogiam'],
  ['avaliacoes_lidas', 'Amostra lida'],
  ['site', 'Site'],
]
const LIMITE_MAPS = 5

// "MARIA DA SILVA (Sócio-Administrador)" → nome e cargo separados, nome em
// caixa de título porque a Receita devolve tudo em maiúsculas e gritar o
// nome do sócio na tela atrapalha a leitura rápida. As partículas ficam
// minúsculas: "Maria da Silva" se lê melhor que "Maria Da Silva".
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'di', 'du'])

function separarSocio(bruto) {
  const m = String(bruto).match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  const nome = (m ? m[1] : bruto).trim()
  const cargo = m ? m[2].trim() : ''
  const bonito = nome.toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && PARTICULAS.has(p))
      ? p
      : p.replace(/(^|')\p{L}/gu, (c) => c.toUpperCase()))
    .join(' ')
  return { nome: bonito, cargo, manda: /administrador|titular|presidente|s[óo]cio-?adm/i.test(cargo) }
}

// Para quem chama o componente saber, antes de desenhar a caixa, se há algo
// dentro dela — evita um card com título e nada embaixo.
export function temFichaEmpresa(dossie) {
  if (!dossie) return false
  return Boolean(String(dossie.socios || '').trim())
    || DO_MAPS.some(([k]) => String(dossie[k] || '').trim())
}

export default function FichaEmpresa({ dossie }) {
  const [copiado, setCopiado] = useState('')
  if (!dossie) return null

  async function copiarNome(nome) {
    try { await navigator.clipboard.writeText(nome) } catch { return }
    setCopiado(nome)
    setTimeout(() => setCopiado(''), 1500)
  }

  // a lista termina em "+3" quando há mais sócios do que cabe na tela — isso é
  // contagem, não gente, e não pode virar um nome clicável
  const partes = String(dossie.socios || '').split('·').map((s) => s.trim()).filter(Boolean)
  const restantes = partes.find((p) => /^\+\d+$/.test(p)) || ''
  const socios = partes.filter((p) => !/^\+\d+$/.test(p)).map(separarSocio)

  const doMaps = DO_MAPS
    .filter(([k]) => String(dossie[k] || '').trim())
    .slice(0, LIMITE_MAPS)

  if (!socios.length && !doMaps.length) return null

  return (
    <div className="space-y-2.5">
      {socios.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-3 flex items-center gap-1.5">
            <Icone nome="cartao" tam={11} className="text-sinal" />
            Quadro societário
          </p>
          <div className="flex flex-col gap-1">
            {socios.map((s, i) => (
              <button key={`${s.nome}-${i}`} type="button"
                onClick={() => copiarNome(s.nome)}
                title="Copiar o nome"
                className={`flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded-lg border
                  px-2 py-1.5 text-left transition ${
                  s.manda ? 'border-sinal/40 bg-sinal/10' : 'border-line'}`}>
                <span className={`text-[13px] font-semibold leading-tight ${
                  s.manda ? 'text-sinal' : 'text-ink'}`}>{s.nome}</span>
                {s.cargo && <span className="text-[10px] text-ink-3 leading-tight">{s.cargo}</span>}
                {copiado === s.nome && (
                  <span className="ml-auto text-[10px] font-bold text-sinal">copiado</span>
                )}
              </button>
            ))}
            {restantes && (
              <p className="text-[10px] text-ink-3 px-2">
                e mais {restantes.slice(1)} no quadro societário
              </p>
            )}
          </div>
        </div>
      )}

      {doMaps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-3 flex items-center gap-1.5">
            <Icone nome="pino" tam={11} className="text-sinal" />
            No Google
          </p>
          <dl className="space-y-1">
            {doMaps.map(([k, rotulo]) => (
              <div key={k} className="flex gap-2 text-[11px] leading-snug">
                <dt className="shrink-0 w-[6.5rem] text-ink-3">{rotulo}</dt>
                <dd className={`flex-1 min-w-0 break-words ${
                  k === 'reclamacoes' ? 'text-amber' : 'text-ink-2'}`}>
                  {String(dossie[k]).slice(0, 240)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

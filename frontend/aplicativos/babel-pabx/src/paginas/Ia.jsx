import { IaLigadora } from './Gestao'
import Icone from '../componentes/Icone'

// IA como menu próprio (spec 2026-08-06): a Bel sai de sub-aba escondida da
// Gestão e vira central de comando — campanhas, persona, voz, conhecimento e
// resultados das ligações num lugar só.
export default function Ia() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl bg-sinal/12 border border-sinal/30 grid place-items-center text-sinal">
          <Icone nome="robo" tam={18} />
        </span>
        <div>
          <h2 className="font-bold leading-tight">Bel — IA ligadora</h2>
          <p className="text-xs text-ink-2">Campanhas, persona, conhecimento e ligações da IA</p>
        </div>
      </div>
      <IaLigadora />
    </div>
  )
}

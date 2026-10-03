// Tom de chamada (ringback) sintético — padrão brasileiro: 425 Hz,
// cadência 1s ligado / 4s desligado. Gerado na hora pela Web Audio API,
// sem baixar arquivo (nenhuma dependência externa, nada de CSP).
let ctx = null
let osc = null
let ganho = null
let timer = null

export function tocarChamando() {
  pararChamando()
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return
  ctx = new AudioCtx()
  osc = ctx.createOscillator()
  ganho = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 425 // Hz — tom de controle de chamada do Brasil
  ganho.gain.value = 0
  osc.connect(ganho)
  ganho.connect(ctx.destination)
  osc.start()

  // cadência: 1s audível, 4s em silêncio, repetindo
  const cicloMs = 5000
  const pulso = () => {
    const t = ctx.currentTime
    ganho.gain.cancelScheduledValues(t)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(0.18, t + 0.05) // sobe suave
    ganho.gain.setValueAtTime(0.18, t + 1.0)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 1.05) // desce suave
  }
  pulso()
  timer = setInterval(pulso, cicloMs)
}

export function pararChamando() {
  if (timer) { clearInterval(timer); timer = null }
  try { osc?.stop() } catch { /* já parado */ }
  try { ctx?.close() } catch { /* já fechado */ }
  osc = null; ganho = null; ctx = null
}

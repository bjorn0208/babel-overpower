// Ponte de áudio do simulador: microfone ↔ motor da Bel (via WSS na VPS).
// PCM s16le 8 kHz nos dois sentidos — o mesmo áudio da linha telefônica.

const URL_PONTE = 'wss://reuniao.babel-os.com/ponte-ia'

export async function iniciarPonte({ chamadaId, aoEstado }) {
  const ctx = new AudioContext({ sampleRate: 8000 })
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  // O await acima quebra a cadeia do clique, e aí o navegador deixa o contexto
  // 'suspended' — no celular isso é a regra. Suspenso, nada toca E o
  // onaudioprocess não dispara: a Bel fala no vazio e o microfone não sai
  // daqui. Dá silêncio dos dois lados, que foi o que aconteceu em 27/08.
  if (ctx.state !== 'running') {
    try { await ctx.resume() } catch { /* segue: o onopen tenta de novo */ }
  }
  const fonte = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(1024, 1, 1)
  const mudo = ctx.createGain()
  mudo.gain.value = 0

  const ws = new WebSocket(URL_PONTE)
  ws.binaryType = 'arraybuffer'
  let cursor = 0
  let vivo = true

  ws.onopen = async () => {
    if (ctx.state !== 'running') {
      try { await ctx.resume() } catch { /* nada a fazer além de seguir */ }
    }
    ws.send(JSON.stringify({ chamada_id: chamadaId }))
    aoEstado?.(ctx.state === 'running' ? 'conversando' : 'sem-audio')
  }

  proc.onaudioprocess = (e) => {
    if (ws.readyState !== 1) return
    const f = e.inputBuffer.getChannelData(0)
    const i16 = new Int16Array(f.length)
    for (let i = 0; i < f.length; i++) {
      let v = f[i]
      if (v > 1) v = 1; else if (v < -1) v = -1
      i16[i] = Math.round(v * 32767)
    }
    ws.send(i16.buffer)
  }
  fonte.connect(proc)
  proc.connect(mudo)
  mudo.connect(ctx.destination)

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string' || !vivo) return
    const i16 = new Int16Array(ev.data)
    if (!i16.length) return
    const buf = ctx.createBuffer(1, i16.length, 8000)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    // buffer de jitter de 200 ms: se o cursor ficou pra trás (rede engasgou),
    // reancorá com folga em vez de tocar em cima do "agora" → sem cortes
    if (cursor < ctx.currentTime + 0.05) cursor = ctx.currentTime + 0.2
    src.start(cursor)
    cursor += buf.duration
  }

  function parar() {
    if (!vivo) return
    vivo = false
    try { proc.disconnect() } catch { /* já desconectado */ }
    try { fonte.disconnect() } catch { /* idem */ }
    try { stream.getTracks().forEach((t) => t.stop()) } catch { /* idem */ }
    try { ctx.close() } catch { /* idem */ }
    try { if (ws.readyState <= 1) ws.close() } catch { /* idem */ }
    aoEstado?.('encerrado')
  }

  ws.onclose = parar
  ws.onerror = parar

  return { parar }
}

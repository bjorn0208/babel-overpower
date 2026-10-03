const SYSTEM_PROMPT = `Você é um gerador de mapas mentais especialista, no estilo MindMeister.
O usuário descreve um tema ou cola um texto. Responda APENAS com um objeto JSON válido, sem markdown, sem explicações, neste formato:
{"topic":"Tema central","children":[{"topic":"Ramo 1","children":[{"topic":"Subitem"}]}]}
Regras:
- "topic" curto e claro (máximo ~6 palavras por nó)
- 4 a 8 ramos principais, cada um com 2 a 5 subitens; até 4 níveis quando fizer sentido
- Responda no mesmo idioma do pedido do usuário
- Seja concreto e útil, cobrindo o tema de forma completa`

function demoMap(prompt) {
  return {
    topic: prompt.slice(0, 60) || 'Modo demonstração',
    children: [
      { topic: '⚠️ Modo demonstração', children: [{ topic: 'Sem chave da OpenRouter' }, { topic: 'A IA ainda não foi chamada' }] },
      { topic: 'Como ativar a IA', children: [{ topic: 'Configure OPENROUTER_API_KEY na Vercel' }] },
      { topic: 'Enquanto isso', children: [{ topic: 'Edite nós com duplo clique' }, { topic: 'Tab cria filho, Enter cria irmão' }, { topic: 'Arraste para reorganizar' }] },
    ],
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }
  try {
    const { prompt } = req.body || {}
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Digite um tema para gerar o mapa' })
    }
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return res.json({ demo: true, content: JSON.stringify(demoMap(prompt.trim())) })
    }
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Marcelo Meister',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt.trim() },
        ],
        temperature: 0.7,
      }),
    })
    const data = await upstream.json()
    if (!upstream.ok) {
      return res.status(502).json({ error: data?.error?.message || `OpenRouter respondeu ${upstream.status}` })
    }
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      return res.status(502).json({ error: 'A IA não retornou conteúdo' })
    }
    res.json({ content })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro interno' })
  }
}

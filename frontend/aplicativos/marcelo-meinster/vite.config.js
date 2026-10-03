import { defineConfig, loadEnv } from 'vite'

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
      { topic: 'Como ativar a IA', children: [{ topic: 'Abra o arquivo .env' }, { topic: 'Cole OPENROUTER_API_KEY=sk-or-...' }, { topic: 'Reinicie o npm run dev' }] },
      { topic: 'Enquanto isso', children: [{ topic: 'Edite nós com duplo clique' }, { topic: 'Tab cria filho, Enter cria irmão' }, { topic: 'Arraste para reorganizar' }] },
    ],
  }
}

function aiEndpoint(env) {
  return {
    name: 'ai-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/generate', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end(JSON.stringify({ error: 'Use POST' }))
        }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const { prompt } = JSON.parse(body || '{}')
            if (!prompt || !prompt.trim()) {
              res.statusCode = 400
              return res.end(JSON.stringify({ error: 'Digite um tema para gerar o mapa' }))
            }
            const apiKey = env.OPENROUTER_API_KEY
            if (!apiKey || apiKey.includes('cole-sua-chave')) {
              return res.end(JSON.stringify({ demo: true, content: JSON.stringify(demoMap(prompt.trim())) }))
            }
            const model = env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
            const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:5173',
                'X-Title': 'M Master',
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
              res.statusCode = 502
              const message = data?.error?.message || `OpenRouter respondeu ${upstream.status}`
              return res.end(JSON.stringify({ error: message }))
            }
            const content = data?.choices?.[0]?.message?.content
            if (!content) {
              res.statusCode = 502
              return res.end(JSON.stringify({ error: 'A IA não retornou conteúdo' }))
            }
            res.end(JSON.stringify({ content }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message || 'Erro interno' }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [aiEndpoint(env)],
    server: { port: 5173 },
  }
})

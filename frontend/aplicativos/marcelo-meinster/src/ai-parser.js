// Converte a resposta de texto do LLM em dados do mind-elixir.
// Puro (sem DOM/rede) para rodar tanto no navegador quanto no node --test.

const MAX_DEPTH = 6
const MAX_NODES = 300

export function extractMindMapJson(text) {
  if (typeof text !== 'string') throw new Error('Resposta vazia — nenhum JSON encontrado')
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates = fenced ? [fenced[1], text] : [text]
  for (const candidate of candidates) {
    const start = candidate.indexOf('{')
    if (start === -1) continue
    // Varre até fechar o objeto balanceado (ignorando chaves dentro de strings)
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i]
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1))
          } catch {
            break
          }
        }
      }
    }
  }
  throw new Error('A resposta da IA não contém JSON válido')
}

export function toMindElixirData(tree) {
  const rootTopic = normalizeTopic(tree && tree.topic)
  if (!rootTopic) throw new Error('A raiz do mapa não tem topic')
  let count = 0
  const buildNode = (node, depth) => {
    const topic = normalizeTopic(node && node.topic)
    if (!topic || count >= MAX_NODES) return null
    count++
    const result = { id: newId(), topic }
    if (depth < MAX_DEPTH && Array.isArray(node.children)) {
      const children = node.children.map(c => buildNode(c, depth + 1)).filter(Boolean)
      if (children.length) result.children = children
    }
    return result
  }
  return { nodeData: buildNode(tree, 0) }
}

function normalizeTopic(value) {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

let counter = 0
function newId() {
  counter++
  return `mm-${Date.now().toString(36)}-${counter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

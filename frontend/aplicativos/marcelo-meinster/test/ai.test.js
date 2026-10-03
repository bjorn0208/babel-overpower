import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractMindMapJson, toMindElixirData } from '../src/ai-parser.js'

// --- extractMindMapJson ---

test('extrai JSON puro', () => {
  const obj = extractMindMapJson('{"topic":"Raiz","children":[]}')
  assert.equal(obj.topic, 'Raiz')
})

test('extrai JSON dentro de cerca ```json', () => {
  const text = 'Aqui está o mapa:\n```json\n{"topic":"Raiz","children":[{"topic":"A"}]}\n```\nEspero que ajude!'
  const obj = extractMindMapJson(text)
  assert.equal(obj.children[0].topic, 'A')
})

test('extrai primeiro objeto balanceado no meio de texto', () => {
  const text = 'Claro! {"topic":"Plano","children":[{"topic":"Etapa {1}"}]} — pronto.'
  const obj = extractMindMapJson(text)
  assert.equal(obj.topic, 'Plano')
  assert.equal(obj.children[0].topic, 'Etapa {1}')
})

test('lança erro quando não há JSON', () => {
  assert.throws(() => extractMindMapJson('não tenho nada útil'), /JSON/)
})

// --- toMindElixirData ---

test('converte árvore em MindElixirData com ids únicos', () => {
  const data = toMindElixirData({
    topic: 'Raiz',
    children: [
      { topic: 'A', children: [{ topic: 'A1' }] },
      { topic: 'B' },
    ],
  })
  assert.equal(data.nodeData.topic, 'Raiz')
  assert.equal(data.nodeData.children.length, 2)
  assert.equal(data.nodeData.children[0].children[0].topic, 'A1')
  const ids = new Set()
  const walk = n => {
    assert.ok(typeof n.id === 'string' && n.id.length > 0)
    assert.ok(!ids.has(n.id), 'id duplicado')
    ids.add(n.id)
    ;(n.children || []).forEach(walk)
  }
  walk(data.nodeData)
})

test('descarta filhos sem topic válido e coage números para string', () => {
  const data = toMindElixirData({
    topic: 'Raiz',
    children: [{ topic: 42 }, { notTopic: 'x' }, null, { topic: '  ' }],
  })
  assert.equal(data.nodeData.children.length, 1)
  assert.equal(data.nodeData.children[0].topic, '42')
})

test('lança erro se a raiz não tem topic', () => {
  assert.throws(() => toMindElixirData({ children: [] }), /topic/i)
})

test('limita profundidade a 6 níveis', () => {
  let tree = { topic: 'fundo' }
  for (let i = 0; i < 10; i++) tree = { topic: `n${i}`, children: [tree] }
  const data = toMindElixirData(tree)
  let depth = 0
  let node = data.nodeData
  while (node.children && node.children.length) {
    depth++
    node = node.children[0]
  }
  assert.ok(depth <= 6, `profundidade ${depth} > 6`)
})

import MindElixir from 'mind-elixir'
import 'mind-elixir/style'
import { pt } from 'mind-elixir/i18n'
import { snapdom } from '@zumer/snapdom'
import { extractMindMapJson, toMindElixirData } from './ai-parser.js'
import './style.css'

const STORAGE_KEY = 'm-master-map'
const WELCOME_KEY = 'marcelo-meister-aviso'

// Funciona offline: cacheia o app no navegador na primeira visita
if ('serviceWorker' in navigator && !location.hostname.includes('localhost')) {
  navigator.serviceWorker.register('/sw.js')
}

const mind = new MindElixir({
  el: '#map',
  direction: MindElixir.SIDE,
  contextMenu: { locale: pt, focus: true, link: true },
  toolBar: true,
  keypress: true,
  allowUndo: true,
  newTopicName: 'Novo tópico',
  theme: MindElixir.DARK_THEME,
})

mind.init(loadSaved() || MindElixir.new('Meu Mapa Mental'))

mind.bus.addListener('operation', save)

// Aviso na primeira visita: salve seu trabalho em JSON
if (!localStorage.getItem(WELCOME_KEY)) {
  localStorage.setItem(WELCOME_KEY, '1')
  setTimeout(() => {
    toast(
      '💾 Importante: clique em "JSON" para salvar seu mapa numa pasta do computador. Para continuar depois, use "📂 Abrir" e suba o arquivo JSON.',
      false,
      12000
    )
  }, 1500)
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mind.getData()))
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return data?.nodeData?.topic ? data : null
  } catch {
    return null
  }
}

// --- Barra de IA ---

const form = document.getElementById('ai-form')
const input = document.getElementById('ai-input')
const button = document.getElementById('ai-button')

form.addEventListener('submit', async event => {
  event.preventDefault()
  const prompt = input.value.trim()
  if (!prompt) return
  setLoading(true)
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || `Erro ${response.status}`)
    const data = toMindElixirData(extractMindMapJson(payload.content))
    mind.refresh(data)
    mind.toCenter()
    mind.scaleFit()
    save()
    if (payload.demo) {
      toast('Modo demonstração: cole sua OPENROUTER_API_KEY no arquivo .env para ativar a IA de verdade.')
    } else {
      toast('Mapa gerado! Agora é só editar: duplo clique, Tab, Enter e arrastar.')
    }
    input.value = ''
  } catch (err) {
    toast(err.message, true)
  } finally {
    setLoading(false)
  }
})

function setLoading(loading) {
  button.disabled = loading
  button.querySelector('.btn-label').textContent = loading ? 'Gerando…' : '✨ Gerar'
  button.querySelector('.btn-spinner').hidden = !loading
}

// --- Ações ---

document.getElementById('new-map').addEventListener('click', () => {
  if (!confirm('Começar um novo mapa em branco? O mapa atual será substituído.')) return
  mind.refresh(MindElixir.new('Meu Mapa Mental'))
  mind.toCenter()
  save()
})

const importInput = document.getElementById('import-file')
document.getElementById('import-json').addEventListener('click', () => importInput.click())
importInput.addEventListener('change', async () => {
  const file = importInput.files[0]
  importInput.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (!data?.nodeData?.topic) throw new Error('Este arquivo não é um mapa válido')
    mind.refresh(data)
    mind.toCenter()
    save()
    toast('Mapa carregado! Pode continuar de onde parou.')
  } catch (err) {
    toast(`Não consegui abrir o JSON: ${err.message}`, true)
  }
})

document.getElementById('export-json').addEventListener('click', () => {
  const data = mind.getData()
  download(`${slug(data.nodeData.topic)}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  toast('JSON baixado! Guarde numa pasta segura — depois é só usar "📂 Abrir" para continuar.')
})

document.getElementById('export-png').addEventListener('click', async () => {
  try {
    const result = await snapdom(mind.nodes, { backgroundColor: '#0f1117', scale: 2 })
    const blob = await result.toBlob({ type: 'png' })
    download(`${slug(mind.getData().nodeData.topic)}.png`, blob)
  } catch (err) {
    toast(`Não consegui exportar o PNG: ${err.message}`, true)
  }
})

function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function slug(text) {
  return (text || 'mapa-mental')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'mapa-mental'
}

// --- Toast ---

let toastTimer
function toast(message, isError = false, duration = 6000) {
  const el = document.getElementById('toast')
  el.textContent = message
  el.className = `toast${isError ? ' error' : ''}`
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.hidden = true), duration)
}

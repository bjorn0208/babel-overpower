import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icone from '../componentes/Icone'
import { cn } from '../componentes/ui'

// Configuração do WhatsApp da empresa: escolher o provedor, guardar a chave,
// parear o número pelo QR e conferir se está no ar.
//
// A tela toda existe para responder três perguntas, nesta ordem: está
// conectado? se não, qual o QR? e onde eu colo o endereço do webhook?

const PROVEDORES = [
  {
    id: 'zapi',
    nome: 'Z-API',
    resumo: 'serviço pago (~R$ 100/mês), nada para instalar',
    campos: [
      ['instancia', 'ID da instância', 'ex.: 3D1F...'],
      ['token', 'Token da instância', 'ex.: A1B2C3...'],
    ],
    chaveRotulo: 'Client-Token (segurança da conta)',
  },
  {
    id: 'evolution',
    nome: 'Evolution',
    resumo: 'gratuito, instalado num servidor seu',
    campos: [
      ['url', 'Endereço da API', 'https://evolution.seu-dominio.com'],
      ['instancia', 'Nome da instância', 'ex.: babel'],
    ],
    chaveRotulo: 'API key',
  },
]

const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal'

export default function GestaoWhatsapp() {
  const [provedor, setProvedor] = useState('zapi')
  const [chave, setChave] = useState('')
  const [config, setConfig] = useState({})
  const [linhaId, setLinhaId] = useState(null)
  const [chaveFinal, setChaveFinal] = useState('')
  const [status, setStatus] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [copiado, setCopiado] = useState(false)

  const escolhido = PROVEDORES.find((p) => p.id === provedor) || PROVEDORES[0]

  async function lerStatus() {
    const { data, error } = await supabase.functions.invoke('whatsapp-status')
    if (error || data?.erro) {
      setStatus({ erro: data?.erro || 'não deu para consultar' })
    } else {
      setStatus(data)
      setChaveFinal(data.chave_final || '')
      if (data.provedor) setProvedor(data.provedor)
    }
    setCarregando(false)
  }

  useEffect(() => {
    // o que já está salvo (a chave em si nunca volta inteira para a tela)
    supabase.from('chaves_api').select('id, provedor, config')
      .like('provedor', 'whatsapp%').eq('ativa', true).limit(1)
      .then(({ data }) => {
        const l = data?.[0]
        if (l) {
          setLinhaId(l.id)
          setProvedor(l.provedor.replace(/^whatsapp-?/, '') || 'zapi')
          setConfig(l.config || {})
        }
      })
    lerStatus()
  }, [])

  // enquanto espera o pareamento, o QR muda a cada poucos segundos
  useEffect(() => {
    if (!status || status.conectado || !status.configurado) return
    const t = setInterval(lerStatus, 12000)
    return () => clearInterval(t)
  }, [status?.conectado, status?.configurado]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    if (!chave.trim() && !linhaId) { setAviso('Cole a chave do provedor.'); return }
    setSalvando(true); setAviso('')
    const linha = {
      provedor: `whatsapp-${provedor}`,
      config,
      ativa: true,
      rotulo: `WhatsApp · ${escolhido.nome}`,
    }
    if (chave.trim()) linha.chave = chave.trim()
    const { error } = linhaId
      ? await supabase.from('chaves_api').update(linha).eq('id', linhaId)
      : await supabase.from('chaves_api').insert(linha)
    setSalvando(false)
    if (error) { setAviso(`Não salvou: ${error.message}`); return }
    setChave('')
    setAviso('Salvo. Conferindo a conexão…')
    setCarregando(true)
    await lerStatus()
    setTimeout(() => setAviso(''), 5000)
  }

  async function copiarWebhook() {
    try { await navigator.clipboard.writeText(status?.webhook || '') } catch { return }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  const conectado = !!status?.conectado

  return (
    <div className="p-4 pt-2 space-y-3">
      {/* 1. está no ar? */}
      <div className="rounded-2xl bg-surface border border-line p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0',
            conectado ? 'bg-sinal' : status?.configurado ? 'bg-amber' : 'bg-ink-3')} />
          <p className="font-bold flex-1">
            {carregando ? 'Consultando…'
              : conectado ? 'WhatsApp conectado'
                : status?.configurado ? 'Aguardando o pareamento'
                  : 'Nenhum WhatsApp conectado'}
          </p>
          <button onClick={() => { setCarregando(true); lerStatus() }}
            className="text-xs text-ink-3 underline">atualizar</button>
        </div>
        <p className="text-xs text-ink-2 leading-relaxed">
          {conectado
            ? 'As mensagens que chegarem neste número aparecem na aba WhatsApp, e a equipe responde por lá.'
            : status?.configurado
              ? `Estado do provedor: ${status?.estado || '—'}. Leia o QR abaixo no celular do número da empresa.`
              : 'Escolha o provedor, cole a chave e salve. Depois é só ler o QR Code no celular.'}
        </p>
        {status?.erro && <p className="text-xs text-amber">{status.erro}</p>}
        {chaveFinal && (
          <p className="text-[11px] text-ink-3 tnum">chave em uso: ••••{chaveFinal}</p>
        )}
      </div>

      {/* 2. o QR, quando falta parear */}
      {status?.qr && !conectado && (
        <div className="rounded-2xl bg-surface border border-line p-4 space-y-2 text-center">
          <p className="font-bold text-sm">Leia no WhatsApp da empresa</p>
          <p className="text-xs text-ink-2">
            Celular → Aparelhos conectados → Conectar um aparelho
          </p>
          <img src={status.qr.startsWith('data:') ? status.qr : `data:image/png;base64,${status.qr}`}
            alt="QR Code do WhatsApp"
            className="mx-auto w-56 h-56 rounded-xl bg-white p-2" />
          <p className="text-[11px] text-ink-3">
            O código se renova sozinho a cada poucos segundos.
          </p>
        </div>
      )}

      {/* 3. provedor e chaves */}
      <div className="rounded-2xl bg-surface border border-line p-4 space-y-3">
        <div>
          <p className="font-bold">Provedor</p>
          <p className="text-xs text-ink-2">Quem faz a ponte entre o WhatsApp e o sistema.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PROVEDORES.map((p) => (
            <button key={p.id} onClick={() => setProvedor(p.id)}
              className={cn('rounded-xl border px-3 py-2.5 text-left transition',
                provedor === p.id ? 'border-sinal/50 bg-sinal/10' : 'border-line')}>
              <span className={cn('block text-sm font-bold',
                provedor === p.id ? 'text-sinal' : 'text-ink')}>{p.nome}</span>
              <span className="block text-[11px] text-ink-3 leading-tight">{p.resumo}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-ink-2">{escolhido.chaveRotulo}</span>
            <input value={chave} onChange={(e) => setChave(e.target.value)}
              type="password" autoComplete="off"
              placeholder={linhaId ? 'deixe em branco para manter a atual' : 'cole a chave aqui'}
              className={campo} />
          </label>
          {escolhido.campos.map(([k, rotulo, exemplo]) => (
            <label key={k} className="block">
              <span className="text-xs text-ink-2">{rotulo}</span>
              <input value={config[k] || ''} placeholder={exemplo}
                onChange={(e) => setConfig({ ...config, [k]: e.target.value })}
                className={campo} />
            </label>
          ))}
        </div>

        <button onClick={salvar} disabled={salvando}
          className="w-full rounded-lg bg-sinal py-2.5 font-bold text-sm text-white disabled:opacity-40">
          {salvando ? 'Salvando…' : 'Salvar e conectar'}
        </button>
        {aviso && <p className="text-xs text-sinal">{aviso}</p>}
      </div>

      {/* 4. o endereço que o provedor precisa conhecer */}
      <div className="rounded-2xl bg-surface border border-line p-4 space-y-2">
        <div>
          <p className="font-bold">Endereço do webhook</p>
          <p className="text-xs text-ink-2 leading-relaxed">
            Cole isto no painel do provedor, no campo de webhook de mensagem
            recebida. É por aqui que a mensagem do cliente entra no sistema.
          </p>
        </div>
        <div className="flex gap-1.5">
          <input readOnly value={status?.webhook || ''}
            onFocus={(e) => e.target.select()}
            className={`${campo} font-mono text-[11px]`} />
          <button onClick={copiarWebhook} disabled={!status?.webhook}
            className="shrink-0 rounded-lg border border-line px-3 text-xs font-bold text-ink-2 disabled:opacity-40">
            {copiado ? 'copiado' : <Icone nome="copiar" tam={14} />}
          </button>
        </div>
        <p className="text-[11px] text-amber leading-relaxed">
          Este endereço contém um segredo: quem tiver ele consegue escrever
          mensagens falsas na caixa da equipe. Não publique.
        </p>
      </div>
    </div>
  )
}

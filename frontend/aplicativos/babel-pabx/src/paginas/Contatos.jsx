import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { linkWhatsappProposta } from '../lib/whatsapp'
import Icone from '../componentes/Icone'

const caixa = 'rounded-xl bg-surface border border-line'

// Contatos que a equipe conseguiu: quem atendeu, telefone e e-mail que a
// pessoa passou na ligação — digitados na hora ou extraídos da transcrição.
// É a lista para mandar proposta: tudo pronto para copiar, ligar ou abrir
// o WhatsApp sem caçar em ficha nenhuma.

function fmtFone(f) {
  const n = String(f || '').replace(/\D/g, '').replace(/^55/, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return f
}
const ehCelular = (f) => {
  const d = String(f || '').replace(/\D/g, '').replace(/^55/, '')
  return d.length === 11 && d[2] === '9'
}
// A mensagem prometia "segue abaixo a nossa apresentação" e não levava link
// nenhum — agora sai da mesma fonte dos outros botões, com a proposta junto.

export default function Contatos({ perfil, ehAdmin, aoLigar, aoAbrirLead }) {
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [soMeus, setSoMeus] = useState(true)
  const [copiado, setCopiado] = useState('')

  async function carregar() {
    setCarregando(true)
    // leads cujo dossiê tem telefone OU e-mail de contato — o que caracteriza
    // "consegui o contato" (nome sozinho não serve para mandar proposta)
    let q = supabase.from('leads')
      .select('id, empresa, telefone, cidade, nicho, status, dossie, contato_nome, atribuido_a, ultima_tentativa_em')
      .or('dossie->>telefone_contato.not.is.null,dossie->>email_contato.not.is.null')
      .order('ultima_tentativa_em', { ascending: false, nullsFirst: false })
      .limit(300)
    if (soMeus && !ehAdmin) q = q.eq('atribuido_a', perfil.user_id)
    else if (soMeus) q = q.eq('atribuido_a', perfil.user_id)
    const { data } = await q
    setLista(data || [])
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [soMeus])

  async function copiar(texto, marca) {
    if (!texto) return
    try { await navigator.clipboard.writeText(texto) } catch { return }
    setCopiado(marca)
    setTimeout(() => setCopiado(''), 1500)
  }

  const filtrada = lista.filter((l) => {
    if (!busca.trim()) return true
    const t = busca.toLowerCase()
    const d = l.dossie || {}
    return [l.empresa, l.contato_nome, d.nome_atendente, d.telefone_contato, d.email_contato, l.nicho]
      .some((v) => String(v || '').toLowerCase().includes(t))
  })

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-3">
      <div className="flex gap-2">
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar empresa, pessoa, telefone…"
          className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm outline-none focus:border-sinal" />
        <button onClick={() => setSoMeus(!soMeus)}
          className={`shrink-0 rounded-lg border px-3 text-xs font-bold ${
            soMeus ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-2'}`}
          title={soMeus ? 'Mostrando só os seus' : 'Mostrando os da equipe'}>
          {soMeus ? 'Meus' : 'Equipe'}
        </button>
      </div>

      {carregando && <p className="text-center text-ink-3 py-10 text-sm">Carregando…</p>}
      {!carregando && filtrada.length === 0 && (
        <p className="text-center text-ink-3 py-10 text-sm leading-relaxed">
          {busca ? 'Nada encontrado com esse termo.'
            : 'Nenhum contato guardado ainda. Durante a ligação, use o card “Contato do cliente” '
              + '— ou o botão “Puxar dados da ligação” ao desligar.'}
        </p>
      )}
      {!carregando && filtrada.length > 0 && (
        <p className="text-[11px] text-ink-3 px-1 tnum">
          {filtrada.length} contato{filtrada.length === 1 ? '' : 's'} guardado{filtrada.length === 1 ? '' : 's'}
        </p>
      )}

      {filtrada.map((l) => {
        const d = l.dossie || {}
        const quem = d.nome_atendente || l.contato_nome || ''
        const fone = d.telefone_contato || ''
        const email = d.email_contato || ''
        return (
          <div key={l.id} className={`${caixa} p-3 space-y-2`}>
            <button onClick={() => aoAbrirLead?.(l.id)} className="w-full text-left">
              <p className="font-semibold text-sm truncate">
                {l.empresa} <span className="text-ink-3 text-xs">›</span>
              </p>
              <p className="text-[11px] text-ink-2 truncate">
                {quem ? `com ${quem}` : 'sem nome anotado'}
                {l.nicho ? ` · ${l.nicho}` : ''}{l.cidade ? ` · ${l.cidade}` : ''}
              </p>
            </button>

            {fone && (
              <div className="flex items-center gap-1.5">
                <span className="flex-1 min-w-0 text-sm tnum truncate">{fmtFone(fone)}</span>
                {ehCelular(fone) && (
                  <a href={linkWhatsappProposta(fone, {
                      empresa: l.empresa || '', vendedor: perfil?.nome || '',
                    })}
                    target="_blank" rel="noopener noreferrer" title="Abrir no WhatsApp com a apresentação"
                    className="shrink-0 rounded-lg border border-sinal/50 text-sinal px-2.5 py-1.5">
                    <Icone nome="whatsapp" tam={13} />
                  </a>
                )}
                <button onClick={() => aoLigar?.({ id: l.id, empresa: l.empresa, telefone: fone })}
                  title="Ligar para este número" className="shrink-0 rounded-lg border border-line text-ink-2 px-2.5 py-1.5">
                  <Icone nome="fone" tam={13} />
                </button>
                <button onClick={() => copiar(fmtFone(fone), `f${l.id}`)} title="Copiar telefone"
                  className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold text-ink-3">
                  {copiado === `f${l.id}` ? 'ok!' : <Icone nome="copiar" tam={13} />}
                </button>
              </div>
            )}

            {email && (
              <div className="flex items-center gap-1.5">
                <span className="flex-1 min-w-0 text-sm truncate">{email}</span>
                <a href={`mailto:${email}?subject=${encodeURIComponent('Proposta Comercial — Babel OS')}`}
                  title="Escrever e-mail"
                  className="shrink-0 rounded-lg border border-sinal/50 text-sinal px-2.5 py-1.5">
                  <Icone nome="email" tam={13} />
                </a>
                <button onClick={() => copiar(email, `e${l.id}`)} title="Copiar e-mail"
                  className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold text-ink-3">
                  {copiado === `e${l.id}` ? 'ok!' : <Icone nome="copiar" tam={13} />}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

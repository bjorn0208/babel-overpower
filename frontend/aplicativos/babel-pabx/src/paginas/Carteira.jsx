import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const caixa = 'rounded-xl bg-surface border border-line'
const campo = 'w-full rounded-lg bg-surface-2 border border-line px-3 py-2 outline-none focus:border-sinal text-sm'

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function mesDe(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}
function dataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Carteira: o lucro ao fechar de cada venda cai aqui. O usuário acompanha o
// saldo, pede saque (Pix) e vê quanto sacou em cada mês. O admin paga e registra.
export default function Carteira({ perfil, ehAdmin }) {
  const [saldo, setSaldo] = useState(null)
  const [lancamentos, setLancamentos] = useState([])
  const [saques, setSaques] = useState([])
  const [pedindo, setPedindo] = useState(false)
  const [valorSaque, setValorSaque] = useState('')
  const [chavePix, setChavePix] = useState('')
  const [msg, setMsg] = useState('')
  const [fila, setFila] = useState([])         // admin: saques pendentes de todos
  const [nomes, setNomes] = useState({})

  async function carregar() {
    const [{ data: s }, { data: ls }, { data: sq }] = await Promise.all([
      supabase.rpc('saldo_carteira'),
      supabase.from('carteira_lancamentos').select('*')
        .eq('user_id', perfil.user_id).order('criado_em', { ascending: false }).limit(100),
      supabase.from('saques').select('*')
        .eq('user_id', perfil.user_id).order('criado_em', { ascending: false }).limit(100),
    ])
    setSaldo(s)
    setLancamentos(ls || [])
    setSaques(sq || [])
    if (ehAdmin) {
      const [{ data: f }, { data: ps }] = await Promise.all([
        supabase.from('saques').select('*').eq('status', 'pendente').order('criado_em'),
        supabase.from('profiles').select('user_id, nome'),
      ])
      setFila(f || [])
      setNomes(Object.fromEntries((ps || []).map((p) => [p.user_id, p.nome])))
    }
  }
  useEffect(() => { carregar() }, [])

  async function pedirSaque() {
    setMsg('')
    const { error } = await supabase.rpc('solicitar_saque', {
      _valor: Number(valorSaque), _chave_pix: chavePix,
    })
    if (error) { setMsg(error.message); return }
    setPedindo(false); setValorSaque(''); setMsg('Saque solicitado — o admin paga por Pix e marca aqui.')
    carregar()
  }

  async function decidirSaque(s, status) {
    await supabase.from('saques').update({
      status, pago_em: status === 'pago' ? new Date().toISOString() : null,
    }).eq('id', s.id)
    carregar()
  }

  // histórico mensal: quanto sacou (pago) em cada mês
  const porMes = {}
  for (const s of saques.filter((x) => x.status === 'pago')) {
    const chave = mesDe(s.pago_em || s.criado_em)
    porMes[chave] = (porMes[chave] || 0) + Number(s.valor)
  }

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <div className={`${caixa} p-5 text-center space-y-1`}>
        <p className="text-xs uppercase tracking-wide text-ink-3">Saldo disponível</p>
        <p className="text-3xl font-extrabold text-sinal tnum">{saldo === null ? '…' : brl(saldo)}</p>
        <p className="text-[11px] text-ink-3">Cada venda validada na call credita o seu lucro ao fechar.</p>
        <button onClick={() => setPedindo(!pedindo)} disabled={!saldo || saldo <= 0}
          className="mt-2 rounded-lg bg-sinal px-6 py-2 font-semibold text-white disabled:opacity-40">
          Solicitar saque
        </button>
      </div>

      {pedindo && (
        <div className={`${caixa} p-4 space-y-2`}>
          <p className="text-sm font-semibold">Pedir saque</p>
          <input type="number" min="1" step="0.01" placeholder="Valor (R$)" value={valorSaque}
            onChange={(e) => setValorSaque(e.target.value)} className={campo} />
          <input placeholder="Sua chave Pix" value={chavePix}
            onChange={(e) => setChavePix(e.target.value)} className={campo} />
          <button onClick={pedirSaque} disabled={!valorSaque || !chavePix}
            className="w-full rounded-lg bg-sinal py-2 font-semibold text-white disabled:opacity-40">
            Confirmar pedido
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-sinal">{msg}</p>}

      {ehAdmin && fila.length > 0 && (
        <div className={`${caixa} p-4 space-y-2`}>
          <p className="text-sm font-semibold">Saques aguardando pagamento (admin)</p>
          {fila.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg bg-surface-2 border border-line px-3 py-2">
              <span className="flex-1 min-w-0 text-sm">
                <b>{nomes[s.user_id] || '?'}</b> · {brl(s.valor)}
                <span className="block text-[11px] text-ink-3 truncate">Pix: {s.chave_pix} · {dataHora(s.criado_em)}</span>
              </span>
              <button onClick={() => decidirSaque(s, 'pago')}
                className="text-xs font-bold border border-sinal/50 text-sinal rounded-full px-3 py-1">✓ Paguei</button>
              <button onClick={() => decidirSaque(s, 'recusado')}
                className="text-xs border border-line text-ink-2 rounded-full px-3 py-1">Recusar</button>
            </div>
          ))}
        </div>
      )}

      {Object.keys(porMes).length > 0 && (
        <div className={`${caixa} p-4 space-y-1.5`}>
          <p className="text-sm font-semibold">Quanto saquei por mês</p>
          {Object.entries(porMes).map(([mes, total]) => (
            <div key={mes} className="flex justify-between text-sm">
              <span className="text-ink-2 capitalize">{mes}</span>
              <span className="font-semibold tnum">{brl(total)}</span>
            </div>
          ))}
        </div>
      )}

      <div className={`${caixa} p-4 space-y-1.5`}>
        <p className="text-sm font-semibold">Extrato</p>
        {lancamentos.length === 0 && saques.length === 0 && (
          <p className="text-xs text-ink-3">Nada ainda — a primeira venda validada credita aqui.</p>
        )}
        {[...lancamentos.map((l) => ({ ...l, _tipo: 'credito' })),
          ...saques.map((s) => ({ ...s, _tipo: 'saque' }))]
          .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
          .slice(0, 60)
          .map((i) => (
            <div key={`${i._tipo}-${i.id}`} className="flex justify-between gap-2 text-sm border-b border-line/50 last:border-0 py-1">
              <span className="text-ink-2 min-w-0 truncate">
                {i._tipo === 'credito' ? `${i.descricao || 'Crédito'}` :
                  `Saque ${i.status === 'pago' ? 'pago' : i.status === 'recusado' ? 'recusado' : 'pendente'}`}
                <span className="text-[10px] text-ink-3"> · {dataHora(i.criado_em)}</span>
              </span>
              <span className={`font-semibold tnum whitespace-nowrap ${
                i._tipo === 'credito' ? 'text-sinal' : i.status === 'recusado' ? 'text-ink-3 line-through' : 'text-danger'}`}>
                {i._tipo === 'credito' ? '+' : '−'}{brl(i.valor)}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

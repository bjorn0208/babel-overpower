import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const caixa = 'rounded-xl bg-surface border border-line'

// Contratos gerados pela ponte (o motor mora no app Contratos da Babel OS):
// o mentor acompanha aqui quem assinou e quem mandou comprovante.
export default function Contratos({ perfil, ehAdmin }) {
  const [leads, setLeads] = useState([])
  const [status, setStatus] = useState({})   // chave_publica → status
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    setCarregando(true)
    let q = supabase.from('leads')
      .select('id, empresa, telefone, status, babel_contrato_chave, babel_user_id, atualizado_em, atribuido_a')
      .not('babel_contrato_chave', 'is', null)
      .order('atualizado_em', { ascending: false }).limit(50)
    if (!ehAdmin) q = q.eq('atribuido_a', perfil.user_id)
    const { data } = await q
    setLeads(data || [])
    setCarregando(false)

    // status ao vivo, um a um (poucos contratos por mentor)
    for (const l of data || []) {
      supabase.functions.invoke('babelos', {
        body: { acao: 'status_contrato', chave_publica: l.babel_contrato_chave },
      }).then(({ data: s }) => {
        if (s?.ok) setStatus((m) => ({ ...m, [l.babel_contrato_chave]: s }))
      })
    }
  }
  useEffect(() => { carregar() }, [])

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto p-4 md:p-6 space-y-3">
      <p className="text-xs text-ink-2">
        Contratos gerados nas mentorias — assinatura e comprovante ao vivo.
        O texto do contrato mora no app Contratos da Babel OS.
      </p>
      {carregando && <p className="text-center text-ink-2 p-8">Carregando…</p>}
      {!carregando && leads.length === 0 && (
        <p className="text-center text-ink-3 text-sm p-8">
          Nenhum contrato ainda — eles nascem no cockpit da Reunião, em "Fechar venda".
        </p>
      )}
      {leads.map((l) => {
        const s = status[l.babel_contrato_chave]
        return (
          <div key={l.id} className={`${caixa} px-4 py-3 space-y-1.5`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{l.empresa}</span>
              {l.status === 'convertido' && (
                <span className="text-[10px] font-bold border border-sinal/50 text-sinal rounded-full px-2 py-0.5">CLIENTE</span>
              )}
            </div>
            <div className="flex gap-2 text-xs">
              <span className={`flex-1 rounded-lg border px-2 py-1 text-center font-semibold ${
                s?.assinado ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-3'}`}>
                {s ? (s.assinado ? '✓ Assinado' : 'aguardando assinatura') : '…'}
              </span>
              <span className={`flex-1 rounded-lg border px-2 py-1 text-center font-semibold ${
                s?.comprovante ? 'border-sinal/50 text-sinal bg-sinal/10' : 'border-line text-ink-3'}`}>
                {s ? (s.comprovante ? '✓ Comprovante' : 'sem comprovante') : '…'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

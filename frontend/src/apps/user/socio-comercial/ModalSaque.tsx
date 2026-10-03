import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { formatarBRL } from './tipos'

type RagenticToast = { success: (m: string) => void; error: (m: string) => void }
function obterToast(): RagenticToast {
  const w = window as unknown as { useToast?: () => RagenticToast }
  return w.useToast?.() ?? { success: () => {}, error: () => {} }
}

type Props = {
  saldo: number
  valorMinimo: number
  chavePixPadrao: string | null
  onClose: () => void
  onSucesso: () => void
}

export function ModalSaque({ saldo, valorMinimo, chavePixPadrao, onClose, onSucesso }: Props) {
  const [valor, setValor] = useState('')
  const [chavePix, setChavePix] = useState(chavePixPadrao ?? '')
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = obterToast()
    const v = parseFloat(valor)
    if (!v || v <= 0 || v > saldo) {
      t.error('Valor inválido')
      return
    }
    if (valorMinimo > 0 && v < valorMinimo) {
      t.error(`Valor mínimo para saque: ${formatarBRL(valorMinimo)}`)
      return
    }
    setEnviando(true)
    try {
      const { error } = await supabase.rpc('solicitar_saque', {
        p_valor: v,
        p_chave_pix: chavePix || chavePixPadrao || '',
      })
      if (error) throw error
      t.success('Saque solicitado com sucesso')
      setValor('')
      onClose()
      onSucesso()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao solicitar saque'
      obterToast().error(msg)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="h2">Solicitar Saque</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="col gap-3">
          <div className="col gap-1">
            <label className="label">
              Valor{valorMinimo > 0 ? ` (mín: ${formatarBRL(valorMinimo)} / ` : ' ('}
              máx: {formatarBRL(saldo)})
            </label>
            <input
              type="number"
              step="0.01"
              min={valorMinimo > 0 ? valorMinimo : 0.01}
              max={saldo}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
              placeholder="0,00"
              className="input mono"
            />
          </div>

          <div className="col gap-1">
            <label className="label">Chave Pix</label>
            <input
              value={chavePix}
              onChange={(e) => setChavePix(e.target.value)}
              required
              placeholder="CPF, e-mail ou telefone"
              className="input mono"
            />
          </div>

          <div className="row gap-2" style={{ justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando} className="btn btn-primary">
              {enviando ? 'Enviando…' : 'Solicitar'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

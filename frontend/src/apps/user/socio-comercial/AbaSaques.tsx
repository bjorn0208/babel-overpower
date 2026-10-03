import type { Saque } from './tipos'
import { formatarBRL } from './tipos'

type Props = {
  saques: Saque[]
}

function BadgeStatus({ status }: { status: Saque['status'] }) {
  if (status === 'pendente') return <span className="badge badge-warn">Pendente</span>
  if (status === 'pago') return <span className="badge badge-success">Pago</span>
  if (status === 'recusado') return <span className="badge badge-err">Recusado</span>
  return <span className="badge">{status}</span>
}

export function AbaSaques({ saques }: Props) {
  if (saques.length === 0) {
    return (
      <div className="col" style={{ alignItems: 'center', padding: '48px 0' }}>
        <div style={{ fontSize: 32, opacity: 0.25, marginBottom: 8 }}>🏦</div>
        <div className="muted small">Nenhum saque solicitado ainda</div>
      </div>
    )
  }

  return (
    <div className="os-card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ textAlign: 'right' }}>Valor</th>
            <th style={{ textAlign: 'left' }}>Chave Pix</th>
            <th style={{ textAlign: 'center' }}>Status</th>
            <th style={{ textAlign: 'left' }}>Data</th>
          </tr>
        </thead>
        <tbody>
          {saques.map((s) => (
            <tr key={s.id}>
              <td style={{ textAlign: 'right' }}>
                <span className="mono small" style={{ fontWeight: 700 }}>
                  {formatarBRL(Number(s.valor))}
                </span>
              </td>
              <td>
                <span className="mono tiny muted">{s.chave_pix || '—'}</span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <BadgeStatus status={s.status} />
              </td>
              <td>
                <span className="muted tiny">
                  {new Date(s.created_at).toLocaleDateString('pt-BR')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import type { Comissao } from './tipos'
import { formatarBRL } from './tipos'

type Props = {
  comissoes: Comissao[]
}

export function AbaComissoes({ comissoes }: Props) {
  if (comissoes.length === 0) {
    return (
      <div className="col" style={{ alignItems: 'center', padding: '48px 0' }}>
        <div style={{ fontSize: 32, opacity: 0.25, marginBottom: 8 }}>💰</div>
        <div className="muted small">Nenhuma comissão recebida ainda</div>
      </div>
    )
  }

  return (
    <div className="os-card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Origem</th>
            <th style={{ textAlign: 'center' }}>Nível</th>
            <th style={{ textAlign: 'right' }}>Valor base</th>
            <th style={{ textAlign: 'center' }}>%</th>
            <th style={{ textAlign: 'right' }}>Comissão</th>
            <th style={{ textAlign: 'left' }}>Data</th>
          </tr>
        </thead>
        <tbody>
          {comissoes.map((c) => (
            <tr key={c.id}>
              <td>
                <span className="small">{c.origem_nome || '—'}</span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <div
                  className="avatar"
                  style={{
                    background: '#5b50ea',
                    width: 24,
                    height: 24,
                    fontSize: 10,
                    margin: '0 auto',
                  }}
                >
                  {c.nivel}
                </div>
              </td>
              <td style={{ textAlign: 'right' }}>
                <span className="muted small mono">{formatarBRL(Number(c.valor_base))}</span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className="muted tiny">{Number(c.percentual)}%</span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <span className="small mono" style={{ color: 'oklch(0.72 0.18 142)' }}>
                  {formatarBRL(Number(c.valor_comissao))}
                </span>
              </td>
              <td>
                <span className="muted tiny">
                  {new Date(c.created_at).toLocaleDateString('pt-BR')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

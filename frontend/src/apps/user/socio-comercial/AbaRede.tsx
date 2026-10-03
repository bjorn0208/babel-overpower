import type { Indicado } from './tipos'
import { iniciais } from './tipos'

type Props = {
  indicados: Indicado[]
}

export function AbaRede({ indicados }: Props) {
  if (indicados.length === 0) {
    return (
      <div className="col" style={{ alignItems: 'center', padding: '48px 0' }}>
        <div style={{ fontSize: 32, opacity: 0.25, marginBottom: 8 }}>👥</div>
        <div className="muted small">Nenhum indicado ainda</div>
        <div className="muted tiny" style={{ marginTop: 4 }}>
          Compartilhe seu link de cadastro para começar
        </div>
      </div>
    )
  }

  return (
    <div className="os-card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Nome</th>
            <th style={{ textAlign: 'center' }}>Sub-indicados</th>
            <th style={{ textAlign: 'center' }}>Status</th>
            <th style={{ textAlign: 'left' }}>Data</th>
          </tr>
        </thead>
        <tbody>
          {indicados.map((ind) => {
            const ini = iniciais(ind.full_name || ind.email)
            return (
              <tr key={ind.id}>
                <td>
                  <div className="row gap-2" style={{ alignItems: 'center' }}>
                    {ind.avatar_url ? (
                      <img
                        src={ind.avatar_url}
                        alt=""
                        loading="lazy"
                        style={{
                          width: 32, height: 32, borderRadius: '50%',
                          objectFit: 'cover', flexShrink: 0,
                          border: '1px solid rgba(255,255,255,0.10)',
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div
                        className="avatar"
                        style={{ background: '#5b8bea', width: 32, height: 32, fontSize: 11 }}
                      >
                        {ini}
                      </div>
                    )}
                    <div>
                      <div className="h3" style={{ fontSize: 13 }}>{ind.full_name || '—'}</div>
                      <div className="muted tiny mono">{ind.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className="mono small">{ind.sub_indicados ?? 0}</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {ind.multinivel_ativo ? (
                    <span className="badge badge-warn">Sócio</span>
                  ) : (
                    <span className="badge">Usuário</span>
                  )}
                </td>
                <td>
                  <span className="muted tiny">
                    {new Date(ind.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

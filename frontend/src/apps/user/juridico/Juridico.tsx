// @ts-nocheck
/**
 * App Jurídico (user) — vitrine dos serviços jurídicos cadastrados pelo admin.
 * Fluxo "tenho interesse": clique registra em `juridico_interesses` e o time
 * do admin entra em contato. Sem cobrança dentro do app.
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

const fmtPreco = (preco) =>
  preco == null
    ? 'Sob consulta'
    : Number(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function Juridico() {
  const t = useToast();
  const [servicos, setServicos] = useState(null);
  const [interesses, setInteresses] = useState(new Set());
  const [enviandoId, setEnviandoId] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data?.session?.user?.id ?? null;
      setUserId(uid);
      void carregar(uid);
    });
  }, []);

  async function carregar(uid) {
    const [resServ, resInt] = await Promise.all([
      supabase
        .from('juridico_servicos')
        .select('id, nome, descricao, preco, ordem')
        .order('ordem'),
      uid
        ? supabase.from('juridico_interesses').select('servico_id').eq('user_id', uid)
        : Promise.resolve({ data: [] }),
    ]);
    if (resServ.error) {
      console.error('[Juridico] carregar serviços:', resServ.error);
      t.error('Erro ao carregar serviços.');
      setServicos([]);
    } else {
      setServicos(resServ.data ?? []);
    }
    if (resInt.error) {
      console.error('[Juridico] carregar interesses:', resInt.error);
    } else {
      setInteresses(new Set((resInt.data ?? []).map((r) => r.servico_id)));
    }
  }

  const manifestarInteresse = async (servico) => {
    if (!userId || enviandoId) return;
    setEnviandoId(servico.id);
    const { error } = await supabase
      .from('juridico_interesses')
      .insert({ user_id: userId, servico_id: servico.id });
    setEnviandoId(null);
    if (error) {
      console.error('[Juridico] manifestarInteresse:', error);
      t.error('Erro ao enviar interesse. Tente de novo.');
      return;
    }
    setInteresses((prev) => new Set(prev).add(servico.id));
    t.success(`Interesse enviado · o time entra em contato sobre ${servico.nome}`);
  };

  const lista = useMemo(() => servicos ?? [], [servicos]);

  return (
    <div className="col" style={{ height: '100%' }}>
      <div className="row" style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
        <div>
          <div className="h2">Jurídico</div>
          <div className="muted small">Serviços jurídicos pra sua empresa. Clique e o time entra em contato.</div>
        </div>
      </div>

      <div className="flex-1 scroll" style={{ overflowY: 'auto', padding: 22 }}>
        {servicos === null && (
          <div className="os-card center" style={{ padding: 60 }}>
            <div className="muted">Carregando serviços…</div>
          </div>
        )}

        {servicos !== null && lista.length === 0 && (
          <div className="os-card center" style={{ padding: 60 }}>
            <Icon name="briefcase" size={36} stroke="var(--txt-3)" />
            <div className="h3" style={{ marginTop: 12 }}>Nenhum serviço disponível</div>
            <div className="muted small" style={{ marginTop: 4 }}>Aguarde novidades do time jurídico.</div>
          </div>
        )}

        <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
          {lista.map((s) => {
            const jaEnviado = interesses.has(s.id);
            return (
              <div key={s.id} className="os-card lift flex-1" style={{ padding: 20, minWidth: 260, maxWidth: 340 }}>
                <div className="row gap-3" style={{ alignItems: 'center' }}>
                  <div
                    className="center"
                    style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Icon name="briefcase" size={22} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="h3" style={{ fontSize: 15 }}>{s.nome}</div>
                    <div className="kpi-num os-aurora-text" style={{ fontSize: 16, marginTop: 2 }}>
                      {fmtPreco(s.preco)}
                    </div>
                  </div>
                </div>
                {s.descricao && (
                  <div className="muted small" style={{ marginTop: 8, lineHeight: 1.45 }}>{s.descricao}</div>
                )}
                <button
                  className={`btn ${jaEnviado ? '' : 'btn-primary'}`}
                  style={{ width: '100%', marginTop: 14 }}
                  onClick={() => manifestarInteresse(s)}
                  disabled={jaEnviado || enviandoId === s.id}
                >
                  {jaEnviado
                    ? (<><Icon name="check" size={13} /> Interesse enviado</>)
                    : (<><Icon name="arrowRight" size={13} /> {enviandoId === s.id ? 'Enviando…' : 'Tenho interesse'}</>)}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

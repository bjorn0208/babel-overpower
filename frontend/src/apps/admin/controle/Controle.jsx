import { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';
import { ModalZapi } from '../tenants/ModalZapi';
import { PlanilhaGastos } from './planilha-gastos';

// App Controle (admin) — vencimento dos planos por urgência + saldo OpenRouter ao vivo.
// Nasceu do incidente 2026-07-14: crédito do OpenRouter zerou e a plataforma calou sem aviso.

const DIA_MS = 86400000;

// Paleta de urgência (oklch, casa com o tema do OS)
const CORES = {
  vermelho: { fundo: 'oklch(0.65 0.21 25 / 0.16)', texto: 'oklch(0.75 0.19 25)' },
  laranja:  { fundo: 'oklch(0.72 0.17 55 / 0.16)', texto: 'oklch(0.78 0.16 55)' },
  amarelo:  { fundo: 'oklch(0.80 0.16 95 / 0.14)', texto: 'oklch(0.83 0.14 95)' },
  verde:    { fundo: 'oklch(0.72 0.17 150 / 0.14)', texto: 'oklch(0.78 0.15 150)' },
  cinza:    { fundo: 'rgba(255,255,255,0.06)',      texto: 'rgba(255,255,255,0.55)' },
};

function classificarUrgencia(assinatura) {
  if (!assinatura) return { rotulo: 'sem plano', cor: CORES.cinza, ordem: 999 };
  const ativa = ['ativa', 'active'].includes(assinatura.status);
  const dias = assinatura.data_expiracao
    ? Math.ceil((new Date(assinatura.data_expiracao).getTime() - Date.now()) / DIA_MS)
    : null;
  if (!ativa) return { rotulo: assinatura.status || 'inativa', cor: CORES.vermelho, ordem: -2, dias };
  if (dias === null) return { rotulo: 'sem validade', cor: CORES.cinza, ordem: 998, dias };
  if (dias < 0) return { rotulo: 'vencido', cor: CORES.vermelho, ordem: -1, dias };
  if (dias <= 3) return { rotulo: `${dias}d restantes`, cor: CORES.vermelho, ordem: dias };
  if (dias <= 7) return { rotulo: `${dias}d restantes`, cor: CORES.laranja, ordem: dias };
  if (dias <= 15) return { rotulo: `${dias}d restantes`, cor: CORES.amarelo, ordem: dias };
  return { rotulo: `${dias}d restantes`, cor: CORES.verde, ordem: dias };
}

function Selo({ cor, children }) {
  return (
    <span className="mono" style={{
      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
      background: cor.fundo, color: cor.texto, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function CartaoSaldo({ saldo, carregando, aoAtualizar }) {
  const corSaldo = saldo == null ? CORES.cinza
    : saldo.saldo <= 5 ? CORES.vermelho
    : saldo.saldo <= 15 ? CORES.laranja
    : CORES.verde;
  const mediaDia = saldo?.uso_semana ? saldo.uso_semana / 7 : 0;
  const folegoDias = saldo && mediaDia > 0 ? Math.floor(Math.max(saldo.saldo, 0) / mediaDia) : null;

  return (
    <div className="os-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 18 }}>
      <div className="row center" style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'linear-gradient(135deg, var(--os-acento-1-soft), var(--os-acento-2-soft))',
      }}><Icon name="wallet" size={20} /></div>

      <div style={{ flex: 1 }}>
        <div className="title-section">Saldo OpenRouter</div>
        <div className="row gap-3" style={{ alignItems: 'baseline' }}>
          <span className="kpi-num" style={{ fontSize: 30, letterSpacing: '-0.02em', color: corSaldo.texto }}>
            {saldo == null ? '—' : `$${saldo.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
          {saldo != null && (
            <span className="muted small">
              gasto hoje ${saldo.uso_hoje.toFixed(2)}
              {folegoDias != null && ` · fôlego ~${folegoDias}d no ritmo da semana`}
            </span>
          )}
        </div>
        {saldo?.consultado_em && (
          <div className="muted tiny">
            atualizado {new Date(saldo.consultado_em).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · auto a cada 60s
          </div>
        )}
      </div>

      {saldo != null && saldo.saldo <= 5 && <Selo cor={CORES.vermelho}>recarregar agora</Selo>}
      <button className="btn" onClick={aoAtualizar} disabled={carregando} title="Consultar saldo agora">
        <Icon name="clock" size={13} /> {carregando ? 'Consultando…' : 'Atualizar'}
      </button>
    </div>
  );
}

export function Controle() {
  const t = useToast();
  const [saldo, setSaldo] = useState(null);
  const [consultandoSaldo, setConsultandoSaldo] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [carregandoTenants, setCarregandoTenants] = useState(true);
  const [tenantZapi, setTenantZapi] = useState(null); // pessoa clicada → modal de config de API

  const consultarSaldo = useCallback(async (silencioso = false) => {
    setConsultandoSaldo(true);
    try {
      const { data, error } = await supabase.functions.invoke('saldo-openrouter', { body: {} });
      if (error || !data?.ok) throw new Error(data?.erro || error?.message || 'falha na consulta');
      setSaldo(data);
    } catch (e) {
      if (!silencioso) t.show?.({ tipo: 'erro', titulo: 'Saldo OpenRouter', msg: e.message });
    } finally {
      setConsultandoSaldo(false);
    }
  }, [t]);

  const carregarTenants = useCallback(async () => {
    setCarregandoTenants(true);
    const [{ data: perfis, error: e1 }, { data: assinaturas, error: e2 }] = await Promise.all([
      supabase.from('profiles')
        .select('id, full_name, apelido, email, is_active, system_role')
        .is('parent_user_id', null),
      supabase.from('assinaturas_usuario')
        .select('user_id, plano_nome, status, data_expiracao, conversas_usadas, max_conversas'),
    ]);
    if (e1 || e2) {
      t.show?.({ tipo: 'erro', titulo: 'Controle', msg: (e1 || e2).message });
      setCarregandoTenants(false);
      return;
    }
    const porUsuario = new Map((assinaturas || []).map(a => [a.user_id, a]));
    const lista = (perfis || [])
      .filter(p => p.system_role !== 'platform_admin')
      .map(p => {
        const assinatura = porUsuario.get(p.id) || null;
        return { perfil: p, assinatura, urgencia: classificarUrgencia(assinatura) };
      })
      .sort((a, b) => a.urgencia.ordem - b.urgencia.ordem);
    setTenants(lista);
    setCarregandoTenants(false);
  }, [t]);

  useEffect(() => {
    consultarSaldo(true);
    carregarTenants();
    const intervalo = setInterval(() => consultarSaldo(true), 60000);
    return () => clearInterval(intervalo);
  }, [consultarSaldo, carregarTenants]);

  const resumo = useMemo(() => {
    const criticos = tenants.filter(x => x.urgencia.ordem <= 3).length;
    const atencao = tenants.filter(x => x.urgencia.ordem > 3 && x.urgencia.ordem <= 15).length;
    return { criticos, atencao, total: tenants.length };
  }, [tenants]);

  return (
    <div style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="h1">Controle</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            Vencimento dos planos e saldo de LLM — sem surpresas.
          </div>
        </div>
        <div className="row gap-2 small">
          <Selo cor={CORES.vermelho}>{resumo.criticos} críticos</Selo>
          <Selo cor={CORES.amarelo}>{resumo.atencao} em atenção</Selo>
          <span className="muted small">{resumo.total} tenants</span>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <CartaoSaldo saldo={saldo} carregando={consultandoSaldo} aoAtualizar={() => consultarSaldo(false)} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <PlanilhaGastos />
      </div>

      <div className="os-card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="h3">Planos por urgência</div>
          <button className="btn" onClick={carregarTenants} disabled={carregandoTenants}>
            {carregandoTenants ? 'Carregando…' : 'Recarregar lista'}
          </button>
        </div>

        {carregandoTenants && tenants.length === 0 && <div className="muted small">Carregando tenants…</div>}
        {!carregandoTenants && tenants.length === 0 && <div className="muted small">Nenhum tenant encontrado.</div>}

        {tenants.map((item, i) => {
          const { perfil, assinatura, urgencia } = item;
          const nome = perfil.apelido || perfil.full_name || perfil.email || 'Sem nome';
          const vence = assinatura?.data_expiracao
            ? new Date(assinatura.data_expiracao).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : '—';
          return (
            <div key={perfil.id} className="row gap-3 os-linha-clicavel"
              style={{ padding: '10px 0', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer' }}
              title="Abrir configuração de APIs"
              onClick={() => setTenantZapi({ id: perfil.id, nome })}>
              <div className="avatar" style={{ width: 30, height: 30, fontSize: 12, background: urgencia.cor.fundo, color: urgencia.cor.texto }}>
                {nome[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="h3" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</div>
                <div className="muted tiny">
                  {assinatura?.plano_nome || 'sem plano'}
                  {assinatura && ` · ${assinatura.conversas_usadas ?? 0}/${assinatura.max_conversas ?? '∞'} conversas`}
                  {perfil.is_active === false && ' · conta desativada'}
                </div>
              </div>
              <span className="mono tiny muted" title="Data de expiração">{vence}</span>
              <Selo cor={urgencia.cor}>{urgencia.rotulo}</Selo>
            </div>
          );
        })}
      </div>

      {tenantZapi && <ModalZapi tenant={tenantZapi} onClose={() => setTenantZapi(null)} />}
    </div>
  );
}

// @ts-nocheck
/**
 * Aba "Aplicativos" do app Loja (user).
 * Sub-abas: Disponíveis (catálogo - já instalados) e Instalados.
 *
 * Disponíveis: lista apps que o user pode instalar. Botão "Instalar" dispara
 * animação visual (barra preenchendo direita→esquerda, 1.2s) + insert em
 * `aplicativos_instalados` + toast + custom event pra bundle recalcular.
 *
 * Instalados: lista o que já tem instalado. Botão "Desinstalar" remove a row
 * + dispara o mesmo custom event.
 *
 * App pago não exercitado nessa onda (todos os apps do catálogo são grátis
 * por enquanto). Quando entrar app pago, abrir modal PIX + comprovante
 * (mesmo fluxo dos planos) antes do insert em aplicativos_instalados.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';
import './aba-aplicativos.css';

type Aplicativo = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  icone: string;
  categoria: string;
  preco_mensal: number | null;
  ordem?: number;
};

type Props = {
  userId: string | null;
};

// Pacote de Conhecimento (categoria 'conhecimento'): não vira app no Launchpad — instalar
// libera o pacote pra ser LIGADO no Hub de Conhecimento do agente.
const ehPacote = (app: Aplicativo) => app.categoria === 'conhecimento';
const rotuloCategoria = (app: Aplicativo) => (ehPacote(app) ? 'Pacote de conhecimento' : app.categoria);
const abrirAgente = () => {
  try {
    window.dispatchEvent(new CustomEvent('ragentic-abrir-app', { detail: { slug: 'agente' } }));
  } catch {
    /* noop */
  }
};

export function AbaAplicativos({ userId }: Props) {
  const t = useToast();
  const [sub, setSub] = useState<'disponiveis' | 'instalados'>('disponiveis');
  const [catalogo, setCatalogo] = useState<Aplicativo[] | null>(null);
  const [instalados, setInstalados] = useState<Set<string>>(new Set());
  const [instalandoId, setInstalandoId] = useState<string | null>(null);
  const [instalandoPronto, setInstalandoPronto] = useState(false);
  const [desinstalandoId, setDesinstalandoId] = useState<string | null>(null);
  const cancelTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const recarregar = async () => {
    if (!userId) return;
    const [resCat, resInst] = await Promise.all([
      // RPC aplica a regra de nicho (app sem vínculo = global; com vínculo = só do nicho do tenant).
      // Sem ela, apps de nicho (ex: Consulta no limpa_nome) vazariam pra todos os tenants.
      supabase.rpc('apps_visiveis_para_tenant'),
      supabase
        .from('aplicativos_instalados')
        .select('aplicativo_id, aplicativo_slug')
        .eq('user_id', userId),
    ]);
    if (resCat.error) {
      console.error('[AbaAplicativos] catálogo:', resCat.error);
      t.error('Erro ao carregar catálogo.');
      setCatalogo([]);
    } else {
      const apps = ((resCat.data ?? []) as Aplicativo[])
        .slice()
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      setCatalogo(apps);
    }
    if (resInst.error) {
      console.error('[AbaAplicativos] instalados:', resInst.error);
    } else {
      const slugs = new Set<string>((resInst.data ?? []).map((r: any) => r.aplicativo_slug));
      setInstalados(slugs);
      // Atualiza RAGENTIC_DATA pra bundle reagir
      const W = (window as any).RAGENTIC_DATA || {};
      W.APLICATIVOS_INSTALADOS_SLUGS = Array.from(slugs);
      (window as any).RAGENTIC_DATA = W;
    }
  };

  useEffect(() => {
    void recarregar();
    return () => {
      cancelTimers.current.forEach((id) => clearTimeout(id));
      cancelTimers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const disponiveis = useMemo(
    () => (catalogo || []).filter((a) => !instalados.has(a.slug)),
    [catalogo, instalados],
  );
  const listaInstalados = useMemo(
    () => (catalogo || []).filter((a) => instalados.has(a.slug)),
    [catalogo, instalados],
  );

  const instalar = async (app: Aplicativo) => {
    if (!userId) return;
    if (app.preco_mensal != null && app.preco_mensal > 0) {
      t.info('App pago — fluxo PIX ainda não conectado nessa onda.');
      return;
    }
    if (instalandoId) return;
    setInstalandoId(app.id);
    setInstalandoPronto(false);

    // Roda o insert em paralelo com a animação. Anima por 1.2s mínimo
    // pra UX ficar consistente mesmo se o banco responder rápido.
    const inicio = Date.now();
    const promiseInsert = supabase
      .from('aplicativos_instalados')
      .insert({ user_id: userId, aplicativo_id: app.id, aplicativo_slug: app.slug })
      .select('id')
      .maybeSingle();

    const { error } = await promiseInsert;
    const decorridos = Date.now() - inicio;
    const restanteAnim = Math.max(0, 1200 - decorridos);

    if (error) {
      cancelTimers.current.push(
        setTimeout(() => {
          setInstalandoId(null);
          setInstalandoPronto(false);
          t.error('Falha ao instalar. Tente de novo.');
          console.error('[AbaAplicativos] instalar:', error);
        }, restanteAnim),
      );
      return;
    }

    cancelTimers.current.push(
      setTimeout(() => {
        setInstalandoPronto(true);
        // Atualiza estado local + dispara evento
        setInstalados((prev) => {
          const novo = new Set(prev);
          novo.add(app.slug);
          const W = (window as any).RAGENTIC_DATA || {};
          W.APLICATIVOS_INSTALADOS_SLUGS = Array.from(novo);
          (window as any).RAGENTIC_DATA = W;
          return novo;
        });
        try {
          window.dispatchEvent(new CustomEvent('ragentic-aplicativos-mudaram'));
        } catch {
          /* noop */
        }
      }, restanteAnim),
    );

    cancelTimers.current.push(
      setTimeout(() => {
        setInstalandoId(null);
        setInstalandoPronto(false);
        t.success(
          ehPacote(app)
            ? `${app.nome} instalado · ligue em Agente → Conhecimento → Pacotes extras`
            : `${app.nome} instalado · busque no Launchpad ou Spotlight`,
        );
      }, restanteAnim + 900),
    );
  };

  const desinstalar = async (app: Aplicativo) => {
    if (!userId) return;
    const aviso = ehPacote(app)
      ? `Desinstalar "${app.nome}"?\nO pacote sai de todos os agentes que estavam com ele ligado.`
      : `Desinstalar "${app.nome}"?\nO app some do Launchpad e do Spotlight.`;
    if (!window.confirm(aviso)) return;
    setDesinstalandoId(app.id);
    const { error } = await supabase
      .from('aplicativos_instalados')
      .delete()
      .eq('user_id', userId)
      .eq('aplicativo_id', app.id);
    setDesinstalandoId(null);
    if (error) {
      console.error('[AbaAplicativos] desinstalar:', error);
      t.error('Falha ao desinstalar.');
      return;
    }
    setInstalados((prev) => {
      const novo = new Set(prev);
      novo.delete(app.slug);
      const W = (window as any).RAGENTIC_DATA || {};
      W.APLICATIVOS_INSTALADOS_SLUGS = Array.from(novo);
      (window as any).RAGENTIC_DATA = W;
      return novo;
    });
    try {
      window.dispatchEvent(new CustomEvent('ragentic-aplicativos-mudaram'));
    } catch {
      /* noop */
    }
    t.success(`${app.nome} desinstalado`);
  };

  if (catalogo === null) {
    return (
      <div className="os-card center" style={{ padding: 60 }}>
        <div className="muted">Carregando aplicativos…</div>
      </div>
    );
  }

  return (
    <div className="col gap-3">
      <div className="row gap-2" style={{ marginBottom: 8 }}>
        <span
          className={`tab ${sub === 'disponiveis' ? 'tab-on' : ''}`}
          onClick={() => setSub('disponiveis')}
        >
          <Icon name="grid" size={12} /> Disponíveis ({disponiveis.length})
        </span>
        <span
          className={`tab ${sub === 'instalados' ? 'tab-on' : ''}`}
          onClick={() => setSub('instalados')}
        >
          <Icon name="check" size={12} /> Instalados ({listaInstalados.length})
        </span>
      </div>

      {sub === 'disponiveis' && (
        <>
          {disponiveis.length === 0 && (
            <div className="os-card center" style={{ padding: 60 }}>
              <Icon name="package" size={36} stroke="var(--txt-3)" />
              <div className="h3" style={{ marginTop: 12 }}>Nenhum app disponível</div>
              <div className="muted small" style={{ marginTop: 4 }}>
                {listaInstalados.length > 0 ? 'Você já instalou todos os apps do catálogo.' : 'O catálogo está vazio. Aguarde novidades.'}
              </div>
            </div>
          )}
          <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
            {disponiveis.map((app) => (
              <div
                key={app.id}
                className="os-card lift flex-1 app-card-aplicativo"
                style={{ padding: 20, minWidth: 260, maxWidth: 320 }}
              >
                <div className="row gap-3" style={{ alignItems: 'center' }}>
                  <div
                    className="center"
                    style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Icon name={app.icone || 'grid'} size={22} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="h3" style={{ fontSize: 15 }}>{app.nome}</div>
                    <div className="muted small" style={{ marginTop: 2 }}>{rotuloCategoria(app)}</div>
                  </div>
                </div>
                {app.descricao && (
                  <div className="muted small" style={{ marginTop: 4, lineHeight: 1.45 }}>
                    {app.descricao}
                  </div>
                )}
                <div className="row" style={{ marginTop: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => instalar(app)}
                    disabled={!!instalandoId}
                  >
                    <Icon name="download" size={12} /> Instalar
                  </button>
                </div>

                {instalandoId === app.id && (
                  <div className="instalando-overlay">
                    <div className="instalando-barra" />
                    <div className={`instalando-texto ${instalandoPronto ? 'pronto' : ''}`}>
                      {instalandoPronto
                        ? ehPacote(app)
                          ? `Pronto · ligue ${app.nome} no Hub de Conhecimento do agente`
                          : `Pronto · busque ${app.nome} no Launchpad ou Spotlight`
                        : `Instalando ${app.nome}…`}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {sub === 'instalados' && (
        <>
          {listaInstalados.length === 0 && (
            <div className="os-card center" style={{ padding: 60 }}>
              <Icon name="package" size={36} stroke="var(--txt-3)" />
              <div className="h3" style={{ marginTop: 12 }}>Nenhum app instalado ainda</div>
              <div className="muted small" style={{ marginTop: 4 }}>
                Vá em "Disponíveis" pra instalar o primeiro.
              </div>
            </div>
          )}
          <div className="col gap-2">
            {listaInstalados.map((app) => (
              <div key={app.id} className="os-card row gap-3" style={{ padding: 14, alignItems: 'center' }}>
                <div
                  className="center"
                  style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <Icon name={app.icone || 'grid'} size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="h3" style={{ fontSize: 14 }}>{app.nome}</div>
                  <div className="muted small" style={{ marginTop: 2 }}>{app.descricao || rotuloCategoria(app)}</div>
                </div>
                {ehPacote(app) && (
                  <button className="btn btn-primary btn-sm" onClick={abrirAgente}>
                    <Icon name="sparkles" size={12} /> Ligar no agente
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  onClick={() => desinstalar(app)}
                  disabled={desinstalandoId === app.id}
                >
                  <Icon name="x" size={12} /> {desinstalandoId === app.id ? 'Removendo…' : 'Desinstalar'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

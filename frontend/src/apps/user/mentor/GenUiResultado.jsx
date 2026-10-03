// @ts-nocheck
/* eslint-disable */
/**
 * GenUiResultado — F3.5 commandbar 2026-05-27.
 *
 * Renderiza os `dados.tipo` retornados pelas tools do canal interno (mentor)
 * dentro de uma bolha no commandbar. Sem dependência externa (zero libs de
 * chart) — SVG inline + grid de cards via CSS já existente.
 *
 * Tipos suportados (espelha `tools-mentor.ts` handlers):
 *   - lista_leads             → tabela compacta com chip de temperatura
 *                               (click no nome abre conversa isolada)
 *   - lista_conversas         → cartão por conversa (última mensagem + status)
 *                               com botão "Abrir conversa" (abre pelo id, direto)
 *   - grafico_kpi             → mini bar chart inline + valor grande
 *   - dashboard               → grid de N cards
 *   - link_contrato           → cartão com URL + botão copiar
 *   - confirmacao_placeholders → cartão de template novo + lista de campos
 *   - confirmacao             → bolha verde de check
 *   - acao_os                 → silencioso (já tratado em bundle.jsx via onAbrirApp)
 */
import { useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { urlPublica } from '@/lib/url-app';

// ── Helpers visuais ──────────────────────────────────────────────────────

const COR_TEMPERATURA = {
  quente: { bg: 'rgba(255,107,82,.16)', fg: '#ff8a6f', label: 'Quente' },
  morno:  { bg: 'rgba(255,184,77,.16)', fg: '#ffc678', label: 'Morno' },
  frio:   { bg: 'rgba(98,180,255,.16)', fg: '#7ebdff', label: 'Frio' },
};

function ChipTemperatura({ valor }) {
  if (!valor) return null;
  const c = COR_TEMPERATURA[valor] ?? { bg: 'rgba(255,255,255,.06)', fg: '#aaa', label: valor };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: 999, background: c.bg, color: c.fg,
      fontSize: 11, fontWeight: 600, lineHeight: 1.4,
    }}>{c.label}</span>
  );
}

function fmtData(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const hoje = new Date();
    const ms = hoje - d;
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const dias = Math.floor(h / 24);
    if (dias < 7) return `${dias}d`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch { return ''; }
}

// ── lista_leads ──────────────────────────────────────────────────────────

function GenLeads({ dados, onAbrirApp }) {
  const t = useToast();
  const leads = Array.isArray(dados?.leads) ? dados.leads : [];
  const [carregandoId, setCarregandoId] = useState(null);

  const abrirConversaDoLead = async (lead) => {
    if (carregandoId) return;
    setCarregandoId(lead.id);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data: u } = await sb.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error('Sem sessão');
      // Pega a conversa mais recente do lead (whatsapp por padrão)
      const { data: conv, error } = await sb.from('conversas')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('tenant_id', uid)
        .order('updated_at', { ascending: false })
        .limit(1).maybeSingle();
      if (error) throw error;
      if (!conv?.id) {
        t.info?.(`Nenhuma conversa pra "${lead.name}" ainda.`);
        return;
      }
      const slug = `conversa-isolada__${conv.id.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;
      const w = window;
      if (!w.__PAYLOADS_CONVERSAS) w.__PAYLOADS_CONVERSAS = {};
      // Payload parcial — ConversaIsolada hidrata pelo id via carregarConversaUnica.
      w.__PAYLOADS_CONVERSAS[slug] = { id: conv.id };
      if (typeof onAbrirApp === 'function') {
        onAbrirApp(slug);
        t.success(`Abrindo conversa de ${lead.name}`);
      } else {
        t.error('onAbrirApp não disponível no commandbar.');
      }
    } catch (e) {
      t.error('Falha ao abrir conversa: ' + (e?.message ?? e));
    } finally {
      setCarregandoId(null);
    }
  };

  if (leads.length === 0) {
    return (
      <div className="muted small" style={{ padding: '6px 0' }}>
        Nenhum lead encontrado{dados?.busca ? ` pra “${dados.busca}”` : ''}.
      </div>
    );
  }

  return (
    <div className="genleads-wrap">
      {leads.map((l) => {
        const carregando = carregandoId === l.id;
        const meta = [l.phone, l.fase_pipeline].filter(Boolean).join(' · ');
        return (
          <article key={l.id} className="genlead-card">
            <header className="genlead-head">
              <span className="genlead-nome" title={l.name || ''}>{l.name || '(sem nome)'}</span>
              <ChipTemperatura valor={l.temperatura_lead} />
            </header>
            <div className="genlead-meta muted tiny">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta || 'sem dados de contato'}
              </span>
              {l.updated_at ? <span className="genlead-tempo">{fmtData(l.updated_at)}</span> : null}
            </div>
            {l.fato_match ? (
              <p className="genlead-fato">
                {l.categoria ? (
                  <span className="genlead-fato-cat">{String(l.categoria).replace(/_/g, ' ')}</span>
                ) : null}
                “{l.fato_match}”
              </p>
            ) : null}
            {l.resumo_conversa ? (
              <p className="muted tiny" style={{ margin: '4px 0 0', lineHeight: 1.45 }}>
                {l.resumo_conversa}
              </p>
            ) : null}
            <button
              type="button"
              className="genlead-cta"
              onClick={() => abrirConversaDoLead(l)}
              disabled={carregando}
            >
              <Icon name="message" size={12} />
              {carregando ? 'Abrindo…' : 'Abrir conversa'}
            </button>
          </article>
        );
      })}
    </div>
  );
}


// ── lista_conversas ──────────────────────────────────────────────────────
// Pedido do Theus (2026-09-16): pedir "as conversas" tem que vir em cartão, com
// botão de abrir. O item já traz `conversa_id`, então abre na hora — sem a busca
// extra que a lista_leads precisa fazer (e que falha quando o lead não tem conversa).

const STATUS_CONVERSA = {
  humano:    { fg: '#ffc678', bg: 'rgba(255,184,77,.16)', label: 'Com você' },
  ativa:     { fg: '#7ee0a8', bg: 'rgba(90,220,150,.14)', label: 'Com o agente' },
  encerrada: { fg: '#9aa3ad', bg: 'rgba(255,255,255,.06)', label: 'Encerrada' },
};

function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '–';
  if (partes[0].toLowerCase() === 'contato') return '#';
  return partes.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function GenConversas({ dados, onAbrirApp }) {
  const t = useToast();
  const conversas = Array.isArray(dados?.conversas) ? dados.conversas : [];

  const abrir = (c) => {
    if (!c?.conversa_id) return;
    if (typeof onAbrirApp !== 'function') {
      t.error('Não consegui abrir a conversa daqui.');
      return;
    }
    const slug = `conversa-isolada__${c.conversa_id.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;
    try {
      if (!window.__PAYLOADS_CONVERSAS) window.__PAYLOADS_CONVERSAS = {};
      window.__PAYLOADS_CONVERSAS[slug] = { id: c.conversa_id };
    } catch { /* noop */ }
    onAbrirApp(slug);
    t.success(`Abrindo conversa de ${c.nome}`);
  };

  if (conversas.length === 0) {
    return (
      <div className="muted small" style={{ padding: '6px 0' }}>
        Nenhuma conversa {dados?.busca ? `pra “${dados.busca}”` : dados?.periodo || 'no período'}.
      </div>
    );
  }

  return (
    <div className="genconvs-wrap">
      <div className="genconvs-topo muted tiny">
        {conversas.length} {conversas.length === 1 ? 'conversa' : 'conversas'}
        {dados?.periodo ? ` · ${dados.periodo}` : ''}
        {dados?.busca ? ` · “${dados.busca}”` : ''}
      </div>
      {conversas.map((c) => {
        const st = STATUS_CONVERSA[c.status] ?? null;
        const ult = c.ultima_mensagem;
        const fim = String(c.telefone || '').replace(/\D/g, '').slice(-4);
        return (
          <article key={c.conversa_id} className="genconv-card">
            <div className="genconv-avatar" aria-hidden="true">{iniciais(c.nome)}</div>
            <div className="genconv-corpo">
              <header className="genconv-head">
                <span className="genconv-nome" title={c.nome}>{c.nome}</span>
                {st ? (
                  <span className="genconv-status" style={{ color: st.fg, background: st.bg }}>{st.label}</span>
                ) : null}
                <span className="genconv-tempo muted tiny">{fmtData(c.atualizado_em)}</span>
              </header>
              <div className="genconv-meta muted tiny">
                {[c.canal, fim ? `final ${fim}` : null].filter(Boolean).join(' · ') || 'sem canal'}
              </div>
              {ult ? (
                <p className="genconv-ultima">
                  <span className={`genconv-de genconv-de-${ult.de}`}>
                    {ult.de === 'lead' ? c.nome.split(' ')[0] : 'Agente'}:
                  </span>{' '}
                  {ult.texto}
                </p>
              ) : (
                <p className="genconv-ultima muted">Sem mensagens ainda.</p>
              )}
            </div>
            <button type="button" className="genconv-cta" onClick={() => abrir(c)}>
              <Icon name="message" size={13} />
              Abrir conversa
            </button>
          </article>
        );
      })}
    </div>
  );
}

// ── grafico_kpi ──────────────────────────────────────────────────────────

function GenKpi({ dados }) {
  const serie = Array.isArray(dados?.serie_temporal) ? dados.serie_temporal : [];
  const valor = dados?.valor ?? 0;
  const metrica = dados?.metrica ?? '';
  const periodo = dados?.periodo ?? '';
  const unidade = dados?.unidade ?? (metrica === 'taxa_conversao' ? 'percentual' : 'quantidade');
  const valorFormatado =
    unidade === 'reais'
      ? `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : unidade === 'percentual'
        ? `${valor}%`
        : valor;

  // SVG mini chart — sem libs
  const W = 280, H = 60, PAD = 4;
  const max = Math.max(...serie.map((p) => p.valor), 1);
  const stepX = serie.length > 1 ? (W - PAD * 2) / (serie.length - 1) : 0;
  const pts = serie.map((p, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - ((p.valor / max) * (H - PAD * 2)),
  }));
  const path = pts.length > 0
    ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    : '';

  return (
    <div style={{
      marginTop: 8, padding: '12px 14px',
      background: 'rgba(98,196,142,.06)', border: '1px solid rgba(98,196,142,.18)',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div className="muted tiny" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>{metrica.replace(/_/g, ' ')}</div>
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {valorFormatado}
          </div>
        </div>
        <div className="muted tiny">{periodo}</div>
      </div>
      {pts.length >= 2 && (
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="g-kpi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(98,196,142,.5)" />
              <stop offset="100%" stopColor="rgba(98,196,142,0)" />
            </linearGradient>
          </defs>
          <path d={`${path} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`} fill="url(#g-kpi)" />
          <path d={path} fill="none" stroke="rgba(98,196,142,.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2" fill="#62c48e" />
          ))}
        </svg>
      )}
    </div>
  );
}

// ── dashboard ────────────────────────────────────────────────────────────

function GenDashboard({ dados }) {
  const cards = Array.isArray(dados?.cards) ? dados.cards : [];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8,
      marginTop: 8,
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          padding: 12, background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.08)', borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Icon name={(c.icone || 'box').toLowerCase()} size={12} />
            <div className="muted tiny" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>{c.titulo}</div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{c.valor ?? 0}</div>
        </div>
      ))}
    </div>
  );
}

// ── documentos (contrato + PDF) ──────────────────────────────────────────

/**
 * Miniatura de documento em CSS puro: folha clara com dobra de canto e linhas
 * de texto simuladas. Padrão de mercado pra anexo em chat (nome + tipo +
 * thumbnail + ações) — nada de URL crua na tela.
 */
function FolhaDoc({ selo, corSelo = '#5b8def' }) {
  return (
    <div aria-hidden="true" style={{
      position: 'relative', width: 58, height: 74, flexShrink: 0, borderRadius: 6,
      background: 'linear-gradient(160deg, #fdfdfb 0%, #eef0ee 100%)',
      boxShadow: '0 6px 18px rgba(0,0,0,.35), inset 0 0 0 1px rgba(0,0,0,.06)',
      overflow: 'hidden',
    }}>
      {/* dobra de canto */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 16, height: 16,
        background: 'linear-gradient(225deg, rgba(0,0,0,.14) 50%, transparent 50%)',
      }} />
      {/* linhas de texto simuladas */}
      <div style={{ position: 'absolute', top: 14, left: 9, right: 12, display: 'grid', gap: 5 }}>
        <div style={{ height: 4, width: '55%', borderRadius: 2, background: 'rgba(20,24,32,.32)' }} />
        <div style={{ height: 3, width: '92%', borderRadius: 2, background: 'rgba(20,24,32,.13)' }} />
        <div style={{ height: 3, width: '86%', borderRadius: 2, background: 'rgba(20,24,32,.13)' }} />
        <div style={{ height: 3, width: '90%', borderRadius: 2, background: 'rgba(20,24,32,.13)' }} />
        <div style={{ height: 3, width: '58%', borderRadius: 2, background: 'rgba(20,24,32,.13)' }} />
      </div>
      {/* selo do tipo */}
      <span style={{
        position: 'absolute', left: 6, bottom: 6, padding: '2px 6px', borderRadius: 4,
        fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: '#fff', background: corSelo,
      }}>{selo}</span>
    </div>
  );
}

const estiloBotaoDoc = (primario, cor) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, textDecoration: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 650, lineHeight: 1, whiteSpace: 'nowrap',
  border: `1px solid ${primario ? cor.borda : 'rgba(255,255,255,.14)'}`,
  background: primario ? cor.fundo : 'rgba(255,255,255,.05)',
  color: primario ? cor.texto : '#e6e8ec',
});

/** Contrato gerado — o elemento é o documento, não o link. */
function GenLinkContrato({ dados }) {
  const t = useToast();
  const url = dados?.url_publica ? urlPublica(dados.url_publica) : null;
  const titulo = dados?.titulo || 'Contrato';
  if (!url) return null;
  const cor = { borda: 'rgba(126,189,255,.45)', fundo: 'rgba(126,189,255,.16)', texto: '#cfe4ff' };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); t.success('Link do contrato copiado'); }
    catch { t.error('Falha ao copiar'); }
  };
  return (
    <div style={{
      marginTop: 8, padding: 14, borderRadius: 12, maxWidth: 420,
      background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.09)',
      display: 'flex', gap: 14, alignItems: 'stretch',
    }}>
      <FolhaDoc selo="DOC" corSelo="#5b8def" />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {titulo}
        </div>
        <div className="muted tiny" style={{ marginTop: 3 }}>
          Contrato pronto pra assinatura
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 10 }}>
          <a href={url} target="_blank" rel="noreferrer" style={estiloBotaoDoc(true, cor)}>
            <Icon name="fileSignature" size={12} /> Abrir contrato
          </a>
          <button type="button" onClick={copiar} style={estiloBotaoDoc(false, cor)}>
            <Icon name="copy" size={12} /> Copiar link
          </button>
        </div>
      </div>
    </div>
  );
}

/** Documento PDF gerado pelo Mentor (tool `gerar_documento_pdf`). */
function GenDocumentoPdf({ dados }) {
  const url = dados?.url;
  if (!url) return null;
  const cor = { borda: 'rgba(255,118,96,.45)', fundo: 'rgba(255,118,96,.16)', texto: '#ffcfc4' };
  const nome = dados.nome ?? 'documento.pdf';
  return (
    <div style={{
      marginTop: 8, padding: 14, borderRadius: 12, maxWidth: 420,
      background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.09)',
      display: 'flex', gap: 14, alignItems: 'stretch',
    }}>
      <FolhaDoc selo="PDF" corSelo="#e0533d" />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {nome}
        </div>
        <div className="muted tiny" style={{ marginTop: 3 }}>
          {dados.tamanho_kb ? `${dados.tamanho_kb} KB · ` : ''}link válido por 7 dias
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 10 }}>
          <a href={url} target="_blank" rel="noreferrer" download={nome} style={estiloBotaoDoc(true, cor)}>
            <Icon name="download" size={12} /> Baixar
          </a>
          <a href={url} target="_blank" rel="noreferrer" style={estiloBotaoDoc(false, cor)}>
            <Icon name="eye" size={12} /> Ver
          </a>
        </div>
      </div>
    </div>
  );
}

// ── confirmacao_placeholders ──────────────────────────────────────────────

function GenPlaceholders({ dados }) {
  const phs = Array.isArray(dados?.placeholders) ? dados.placeholders : [];
  const nome = dados?.nome || 'Template';
  const ativo = !!dados?.ativo;
  return (
    <div style={{
      marginTop: 8, padding: 12,
      background: 'rgba(255,184,77,.06)', border: '1px solid rgba(255,184,77,.2)',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon name="fileText" size={14} />
        <div style={{ fontWeight: 600 }}>{nome}</div>
        <span className="muted tiny" style={{ marginLeft: 'auto' }}>{ativo ? 'ativo' : 'rascunho'}</span>
      </div>
      {phs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {phs.map((p, i) => (
            <span key={i} title={p.descricao} style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 11,
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)',
            }}>{p.nome}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── confirmacao (anotação salva, etc) ─────────────────────────────────────

function GenConfirmacao({ mensagem }) {
  return (
    <div style={{
      marginTop: 6, padding: '8px 12px',
      background: 'rgba(98,196,142,.08)', border: '1px solid rgba(98,196,142,.22)',
      borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
    }}>
      <Icon name="check" size={12} />
      <span>{mensagem || 'Pronto'}</span>
    </div>
  );
}

/**
 * Card de exclusão real (tool `excluir_dados`, etapa preparar).
 * Os botões não executam nada sozinhos: mandam a fala de confirmação/cancelamento
 * pro Mentor. É essa fala que destrava o gate de 2 turnos cobrado no banco —
 * o front nunca ganha poder de apagar direto.
 */
function GenConfirmarExclusao({ dados, onResponder }) {
  const [enviado, setEnviado] = useState(null); // 'confirmado' | 'cancelado'
  const linhas = Number(dados?.linhas_previstas ?? 0);
  const amostra = Array.isArray(dados?.amostra) ? dados.amostra : [];

  const responder = (acao) => {
    if (enviado || typeof onResponder !== 'function') return;
    setEnviado(acao === 'confirmar' ? 'confirmado' : 'cancelado');
    onResponder(
      acao === 'confirmar'
        ? `Confirmo a exclusão. Pode executar agora (bilhete ${dados.bilhete}).`
        : `Cancela a exclusão do bilhete ${dados.bilhete} — não apague nada.`,
    );
  };

  const rotulo = (linha) =>
    linha?.titulo ?? linha?.nome ?? linha?.name ?? linha?.descricao_curta ?? linha?.id ?? '(registro)';

  return (
    <div style={{
      marginTop: 6, padding: '12px 14px', borderRadius: 10,
      background: 'rgba(255,107,82,.07)', border: '1px solid rgba(255,107,82,.28)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon name="triangle" size={13} />
        <strong style={{ fontSize: 13 }}>
          Excluir {linhas} registro{linhas > 1 ? 's' : ''} de {dados?.tabela}
        </strong>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: amostra.length ? 8 : 10 }}>
        Some do sistema e do conhecimento do agente. Fica 30 dias resgatável.
      </div>
      {amostra.length > 0 && (
        <ul style={{ margin: '0 0 10px', padding: '0 0 0 16px', fontSize: 12, lineHeight: 1.6 }}>
          {amostra.slice(0, 5).map((l, i) => <li key={i}>{String(rotulo(l))}</li>)}
          {linhas > amostra.length && (
            <li className="muted">e mais {linhas - amostra.length}…</li>
          )}
        </ul>
      )}
      {enviado ? (
        <div className="muted" style={{ fontSize: 12 }}>
          <Icon name={enviado === 'confirmado' ? 'check' : 'x'} size={11} />{' '}
          {enviado === 'confirmado' ? 'Confirmado — executando…' : 'Cancelado.'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => responder('confirmar')}
            style={{
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              border: '1px solid rgba(255,107,82,.45)', background: 'rgba(255,107,82,.18)', color: '#ffb9a6',
            }}
          >
            Confirmar exclusão
          </button>
          <button
            type="button"
            onClick={() => responder('cancelar')}
            style={{
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)', color: '#eaeaea',
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────

// ── imagem_post (app Marketing / tool gerar_imagem_post) ──────────────────

const ROTULO_FORMATO_POST = {
  feed_quadrado: 'Feed 1:1',
  retrato: 'Retrato 4:5',
  story: 'Story 9:16',
  paisagem: 'Paisagem 16:9',
};

function GenImagemPost({ dados }) {
  const url = dados?.url;
  const formato = dados?.formato;
  const aspect = String(dados?.aspect_ratio || '1:1').replace(':', ' / ');
  if (!url) return null;

  async function baixar() {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `post-${formato || 'imagem'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      window.open(url, '_blank');
    }
  }

  return (
    <div style={{ marginTop: 6, maxWidth: 360 }}>
      <div style={{
        position: 'relative', borderRadius: 12, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.03)',
        aspectRatio: aspect,
      }}>
        <img
          src={url}
          alt="Imagem de post gerada"
          loading="lazy"
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8,
      }}>
        <span style={{ fontSize: 11, color: '#9aa0aa', fontWeight: 600 }}>
          {ROTULO_FORMATO_POST[formato] || 'Post'}
        </span>
        <button
          type="button"
          onClick={baixar}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 8, border: '1px solid rgba(255,255,255,.14)',
            background: 'rgba(255,255,255,.06)', color: '#eaeaea', fontSize: 12,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Icon name="download" size={12} /> Baixar
        </button>
      </div>
    </div>
  );
}

export function GenUiResultado({ tipo, dados, mensagem, onAbrirApp, onResponder }) {
  switch (tipo) {
    case 'confirmar_exclusao':       return <GenConfirmarExclusao dados={dados} onResponder={onResponder} />;
    case 'documento_pdf':            return <GenDocumentoPdf dados={dados} />;
    case 'lista_leads':              return <GenLeads dados={dados} onAbrirApp={onAbrirApp} />;
    case 'lista_conversas':          return <GenConversas dados={dados} onAbrirApp={onAbrirApp} />;
    case 'grafico_kpi':              return <GenKpi dados={dados} />;
    case 'dashboard':                return <GenDashboard dados={dados} />;
    case 'link_contrato':            return <GenLinkContrato dados={dados} mensagem={mensagem} />;
    case 'confirmacao_placeholders': return <GenPlaceholders dados={dados} />;
    case 'confirmacao':              return <GenConfirmacao mensagem={mensagem} />;
    case 'imagem_post':              return <GenImagemPost dados={dados} />;
    case 'acao_os':                  return null; // silencioso — bundle.jsx já abre o app
    default:                         return null;
  }
}

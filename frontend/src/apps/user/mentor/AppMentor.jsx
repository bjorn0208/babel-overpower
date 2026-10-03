// @ts-nocheck
/* eslint-disable */
/**
 * App Mentor — F3 commandbar 2026-05-27.
 *
 * Tenant marca/desmarca as tools que o cargo Mentor dele pode usar no commandbar.
 * Grava em cargo_ferramentas do cargo Mentor escopo='tenant' do usuário logado.
 * Cria o cargo Mentor próprio on-the-fly clonando o global (substitui_global_id)
 * se ainda não existir — evita escrever no cargo global e quebrar outros tenants.
 *
 * Whitelist WHITELIST_TOOLS_MENTOR espelha o array TOOLS_MENTOR de
 * supabase/functions/_shared/tools-mentor.ts — mudança lá precisa refletir aqui
 * (e vice-versa). O canal-interno do motor (v81) também faz whitelist por essa
 * lista, então tool fora dela é ignorada mesmo se marcada.
 *
 * Default (cargo sem nenhuma marcação): canal-interno cai no fallback array fixo
 * — Mentor usa TODAS as 14 tools. A UI mostra esse default no rodapé.
 */
import { useState, useEffect, useCallback } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { AbaHistoricoMentor } from './aba-historico';
import { AbaMemoriaMentor } from './aba-memoria';

// Whitelist espelhada do canal-interno.ts/tools-mentor.ts (14 tools).
// recall_entidade é tool especial do canal interno (não entra em cargo_ferramentas).
const WHITELIST_TOOLS_MENTOR = [
  'abrir_app', 'abrir_app_os', 'mostrar_desktop',
  'cadastrar_produto', 'criar_cliente', 'atualizar_empresa', 'criar_categoria',
  'cadastrar_bloco_conhecimento',
  'mostrar_kpi', 'listar_leads_recentes', 'listar_leads_por_dia', 'dashboard_resumo',
  'criar_anotacao_mentor',
  'gerar_link_contrato_livre', 'criar_template_contrato',
  // Tijolos CommandBar 2026-08-01: leitura universal + olhos externos.
  'consultar_dados', 'pesquisar_google', 'consultar_instagram',
];

export function AppMentor() {
  const [aba, setAba] = useState('historico');        // historico | memoria | ferramentas
  const [tools, setTools] = useState([]);             // ferramentas_dinamicas
  const [marcadas, setMarcadas] = useState(new Set()); // ferramenta_id
  const [cargoId, setCargoId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const t = useToast();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data: u } = await sb.auth.getUser();
      const uid = u?.user?.id ?? null;
      if (!uid) throw new Error('Sem sessão');

      // 1. Garante cargo Mentor próprio do tenant (clona do global se não houver).
      //    Evita o app sobrescrever cargo global e quebrar outros tenants.
      let cargo = null;
      const r1 = await sb.from('cargos').select('id')
        .eq('tipologia', 'mentor').eq('escopo', 'tenant').eq('tenant_id', uid).eq('ativo', true)
        .limit(1).maybeSingle();
      if (r1.data?.id) {
        cargo = r1.data;
      } else {
        const g = await sb.from('cargos')
          .select('id, nome, objetivo_principal, regras_livres, campos_rastreio, modelo_llm_padrao, canal_atuacao, ordem')
          .eq('tipologia', 'mentor').eq('escopo', 'global').eq('ativo', true)
          .limit(1).maybeSingle();
        if (!g.data?.id) throw new Error('Cargo Mentor global não encontrado');
        const ins = await sb.from('cargos').insert({
          escopo: 'tenant', tenant_id: uid, tipologia: 'mentor',
          nome: g.data.nome, objetivo_principal: g.data.objetivo_principal,
          regras_livres: g.data.regras_livres, campos_rastreio: g.data.campos_rastreio,
          modelo_llm_padrao: g.data.modelo_llm_padrao, canal_atuacao: g.data.canal_atuacao,
          substitui_global_id: g.data.id, ordem: g.data.ordem ?? 0, ativo: true,
        }).select('id').single();
        if (ins.error) throw ins.error;
        cargo = ins.data;
      }
      setCargoId(cargo.id);

      // 2. Lista as 14 tools whitelisted (ferramentas_dinamicas globais).
      const { data: lista, error: errLista } = await sb.from('ferramentas_dinamicas')
        .select('id, nome_tool, descricao')
        .in('nome_tool', WHITELIST_TOOLS_MENTOR)
        .eq('escopo', 'global')
        .eq('ativo', true);
      if (errLista) throw errLista;
      const ordenado = (lista ?? []).slice().sort((a, b) => a.nome_tool.localeCompare(b.nome_tool));
      setTools(ordenado);

      // 3. cargo_ferramentas atuais do cargo Mentor do tenant.
      const { data: vinc, error: errVinc } = await sb.from('cargo_ferramentas')
        .select('ferramenta_id').eq('cargo_id', cargo.id);
      if (errVinc) throw errVinc;
      setMarcadas(new Set((vinc ?? []).map((v) => v.ferramenta_id)));
    } catch (e) {
      t.error('Falha ao carregar Mentor: ' + (e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const toggle = async (ferramenta_id) => {
    if (!cargoId) return;
    const ativando = !marcadas.has(ferramenta_id);
    // optimistic UI
    setMarcadas((m) => {
      const n = new Set(m);
      if (ativando) n.add(ferramenta_id); else n.delete(ferramenta_id);
      return n;
    });
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      if (ativando) {
        const { error } = await sb.from('cargo_ferramentas').insert({
          cargo_id: cargoId, ferramenta_id, obrigatoria: false, ordem: 0,
        });
        if (error) throw error;
      } else {
        const { error } = await sb.from('cargo_ferramentas')
          .delete().eq('cargo_id', cargoId).eq('ferramenta_id', ferramenta_id);
        if (error) throw error;
      }
    } catch (e) {
      // rollback
      setMarcadas((m) => {
        const n = new Set(m);
        if (ativando) n.delete(ferramenta_id); else n.add(ferramenta_id);
        return n;
      });
      t.error('Falha: ' + (e?.message ?? e));
    }
  };

  const ABAS = [
    { id: 'historico', rotulo: 'Histórico', icone: 'calendar' },
    { id: 'memoria', rotulo: 'Memória', icone: 'brain' },
    { id: 'ferramentas', rotulo: 'Ferramentas', icone: 'wrench' },
  ];

  return (
    <div style={{ padding: 22 }}>
      <div style={{ marginBottom: 14 }}>
        <div className="h2">Mentor</div>
        <div className="muted small">
          Tudo que foi conversado, o que ele aprendeu sobre você e o que ele pode fazer.
        </div>
      </div>

      <div className="row gap-2" style={{ marginBottom: 16 }}>
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`btn ${aba === a.id ? '' : 'btn-ghost'}`}
            onClick={() => setAba(a.id)}
          >
            <Icon name={a.icone} size={13} /> {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'historico' && <AbaHistoricoMentor />}
      {aba === 'memoria' && <AbaMemoriaMentor />}

      {aba === 'ferramentas' && carregando && (
        <div className="muted" style={{ padding: 22 }}>Carregando ferramentas…</div>
      )}
      {aba === 'ferramentas' && !carregando && (<>
      <div className="muted small" style={{ marginBottom: 12 }}>
        Marque as tools que o Mentor pode usar no commandbar. Mudança vale na próxima mensagem.
        {marcadas.size === 0 && (
          <span style={{ marginLeft: 6, opacity: 0.85 }}>
            · Nenhuma marcada = usa todas (default).
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {tools.map((tool) => {
          const on = marcadas.has(tool.id);
          return (
            <label
              key={tool.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                background: on ? 'rgba(98,196,142,.08)' : 'rgba(255,255,255,.02)',
                border: '1px solid ' + (on ? 'rgba(98,196,142,.35)' : 'rgba(255,255,255,.06)'),
                borderRadius: 10, cursor: 'pointer',
              }}
            >
              <input
                type="checkbox" checked={on}
                onChange={() => toggle(tool.id)}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  <Icon name="wrench" size={12} /> {tool.nome_tool}
                </div>
                {tool.descricao && (
                  <div className="muted small" style={{ marginTop: 4, lineHeight: 1.4 }}>
                    {tool.descricao}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {tools.length === 0 && (
        <div className="muted" style={{ padding: 22 }}>
          Nenhuma ferramenta cadastrada pro Mentor. Avise o admin.
        </div>
      )}
      </>)}
    </div>
  );
}

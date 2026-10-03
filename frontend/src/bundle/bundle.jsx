// @ts-nocheck
/* eslint-disable */
/**
 * Bundle Claude Design — Plataforma Limpa LLM-OS
 * -----------------------------------------------
 * Concatenação dos 11 arquivos .jsx originais (icons, data, shell, genui,
 * widgets, tweaks-panel, apps-admin, apps-user, apps-extras, auth, app).
 * Mantido em um único módulo ESM para preservar o escopo compartilhado
 * que existia no original (carregado via <script> no HTML demo).
 *
 * Não editar este arquivo manualmente — ao plugar Supabase, extraia o app
 * em questão para src/apps/<nome>/ como módulo próprio (PR-02 em diante).
 */
import * as ReactNS from "react";
import * as ReactDOMNS from "react-dom";
import * as ReactDOMClient from "react-dom/client";

const React = ReactNS;
const ReactDOM = { ...ReactDOMNS, ...ReactDOMClient };
const { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext, Fragment } = React;

// Exposição opcional em window para debug (não usado pelo código do bundle).
if (typeof window !== "undefined") {
  window.React = React;
  window.ReactDOM = ReactDOM;
}

/* ============================================================
   Módulos OS extraídos (Fase 1B refatoração 2026-05-13).
   Importados aqui e usados nas redefinições abaixo pra preservar
   o resto do bundle funcionando enquanto a refatoração avança.
   ============================================================ */
import { Wallpaper as WallpaperModular } from "@/os/wallpaper";
import { Topo as TopoModular } from "@/os/topo";
import { Dock as DockModular } from "@/os/dock";
import { Spotlight as SpotlightModular } from "@/os/spotlight";
import { NotificationCenter as NotificationCenterModular } from "@/os/notificacoes";
import { Janela as JanelaModular } from "@/os/janela";
import {
  detectarBordaJanela,
  CURSORES_RESIZE,
  MIN_JANELA_W,
  MIN_JANELA_H,
  MARGEM_RESIZE,
  ehCanto,
  calcularResizeCanto,
  calcularTamanhoInicial,
  MARGEM_TOPO_JANELA,
  MARGEM_BORDA_JANELA,
} from "@/os/janela";
import { normalizarTexto } from "@/os/mentor-antecipacao/normalizar.js";
import { Aparencia as AparenciaModular } from "@/apps/admin/aparencia";
import { Conversas as ConversasModular } from "@/apps/user/conversas/Conversas";
import { ConversaIsolada as ConversaIsoladaModular } from "@/apps/user/conversas/ConversaIsolada";
import { ChatTeste as ChatTesteModular } from "@/apps/user/chat-teste/ChatTeste";
import { Empresa as EmpresaModular } from "@/apps/user/empresa/Empresa";
import { Produtos as ProdutosModular } from "@/apps/user/produtos/Produtos";
import { AgenteApp as AgenteAppModular } from "@/apps/user/agente/AgenteApp";
import { Contratos as ContratosModular } from "@/apps/user/contratos/Contratos";
import { Campanha as CampanhaModular } from "@/apps/user/campanha/Campanha";
import { Base as BaseModular } from "@/apps/user/base/Base";
import { Calculadora as CalculadoraModular } from "@/apps/user/calculadora/Calculadora";
import { Agenda as AgendaModular } from "@/apps/user/agenda/Agenda";
import { WidgetKpisReal, WidgetAgendaReal, WidgetFinancas, WidgetMaquete, PreviewFinancas, PreviewMaquete } from "@/os/widgets/WidgetsVivos";
import { Financeiro as FinanceiroModular } from "@/apps/admin/financeiro/Financeiro";
import { AppGestao } from "@/apps/admin/gestao/Gestao";
import { SocioComercial as SocioComercialModular } from "@/apps/admin/socio-comercial/SocioComercial";
import { SocioComercial as SocioComercialUserModular } from "@/apps/user/socio-comercial/SocioComercial";
import { Equipe as EquipeModular } from "@/apps/user/equipe/Equipe";
import { Clientes as ClientesModular } from "@/apps/user/clientes/Clientes";
import { Onboarding as OnboardingModular } from "@/apps/user/onboarding/Onboarding";
import { Dashboard as DashboardModular } from "@/apps/admin/dashboard/Dashboard";
import { Controle as ControleModular } from "@/apps/admin/controle/Controle";
import { LojaAdmin as LojaAdminModular } from "@/apps/admin/loja/LojaAdmin";
import { AppAplicativosAdmin as AplicativosAdminModular } from "@/apps/admin/aplicativos/Aplicativos";
import { Consulta as ConsultaModular } from "@/apps/user/consulta/Consulta";
import { Juridico as JuridicoModular } from "@/apps/user/juridico/Juridico";
import { JuridicoAdmin as JuridicoAdminModular } from "@/apps/admin/juridico/JuridicoAdmin";
import { ConsultaAdmin as ConsultaAdminModular } from "@/apps/admin/consulta/ConsultaAdmin";
import { Tenants as TenantsModular } from "@/apps/admin/tenants/Tenants";
import { AppCuradoria as CuradoriaModular } from "@/apps/admin/curadoria/Curadoria";
import { AppLoja as LojaModular } from "@/apps/user/loja/Loja";
import { AppEstoque as EstoqueModular } from "@/apps/user/estoque/Estoque";
import { UserCargos as UserCargosModular } from "@/apps/user/cargos/UserCargos";
import { AppMentor as AppMentorModular } from "@/apps/user/mentor/AppMentor";
import { PerguntasMentorBell as PerguntasMentorBellModular } from "@/apps/user/componentes/PerguntasMentorBell";
import { GenUiResultado as GenUiResultadoModular } from "@/apps/user/mentor/GenUiResultado";
import { AppCargosAdmin as AppCargosAdminModular } from "@/apps/admin/cargos/AppCargosAdmin";
import { AppNichos } from "@/apps/admin/nichos/Nichos";
import { AppReunioes } from "@/apps/admin/reunioes/Reunioes";
import { AppConfiguracoes as ConfiguracoesModular } from "@/apps/user/configuracoes/Configuracoes";
import { AppTextos as TextosModular } from "@/apps/user/textos/Textos";
import { AppNotas as NotasModular } from "@/apps/user/notas/Notas";
import { AppFinanceiro as CaixaFinanceiroModular } from "@/apps/user/financeiro/Financeiro";
import ReuniaoModular from "@/apps/user/reuniao/Reuniao";
import { AppMarketing as AppMarketingModular } from "@/apps/user/marketing/AppMarketing";
import { AppContabilidade as ContabilidadeModular } from "@/apps/user/contabilidade/Contabilidade";
import { AppRh as RhModular } from "@/apps/user/rh/Rh";
import { AppEmail as EmailModular } from "@/apps/user/email/Email";
import { AppCredito as CreditoModular } from "@/apps/user/credito/Credito";
import { AppRifas as RifasModular } from "@/apps/user/rifas/Rifas";
import ReinoFantasmaModular from "@/apps/user/reino/ReinoFantasma";
import { PostitsFlutuantes } from "@/os/postits/PostitsFlutuantes";
import { Icon } from "@/bundle/bundle-shared";


/* ==================================================================== */
/* === icons.jsx === */
/* ==================================================================== */
// Ícones unificados: fonte única em bundle-shared.jsx (importado no topo).
// Dock/Spotlight do OS leem via window.Icon; apps importam Icon direto.
window.Icon = Icon;

/* ==================================================================== */
/* === data.jsx === */
/* ==================================================================== */
// Mock data for the Ragentic OS demo

const TENANTS = [
  { id:'t1', avatar:'JS', nome:'João Silva', email:'joao@matrix.com.br', phone:'+55 11 98765-4321', status:'ativo',    plano:'Pro',       created:'2026-03-12', tokens: 18420, conversas: 234 },
  { id:'t2', avatar:'MA', nome:'Maria Andrade', email:'maria@vendamais.co', phone:'+55 21 99887-1234', status:'pendente', plano:'Starter',   created:'2026-05-09', tokens: 1240, conversas: 42 },
  { id:'t3', avatar:'CL', nome:'Carla Lima', email:'carla@clinicasoma.com', phone:'+55 31 98123-4456', status:'ativo',    plano:'Pro',       created:'2026-02-04', tokens: 28710, conversas: 612 },
  { id:'t4', avatar:'RF', nome:'Rafael Freitas', email:'rafa@bullfocus.com', phone:'+55 51 98444-2211', status:'ativo',    plano:'Plus',      created:'2026-01-28', tokens: 45230, conversas: 1042 },
  { id:'t5', avatar:'BS', nome:'Bruna Souza', email:'bruna@odontolux.com', phone:'+55 11 97777-1100', status:'inativo',   plano:'Starter',   created:'2025-12-19', tokens: 320,   conversas: 8 },
  { id:'t6', avatar:'PM', nome:'Pedro Marques', email:'pedro@logafast.com', phone:'+55 11 98888-9090', status:'ativo',    plano:'Pro',       created:'2026-04-22', tokens: 12380, conversas: 198 },
  { id:'t7', avatar:'VR', nome:'Vitória Rocha', email:'vit@tecconsulto.com', phone:'+55 41 99211-3322', status:'pendente', plano:'Pro',       created:'2026-05-11', tokens: 380,  conversas: 11 },
];

const CARGOS = [
  { id:'c1', nome:'Atendimento', tipologia:'atendimento', ordem:1, bussola: 'Acolher quem chega, entender o motivo do contato e direcionar pro cargo certo.', vira_coluna_kanban: true, rotulo_coluna: 'Atendendo', campos_rastreio: [
    {nome:'nome', descricao:'Como o lead se chama', obrigatorio:true},
    {nome:'motivo_contato', descricao:'O que trouxe o lead', obrigatorio:true},
    {nome:'canal_preferido', descricao:'Como prefere ser contatado', obrigatorio:false},
  ]},
  { id:'c2', nome:'Vendedor', tipologia:'face_cliente', ordem:2, bussola:'Qualificar interesse, apresentar valor da solução e levar o lead até proposta.', vira_coluna_kanban: true, rotulo_coluna:'Qualificação', campos_rastreio:[
    {nome:'orcamento', descricao:'Faixa de investimento', obrigatorio:true},
    {nome:'urgencia', descricao:'Quando precisa', obrigatorio:true},
    {nome:'objecoes', descricao:'O que está travando', obrigatorio:false},
  ]},
  { id:'c3', nome:'Negociação', tipologia:'face_cliente', ordem:3, bussola:'Fechar a venda com condições aceitáveis para ambos os lados.', vira_coluna_kanban: true, rotulo_coluna:'Negociação', campos_rastreio:[
    {nome:'valor_proposto', descricao:'Quanto foi proposto', obrigatorio:true},
    {nome:'forma_pagamento', descricao:'Como vai pagar', obrigatorio:true},
  ]},
  { id:'c4', nome:'Financeiro', tipologia:'face_cliente', ordem:4, bussola:'Resolver cobrança, ajustar pagamento e manter cliente em dia.', vira_coluna_kanban: true, rotulo_coluna:'Fechamento', campos_rastreio:[
    {nome:'metodo_pagamento', descricao:'PIX, boleto ou cartão', obrigatorio:true},
    {nome:'data_pagamento', descricao:'Quando vai pagar', obrigatorio:false},
  ]},
  { id:'c5', nome:'Suporte', tipologia:'atendimento', ordem:5, bussola:'Solucionar problemas técnicos e dúvidas do cliente já ativo.', vira_coluna_kanban:false, rotulo_coluna:'', campos_rastreio: [
    {nome:'tipo_problema', descricao:'Categoria da dúvida', obrigatorio:true},
  ]},
];

const LEADS = [
  { id:'l1', nome:'Maria Santos',    phone:'+55 11 98711-2233', avatar:'MS', cor:'#7c5ce0', cargo:'c1', preview:'oi, tô vendo o serviço de vocês', delta:'2 min', score: 72, hot:true,  tags:['novo'], dados:{motivo:'orçamento',canal:'whatsapp'} },
  { id:'l2', nome:'Pedro Almeida',   phone:'+55 11 98622-7711', avatar:'PA', cor:'#3aa6c9', cargo:'c1', preview:'qual o valor da consulta?', delta:'5 min', score: 58, hot:false, tags:[], dados:{motivo:'consulta'} },
  { id:'l3', nome:'João Reis',       phone:'+55 21 99332-1100', avatar:'JR', cor:'#c97a3a', cargo:'c2', preview:'topa fechar por R$ 2.400?', delta:'12 min', score: 84, hot:true, tags:['vip'], dados:{orcamento:'2400',urgencia:'esta_semana'} },
  { id:'l4', nome:'Ana Beatriz',     phone:'+55 31 98888-3344', avatar:'AB', cor:'#3ac9a0', cargo:'c3', preview:'pode mandar o PIX', delta:'1 min', score: 91, hot:true, tags:['urgente'], dados:{valor_proposto:'2400',forma_pagamento:'pix'} },
  { id:'l5', nome:'Renato Costa',    phone:'+55 11 98555-9988', avatar:'RC', cor:'#c93a8a', cargo:'c4', preview:'assinou ontem ✓', delta:'1d', score: 95, hot:false, tags:['cliente'], dados:{metodo_pagamento:'pix',data_pagamento:'2026-05-12'} },
  { id:'l6', nome:'Tatiana Vieira',  phone:'+55 21 99011-2244', avatar:'TV', cor:'#5b8bea', cargo:'c2', preview:'quanto sai um pacote anual?', delta:'18 min', score: 65, hot:false, tags:[], dados:{} },
  { id:'l7', nome:'Felipe Castro',   phone:'+55 31 97744-5566', avatar:'FC', cor:'#e0a23a', cargo:'c1', preview:'bom dia, quero saber mais', delta:'25 min', score: 40, hot:false, tags:['novo'], dados:{} },
  { id:'l8', nome:'Camila Borges',   phone:'+55 11 96788-1010', avatar:'CB', cor:'#a96adb', cargo:'c3', preview:'fechado, vou enviar comprovante', delta:'42 min', score: 88, hot:true, tags:['vip'], dados:{} },
];

const TRACES = [
  { id:'tr1', tipo:'porteiro', cargo:'Atendimento', t:'agora', decisao:{ intencao:'cobranca', cargo_alvo:'financeiro', urgencia:'alta', confianca: 0.91 }, latencia: 280 },
  { id:'tr2', tipo:'sintese', cargo:'Financeiro', t:'2s', decisao:{ cargo:'financeiro', ferramenta:'enviar_link_pix', blocos: 3, bolhas: 2, resposta_preview:'Vou te enviar o link de pagamento agora mesmo.' }, latencia: 1140 },
  { id:'tr3', tipo:'ferramenta', cargo:'Financeiro', t:'4s', decisao:{ ferramenta:'enviar_link_pix', args:{valor:'2400.00'}, resultado:'ok' }, latencia: 320 },
  { id:'tr4', tipo:'porteiro', cargo:'Atendimento', t:'18s', decisao:{ intencao:'duvida_produto', cargo_alvo:'vendedor', urgencia:'media', confianca: 0.83 }, latencia: 240 },
  { id:'tr5', tipo:'sintese', cargo:'Vendedor', t:'20s', decisao:{ cargo:'vendedor', ferramenta:null, blocos: 2, bolhas: 3, resposta_preview:'O plano Pro inclui até 500 conversas por mês.' }, latencia: 980 },
  { id:'tr6', tipo:'porteiro', cargo:'Atendimento', t:'1m', decisao:{ intencao:'objecao_preco', cargo_alvo:'negociacao', urgencia:'media', confianca: 0.76 }, latencia: 310 },
];

const BLOCOS = [
  { id:'b1', title:'Política de cancelamento', category:'institucional', ativo:true, tags:['rescisão','reembolso'], excerpt:'O cancelamento pode ser solicitado até 7 dias úteis antes da renovação...' },
  { id:'b2', title:'Tabela de preços 2026', category:'comercial', ativo:true, tags:['planos','valores'], excerpt:'Plano Starter: R$ 197/mês. Plano Pro: R$ 397/mês. Plano Plus: R$ 697/mês...' },
  { id:'b3', title:'Como funciona a integração WhatsApp', category:'suporte', ativo:true, tags:['onboarding','zapi'], excerpt:'A conexão é feita via Z-API. Em até 24h após a aprovação, o número está pronto...' },
  { id:'b4', title:'Garantia de 7 dias', category:'institucional', ativo:false, tags:['garantia'], excerpt:'Caso o cliente não fique satisfeito nos primeiros 7 dias, o valor é devolvido integralmente.' },
  { id:'b5', title:'Argumentação para objeção de preço', category:'vendas', ativo:true, tags:['objeção','script'], excerpt:'Quando o lead diz "está caro", reposicione o valor em relação ao retorno mensal médio...' },
];

const PEDIDOS = [
  { id:'p1', tenant:'João Silva',    avatar:'JS', cor:'#7c5ce0', tipo:'plano',         item:'Pro mensal',           valor: 397, status:'aguardando', criado:'2026-05-12 14:22' },
  { id:'p2', tenant:'Carla Lima',    avatar:'CL', cor:'#3ac9a0', tipo:'pacote_extra',  item:'500 conversas extras', valor: 197, status:'aguardando', criado:'2026-05-12 13:08' },
  { id:'p3', tenant:'Rafael Freitas',avatar:'RF', cor:'#c97a3a', tipo:'implantacao',   item:'Implantação completa', valor: 1497, status:'aguardando', criado:'2026-05-11 19:40' },
  { id:'p4', tenant:'Pedro Marques', avatar:'PM', cor:'#3aa6c9', tipo:'plus',          item:'Sócio Comercial Plus', valor: 297, status:'aguardando', criado:'2026-05-11 11:15' },
];

const SAQUES = [
  { id:'s1', socio:'Lucas Pereira', avatar:'LP', cor:'#e0a23a', valor: 482.40, chave:'lucas@email.com (PIX e-mail)', criado:'2026-05-12 09:12' },
  { id:'s2', socio:'Marina Coelho', avatar:'MC', cor:'#a96adb', valor: 1207.30, chave:'+5511987...22 (PIX telefone)', criado:'2026-05-11 17:50' },
];

const PLANOS = [
  { id:'pl1', nome:'Starter',  preco: 197, max_conversas: 200,  ciclos: 4, dias: 30, storage: 2,  popular: false, beneficios:['200 conversas/mês','4 ciclos por conversa','2 GB de mídia','1 agente IA'] },
  { id:'pl2', nome:'Pro',      preco: 397, max_conversas: 500,  ciclos: 8, dias: 30, storage: 10, popular: true,  beneficios:['500 conversas/mês','8 ciclos por conversa','10 GB de mídia','3 agentes IA','Curadoria avançada','Sócio Comercial'] },
  { id:'pl3', nome:'Plus',     preco: 697, max_conversas: 1200, ciclos: 16,dias: 30, storage: 30, popular: false, beneficios:['1.200 conversas/mês','16 ciclos por conversa','30 GB de mídia','Agentes ilimitados','API & webhooks','Suporte dedicado'] },
];

const COMISSOES = [
  { id:'cm1', nivel: 1, tipo_produto:'implantacao',  tipo_valor:'percentual', valor: 30, ativo:true,  descricao:'Comissão direta sobre implantação' },
  { id:'cm2', nivel: 1, tipo_produto:'mensalidade',  tipo_valor:'percentual', valor: 20, ativo:true,  descricao:'Recorrência mensal (vitalícia)' },
  { id:'cm3', nivel: 2, tipo_produto:'mensalidade',  tipo_valor:'percentual', valor: 5,  ativo:true,  descricao:'Indicação de segundo nível' },
  { id:'cm4', nivel: 1, tipo_produto:'pacote_extra', tipo_valor:'percentual', valor: 15, ativo:true,  descricao:'Sobre cada pacote extra vendido' },
  { id:'cm5', nivel: 3, tipo_produto:'mensalidade',  tipo_valor:'percentual', valor: 2,  ativo:false, descricao:'(desativado) Terceiro nível' },
];

const EQUIPE = [
  { id:'eq1', avatar:'AS', nome:'Ana Santos',     email:'ana@matrix.com.br',      cargo:'Vendedora',  ativo:true,  permissions:['atendimento','contratos','clientes'] },
  { id:'eq2', avatar:'BM', nome:'Bruno Martins',  email:'bruno@matrix.com.br',    cargo:'Atendente',  ativo:true,  permissions:['atendimento','clientes'] },
  { id:'eq3', avatar:'CO', nome:'Carolina Lima',  email:'carolina@matrix.com.br', cargo:'Financeira', ativo:true,  permissions:['atendimento','financeiro','clientes','contratos'] },
  { id:'eq4', avatar:'DR', nome:'Diego Ramos',    email:'diego@matrix.com.br',    cargo:'Closer',     ativo:false, permissions:['atendimento','contratos'] },
];

const APPS_PERMS = ['atendimento','contratos','base','campanhas','financeiro','loja','equipe','socio-comercial','agente','curadoria','clientes','empresa','configuracoes'];

const CONTRATOS = [
  { id:'k1', cliente:'João Reis',     valor: 2400, status:'assinado', criado:'2026-05-08', vence:'2027-05-08', template:'Padrão Pro' },
  { id:'k2', cliente:'Ana Beatriz',   valor: 2400, status:'enviado',  criado:'2026-05-11', vence:null,         template:'Padrão Pro' },
  { id:'k3', cliente:'Renato Costa',  valor: 4980, status:'assinado', criado:'2026-04-20', vence:'2027-04-20', template:'Plus anual' },
  { id:'k4', cliente:'Camila Borges', valor: 1280, status:'rascunho', criado:'2026-05-12', vence:null,         template:'Padrão Starter' },
  { id:'k5', cliente:'Felipe Castro', valor: 720,  status:'expirado', criado:'2025-05-15', vence:'2026-05-15', template:'Padrão Starter' },
];

const PRODUTOS_CONTRATO = [
  { id:'pc1', nome:'Implantação Ragentic',         preco: 1497 },
  { id:'pc2', nome:'Mensalidade Pro (12 meses)',   preco: 397 },
  { id:'pc3', nome:'Treinamento de equipe',        preco: 480 },
];

window.RAGENTIC_DATA = {
  TENANTS, CARGOS, LEADS, TRACES, BLOCOS, PEDIDOS, SAQUES, PLANOS, COMISSOES, EQUIPE, APPS_PERMS, CONTRATOS, PRODUTOS_CONTRATO,
  BRANDING_INICIAL: {
    nome_produto: 'Plataforma Limpa',
    nome_curto: 'PL',
    nome_so: 'Ragentic OS',
    logo_url: '',
    mensagem_login_titulo: 'Bem-vindo!',
    mensagem_login_sub: 'A plataforma inteligente de atendimento que opera 24/7.',
    cor_fundo: 'oklch(0.15 0.04 264)',
    cor_acento_1: 'oklch(0.7 0.18 220)',
    cor_acento_2: 'oklch(0.65 0.22 280)',
  },
  // Sem mock — a pílula do plano só aparece quando o dado real hidrata do banco
  // (evita o flash de "234/500" antes de virar o real). Ver Desktop: re-render
  // no evento 'ragentic-dados-hidratados'.
  PLANO_ATUAL: null,
  // O que o useDadosBundle já hidratou (dado real) VENCE o mock. Sem isto,
  // se este módulo for avaliado DEPOIS do boot real, a atribuição acima
  // apagaria os dados reais e a UI regrediria pro mock pra sempre.
  ...(window.RAGENTIC_DATA || {}),
};

/* ==================================================================== */
/* === shell.jsx === */
/* ==================================================================== */

/* ===== Toaster ===== */
const ToastCtx = React.createContext({ push: () => {} });
function Toaster({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs, { id, ...t }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.duration || 3200);
  }, []);
  const ctx = useMemo(() => ({ push,
    success: (msg) => push({ kind:'success', msg }),
    error:   (msg) => push({ kind:'error', msg }),
    info:    (msg) => push({ kind:'info', msg }),
  }), [push]);
  // Expõe o ctx real pra apps extraídos que usam o ToastCtx do bundle-shared
  // (contexto diferente, sem provider na árvore) — eles delegam pra cá em runtime.
  React.useEffect(() => { try { window.__ragenticToastCtx = ctx; } catch (_) { /* noop */ } }, [ctx]);
  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="toaster">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'triangle' : 'bell'} size={16}
              stroke={t.kind === 'success' ? 'oklch(0.85 0.18 145)' : t.kind === 'error' ? 'oklch(0.82 0.20 25)' : 'oklch(0.85 0.14 220)'} />
            <div>{t.msg}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => React.useContext(ToastCtx);

/* ===== Wallpaper =====
   Refatorado 2026-05-13 — delega ao módulo src/os/wallpaper/.
   Mantém o nome local pra não quebrar referências em JSX. */
function Wallpaper(props) { return <WallpaperModular {...props} />; }

/* Catálogo e aplicação de papel de parede: fonte ÚNICA em
   src/os/wallpaper/wallpapers.ts — o componente Wallpaper injeta
   window.RAGENTIC_WALLPAPERS + window.aplicarPapelParede no mount.
   (Catálogo legado duplicado removido 2026-08-19 — causava tema que
   "não pegava": o style setado por fora era desfeito pelo crossfade.) */
function aplicarPapelParede(id) {
  return typeof window !== 'undefined' && typeof window.aplicarPapelParede === 'function'
    ? window.aplicarPapelParede(id)
    : null;
}

/* ===== Topo (pílulas flutuantes — sem divisor) =====
   Refatorado 2026-05-13 — delega ao módulo src/os/topo/.
   Filosofia Theus: minimalista, sem barra divisória contínua.
   O nome BarraSuperior é mantido pra não quebrar JSX existente. */
function BarraSuperior(props) { return <TopoModular {...props} />; }
const capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

/* ===== CardPlanoConversas (Spec 11) — floating pill ===== */
function CardPlanoConversas({ plano, onAbrirLoja }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const dias = plano.dias_ate_expirar;
  const cor = dias < 7 ? 'oklch(0.82 0.20 25)' : dias <= 14 ? 'oklch(0.88 0.18 80)' : 'oklch(0.85 0.18 145)';
  const dotCor = dias < 7 ? 'oklch(0.65 0.24 25)' : dias <= 14 ? 'oklch(0.78 0.18 80)' : 'oklch(0.72 0.18 145)';
  const pct = Math.round((plano.conversas_usadas / plano.max_conversas) * 100);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="bar-cluster" onClick={() => setOpen(o => !o)}
        style={{ cursor:'pointer', padding:'5px 12px', color: cor }}>
        <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background: dotCor, boxShadow:`0 0 6px ${dotCor}`}}></span>
        <span style={{ fontWeight: 600 }}>{plano.plano_nome}</span>
        <span className="sep"></span>
        <span className="mono" style={{ fontWeight: 600 }}>{plano.conversas_usadas}/{plano.max_conversas}</span>
        <span className="sep"></span>
        <span className="mono">{dias}d</span>
      </button>
      {open && (
        <div className="os-vidro" style={{ position:'absolute', top:38, right:0, padding:16, width:300, zIndex:60, background:'rgba(15,12,30,0.96)' }}>
          <div className="row" style={{ justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div className="small muted">Plano atual</div>
              <div className="h3 os-aurora-text" style={{ marginTop: 2, fontSize: 20 }}>{plano.plano_nome}</div>
            </div>
            <span className="badge" style={{ color: cor, borderColor: cor, background:'transparent' }}>{plano.status}</span>
          </div>
          <div className="hr" />
          <div className="small muted" style={{ marginBottom: 6 }}>Conversas usadas</div>
          <div className="progress"><div style={{ width: `${pct}%` }}></div></div>
          <div className="row" style={{ justifyContent:'space-between', marginTop: 6 }}>
            <span className="small mono">{plano.conversas_usadas} / {plano.max_conversas}</span>
            <span className="small muted mono">{pct}%</span>
          </div>
          <div className="hr" />
          <div className="row" style={{ justifyContent:'space-between' }}>
            <div>
              <div className="muted small">Expira em</div>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{dias} dias</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div className="muted small">Data</div>
              <div className="mono small" style={{ marginTop: 2 }}>{plano.data_expiracao}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Dock =====
   Refatorado 2026-05-13 — delega ao módulo src/os/dock/.
   Mantém o nome local pra não quebrar referências em JSX. */
function Dock(props) { return <DockModular {...props} />; }

/* ===== CommandBar (bottom centered with energy ring) ===== */
function CommandBar({ onSubmit }) {
  const [val, setVal] = useState('');
  const inputRef = useRef();
  useEffect(() => { inputRef.current?.focus(); }, []);
  const handle = (e) => { e.preventDefault(); if (val.trim()) { onSubmit(val); setVal(''); } };
  return (
    <form onSubmit={handle} className="cmd-shell">
      <div className="cmd-inner">
        <input ref={inputRef} placeholder=""
               value={val} onChange={(e) => setVal(e.target.value)} />
        <button type="submit" className="btn-send"><Icon name="arrowUp" size={16} /></button>
      </div>
    </form>
  );
}

/* ===== Janela ===== */
/* MIN_JANELA_W/H, MARGEM_RESIZE, CURSORES_RESIZE e detectarBordaJanela
   agora vêm de @/os/janela (fonte única — antes havia uma CÓPIA local
   com 2px de faixa interna e sem zoom, que era o caminho dominante e
   deixava o resize difícil). 2026-05-18. */

function Janela(props) {
  /* Refatorado 2026-05-13 — delega ao módulo src/os/janela/. */
  return <JanelaModular {...props} />;
}

/* ===== Spotlight =====
   Refatorado 2026-05-13 — delega ao módulo src/os/spotlight/.
   Mantém o nome local pra não quebrar referências em JSX. */
function Spotlight(props) { return <SpotlightModular {...props} />; }

/* ===== Tween hook for KPI numbers ===== */
function useTween(target, duration = 700) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = null;
    const startVal = val;
    let raf;
    const step = (ts) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(startVal + (target - startVal) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

/* ===== Mini area / line chart (no deps) ===== */
function MiniChart({ data, type = 'area', height = 80, color = 'var(--os-acento-1)', color2 = 'var(--os-acento-2)' }) {
  const w = 100, h = height;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = w / (data.length - 1 || 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 10) - 5]);
  const linePath = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = linePath + ` L${w},${h} L0,${h} Z`;
  const id = useMemo(() => 'g-' + Math.random().toString(36).slice(2), []);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width:'100%', height }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color2} stopOpacity="0" />
        </linearGradient>
      </defs>
      {type === 'area' && <path d={areaPath} fill={`url(#${id})`} />}
      <path d={linePath} stroke={color} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

window.Toaster = Toaster;
window.useToast = useToast;
window.ToastCtx = ToastCtx;
window.Wallpaper = Wallpaper;
window.BarraSuperior = BarraSuperior;
window.Dock = Dock;
window.CommandBar = CommandBar;
window.Janela = Janela;
window.Spotlight = Spotlight;
window.useTween = useTween;
window.MiniChart = MiniChart;
window.capitalize = capitalize;

/* ===== MinimizedDock — pílulas das janelas minimizadas (rodapé esquerdo) ===== */
function MinimizedDock({ minimizados, apps, onRestaurar, onFechar }) {
  if (!minimizados.length) return null;
  return (
    <div className="min-dock">
      {minimizados.map(m => {
        // Lookup do app: exato primeiro, depois prefix-match (slug `app__inst` → app base `app`)
        // — mesmo padrão do render principal das janelas. Sem isso, janelas com slug dinâmico
        // (ex: `conversa-isolada__<id>`, aberta a partir de "Perguntas do Mentor") minimizavam
        // e SUMIAM: sem pílula na doca pra restaurar, ficava indistinguível de ter fechado.
        let app = apps.find(a => a.slug === m.slug);
        if (!app && m.slug.includes('__')) {
          app = apps.find(a => a.slug === m.slug.split('__')[0]);
        }
        if (!app) return null;
        return (
          <button key={m.slug} className="min-pill" onClick={() => onRestaurar(m.slug)} title={`Restaurar ${app.titulo}`}>
            <span className="min-pill-icon"><Icon name={app.icone} size={13}/></span>
            <span>{app.titulo}</span>
            <span className="min-pill-arrow"><Icon name="arrowUp" size={11}/></span>
            {/* X fecha a janela direto do balão, sem restaurar (pedido Theus 2026-07-28) */}
            <span
              className="min-pill-arrow"
              role="button"
              tabIndex={0}
              aria-label={`Fechar ${app.titulo}`}
              title={`Fechar ${app.titulo}`}
              onClick={(e) => { e.stopPropagation(); onFechar?.(m.slug); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onFechar?.(m.slug); }
              }}
            >
              <Icon name="x" size={11}/>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ===== NotificationCenter =====
   Refatorado 2026-05-13 — delega ao módulo src/os/notificacoes/.
   Mantém o nome local pra não quebrar referências em JSX. */
function NotificationCenter(props) { return <NotificationCenterModular {...props} />; }

window.MinimizedDock = MinimizedDock;
window.NotificationCenter = NotificationCenter;

/* ===== WorkspaceIndicator (3 desktops virtuais) ===== */
function WorkspaceIndicator({ area, onSwitch, counts }) {
  const items = [
    { i: 0, label: 'Esquerda' },
    { i: 1, label: 'Central' },
    { i: 2, label: 'Direita' },
  ];
  return (
    <div className="ws-indicator">
      {items.map(it => (
        <button key={it.i} className={`ws-dot ${area === it.i ? 'on' : ''}`} onClick={() => onSwitch(it.i)} title={`Área ${it.label}`}>
          <span></span>
          {counts[it.i] > 0 && <span className="ws-count">{counts[it.i]}</span>}
        </button>
      ))}
    </div>
  );
}

/* ===== EdgeHint — pré-visualização do snap de metade ao arrastar pra borda ===== */
function EdgeHint({ side }) {
  if (!side) return null;
  return (
    <div className={`edge-hint edge-${side}`}>
      <div className="edge-label">
        <span style={{ fontSize: 11, opacity: 0.8 }}>solte pra ocupar</span>
        <span style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>metade da tela</span>
      </div>
    </div>
  );
}

window.WorkspaceIndicator = WorkspaceIndicator;
window.EdgeHint = EdgeHint;

/* ===== EdgeNav — setas laterais sempre visíveis para trocar de área ===== */
function EdgeNav({ area, onSwitch }) {
  return (
    <>
      {area > 0 && (
        <button className="edge-nav edge-nav-left" onClick={() => onSwitch(area - 1)} title="Área anterior">
          <Icon name="arrowLeft" size={18} />
        </button>
      )}
      {area < 2 && (
        <button className="edge-nav edge-nav-right" onClick={() => onSwitch(area + 1)} title="Próxima área">
          <Icon name="arrowRight" size={18} />
        </button>
      )}
    </>
  );
}

/* ===== SwipeArea — arrastar no fundo vazio troca de área ===== */
function SwipeArea({ area, onSwitch }) {
  const onMouseDown = (e) => {
    // só ativa se o clique foi no próprio elemento (fundo) — não em janelas ou dock
    if (e.target !== e.currentTarget) return;
    const startX = e.clientX;
    let dx = 0;
    const move = (ev) => { dx = ev.clientX - startX; };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (dx > 100 && area > 0) onSwitch(area - 1);
      else if (dx < -100 && area < 2) onSwitch(area + 1);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  return <div className="swipe-area" onMouseDown={onMouseDown}></div>;
}

window.EdgeNav = EdgeNav;
window.SwipeArea = SwipeArea;

/* ===== Launchpad — overlay com todos os apps + widgets ===== */

/* Ficha de cada app pro card de hover (referência Theus 2026-08-11): descrição
   curta + até 3 funcionalidades. App sem ficha mostra card só com o título. */
const FICHAS_APPS = {
  conversas:        { desc: 'Central de atendimento do agente', func: [
    { icone: 'zap',       t: 'Atendimento',  d: 'Conversas do agente em tempo real' },
    { icone: 'trending',  t: 'Vendas',       d: 'Funil e desfechos de cada lead' },
    { icone: 'userCheck', t: 'Clientes',     d: 'Quem já converteu, num lugar só' } ] },
  empresa:          { desc: 'Dados e identidade da sua empresa', func: [
    { icone: 'users',     t: 'Sócios',       d: 'Quadro societário completo' },
    { icone: 'file',      t: 'Documentos',   d: 'CNPJ, contratos e registros' },
    { icone: 'palette',   t: 'Perfil',       d: 'Identidade que o agente usa' } ] },
  equipe:           { desc: 'Time com papéis e permissões', func: [
    { icone: 'users',     t: 'Membros',      d: 'Convide e gerencie o time' },
    { icone: 'shield',    t: 'Papéis',       d: 'Permissão certa pra cada um' },
    { icone: 'zap',       t: 'Atividade',    d: 'Quem fez o quê no painel' } ] },
  loja:             { desc: 'Apps e recursos pra instalar', func: [
    { icone: 'package',   t: 'Catálogo',     d: 'Apps prontos pra sua conta' },
    { icone: 'plus',      t: 'Instalar',     d: 'Um clique e o app aparece' },
    { icone: 'dollar',    t: 'Planos',       d: 'Assinaturas e upgrades' } ] },
  estoque:          { desc: 'Controle de estoque com alerta de reposição', func: [
    { icone: 'package',   t: 'Itens',        d: 'Quantidade, SKU e categoria' },
    { icone: 'zap',       t: 'Entrada/Saída', d: 'Movimenta com 1 clique e vira histórico' },
    { icone: 'bell',      t: 'Reposição',    d: 'Alerta quando bate o mínimo' } ] },
  configuracoes:    { desc: 'Conta, notificações e aparência', func: [
    { icone: 'users',     t: 'Conta',        d: 'Seus dados e acesso' },
    { icone: 'bell',      t: 'Notificações', d: 'O que te avisa e quando' },
    { icone: 'palette',   t: 'Aparência',    d: 'Tema e cores do OS' } ] },
  'chat-teste':     { desc: 'Treine o agente conversando e corrigindo', func: [
    { icone: 'message',   t: 'Conversa',     d: 'Escolha o produto e fale com o agente de verdade' },
    { icone: 'edit',      t: 'Correções',    d: 'Corrija cada resposta no lápis' },
    { icone: 'brain',     t: 'Mentor',       d: 'Nota de humanização e conversa padrão' } ] },
  produtos:         { desc: 'Catálogo que o agente vende', func: [
    { icone: 'package',   t: 'Produtos',     d: 'Preço, parcelas e garantia' },
    { icone: 'book',      t: 'Conhecimento', d: 'O que o agente sabe de cada um' },
    { icone: 'file',      t: 'Contrato',     d: 'Cláusulas e exigências por produto' } ] },
  contratos:        { desc: 'Gere e acompanhe contratos', func: [
    { icone: 'fileSignature', t: 'Gerador',  d: 'Contrato pronto em segundos' },
    { icone: 'layers',    t: 'Templates',    d: 'Moldes reaproveitáveis' },
    { icone: 'book',      t: 'Histórico',    d: 'Tudo que já foi assinado' } ] },
  consulta:         { desc: 'Consultas de crédito com laudo', func: [
    { icone: 'search',    t: 'Consultar',    d: 'CPF/CNPJ com laudo em PDF' },
    { icone: 'wallet',    t: 'Carteira',     d: 'Saldo e recargas de créditos' },
    { icone: 'book',      t: 'Histórico',    d: 'Consultas anteriores salvas' } ] },
  juridico:         { desc: 'Peças e processos jurídicos', func: [
    { icone: 'shield',    t: 'Processos',    d: 'Acompanhamento de casos' },
    { icone: 'file',      t: 'Peças',        d: 'Documentos gerados com IA' },
    { icone: 'book',      t: 'Modelos',      d: 'Base de modelos jurídicos' } ] },
  agente:           { desc: 'Cérebro do seu agente de IA', func: [
    { icone: 'book',      t: 'Conhecimento', d: 'Ensine o que ele responde' },
    { icone: 'layers',    t: 'Cargos',       d: 'Papéis que ele desempenha' },
    { icone: 'command',   t: 'Perguntas',    d: 'O que ele pergunta ao lead' } ] },
  mentor:           { desc: 'Seu conselheiro de negócio com IA', func: [
    { icone: 'pieChart',  t: 'Resumo',       d: 'O dia da empresa em um tapa' },
    { icone: 'trending',  t: 'KPIs',         d: 'Números vivos direto do banco' },
    { icone: 'zap',       t: 'Ações',        d: 'Cadastre e execute pela conversa' } ] },
  clientes:         { desc: 'Carteira de clientes convertidos', func: [
    { icone: 'userCheck', t: 'Carteira',     d: 'Todos os que fecharam' },
    { icone: 'dollar',    t: 'Pagamentos',   d: 'Parcelas e cobranças' },
    { icone: 'message',   t: 'Relação',      d: 'Histórico de cada cliente' } ] },
  'socio-comercial-user': { desc: 'Sua rede de indicações', func: [
    { icone: 'users',     t: 'Rede',         d: 'Quem você indicou' },
    { icone: 'dollar',    t: 'Comissões',    d: 'Quanto cada venda te rende' },
    { icone: 'trending',  t: 'Saques',       d: 'Resgate seus ganhos' } ] },
  base:             { desc: 'CRM completo dos seus leads', func: [
    { icone: 'users',     t: 'Leads',        d: 'Base inteira com filtros' },
    { icone: 'layers',    t: 'Funil',        d: 'Fase a fase até fechar' },
    { icone: 'search',    t: 'Busca',        d: 'Ache qualquer contato' } ] },
  campanha:         { desc: 'Disparos em massa com persona', func: [
    { icone: 'zap',       t: 'Operação',     d: 'Kanban da execução ao vivo' },
    { icone: 'users',     t: 'Leads',        d: 'Quem entra em cada fase' },
    { icone: 'layers',    t: 'Fases',        d: 'Esteira de abordagem' } ] },
  textos:           { desc: 'Textos prontos com a sua voz', func: [
    { icone: 'edit',      t: 'Gerador',      d: 'Posts, respostas e roteiros' },
    { icone: 'book',      t: 'Biblioteca',   d: 'Tudo que você já gerou' },
    { icone: 'palette',   t: 'Tom',          d: 'A IA escreve como você' } ] },
  marketing:        { desc: 'Criativos e campanhas de tráfego', func: [
    { icone: 'image',     t: 'Criativos',    d: 'Artes geradas com IA' },
    { icone: 'trending',  t: 'Métricas',     d: 'O que tá performando' },
    { icone: 'zap',       t: 'Publicação',   d: 'Do rascunho pro ar' } ] },
  notas:            { desc: 'Anotações rápidas no OS', func: [
    { icone: 'edit',      t: 'Notas',        d: 'Escreva e organize' },
    { icone: 'pin',       t: 'Post-its',     d: 'Cole na área de trabalho' },
    { icone: 'search',    t: 'Busca',        d: 'Ache qualquer anotação' } ] },
  caixa:            { desc: 'Financeiro da sua operação', func: [
    { icone: 'dollar',    t: 'Movimentos',   d: 'Entradas e saídas' },
    { icone: 'pieChart',  t: 'Categorias',   d: 'Pra onde o dinheiro vai' },
    { icone: 'trending',  t: 'Metas',        d: 'Objetivo do mês na tela' } ] },
  reuniao:          { desc: 'Calls com transcrição e análise', func: [
    { icone: 'video',     t: 'Salas',        d: 'Crie e entre em segundos' },
    { icone: 'mic',       t: 'Transcrição',  d: 'Tudo que foi dito, em texto' },
    { icone: 'book',      t: 'Histórico',    d: 'Resumo e decisões por IA' } ] },
  contabilidade:    { desc: 'Contabilidade sem sair do OS', func: [
    { icone: 'file',      t: 'Guias',        d: 'Impostos e vencimentos' },
    { icone: 'pieChart',  t: 'Relatórios',   d: 'DRE e balanços simples' },
    { icone: 'bell',      t: 'Prazos',       d: 'Nada vence sem avisar' } ] },
  rh:               { desc: 'Gestão de pessoas e folha', func: [
    { icone: 'users',     t: 'Colaboradores', d: 'Cadastro e documentos' },
    { icone: 'dollar',    t: 'Folha',        d: 'Salários e benefícios' },
    { icone: 'bell',      t: 'Ponto',        d: 'Presença e ausências' } ] },
  email:            { desc: 'Caixa de e-mail dentro do OS', func: [
    { icone: 'mail',      t: 'Caixa',        d: 'Leia e responda aqui' },
    { icone: 'zap',       t: 'IA',           d: 'Respostas sugeridas' },
    { icone: 'search',    t: 'Busca',        d: 'Ache qualquer conversa' } ] },
  credito:          { desc: 'Esteira de crédito bancário', func: [
    { icone: 'dollar',    t: 'Propostas',    d: 'Simule e envie pro banco' },
    { icone: 'layers',    t: 'Esteira',      d: 'Status de cada proposta' },
    { icone: 'userCheck', t: 'Clientes',     d: 'Quem tá com crédito rodando' } ] },
  rifas:            { desc: 'Rifas e sorteios pros seus leads', func: [
    { icone: 'zap',       t: 'Campanhas',    d: 'Crie a rifa em minutos' },
    { icone: 'users',     t: 'Participantes', d: 'Números e pagamentos' },
    { icone: 'trending',  t: 'Sorteio',      d: 'Resultado auditável' } ] },
  calculadora:      { desc: 'Cálculo rápido sem sair do OS', func: [] },
  agenda:           { desc: 'Compromissos e disponibilidade', func: [
    { icone: 'bell',      t: 'Agenda',       d: 'Dia e semana na tela' },
    { icone: 'zap',       t: 'Agente',       d: 'O agente marca sozinho' },
    { icone: 'users',     t: 'Convidados',   d: 'Compromissos com o time' } ] },
  /* ADMIN */
  dashboard:        { desc: 'Visão geral da plataforma', func: [
    { icone: 'pieChart',  t: 'Métricas',     d: 'Tenants, uso e receita' },
    { icone: 'trending',  t: 'Crescimento',  d: 'Evolução mês a mês' },
    { icone: 'bell',      t: 'Alertas',      d: 'O que precisa de você' } ] },
  controle:         { desc: 'Controles internos da plataforma', func: [
    { icone: 'shield',    t: 'Chaves',       d: 'Integrações e acessos' },
    { icone: 'sliders',   t: 'Flags',        d: 'Ligue e desligue recursos' },
    { icone: 'eye',       t: 'Auditoria',    d: 'Tudo que a IA fez, registrado' } ] },
  tenants:          { desc: 'Contas da plataforma', func: [
    { icone: 'userCheck', t: 'Ativos',       d: 'Quem tá rodando' },
    { icone: 'bell',      t: 'Pendentes',    d: 'Aprovações na fila' },
    { icone: 'eyeOff',    t: 'Inativos',     d: 'Contas pausadas' } ] },
  'loja-admin':     { desc: 'Gestão da loja de apps', func: [
    { icone: 'package',   t: 'Apps',         d: 'Catálogo publicado' },
    { icone: 'dollar',    t: 'Preços',       d: 'Mensalidades e % da loja' },
    { icone: 'bell',      t: 'Aprovação',    d: 'Apps de terceiros na fila' } ] },
  aplicativos:      { desc: 'Apps liberados por conta', func: [
    { icone: 'layers',    t: 'Por tenant',   d: 'Quem vê o quê' },
    { icone: 'sliders',   t: 'Defaults',     d: 'O que vem ligado de fábrica' },
    { icone: 'eye',       t: 'Uso',          d: 'Apps mais abertos' } ] },
  'consulta-admin': { desc: 'Gestão do produto Consulta', func: [
    { icone: 'layers',    t: 'Tipos',        d: 'Consultas disponíveis' },
    { icone: 'package',   t: 'Pacotes',      d: 'Créditos e preços' },
    { icone: 'dollar',    t: 'Recargas',     d: 'Pedidos dos tenants' } ] },
  'juridico-admin': { desc: 'Gestão do produto Jurídico', func: [
    { icone: 'shield',    t: 'Processos',    d: 'Casos de todos os tenants' },
    { icone: 'file',      t: 'Modelos',      d: 'Base global de peças' },
    { icone: 'sliders',   t: 'Config',       d: 'Regras do produto' } ] },
  aparencia:        { desc: 'White-label da plataforma', func: [
    { icone: 'palette',   t: 'Cores',        d: 'Paleta de cada marca' },
    { icone: 'image',     t: 'Logos',        d: 'Identidade por tenant' },
    { icone: 'command',   t: 'Login',        d: 'Tela de entrada custom' } ] },
  financeiro:       { desc: 'Receita da plataforma', func: [
    { icone: 'dollar',    t: 'Pedidos',      d: 'PIX e comprovantes' },
    { icone: 'trending',  t: 'Saques',       d: 'Comissões a pagar' },
    { icone: 'pieChart',  t: 'Visão',        d: 'Receita por produto' } ] },
  'socio-comercial': { desc: 'Programa de indicações', func: [
    { icone: 'dollar',    t: 'Comissões',    d: 'Regras e percentuais' },
    { icone: 'users',     t: 'Rede',         d: 'Árvore de indicações' },
    { icone: 'trending',  t: 'Saques',       d: 'Fila de pagamentos' } ] },
  curadoria:        { desc: 'Inteligência conversacional', func: [
    { icone: 'layers',    t: 'Blocos',       d: '15 gavetas × 3 escopos' },
    { icone: 'flaskConical', t: 'Simulador', d: 'Teste antes de publicar' },
    { icone: 'message',   t: 'Conversa',     d: 'Refine com a IA junto' } ] },
  'cargos-admin':   { desc: 'Cargos globais dos agentes', func: [
    { icone: 'users',     t: 'Globais',      d: 'Papéis da plataforma' },
    { icone: 'layers',    t: 'Nichos',       d: 'Cargo certo por nicho' },
    { icone: 'edit',      t: 'Editor',       d: 'Prompt de cada cargo' } ] },
  'nichos-admin':   { desc: 'Nichos de mercado da plataforma', func: [
    { icone: 'layers',    t: 'Catálogo',     d: 'Nichos disponíveis' },
    { icone: 'book',      t: 'Base',         d: 'Conhecimento por nicho' },
    { icone: 'sliders',   t: 'Config',       d: 'Regras de cada um' } ] },
  'reunioes-admin': { desc: 'Salas de reunião da plataforma', func: [
    { icone: 'video',     t: 'Salas',        d: 'Todas as calls criadas' },
    { icone: 'mic',       t: 'Transcrições', d: 'Áudio virou texto' },
    { icone: 'trending',  t: 'Uso',          d: 'Minutos por tenant' } ] },
};

function Launchpad({ open, onClose, apps, side, onLaunch, onSwitchSide, pinned, onTogglePin, widgets, activeWidgets, onToggleWidget }) {
  const [tab, setTab] = useState('apps'); // 'apps' | 'widgets'
  // Busca de apps (Theus 2026-08-19): com 40+ apps a grade ficou grande.
  const [buscaApps, setBuscaApps] = useState('');
  useEffect(() => { if (open) setBuscaApps(''); }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  const lado = side;
  // Filtra apps ocultos (recursos internos como `conversa-isolada` que abrem
  // só via drag, nunca via Dock/Launchpad).
  const q = buscaApps.trim().toLowerCase();
  const filtered = apps.filter(a =>
    (a.lado === lado || a.lado === 'ambos') && !a.oculto &&
    (!q || a.titulo.toLowerCase().includes(q) || a.slug.includes(q)),
  );
  return (
    <div className="launchpad" onClick={onClose}>
      <div className="launchpad-inner">
        <div style={{ display:'flex', justifyContent:'center', marginBottom: 36 }}>
          <div className="tabs" style={{ background:'rgba(15,12,30,0.45)' }} onClick={(e) => e.stopPropagation()}>
            <span className={`tab ${tab==='apps'?'tab-on':''}`} onClick={(e) => { e.stopPropagation(); setTab('apps'); }}>
              <Icon name="package" size={12}/> Apps
            </span>
            <span className={`tab ${tab==='widgets'?'tab-on':''}`} onClick={(e) => { e.stopPropagation(); setTab('widgets'); }}>
              <Icon name="layers" size={12}/> Widgets
            </span>
          </div>
        </div>

        {tab === 'apps' && (
          <div style={{ display:'flex', justifyContent:'center', marginBottom: 26 }}>
            <input
              className="lp-busca"
              placeholder="Pesquisar apps…"
              value={buscaApps}
              autoFocus
              onChange={(e) => setBuscaApps(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        {tab === 'apps' && filtered.length === 0 && (
          <div className="muted" style={{ textAlign:'center', fontSize: 13 }}>Nenhum app com esse nome.</div>
        )}
        {tab === 'apps' && (
          <div className="launchpad-grid">
            {filtered.map(a => {
              const isPinned = pinned.has(a.slug);
              const ficha = FICHAS_APPS[a.slug];
              return (
                <div key={a.slug} className="lp-app">
                  <button className="lp-icon-btn" onClick={() => { onLaunch(a.slug); onClose(); }}>
                    <div className="lp-icon"><Icon name={a.icone} size={30} /></div>
                    {/* Card de ficha no hover (referência Theus 2026-08-11): glass
                        escuro com luz do acento + funcionalidades do app. */}
                    <span className="lp-ficha" aria-hidden="true">
                      <span className="lp-ficha-topo">
                        <span className="lp-ficha-titulo">{a.titulo}</span>
                        {ficha?.desc && <span className="lp-ficha-desc">{ficha.desc}</span>}
                      </span>
                      {(ficha?.func?.length ?? 0) > 0 && (
                        <span className="lp-ficha-lista">
                          {ficha.func.map(f => (
                            <span key={f.t} className="lp-ficha-item">
                              <span className="lp-ficha-item-icone"><Icon name={f.icone} size={13} sw={2.25} /></span>
                              <span className="lp-ficha-item-texto">
                                <span className="lp-ficha-item-titulo">{f.t}</span>
                                <span className="lp-ficha-item-desc">{f.d}</span>
                              </span>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                  <button className={`lp-pin ${isPinned ? 'pinned' : ''}`} onClick={(e) => { e.stopPropagation(); onTogglePin(a.slug); }} title={isPinned ? 'Remover do menu lateral' : 'Fixar no menu lateral'}>
                    <Icon name="pin" size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'widgets' && (
          <div className="widgets-grid">
            {widgets.map(w => {
              const ativo = activeWidgets.has(w.id);
              return (
                <div key={w.id} className={`widget-card ${ativo ? 'is-on' : ''}`} onClick={(e) => e.stopPropagation()}>
                  <div className="widget-preview">{w.preview()}</div>
                  <div className="row" style={{ padding: 14, justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div className="h3" style={{ fontSize: 14 }}>{w.titulo}</div>
                      <div className="muted tiny">{w.descricao}</div>
                    </div>
                    <button className={`btn ${ativo ? '' : 'btn-primary'} btn-sm`} onClick={(e) => { e.stopPropagation(); onToggleWidget(w.id); }}>
                      {ativo ? <><Icon name="check" size={12}/> Adicionado</> : <><Icon name="plus" size={12}/> Adicionar</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

window.Launchpad = Launchpad;

/* ==================================================================== */
/* === genui.jsx === */
/* ==================================================================== */
const { useState: gUseState, useEffect: gUseEffect, useRef: gUseRef, useMemo: gUseMemo } = React;

/* Cardápio de comandos da barra (digitou "/"): cada item vira prompt pronto no input.
   Ancorado nas tools REAIS do Mentor (tools-mentor.ts) — nada aqui é promessa vazia. */
const COMANDOS_BARRA = [
  { atalho: '/resumo', icone: 'pieChart', rotulo: 'Resumo do dia', prompt: 'Me dá um resumo do dia: KPIs, conversas e o que precisa da minha atenção.' },
  { atalho: '/kpi', icone: 'trending', rotulo: 'KPIs da semana', prompt: 'Mostra os KPIs principais da semana.' },
  { atalho: '/leads', icone: 'zap', rotulo: 'Leads quentes', prompt: 'Quais leads quentes precisam da minha atenção agora?' },
  { atalho: '/buscar', icone: 'search', rotulo: 'Buscar leads por intenção', prompt: 'Busca os leads que [descreva: ex. reclamaram do preço essa semana].' },
  { atalho: '/post', icone: 'image', rotulo: 'Imagem de post', prompt: 'Gera uma imagem de post pra minha rede social sobre [tema].' },
  { atalho: '/produto', icone: 'package', rotulo: 'Cadastrar produto', prompt: 'Cadastra um produto novo: [nome, preço e descrição].' },
  { atalho: '/conhecimento', icone: 'book', rotulo: 'Ensinar o agente', prompt: 'Adiciona na base de conhecimento do agente: [escreva o fato].' },
  { atalho: '/contrato', icone: 'file', rotulo: 'Link de contrato', prompt: 'Gera um link de contrato do produto [nome do produto] pro cliente [nome].' },
  { atalho: '/anotacao', icone: 'edit', rotulo: 'Anotar', prompt: 'Anota pra mim: [escreva a anotação].' },
  { atalho: '/abrir', icone: 'command', rotulo: 'Abrir aplicativo', prompt: 'Abre o app [nome do aplicativo].' },
];

/* Formata a resposta do Mentor: parágrafos, **negrito**, *itálico*, listas "- ",
   `código`, blocos ``` (JetBrains Mono), títulos "###" e auto-link de URL —
   sem lib externa. Antes, ``` e links chegavam como texto cru na bolha. */
function TextoFormatado({ texto }) {
  // URL crua no texto vira link curto e semântico — o token/UUID nunca aparece.
  const rotuloLink = (u) => {
    try {
      const p = new URL(u);
      const path = p.pathname;
      if (path.startsWith('/contrato/')) return 'abrir contrato';
      if (path.startsWith('/consulta/')) return 'abrir consulta';
      if (path.startsWith('/rifa/')) return 'abrir rifa';
      if (path.startsWith('/agendar/')) return 'abrir agenda';
      if (path.startsWith('/acompanhamento/')) return 'abrir acompanhamento';
      const curto = p.hostname.replace(/^www\./, '') + (path.length > 1 ? path : '');
      return curto.length > 38 ? curto.slice(0, 35) + '…' : curto;
    } catch { return u.length > 38 ? u.slice(0, 35) + '…' : u; }
  };
  const inline = (t) => {
    const partes = [];
    let resto = String(t);
    let k = 0;
    const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|(https?:\/\/[^\s)]+)/;
    let m;
    while ((m = re.exec(resto))) {
      if (m.index > 0) partes.push(resto.slice(0, m.index));
      if (m[1] !== undefined) partes.push(<strong key={k++}>{m[1]}</strong>);
      else if (m[2] !== undefined) partes.push(<em key={k++}>{m[2]}</em>);
      else if (m[3] !== undefined) partes.push(<code key={k++} className="fmt-cod-inline">{m[3]}</code>);
      else partes.push(<a key={k++} className="fmt-link" href={m[4]} target="_blank" rel="noopener noreferrer">{rotuloLink(m[4])} ↗</a>);
      resto = resto.slice(m.index + m[0].length);
    }
    partes.push(resto);
    return partes;
  };
  const renderMd = (trecho, chave) => {
    const blocos = trecho.split(/\n{2,}/).filter(b => b.trim() !== '');
    return blocos.map((bloco, i) => {
      // Agrupa linhas consecutivas: itens "- "/"* "/"• " viram <ul> mesmo em bloco misto.
      const grupos = [];
      for (const linha of bloco.split('\n').filter(l => l.trim() !== '')) {
        const item = /^\s*[-•*]\s+(.*)$/.exec(linha);
        const titulo = /^\s*#{1,4}\s+(.*)$/.exec(linha);
        const anterior = grupos[grupos.length - 1];
        if (titulo) {
          grupos.push({ tipo: 'titulo', linhas: [titulo[1]] });
        } else if (item) {
          if (anterior?.tipo === 'lista') anterior.linhas.push(item[1]);
          else grupos.push({ tipo: 'lista', linhas: [item[1]] });
        } else if (anterior?.tipo === 'par') {
          anterior.linhas.push(linha);
        } else {
          grupos.push({ tipo: 'par', linhas: [linha] });
        }
      }
      return (
        <Fragment key={`${chave}-${i}`}>
          {grupos.map((g, j) =>
            g.tipo === 'lista' ? (
              <ul key={j} className="fmt-lista">
                {g.linhas.map((l, k) => <li key={k}>{inline(l)}</li>)}
              </ul>
            ) : g.tipo === 'titulo' ? (
              <p key={j} className="fmt-titulo">{inline(g.linhas[0])}</p>
            ) : (
              <p key={j} className="fmt-par">
                {g.linhas.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{inline(l)}</Fragment>)}
              </p>
            )
          )}
        </Fragment>
      );
    });
  };
  // Extrai blocos ``` ANTES de dividir em parágrafos (código tem \n\n internos).
  const partes = String(texto ?? '').replace(/\r\n/g, '\n').split(/```[a-z]*\n?([\s\S]*?)```/);
  return partes.map((parte, i) =>
    i % 2 === 1
      ? <pre key={i} className="fmt-codigo">{parte.replace(/\n$/, '')}</pre>
      : renderMd(parte, i)
  );
}

/* ============== CommandBar inteligente (Gen UI inline) ============== */

// Título que o banco põe em toda conversa nova. Enquanto a thread estiver com
// ele, o painel de histórico mostra a 1ª pergunta no lugar.
const TITULO_PADRAO_MENTOR = 'Conversa com Mentor';

// A frase que identifica a conversa no painel: a própria pergunta, limpa de
// quebras de linha, de anexo colado e do "/" de comando. Sem LLM, sem custo.
function resumirPergunta(texto) {
  const cru = String(texto ?? '')
    .split('\n--- CONTEÚDO DO ARQUIVO ANEXADO')[0]
    .replace(/\s+/g, ' ')
    .replace(/^\//, '')
    .trim();
  if (!cru) return TITULO_PADRAO_MENTOR;
  return cru.length > 68 ? cru.slice(0, 67).trimEnd() + '…' : cru;
}

// "hoje" / "ontem" / "12 de agosto" — cabeçalho de grupo do painel.
function grupoDoDia(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mesmoDia(d, hoje)) return 'hoje';
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia(d, ontem)) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

/* Parseia o resultado das tools p/ extrair `dados.tipo` (Gen UI: gráfico, lista…). */
function extrairGenUis(toolCalls) {
  return (Array.isArray(toolCalls) ? toolCalls : [])
    .map((tc) => {
      const cru = tc?.resultado;
      if (!cru || typeof cru !== 'string') return null;
      try {
        const j = JSON.parse(cru);
        if (j && j.dados && j.dados.tipo) {
          return { tipo: j.dados.tipo, dados: j.dados, mensagem: j.mensagem };
        }
      } catch { /* não-JSON: ignora */ }
      return null;
    })
    .filter(Boolean);
}

/*
 * Resgata a resposta que o motor gravou depois da chamada HTTP cair.
 * Turno pesado do Mentor já levou 121s no motor; o fetch morre antes disso e
 * o usuário via "não consegui falar com o Mentor" mesmo com a resposta pronta
 * no banco. Aqui a gente espera ela aparecer antes de acusar erro.
 */
async function resgatarRespostaAtrasada(sb, conversaId, enviadoEm, esperaMaxMs = 90_000) {
  const limite = Date.now() + esperaMaxMs;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 4000));
    const { data } = await sb
      .from('mentor_mensagens')
      .select('conteudo, tool_calls, criado_em')
      .eq('conversa_id', conversaId)
      .eq('papel', 'assistant')
      .gt('criado_em', enviadoEm)
      .order('criado_em', { ascending: false })
      .limit(1);
    const achou = data?.[0];
    if (achou && String(achou.conteudo ?? '').trim()) return achou;
  }
  return null;
}

function CommandBarInteligente({ onAbrirApp, side, janelasAbertas = 0 }) {
  const [val, setVal] = gUseState('');
  const [chat, setChat] = gUseState([]); // {id, from, bolhas, widget, ts}
  const [pensando, setPensando] = gUseState(false);
  // Espera longa não pode ser 3 pontinhos mudos: o Mentor roda até 6 rodadas de
  // tools (10-30s). A frase evolui com o tempo pra contar o que tá acontecendo.
  const [frasePensando, setFrasePensando] = gUseState(0);
  gUseEffect(() => {
    if (!pensando) { setFrasePensando(0); return; }
    const t1 = setTimeout(() => setFrasePensando(1), 4000);
    const t2 = setTimeout(() => setFrasePensando(2), 12000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pensando]);
  // Barra retrátil. Nasce ESCONDIDA (2026-08-10): o Mentor vive fora de cena
  // igual ao dock. Desde 2026-08-11 o cursor manda: entra no ESPAÇO da barra
  // (não no rodapé inteiro) → aparece; sai de cima → some na hora, salvo
  // trabalho em curso (texto, gravação, anexo, resposta a caminho). Sem setas.
  const [barraEscondida, setBarraEscondida] = gUseState(true);
  // Histórico lateral (2026-08-08): cada assunto é uma thread própria em
  // `mentor_conversas`. O painel lista as threads pelo título — que é a
  // primeira pergunta feita nela — e clicar troca a conversa do feed.
  const [historicoAberto, setHistoricoAberto] = gUseState(false);
  const [conversas, setConversas] = gUseState([]);          // {id, titulo, atualizado_em}
  const [conversaAtiva, setConversaAtiva] = gUseState(null);
  const [carregandoConversas, setCarregandoConversas] = gUseState(false);
  // Onda 2026-05-14: anexo de arquivo + gravação de áudio
  const [anexo, setAnexo] = gUseState(null);
  const [anexando, setAnexando] = gUseState(false);
  const [gravando, setGravando] = gUseState(false);
  const [audioBlob, setAudioBlob] = gUseState(null);
  const [audioDur, setAudioDur] = gUseState(0);
  const [transcrevendo, setTranscrevendo] = gUseState(false);
  const refFile = gUseRef();
  const refRec = gUseRef();
  const refChunks = gUseRef([]);
  const inputRef = gUseRef();
  // Copiar mensagem (Dominic 2026-08-25): botão discreto por bolha; o ícone
  // vira ✓ por 1,6s após copiar.
  const [copiadoKey, setCopiadoKey] = gUseState(null);
  const copiarBolha = (key, texto) => {
    navigator.clipboard?.writeText(String(texto ?? '')).then(() => {
      setCopiadoKey(key);
      setTimeout(() => setCopiadoKey((k) => (k === key ? null : k)), 1600);
    }).catch(() => {});
  };
  // Menu "+" (Dominic 2026-08-25): os 3 controles da barra (anexar, áudio,
  // histórico) viraram um único botão + que abre um menu glass compacto.
  const [menuMaisAberto, setMenuMaisAberto] = gUseState(false);
  const refMenuMais = gUseRef();
  gUseEffect(() => {
    if (!menuMaisAberto) return;
    const aoClicarFora = (e) => {
      if (refMenuMais.current && !refMenuMais.current.contains(e.target)) setMenuMaisAberto(false);
    };
    const aoTeclar = (e) => { if (e.key === 'Escape') setMenuMaisAberto(false); };
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [menuMaisAberto]);
  gUseEffect(() => { if (barraEscondida) setMenuMaisAberto(false); }, [barraEscondida]);
  // Motor Anticipatory (porte Dominic Aknator 2026-08-24): mapeia a frase a
  // cada tecla, normaliza visível na caixa, antecipa a consulta e — quando o
  // léxico fechado cobre — responde local sem LLM, declarando a via.

  const escolherArquivo = () => refFile.current?.click();

  const onArquivoSelecionado = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setAnexando(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data: sess } = await sb.auth.getSession();
      const userId = sess?.session?.user?.id;
      if (!userId) throw new Error('Faça login pra anexar arquivos.');
      if (f.size > 8 * 1024 * 1024) throw new Error(`Arquivo grande demais (${(f.size/1024).toFixed(0)}KB). Limite 8MB.`);
      const ext = (f.name.split('.').pop() || 'txt').toLowerCase();
      // Imagem entra desde 2026-08-02: a edge manda pro modelo multimodal, que
      // transcreve o texto do print/foto e descreve o que é.
      if (!['txt','md','pdf','docx','png','jpg','jpeg','webp','heic','gif'].includes(ext)) {
        throw new Error('Use TXT, MD, PDF, DOCX ou imagem (PNG, JPG, WEBP).');
      }
      const nomeSeg = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${userId}/${Date.now()}_${nomeSeg}`;
      const { error: upErr } = await sb.storage.from('mestre-anexos').upload(path, f, { contentType: f.type || undefined });
      if (upErr) throw upErr;
      const { data: ext2, error: exErr } = await sb.functions.invoke('extrair-contrato-de-arquivo', { body: { caminho_arquivo: path } });
      if (exErr) throw exErr;
      if (!ext2?.ok || !ext2?.texto) throw new Error(ext2?.mensagem || 'Falha ao extrair conteúdo.');
      setAnexo({ nome: f.name, path, texto: ext2.texto, caracteres: ext2.caracteres ?? ext2.texto.length });
    } catch (err) {
      try { (window.useToast?.() || {}).show?.({ tipo:'erro', titulo:'Anexo', msg: err.message || 'falha' }); } catch (_) {}
    } finally {
      setAnexando(false);
    }
  };

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      refChunks.current = [];
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) refChunks.current.push(ev.data); };
      const inicio = Date.now();
      rec.onstop = () => {
        const blob = new Blob(refChunks.current, { type: rec.mimeType || 'audio/webm' });
        const dur = Math.round((Date.now() - inicio) / 1000);
        stream.getTracks().forEach((tr) => tr.stop());
        // Voz estilo Siri (Theus 2026-07-28): parou de gravar → transcreve e executa.
        void transcreverEEnviar(blob, dur);
      };
      refRec.current = rec;
      rec.start();
      setGravando(true);
    } catch (_) {
      try { (window.useToast?.() || {}).show?.({ tipo:'erro', titulo:'Microfone', msg: 'Permita o uso do microfone no navegador.' }); } catch (__) {}
    }
  };

  const pararGravacao = () => {
    const rec = refRec.current;
    if (rec && rec.state === 'recording') rec.stop();
    setGravando(false);
  };

  const descartarAudio = () => { setAudioBlob(null); setAudioDur(0); };

  // Transcreve o áudio (edge transcrever-audio-mentor, Gemini multimodal) e envia
  // o texto como mensagem normal — o Mentor executa a tarefa falada. Se a
  // transcrição falhar, o áudio cai na pílula e segue o caminho antigo (link).
  const transcreverEEnviar = async (blob, dur) => {
    setTranscrevendo(true);
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      const passo = 0x8000;
      for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo));
      const base64 = btoa(bin);
      const formato = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'opus';
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data, error } = await sb.functions.invoke('transcrever-audio-mentor', {
        body: { audio_base64: base64, formato },
      });
      if (error || !data?.ok || !data?.texto) throw new Error(data?.erro || error?.message || 'transcrição vazia');
      setTranscrevendo(false);
      await send(String(data.texto));
    } catch (e) {
      setTranscrevendo(false);
      setAudioBlob(blob);
      setAudioDur(dur);
      try { (window.useToast?.() || {}).show?.({ tipo:'erro', titulo:'Voz', msg: `Não transcrevi (${e?.message ?? e}). Áudio ficou na barra pra enviar mesmo assim.` }); } catch (_) {}
    }
  };

  // Conversa real com cargo Mentor (edge `agente-mestre-chat`, Gemini 3 Pro).
  // Garante 1 row em `mentor_conversas` por sessão — a edge precisa de
  // conversa_id válido. Reusa última conversa do user; cria nova se não existir.
  const refConversaMentor = gUseRef(null);
  const refCargoTipologia = gUseRef(null); // 'admin' (super-admin) | 'mentor' — escopo do commandbar
  // Histórico persistente (2026-08-01): 1 conversa contínua "humana" — refresh
  // recarrega o que já foi falado; scroll/botão revela o passado.
  const refMaisAntiga = gUseRef(null); // criado_em da msg mais antiga já carregada
  const [temMaisHistorico, setTemMaisHistorico] = gUseState(false);
  const [carregandoHistorico, setCarregandoHistorico] = gUseState(false);
  const refFeed = gUseRef(null);

  const PAGINA_HISTORICO = 50;
  const msgDoBanco = (m) => ({
    id: m.id,
    from: m.papel === 'user' ? 'user' : 'mentor',
    bolhas: [String(m.conteudo ?? '')],
    ts: new Date(m.criado_em).getTime(),
    toolCalls: Array.isArray(m.tool_calls) ? m.tool_calls : [],
  });

  // Carrega as últimas N mensagens de uma thread e joga no feed. Usada pelo
  // init (última conversa) e pelo painel de histórico (conversa escolhida).
  const carregarMensagensDaConversa = async (conversaId) => {
    const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
    const { data: msgs } = await sb
      .from('mentor_mensagens')
      .select('id, papel, conteudo, criado_em, tool_calls')
      .eq('conversa_id', conversaId)
      .order('criado_em', { ascending: false })
      .limit(PAGINA_HISTORICO);
    const lote = Array.isArray(msgs) ? msgs : [];
    const cronologica = lote.slice().reverse();
    refMaisAntiga.current = cronologica[0]?.criado_em ?? null;
    setChat(cronologica.map(msgDoBanco));
    setTemMaisHistorico(lote.length === PAGINA_HISTORICO);
  };

  // Lista as threads do canal mentor, mais recente primeiro. Thread que ainda
  // está com o título padrão (nasceu antes desta tela) ganha como rótulo a
  // primeira pergunta feita nela.
  const carregarConversas = async () => {
    setCarregandoConversas(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { setConversas([]); return; }
      const { data: convs } = await sb
        .from('mentor_conversas')
        .select('id, titulo, atualizado_em, mentor_mensagens(count)')
        .eq('owner_id', uid)
        .eq('canal', 'mentor')
        .order('atualizado_em', { ascending: false })
        .limit(40);
      // Thread sem nenhuma mensagem não entra na lista: era ela que "não abria"
      // (clicava e o feed vinha vazio, porque vazio ela estava mesmo).
      // Se a contagem não vier (embed indisponível), mostra a thread do mesmo
      // jeito — melhor listar demais que esconder conversa real do dono.
      const lista = (convs ?? [])
        .filter((c) => !Array.isArray(c.mentor_mensagens) || (c.mentor_mensagens[0]?.count ?? 0) > 0)
        .map(({ mentor_mensagens: _ignorado, ...c }) => ({ ...c }));
      const semTitulo = lista.filter((c) => !c.titulo || c.titulo === TITULO_PADRAO_MENTOR);
      if (semTitulo.length > 0) {
        const { data: primeiras } = await sb
          .from('mentor_mensagens')
          .select('conversa_id, conteudo, criado_em')
          .in('conversa_id', semTitulo.map((c) => c.id))
          .eq('papel', 'user')
          .order('criado_em', { ascending: true })
          .limit(300);
        const primeiraDe = new Map();
        for (const m of primeiras ?? []) {
          if (!primeiraDe.has(m.conversa_id)) primeiraDe.set(m.conversa_id, m.conteudo);
        }
        for (const c of lista) {
          if (primeiraDe.has(c.id)) c.titulo = resumirPergunta(primeiraDe.get(c.id));
        }
      }
      setConversas(lista);
    } catch (e) {
      console.warn('[CommandBar] listar conversas falhou:', e?.message ?? e);
    } finally {
      setCarregandoConversas(false);
    }
  };

  const abrirConversa = async (conversaId) => {
    // Clicar na conversa já ativa recarrega em vez de só fechar o painel: com a
    // entrada limpa o feed começa vazio, e o atalho antigo fazia a thread ativa
    // parecer que "não abria".
    if (!conversaId) { setHistoricoAberto(false); return; }
    refConversaMentor.current = conversaId;
    refMaisAntiga.current = null;
    setConversaAtiva(conversaId);
    setHistoricoAberto(false);
    try {
      await carregarMensagensDaConversa(conversaId);
    } catch (e) {
      console.warn('[CommandBar] abrir conversa falhou:', e?.message ?? e);
    }
  };

  // Conversa nova = feed em branco. A thread só nasce no banco quando a
  // primeira mensagem sai (`send` cria) — antes disso ela seria só mais uma
  // linha vazia poluindo o painel.
  const novaConversa = () => {
    refConversaMentor.current = null;
    refMaisAntiga.current = null;
    setConversaAtiva(null);
    setChat([]);
    setTemMaisHistorico(false);
    setHistoricoAberto(false);
    inputRef.current?.focus();
  };

  // Entrada limpa (2026-08-11): o Mentor NÃO abre com a última conversa nem
  // cria thread no boot. A conversa nasce no primeiro envio (`send` já cuida
  // disso) — assim ninguém entra no OS com papo de ontem na cara, e paramos de
  // encher `mentor_conversas` de thread vazia que sujava o painel de histórico.
  // Conversa antiga continua a um clique de distância no painel.

  // Painel só busca a lista quando abre — nada de query em background.
  gUseEffect(() => {
    if (historicoAberto) void carregarConversas();
  }, [historicoAberto]);

  // Painel de conversas aberto só fecha por escolha (Theus 2026-09-18): ao
  // selecionar uma conversa, "nova conversa" ou o X. Antes saía por 5s de
  // ociosidade e descia junto com a barra quando o mouse saía da faixa — a
  // lista sumia antes de a pessoa clicar.

  // Janela nova abriu = o usuário foi trabalhar. Painel e barra saem da frente.
  const refJanelas = gUseRef(janelasAbertas);
  gUseEffect(() => {
    if (janelasAbertas > refJanelas.current) {
      setHistoricoAberto(false);
      setBarraEscondida(true);
    }
    refJanelas.current = janelasAbertas;
  }, [janelasAbertas]);

  // ── Barra oculta por padrão, revelada por proximidade (padrão do dock) ─────
  // Mouse na faixa de baixo da tela (ou sobre a própria barra/feed) traz o
  // Mentor; 5s sem interação e ele volta pra fora de cena. Nunca some no meio
  // de um trabalho: digitando, gravando, com anexo ou esperando resposta, fica.
  const refPodeSumir = gUseRef(true);
  refPodeSumir.current = !pensando && !gravando && !transcrevendo && !anexo && !menuMaisAberto && !historicoAberto && val.trim() === '';

  // O cursor manda (Theus 2026-08-11): a barra aparece quando o mouse entra no
  // ESPAÇO que ela ocupa (não no rodapé inteiro) e some assim que sai — salvo
  // trabalho em curso (texto digitado, gravando, pensando, anexo), que segura.
  gUseEffect(() => {
    const FAIXA = 120; // altura da zona sensível na base, em px
    const aoMover = (e) => {
      // Zona = retângulo da barra: base da tela E centro ± meia largura (+40px de folga).
      const meiaBarra = Math.min(720, window.innerWidth * 0.78) / 2 + 40;
      const naZona = e.clientY > window.innerHeight - FAIXA &&
        Math.abs(e.clientX - window.innerWidth / 2) < meiaBarra;
      const emCima = e.target?.closest?.('.cmd-arena, .cmd-feed-arena');
      if (naZona || emCima) {
        setBarraEscondida(false);
      } else if (refPodeSumir.current) {
        setBarraEscondida(true);
        setHistoricoAberto(false);
      }
    };
    document.addEventListener('mousemove', aoMover);
    return () => document.removeEventListener('mousemove', aoMover);
  }, []);

  // Ao sair de cena tira o foco do input — senão o usuário digitaria numa
  // barra invisível.
  gUseEffect(() => {
    if (barraEscondida && document.activeElement === inputRef.current) inputRef.current?.blur();
  }, [barraEscondida]);

  // Enquanto o Mentor pensa, o painel pulsa mais rápido e mais aceso; quando a
  // resposta chega, o pulso desacelera até parar em vez de cortar seco.
  const [acalmando, setAcalmando] = gUseState(false);
  const refPensavaAntes = gUseRef(false);
  gUseEffect(() => {
    if (refPensavaAntes.current && !pensando) {
      setAcalmando(true);
      const t = setTimeout(() => setAcalmando(false), 1600);
      refPensavaAntes.current = pensando;
      return () => clearTimeout(t);
    }
    refPensavaAntes.current = pensando;
  }, [pensando]);

  // Ordem humana: cima→baixo. Mensagem nova (ou "pensando") rola o feed pro fim.
  gUseEffect(() => {
    const el = refFeed.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, pensando]);

  // Puxa mais um lote antigo e mantém o olho na mesma mensagem (compensa o scroll).
  const verAnteriores = async () => {
    const conversaId = refConversaMentor.current;
    if (!conversaId || !refMaisAntiga.current || carregandoHistorico) return;
    setCarregandoHistorico(true);
    try {
      const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      const { data: msgs } = await sb
        .from('mentor_mensagens')
        .select('id, papel, conteudo, criado_em, tool_calls')
        .eq('conversa_id', conversaId)
        .lt('criado_em', refMaisAntiga.current)
        .order('criado_em', { ascending: false })
        .limit(PAGINA_HISTORICO);
      if (Array.isArray(msgs) && msgs.length > 0) {
        const cronologica = msgs.slice().reverse();
        refMaisAntiga.current = cronologica[0]?.criado_em ?? null;
        const el = refFeed.current;
        const alturaAntes = el ? el.scrollHeight : 0;
        setChat((c) => [...cronologica.map(msgDoBanco), ...c]);
        setTemMaisHistorico(msgs.length === PAGINA_HISTORICO);
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - alturaAntes;
        });
      } else {
        setTemMaisHistorico(false);
      }
    } catch (e) {
      console.warn('[CommandBar] carregar histórico falhou:', e?.message ?? e);
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const send = async (txt) => {
    const t = (txt ?? val).trim();
    const temAnexo = !!anexo;
    const temAudio = !!audioBlob;
    if (!t && !temAnexo && !temAudio) return;

    // A antecipação da pergunta foi removida em 2026-09-04 (Theus): o motor local
    // respondia na hora quando o léxico fechava a frase, e essa resposta nunca
    // chegava ao Mentor nem virava histórico. TODA pergunta agora vai pro Mentor.
    // Do motor sobrou só `normalizarTexto`, que corrige o que se digita na caixa.

    // Upload de áudio (se houver) — anexa link no corpo da mensagem.
    let urlAudio = null;
    if (temAudio) {
      try {
        const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
        const { data: sess } = await sb.auth.getSession();
        const userId = sess?.session?.user?.id;
        if (userId) {
          const ext = (audioBlob.type.includes('mp4') ? 'm4a' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm');
          const path = `${userId}/audio_${Date.now()}.${ext}`;
          const { error: upErr } = await sb.storage.from('mestre-anexos').upload(path, audioBlob, { contentType: audioBlob.type });
          if (!upErr) {
            const { data } = sb.storage.from('mestre-anexos').getPublicUrl(path);
            urlAudio = data?.publicUrl || null;
          }
        }
      } catch (_) {}
    }

    // Compor mensagem final pro Mentor: texto + texto extraído do anexo + URL áudio.
    const partesEnvio = [];
    if (t) partesEnvio.push(t);
    if (temAnexo) partesEnvio.push(`\n\n--- CONTEÚDO DO ARQUIVO ANEXADO (${anexo.nome}) ---\n${anexo.texto}`);
    if (urlAudio) partesEnvio.push(`\n\n[áudio gravado · ${audioDur}s · ${urlAudio}]`);
    const corpoFinal = partesEnvio.join('').trim() || '[anexo enviado]';

    // Bolha visual resumida pro histórico do user.
    const partesBolha = [];
    if (t) partesBolha.push(t);
    if (temAnexo) partesBolha.push(`📎 ${anexo.nome}`);
    if (urlAudio) partesBolha.push(`🎙️ áudio ${audioDur}s`);
    const bolhaTxt = partesBolha.join(' · ') || '(anexo)';

    setVal('');
    setAnexo(null);
    setAudioBlob(null);
    setAudioDur(0);

    const id = Date.now();
    setChat(c => [...c, { id, from:'user', bolhas:[bolhaTxt], ts:Date.now() }]);
    setPensando(true);

    // Declarados FORA do try pro catch (resgate de resposta atrasada) conseguir
    // acessá-los. Antes eram const/let DENTRO do try → o catch caía em
    // ReferenceError (sb/conversaId/enviadoEm fora de escopo) e a resposta que o
    // motor gravou depois nunca era recuperada.
    let sb = null;
    let conversaId = refConversaMentor.current;
    let enviadoEm = null;

    try {
      sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
      conversaId = refConversaMentor.current;
      // Defesa: se o init não rolou, tenta criar agora antes de chamar a edge.
      if (!conversaId) {
        const { data: sess } = await sb.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid) throw new Error('Faça login pra falar com o Mentor.');
        const { data: nova, error: errIns } = await sb
          .from('mentor_conversas')
          .insert({ owner_id: uid })
          .select('id')
          .single();
        if (errIns) throw errIns;
        conversaId = nova.id;
        refConversaMentor.current = conversaId;
        setConversaAtiva(conversaId);
      }

      // Batismo da thread: a 1ª pergunta vira o título que aparece no painel.
      // O filtro pelo título padrão faz o update valer só uma vez por conversa
      // — sem precisar saber, aqui, se ela já foi batizada.
      if (t) {
        const apelido = resumirPergunta(t);
        void sb
          .from('mentor_conversas')
          .update({ titulo: apelido })
          .eq('id', conversaId)
          .eq('titulo', TITULO_PADRAO_MENTOR)
          .then(({ error }) => {
            if (error) return;
            setConversas((c) => c.map((x) => (
              x.id === conversaId && (!x.titulo || x.titulo === TITULO_PADRAO_MENTOR)
                ? { ...x, titulo: apelido }
                : x
            )));
          });
      }

      // Via rápida do histórico (Dominic, 2026-08-25): antes do motor pesado,
      // tenta responder em ~1-2s usando SÓ o histórico de conversas do Mentor
      // (edge mentor-resposta-rapida — 1 chamada LLM leve, sem RAG, base =
      // conversa atual + trechos das outras threads do user). Contrato honesto:
      // fora_do_escopo=true → nada foi gravado, segue pro motor profundo
      // (RAG/pesquisa) exatamente como hoje. Desligável com
      // VITE_COMMANDBAR_HISTORICO_RAPIDO='false'.
      const USAR_HISTORICO_RAPIDO = import.meta.env.VITE_COMMANDBAR_HISTORICO_RAPIDO !== 'false';
      if (USAR_HISTORICO_RAPIDO && t && !temAnexo && !temAudio) {
        try {
          const { data: rapida, error: errRapida } = await sb.functions.invoke('mentor-resposta-rapida', {
            body: { conversa_id: conversaId, mensagem: corpoFinal },
          });
          if (!errRapida && rapida?.ok && !rapida.fora_do_escopo && rapida.mensagem) {
            setChat(c => [
              ...c,
              {
                id: id + 1,
                from: 'mentor',
                // Sem rodapé técnico (Dominic 2026-08-25): o chat é uma conversa.
                bolhas: [String(rapida.mensagem).trim()],
                ts: Date.now(),
              },
            ]);
            return; // pensando desliga no finally
          }
        } catch (eRapida) {
          // Qualquer falha da via rápida é silenciosa: o motor profundo assume.
          console.warn('[CommandBar] via rápida do histórico falhou, seguindo pro motor:', eRapida?.message ?? eRapida);
        }
      }

      // Fusão C1 · Fase 3c.4 — flag de repontamento do commandbar pro motor único.
      // Default OFF (env ausente/'false') = agente-mestre-chat, idêntico ao atual.
      // ON ('true', setado no build/Vercel só na 3d após webtest) = motor único
      // ragentic-processar-inline (JWT do user via invoke; SEM cargo_tipologia —
      // nível resolvido server-side por profiles.system_role, D1).
      // Marca do envio: se a chamada cair por tempo, é por aqui que a gente
      // reconhece a resposta que o motor gravou depois (ver catch abaixo).
      // Atribuição (sem `const`): declarado fora do try pro catch enxergar.
      enviadoEm = new Date().toISOString();

      const USAR_MOTOR_UNICO = import.meta.env.VITE_COMMANDBAR_MOTOR_UNICO === 'true';

      // Cargo do commandbar por escopo: super-admin → cargo 'admin'; demais → 'mentor'.
      // Resolvido 1x por sessão do componente (ref) pra não bater no banco a cada mensagem.
      // Só no caminho legado — no motor único o nível vem server-side (sem query morta).
      if (!USAR_MOTOR_UNICO && refCargoTipologia.current === null) {
        try {
          const { data: sessP } = await sb.auth.getSession();
          const uidP = sessP?.session?.user?.id;
          // Super-admin = profiles.system_role === 'platform_admin' (mesmo critério da edge).
          let systemRole = null;
          if (uidP) {
            const { data: perfil } = await sb
              .from('profiles')
              .select('system_role')
              .eq('id', uidP)
              .maybeSingle();
            systemRole = perfil?.system_role ?? null;
          }
          refCargoTipologia.current = systemRole === 'platform_admin' ? 'admin' : 'mentor';
        } catch {
          refCargoTipologia.current = 'mentor';
        }
      }

      const { data: resp, error: errInv } = USAR_MOTOR_UNICO
        ? await sb.functions.invoke('ragentic-processar-inline', {
            body: { conversa_id: conversaId, mensagem: corpoFinal },
          })
        : await sb.functions.invoke('agente-mestre-chat', {
            body: { conversa_id: conversaId, mensagem: corpoFinal, cargo_tipologia: refCargoTipologia.current },
          });
      if (errInv) throw errInv;
      if (!resp?.ok) throw new Error(resp?.error ?? 'Falha ao falar com Mentor');

      const respostaTexto = String(resp.mensagem ?? '').trim() || '…';
      const toolCalls = Array.isArray(resp.tool_calls) ? resp.tool_calls : [];
      const genUis = extrairGenUis(toolCalls);

      setChat(c => [
        ...c,
        { id: id + 1, from:'mentor', bolhas:[respostaTexto], toolCalls, genUis, ts:Date.now() },
      ]);

      // Honra tool_calls visuais: `abrir_app_os` / `abrir_app` abrem app no Desktop OS.
      for (const tc of toolCalls) {
        if (!tc?.nome) continue;
        if (tc.nome === 'abrir_app_os' && tc.args?.slug) {
          setTimeout(() => onAbrirApp(String(tc.args.slug)), 500);
        } else if (tc.nome === 'abrir_app' && tc.args?.app_id) {
          setTimeout(() => onAbrirApp(String(tc.args.app_id)), 500);
        }
      }
    } catch (e) {
      // Turno longo (já vimos 121s no motor) derruba a chamada HTTP muito
      // antes do processamento acabar — mas o motor GRAVA a resposta em
      // mentor_mensagens de qualquer jeito. Antes de acusar erro, espera a
      // resposta aparecer no banco: o que era "erro" vira resposta atrasada.
      // Só tenta resgatar se o envio chegou a acontecer (sb/conversaId/enviadoEm
      // definidos). Erro cedo (antes de invocar o motor) não gravou nada.
      const resgatada = (sb && conversaId && enviadoEm)
        ? await resgatarRespostaAtrasada(sb, conversaId, enviadoEm)
        : null;
      if (resgatada) {
        const toolCallsResgatados = Array.isArray(resgatada.tool_calls) ? resgatada.tool_calls : [];
        setChat(c => [
          ...c,
          {
            id: id + 1,
            from: 'mentor',
            bolhas: [String(resgatada.conteudo ?? '').trim() || '…'],
            toolCalls: toolCallsResgatados,
            genUis: extrairGenUis(toolCallsResgatados),
            ts: Date.now(),
          },
        ]);
      } else {
        const msg = e?.message ?? String(e);
        setChat(c => [
          ...c,
          { id: id + 1, from:'mentor', bolhas:[`Não consegui falar com o Mentor agora. (${msg})`], ts:Date.now() },
        ]);
      }
    } finally {
      setPensando(false);
    }
  };

  const submit = (e) => { e?.preventDefault(); send(val); };
  const limpar = () => setChat([]);

  // Cardápio "/": filtra os comandos pelo que vier depois da barra ("/lea" → leads).
  const filtroComando = val.startsWith('/') ? val.slice(1).toLowerCase() : null;
  const comandosVisiveis = filtroComando === null ? [] : COMANDOS_BARRA.filter(
    (c) => (c.atalho + ' ' + c.rotulo).toLowerCase().includes(filtroComando),
  );
  const escolherComando = (c) => {
    setVal(c.prompt);
    inputRef.current?.focus();
  };

  return (
    <>
    {/* Feed do chat em container próprio (z 90): fica ATRÁS das janelas (z 101+),
        enquanto a barra de digitar segue na frente (z 180). Pedido Theus 2026-07-10. */}
    <div className={`cmd-feed-arena${barraEscondida ? ' is-escondida' : ''}`}>
      {/* Histórico do chat com o Mentor — persistente (mentor_mensagens), cima→baixo. */}
      {chat.length > 0 && (
        <div className="cmd-results scroll" ref={refFeed}>
          {temMaisHistorico && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ alignSelf: 'center', fontSize: 11, opacity: 0.75 }}
              disabled={carregandoHistorico}
              onClick={verAnteriores}
            >
              {carregandoHistorico ? 'Carregando…' : '↑ Ver conversas anteriores'}
            </button>
          )}
          {chat.map((m, idx) => {
            const grupoNovo = chat[idx - 1]?.from !== m.from;
            const fimGrupo = chat[idx + 1]?.from !== m.from;
            const chips = m.from === 'mentor'
              ? (m.toolCalls ?? []).filter((tc) => {
                  const nome = tc?.nome ?? tc?.toolName;
                  if (!nome || nome === 'abrir_app_os' || nome === 'abrir_app') return false;
                  // Tool que virou widget Gen UI não ganha chip — o widget já conta a história.
                  if (typeof tc?.resultado === 'string') {
                    try { if (JSON.parse(tc.resultado)?.dados?.tipo) return false; } catch { /* não-JSON */ }
                  }
                  return true;
                })
              : [];
            return (
              <div key={m.id} className={`cmd-msg ${m.from}${grupoNovo ? ' inicio-grupo' : ''}`}>
                {m.from === 'mentor' && grupoNovo && (
                  <span className="cmd-autor"><span className="cmd-autor-dot" aria-hidden="true"></span>Mentor</span>
                )}
                {chips.length > 0 && (
                  <div className="cmd-tools">
                    {chips.map((tc, i) => {
                      const falhou = typeof tc.resultado === 'string' && tc.resultado.trim().startsWith('✗');
                      return (
                        <span key={i} className={`cmd-tool-chip${falhou ? ' falhou' : ''}`}>
                          {falhou ? '✗' : '✓'} {String(tc.nome ?? tc.toolName).replace(/_/g, ' ')}
                        </span>
                      );
                    })}
                  </div>
                )}
                {m.bolhas?.map((b, i) => {
                  const chaveCopia = `${m.id}-${i}`;
                  return (
                    <div key={i} className={`cmd-bolha-wrap${m.from === 'user' ? ' is-out' : ''}`}>
                      <div className={m.from === 'user' ? 'bolha-out' : 'bolha-in'} style={{ animationDelay:`${i*70}ms` }}>
                        {m.from === 'mentor' ? <TextoFormatado texto={b} /> : b}
                      </div>
                      <button
                        type="button"
                        className={`cmd-copiar${copiadoKey === chaveCopia ? ' is-copiado' : ''}`}
                        title="Copiar mensagem"
                        aria-label="Copiar mensagem"
                        onClick={() => copiarBolha(chaveCopia, b)}
                      >
                        <Icon name={copiadoKey === chaveCopia ? 'check' : 'copy'} size={12} />
                      </button>
                    </div>
                  );
                })}
                {m.from === 'mentor' && Array.isArray(m.genUis) && m.genUis.length > 0 && (
                  <div className="bolha-in" style={{ animationDelay:'140ms', maxWidth: 520 }}>
                    {m.genUis.map((g, i) => (
                      <GenUiResultadoModular key={i} tipo={g.tipo} dados={g.dados} mensagem={g.mensagem} onAbrirApp={onAbrirApp} onResponder={send} />
                    ))}
                  </div>
                )}
                {fimGrupo && m.ts ? (
                  <span className="cmd-hora">{new Date(m.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                ) : null}
              </div>
            );
          })}
          {pensando && (
            <div className="cmd-msg mentor inicio-grupo">
              <span className="cmd-autor"><span className="cmd-autor-dot" aria-hidden="true"></span>Mentor</span>
              <div className="bolha-in cmd-pensando" role="status">
                <span className="thinking-dot"></span>
                <span className="thinking-dot" style={{ animationDelay:'180ms' }}></span>
                <span className="thinking-dot" style={{ animationDelay:'360ms' }}></span>
                <span key={frasePensando} className="cmd-pensando-frase">
                  {['Pensando…', 'Consultando o sistema…', 'Executando ações — tarefas maiores levam um pouco mais…'][frasePensando]}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>

    <div className={`cmd-arena${barraEscondida ? ' is-escondida' : ''}`}>
      {/* Painel das conversas: cada thread pelo nome da 1ª pergunta feita nela.
          Mora na arena da barra (z 180) — janela aberta não cobre o clique. */}
      {/* Faixa invisível ao lado da barra: encostou o mouse, o painel abre.
          Fica aqui e não na borda da tela pra não disputar espaço com o dock. */}
      <div
        className="cmd-historico-zona"
        aria-hidden
        onMouseEnter={() => setHistoricoAberto(true)}
      />
      {historicoAberto && (
        <div
          className={`cmd-historico${pensando ? ' is-pensando' : ''}${acalmando ? ' is-acalmando' : ''}`}
          role="dialog"
          aria-label="Conversas com o Mentor"
        >
          <div className="cmd-historico-cabecalho">
            <span>Conversas</span>
            <button
              type="button"
              className="cmd-historico-fechar"
              onClick={() => setHistoricoAberto(false)}
              aria-label="Fechar conversas"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
          <button type="button" className="cmd-historico-nova" onClick={novaConversa}>
            <Icon name="plus" size={13} /> Nova conversa
          </button>
          <div className="cmd-historico-lista scroll">
            {carregandoConversas && conversas.length === 0 && (
              <div className="cmd-historico-vazio">Carregando…</div>
            )}
            {!carregandoConversas && conversas.length === 0 && (
              <div className="cmd-historico-vazio">
                Nada pesquisado ainda. Pergunta alguma coisa na barra que ela fica guardada aqui.
              </div>
            )}
            {conversas.map((c, i) => {
              const grupo = grupoDoDia(c.atualizado_em);
              const abreGrupo = i === 0 || grupo !== grupoDoDia(conversas[i - 1].atualizado_em);
              const semPergunta = !c.titulo || c.titulo === TITULO_PADRAO_MENTOR;
              const rotulo = semPergunta ? 'Conversa nova' : c.titulo;
              return (
                <Fragment key={c.id}>
                  {abreGrupo && <div className="cmd-historico-dia">{grupo}</div>}
                  <button
                    type="button"
                    className={`cmd-historico-item${c.id === conversaAtiva ? ' is-ativa' : ''}${semPergunta ? ' is-vazia' : ''}`}
                    onClick={() => abrirConversa(c.id)}
                    title={rotulo}
                  >
                    <span className="cmd-historico-item-texto">{rotulo}</span>
                    <span className="cmd-historico-item-hora">
                      {new Date(c.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
      {/* Cardápio "/" — clique preenche o input com o prompt pronto (não envia sozinho). */}
      {comandosVisiveis.length > 0 && (
        <div className="cmd-comandos" role="listbox" aria-label="Comandos disponíveis">
          <div className="cmd-comandos-cabecalho">
            <span>Comandos</span>
            <span className="muted tiny">{comandosVisiveis.length} disponíve{comandosVisiveis.length > 1 ? 'is' : 'l'}</span>
          </div>
          <div className="cmd-comandos-lista scroll">
            {comandosVisiveis.map((c) => (
              <button
                key={c.atalho}
                type="button"
                role="option"
                aria-selected={false}
                className="cmd-comando-item"
                onClick={() => escolherComando(c)}
              >
                <span className="cmd-comando-icone" aria-hidden="true">
                  <Icon name={c.icone} size={15} />
                </span>
                <span className="cmd-comando-textos">
                  <span className="cmd-comando-rotulo">{c.rotulo}</span>
                  <span className="cmd-comando-descricao">{c.prompt}</span>
                </span>
                <kbd className="cmd-comando-atalho">{c.atalho}</kbd>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pílulas de anexo/áudio prontos */}
      {(anexo || audioBlob || transcrevendo) && (
        <div className="row gap-2" style={{ marginBottom: 8, flexWrap:'wrap', justifyContent:'center' }}>
          {anexo && (
            <div className="os-vidro row gap-2" style={{ padding:'6px 10px', alignItems:'center', fontSize:11 }}>
              <Icon name="paperclip" size={12} stroke="var(--txt-3)"/>
              <span style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={anexo.nome}>{anexo.nome}</span>
              <span className="muted tiny">{anexo.caracteres.toLocaleString('pt-BR')} chars</span>
              <button type="button" className="btn btn-ghost btn-icon" title="Remover anexo" onClick={() => setAnexo(null)}>
                <Icon name="x" size={11}/>
              </button>
            </div>
          )}
          {transcrevendo && (
            <div className="os-vidro row gap-2" style={{ padding:'6px 10px', alignItems:'center', fontSize:11 }}>
              <Icon name="mic" size={12} stroke="oklch(0.72 0.20 30)"/>
              <span>Transcrevendo o áudio…</span>
            </div>
          )}
          {audioBlob && (
            <div className="os-vidro row gap-2" style={{ padding:'6px 10px', alignItems:'center', fontSize:11 }}>
              <Icon name="mic" size={12} stroke="oklch(0.72 0.20 30)"/>
              <span>Áudio · {audioDur}s</span>
              <audio controls src={URL.createObjectURL(audioBlob)} style={{ height: 24 }} />
              <button type="button" className="btn btn-ghost btn-icon" title="Descartar áudio" onClick={descartarAudio}>
                <Icon name="x" size={11}/>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Menu "+" — glass compacto (estilo Claude): as 3 ações antigas da
          barra num popover só. Vive FORA do form: .cmd-shell tem
          overflow:hidden (anel de energia) e clipava o menu — dentro da
          .cmd-arena ele escapa do clip e o hover nele conta como "em cima
          da barra" (não some). Fecha em Escape/clique fora/barra escondida. */}
      {menuMaisAberto && (
        <div className="cmd-mais-menu" role="menu" aria-label="Ações do chat" ref={refMenuMais}>
          <button type="button" role="menuitem" className="cmd-mais-item"
            onClick={() => { setMenuMaisAberto(false); setHistoricoAberto(true); }}>
            <span className="cmd-mais-chip is-historico"><Icon name="clock" size={15} /></span>
            <span className="cmd-mais-textos">
              <span className="cmd-mais-rotulo">Conversas anteriores</span>
              <span className="cmd-mais-descricao">Suas threads com o Mentor</span>
            </span>
            <span className="cmd-mais-seta" aria-hidden="true">›</span>
          </button>
          <button type="button" role="menuitem" className="cmd-mais-item"
            onClick={() => { setMenuMaisAberto(false); iniciarGravacao(); }}>
            <span className="cmd-mais-chip is-audio"><Icon name="mic" size={15} /></span>
            <span className="cmd-mais-textos">
              <span className="cmd-mais-rotulo">Gravar áudio</span>
              <span className="cmd-mais-descricao">Fala transcrita e enviada</span>
            </span>
            <span className="cmd-mais-seta" aria-hidden="true">›</span>
          </button>
          <button type="button" role="menuitem" className="cmd-mais-item"
            disabled={anexando}
            onClick={() => { setMenuMaisAberto(false); escolherArquivo(); }}>
            <span className="cmd-mais-chip is-anexo"><Icon name={anexando ? 'loader' : 'paperclip'} size={15} /></span>
            <span className="cmd-mais-textos">
              <span className="cmd-mais-rotulo">{anexo ? 'Trocar arquivo' : 'Anexar arquivo'}</span>
              <span className="cmd-mais-descricao">PDF, DOCX, imagem · até 8MB</span>
            </span>
            <span className="cmd-mais-seta" aria-hidden="true">›</span>
          </button>
          <span className="cmd-mais-caret" aria-hidden="true" />
        </div>
      )}

      <form onSubmit={submit} className="cmd-shell">
        <div className="cmd-inner">
          <input ref={refFile} type="file" accept=".txt,.md,.pdf,.docx,.png,.jpg,.jpeg,.webp,.heic,.gif" style={{ display:'none' }} onChange={onArquivoSelecionado} />
          <button
            type="button"
            className={`cmd-action cmd-mais-botao${gravando ? ' is-recording' : menuMaisAberto ? ' is-on is-menu-aberto' : anexo || anexando ? ' is-on' : ''}`}
            title={gravando ? 'Parar gravação' : 'Mais ações'}
            aria-label={gravando ? 'Parar gravação' : 'Mais ações'}
            aria-expanded={menuMaisAberto}
            aria-haspopup="menu"
            onClick={gravando ? pararGravacao : () => setMenuMaisAberto((v) => !v)}
          >
            <Icon name={gravando ? 'square' : 'plus'} size={16} />
          </button>
          <input ref={inputRef} placeholder=""
                 value={val} onChange={(e) => setVal(normalizarTexto(e.target.value).texto)} />
          {chat.length > 0 && (
            <button type="button" className="cmd-clear" onClick={limpar} title="Limpar">
              <Icon name="x" size={14} />
            </button>
          )}
          {/* Sem botão de enviar (Theus 2026-08-11): Enter no input dispara o
              submit do form — áudio e anexo também saem por Enter. */}
        </div>
      </form>
    </div>

    </>
  );
}

function construirResposta(d, txt, onAbrirApp) {
  const DATA = window.RAGENTIC_DATA;
  switch (d.tipo) {
    case 'lista_leads': return {
      bolhas: [`Encontrei ${DATA.LEADS.filter(l => l.hot).length} leads quentes esperando você.`],
      widget: { tipo:'lista_leads', leads: DATA.LEADS.filter(l => l.hot) },
    };
    case 'grupo_kpis': return {
      bolhas: ['Os KPIs principais desta semana:'],
      widget: { tipo:'grupo_kpis', kpis: [
        { l:'Conversas', v: 234, trend:+12 },
        { l:'Leads quentes', v: 18, trend:+8 },
        { l:'Tx. conversão', v:'14.2%', trend:+2 },
        { l:'Ticket médio', v:'R$ 2.180', trend:+12 },
      ]},
    };
    case 'funil': return {
      bolhas:['Funil dos seus agentes nas últimas semanas:'],
      widget: { tipo:'funil', fases: [['Atendendo',312,100],['Qualificação',184,59],['Negociação',96,31],['Fechamento',38,12]] },
    };
    case 'grafico': return {
      bolhas:['Receita projetada para o mês:'],
      widget: { tipo:'grafico', dados:[12,18,24,21,28,32,38,44,52,58], titulo:'Receita projetada' },
    };
    case 'pedidos': return {
      bolhas: [`${DATA.PEDIDOS.length} pedidos esperando sua aprovação. Total: R$ ${DATA.PEDIDOS.reduce((s,p)=>s+p.valor,0).toLocaleString('pt-BR')}`],
      widget: { tipo:'pedidos', pedidos: DATA.PEDIDOS.slice(0,3) },
    };
    case 'top_tenants': return {
      bolhas:['Tenants com maior consumo este mês:'],
      widget: { tipo:'top_tenants', items: DATA.TENANTS.sort((a,b)=>b.tokens-a.tokens).slice(0,4) },
    };
    case 'saude_agentes': return {
      bolhas:['Status do motor Ragentic v6:'],
      widget: { tipo:'saude' },
    };
    case 'custo_tokens': return {
      bolhas:['Custo de tokens consumidos hoje:'],
      widget: { tipo:'grafico', dados:[42,56,78,64,88,72,94], titulo:'Custo · últimos 7 dias' },
    };
    case 'acao_os': return {
      bolhas:[`Abrindo ${d.payload}…`],
      widget: { tipo:'acao_os', payload: d.payload },
    };
    default: return {
      bolhas:['Boa pergunta — vou ter que pensar nessa.', 'Tente: leads quentes · KPIs · funil · receita · abrir atendimento.'],
    };
  }
}

function MentorWidgetInline({ w, onAbrirApp }) {
  const DATA = window.RAGENTIC_DATA;

  if (w.tipo === 'lista_leads') return (
    <div className="genui-card" style={{ width: 480 }}>
      <div className="row" style={{ justifyContent:'space-between', marginBottom: 8 }}>
        <div className="title-section">{w.leads.length} leads quentes</div>
        <button className="genui-link" onClick={() => onAbrirApp('atendimento')}>Ver todos <Icon name="arrowRight" size={11}/></button>
      </div>
      <div className="col gap-1">
        {w.leads.map(l => (
          <div key={l.id} className="genui-row" onClick={() => onAbrirApp('atendimento')}>
            <div className="avatar" style={{ background: l.cor, width: 26, height: 26, fontSize: 10 }}>{l.avatar}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row gap-2">
                <span style={{ fontWeight: 600, fontSize: 12 }}>{l.nome}</span>
                <span className="badge badge-err" style={{ fontSize: 9, padding:'1px 5px' }}>🔥 {l.score}</span>
              </div>
              <div className="muted tiny" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.preview}</div>
            </div>
            <Icon name="arrowRight" size={12} stroke="var(--txt-4)" />
          </div>
        ))}
      </div>
    </div>
  );

  if (w.tipo === 'grupo_kpis') return (
    <div className="row gap-2" style={{ flexWrap:'wrap', maxWidth: 480 }}>
      {w.kpis.map((k, i) => (
        <div key={i} className="genui-card" style={{ flex:1, minWidth: 110, padding: 12 }}>
          <div className="muted tiny">{k.l}</div>
          <div className="kpi-num os-aurora-text" style={{ fontSize: 22, marginTop: 2 }}>{k.v}</div>
          <span className={`badge ${k.trend > 0 ? 'badge-success' : 'badge-err'}`} style={{ fontSize: 9 }}>
            <Icon name={k.trend > 0 ? 'trending' : 'trendingDown'} size={9}/> {k.trend > 0 ? '+' : ''}{k.trend}%
          </span>
        </div>
      ))}
    </div>
  );

  if (w.tipo === 'funil') return (
    <div className="genui-card" style={{ width: 440 }}>
      <div className="title-section" style={{ marginBottom: 10 }}>Funil — últimos 30 dias</div>
      <div className="col gap-2">
        {w.fases.map(([l, n, p]) => (
          <div key={l}>
            <div className="row" style={{ justifyContent:'space-between' }}>
              <span className="small">{l}</span>
              <span className="mono small">{n} <span className="muted">· {p}%</span></span>
            </div>
            <div className="progress" style={{ marginTop: 4 }}><div style={{ width: `${p}%` }}></div></div>
          </div>
        ))}
      </div>
    </div>
  );

  if (w.tipo === 'grafico') return (
    <div className="genui-card" style={{ width: 440 }}>
      <div className="title-section" style={{ marginBottom: 6 }}>{w.titulo}</div>
      <MiniChart data={w.dados} height={100} />
    </div>
  );

  if (w.tipo === 'pedidos') return (
    <div className="genui-card" style={{ width: 480 }}>
      <div className="row" style={{ justifyContent:'space-between', marginBottom: 8 }}>
        <div className="title-section">{w.pedidos.length} pedidos aguardando</div>
        <button className="genui-link" onClick={() => onAbrirApp('financeiro')}>Aprovar <Icon name="arrowRight" size={11}/></button>
      </div>
      <div className="col gap-1">
        {w.pedidos.map(p => (
          <div key={p.id} className="genui-row" onClick={() => onAbrirApp('financeiro')}>
            <div className="avatar" style={{ background: p.cor, width: 24, height: 24, fontSize: 9 }}>{p.avatar}</div>
            <div style={{ flex:1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{p.tenant}</div>
              <div className="muted tiny">{p.item}</div>
            </div>
            <div className="mono small">R$ {p.valor.toLocaleString('pt-BR')}</div>
          </div>
        ))}
      </div>
    </div>
  );

  if (w.tipo === 'top_tenants') return (
    <div className="genui-card" style={{ width: 440 }}>
      <div className="title-section" style={{ marginBottom: 8 }}>Top tenants por consumo</div>
      <div className="col gap-1">
        {w.items.map((t, i) => (
          <div key={t.id} className="genui-row" onClick={() => onAbrirApp('tenants')}>
            <span className="dim mono" style={{ width: 14 }}>{i+1}</span>
            <div className="avatar" style={{ background:'#5b8bea', width: 24, height: 24, fontSize: 9 }}>{t.avatar}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{t.nome}</div>
              <div className="muted tiny">{t.plano}</div>
            </div>
            <div className="mono small">{t.tokens.toLocaleString('pt-BR')} tok</div>
          </div>
        ))}
      </div>
    </div>
  );

  if (w.tipo === 'saude') return (
    <div className="genui-card" style={{ width: 440 }}>
      <div className="title-section" style={{ marginBottom: 10 }}>Motor Ragentic v6</div>
      <div className="col gap-2">
        {[
          { l:'Porteiro (gemma-3-27b)', s:'on', v:'91% acurácia' },
          { l:'Síntese (gemini-2.5-flash)', s:'on', v:'P95 1.2s' },
          { l:'Z-API webhook', s:'on', v:'0 falhas' },
          { l:'Embedding queue', s:'warn', v:'fila 124' },
        ].map(r => (
          <div key={r.l} className="row gap-2">
            <span className={`dot dot-${r.s}`}></span>
            <span className="flex-1 small">{r.l}</span>
            <span className="muted tiny mono">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (w.tipo === 'acao_os') return (
    <div className="genui-card row gap-2" style={{ width: 'fit-content', padding: 10 }}>
      <Icon name="zap" size={14} stroke="var(--os-acento-1)" />
      <span className="small">Abrindo <strong>{w.payload}</strong>…</span>
    </div>
  );

  return null;
}

/* ============== Stream de cérebro (canto superior direito) ============== */
function CerebroStream({ side }) {
  const [eventos, setEventos] = gUseState([]);
  const [escondido, setEscondido] = gUseState(false);

  gUseEffect(() => {
    const samples = [
      { tipo:'porteiro', txt:'classificou intenção · cobrança', cargo:'financeiro', conf:0.91 },
      { tipo:'sintese', txt:'gerou 2 bolhas + chamou tool', cargo:'vendedor', conf:0.87 },
      { tipo:'porteiro', txt:'classificou intenção · dúvida_produto', cargo:'vendedor', conf:0.83 },
      { tipo:'ferramenta', txt:'enviar_link_pix · ok', cargo:'financeiro' },
      { tipo:'sintese', txt:'recuperou 3 blocos', cargo:'mentor', conf:0.79 },
      { tipo:'porteiro', txt:'classificou intenção · objeção_preço', cargo:'negociacao', conf:0.76 },
      { tipo:'webhook', txt:'Z-API · mensagem recebida', cargo:'porteiro' },
      { tipo:'realtime', txt:'novo lead · Atendimento', cargo:'porteiro' },
      { tipo:'sintese', txt:'finalizou turno · 4 bolhas', cargo:'vendedor', conf:0.88 },
    ];
    let i = 0;
    const tick = () => {
      const s = samples[i % samples.length];
      i++;
      const ev = { ...s, id: Date.now() + Math.random() };
      setEventos(es => [ev, ...es].slice(0, 4));
    };
    tick();
    const id = setInterval(tick, 3800);
    return () => clearInterval(id);
  }, []);

  if (escondido) return null;
  return (
    <div className="cerebro-stream">
      <div className="cerebro-head">
        <span className="dot dot-on pulse" style={{ width: 6, height: 6 }}></span>
        <span className="muted tiny" style={{ letterSpacing:'0.10em', textTransform:'uppercase', fontWeight: 600 }}>Cérebro do OS · ao vivo</span>
        <span className="flex-1"></span>
        <button className="cerebro-hide" onClick={() => setEscondido(true)} title="Esconder"><Icon name="x" size={11}/></button>
      </div>
      <div className="col gap-1" style={{ marginTop: 6 }}>
        {eventos.map((e, i) => (
          <div key={e.id} className={`cerebro-evento cerebro-${e.tipo}`} style={{ opacity: 1 - i * 0.12 }}>
            <span className="cerebro-tipo">{e.tipo}</span>
            <span className="small" style={{ flex: 1, minWidth: 0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.txt}</span>
            {e.cargo && <span className="muted tiny mono" style={{ flexShrink: 0 }}>→ {e.cargo.split('→').pop().trim()}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============== Cursor glow ============== */
function CursorGlow() {
  const ref = gUseRef();
  gUseEffect(() => {
    const h = (e) => {
      if (!ref.current) return;
      ref.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    document.addEventListener('pointermove', h);
    return () => document.removeEventListener('pointermove', h);
  }, []);
  return <div ref={ref} className="cursor-glow"></div>;
}

window.CommandBarInteligente = CommandBarInteligente;
window.CerebroStream = CerebroStream;
window.CursorGlow = CursorGlow;

/* ==================================================================== */
/* === widgets.jsx === */
/* ==================================================================== */
const { useState: wUseState, useEffect: wUseEffect, useRef: wUseRef } = React;

/* ============== Desktop Widgets ==============
   Cada widget metadata: id, titulo, descricao, defaultPos, width, preview(), Body
   Body = conteúdo INTERIOR (sem posição). O wrapper DraggableWidget cuida do drag.
================================================ */

/* Previews (no Launchpad) */
function WidgetReloginhoPreview() {
  return (
    <div style={{ textAlign:'center', color:'white' }}>
      <div className="kpi-num" style={{ fontSize: 32, lineHeight: 1 }}>09:42</div>
      <div className="tiny" style={{ opacity: 0.8, marginTop: 4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Qua, 13 mai</div>
    </div>
  );
}
function WidgetKpisPreview() {
  return (
    <div style={{ display:'flex', gap: 10, color:'white' }}>
      {[['•','falaram hoje'],['🔥','quentes'],['%','conv. mês']].map(([v,l], i) => (
        <div key={i} style={{ background:'rgba(0,0,0,0.25)', borderRadius: 8, padding:'8px 10px', textAlign:'center' }}>
          <div className="kpi-num" style={{ fontSize: 16, lineHeight: 1 }}>{v}</div>
          <div className="tiny" style={{ opacity: 0.7, marginTop: 2 }}>{l}</div>
        </div>
      ))}
    </div>
  );
}
function WidgetAgendaPreview() {
  return (
    <div style={{ color:'white', width: '100%' }}>
      <div className="tiny" style={{ opacity: 0.8, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom: 6 }}>Próximo evento</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Eventos e compromissos</div>
      <div className="tiny mono" style={{ opacity: 0.8, marginTop: 4 }}>da sua agenda, ao vivo</div>
    </div>
  );
}

/* Live bodies (no desktop) */
function WidgetReloginhoBody() {
  const [now, setNow] = wUseState(new Date());
  wUseEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hm = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ss = now.toLocaleTimeString('pt-BR', { second: '2-digit' });
  const dm = now.toLocaleDateString('pt-BR', { weekday: 'short', day:'2-digit', month: 'short' });
  return (
    <div style={{ textAlign:'center' }}>
      <div className="title-section" style={{ marginBottom: 8 }}>Relógio</div>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'center', gap: 4 }}>
        <div className="kpi-num os-aurora-text" style={{ fontSize: 48, lineHeight: 1 }}>{hm}</div>
        <div className="muted mono" style={{ fontSize: 16 }}>:{ss}</div>
      </div>
      <div className="muted small" style={{ marginTop: 8, textTransform:'capitalize' }}>{dm}</div>
    </div>
  );
}

// KPIs e Agenda: corpos vivos em @/os/widgets/WidgetsVivos (dados do tenant).
// Os antigos eram números fixos de exemplo.

function WidgetAppsRecentesPreview() {
  return (
    <div style={{ color:'white', width:'100%' }}>
      <div className="tiny" style={{ opacity: 0.8, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom: 6 }}>Apps recentes</div>
      {[['zap','Conversas'],['book','Agente'],['wallet','Loja']].map(([ic, n], i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap: 8, padding:'3px 0' }}>
          <Icon name={ic} size={13} /><span style={{ fontSize: 12 }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

function WidgetAppsRecentesBody({ apps, onLaunch }) {
  const ler = () => {
    try { return JSON.parse(localStorage.getItem('os_apps_recentes') || '[]'); }
    catch (e) { return []; }
  };
  const [recentes, setRecentes] = wUseState(ler);
  wUseEffect(() => {
    const atualiza = () => setRecentes(ler());
    window.addEventListener('os:apps-recentes', atualiza);
    return () => window.removeEventListener('os:apps-recentes', atualiza);
  }, []);
  // Só apps que ainda existem pro usuário; máximo 5, sem scroll.
  const itens = recentes
    .map(slug => (apps || []).find(a => a.slug === slug))
    .filter(Boolean)
    .slice(0, 5);
  return (
    <>
      <div className="row" style={{ justifyContent:'space-between', marginBottom: 10 }}>
        <div className="title-section">Apps recentes</div>
        <Icon name="clock" size={12} stroke="var(--txt-3)" />
      </div>
      {itens.length === 0 ? (
        <div className="muted tiny" style={{ padding: '6px 0' }}>Abra um app e ele aparece aqui.</div>
      ) : (
        <div className="col gap-2">
          {itens.map(a => (
            <div key={a.slug} className="row gap-2 os-linha-clicavel" role="button" tabIndex={0}
              onClick={() => onLaunch?.(a.slug)}
              onKeyDown={(e) => { if (e.key === 'Enter') onLaunch?.(a.slug); }}
              title={`Abrir ${a.titulo}`}
              style={{ padding: 8, background:'rgba(255,255,255,0.03)', borderRadius: 8, cursor:'pointer' }}>
              <span className="row center" style={{ width: 26, height: 26, borderRadius: 7, background:'rgba(255,255,255,0.06)', flexShrink: 0, justifyContent:'center' }}>
                <Icon name={a.icone} size={14} />
              </span>
              <span className="small" style={{ flex: 1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.titulo}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const DESKTOP_WIDGETS = [
  { id:'apps-recentes', titulo:'Apps recentes', descricao:'Os 5 últimos apps que você abriu',
    width: 240, defaultPos: { x: 60, y: window.innerHeight - 380 },
    preview: WidgetAppsRecentesPreview, body: WidgetAppsRecentesBody },
  { id:'relogio', titulo:'Relógio', descricao:'Hora e data em destaque',
    width: 220, defaultPos: { x: 60, y: 100 },
    preview: WidgetReloginhoPreview, body: WidgetReloginhoBody },
  { id:'kpis', titulo:'KPIs', descricao:'Leads que falaram hoje, quentes e conversão do mês',
    width: 280, defaultPos: { x: window.innerWidth - 340, y: 120 },
    preview: WidgetKpisPreview, body: WidgetKpisReal },
  { id:'agenda', titulo:'Agenda', descricao:'Próximos eventos e compromissos com leads',
    width: 280, defaultPos: { x: window.innerWidth - 340, y: window.innerHeight - 280 },
    preview: WidgetAgendaPreview, body: WidgetAgendaReal },
  { id:'financas', titulo:'Finanças', descricao:'Saldo do mês, entradas, saídas e próxima conta',
    width: 280, defaultPos: { x: window.innerWidth - 640, y: 120 },
    preview: PreviewFinancas, body: WidgetFinancas },
  { id:'maquete', titulo:'Maquete 2D', descricao:'Janelinha do escritório com a equipe ao vivo',
    width: 380, defaultPos: { x: 320, y: 100 },
    preview: PreviewMaquete, body: WidgetMaquete },
];

/* Draggable wrapper */
function DraggableWidget({ id, x, y, width, onMove, children }) {
  const onDown = (e) => {
    // .widget-interativo = área com interação própria (ex.: câmera da maquete).
    if (e.target.closest('button, input, .widget-interativo')) return;
    const start = { mx: e.clientX, my: e.clientY, x, y };
    const move = (ev) => {
      const nx = Math.max(8, Math.min(window.innerWidth - width - 8, start.x + (ev.clientX - start.mx)));
      const ny = Math.max(50, Math.min(window.innerHeight - 50, start.y + (ev.clientY - start.my)));
      onMove(id, nx, ny);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  return (
    <div className="desk-widget" style={{ left: x, top: y, width }} onMouseDown={onDown}>
      {children}
    </div>
  );
}

function DesktopWidgets({ active, positions, onMove, apps, onLaunch }) {
  return (
    <>
      {DESKTOP_WIDGETS.filter(w => active.has(w.id)).map(w => {
        const Body = w.body;
        const pos = positions[w.id] || w.defaultPos;
        return (
          <DraggableWidget key={w.id} id={w.id} x={pos.x} y={pos.y} width={w.width} onMove={onMove}>
            <Body apps={apps} onLaunch={onLaunch} />
          </DraggableWidget>
        );
      })}
    </>
  );
}

window.DESKTOP_WIDGETS = DESKTOP_WIDGETS;
window.DesktopWidgets = DesktopWidgets;

/* ==================================================================== */
/* === tweaks-panel.jsx === */
/* ==================================================================== */

// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({ title = 'Tweaks', noDeckControls = false, children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  // Auto-inject a rail toggle when a <deck-stage> is on the page. The
  // toggle drives the deck's per-viewer _railVisible via window message;
  // state is mirrored from the same localStorage key the deck reads so
  // the control reflects reality across reloads. The mechanism is the
  // message — authors who want custom placement can post it directly
  // and pass noDeckControls to suppress this one.
  const hasDeckStage = React.useMemo(
    () => typeof document !== 'undefined' && !!document.querySelector('deck-stage'),
    [],
  );
  // deck-stage enables its rail in connectedCallback, but this panel can
  // mount before that element has upgraded. The initial read catches the
  // common case; the listener covers mounting first. (Older deck-stage.js
  // copies still wait for the host's __omelette_rail_enabled postMessage —
  // same listener handles those.)
  const [railEnabled, setRailEnabled] = React.useState(
    () => hasDeckStage && !!document.querySelector('deck-stage')?._railEnabled,
  );
  React.useEffect(() => {
    if (!hasDeckStage || railEnabled) return undefined;
    const onMsg = (e) => {
      if (e.data && e.data.type === '__omelette_rail_enabled') setRailEnabled(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [hasDeckStage, railEnabled]);
  const [railVisible, setRailVisible] = React.useState(() => {
    try { return localStorage.getItem('deck-stage.railVisible') !== '0'; } catch (e) { return true; }
  });
  const toggleRail = (on) => {
    setRailVisible(on);
    window.postMessage({ type: '__deck_rail_visible', on }, '*');
  };
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel" data-noncommentable=""
           style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={dismiss}>✕</button>
        </div>
        <div className="twk-body">
          {children}
          {hasDeckStage && railEnabled && !noDeckControls && (
            <TweakSection label="Deck">
              <TweakToggle label="Thumbnail rail" value={railVisible} onChange={toggleRail} />
            </TweakSection>
          )}
        </div>
      </div>
    </>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({ label, children }) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = (o) => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = (s) => {
      const m = options.find((o) => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return <TweakSelect label={label} value={value} options={options}
                        onChange={(s) => onChange(resolve(s))} />;
  }
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input className="twk-field" type="text" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </TweakRow>
  );
}

function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
             onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          stroke={light ? 'rgba(0,0,0,.78)' : '#fff'} />
  </svg>
);

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({ label, value, options, onChange }) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <input type="color" className="twk-swatch" value={value}
               onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button key={i} type="button" className="twk-chip" role="radio"
                    aria-checked={on} data-on={on ? '1' : '0'}
                    aria-label={colors.join(', ')} title={colors.join(' · ')}
                    style={{ background: hero }}
                    onClick={() => onChange(o)}>
              {sup.length > 0 && (
                <span>
                  {sup.map((c, j) => <i key={j} style={{ background: c }} />)}
                </span>
              )}
              {on && <__TwkCheck light={__twkIsLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button type="button" className={secondary ? 'twk-btn secondary' : 'twk-btn'}
            onClick={onClick}>{label}</button>
  );
}

Object.assign(window, {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
});

/* ==================================================================== */
/* === apps-admin.jsx === */
/* ==================================================================== */

/* ============== DASHBOARD ADMIN (Spec 02) ============== */
function AppDashboardAdmin() {
  return <DashboardModular />;
}

/* ============== CONTROLE (planos por urgência + saldo OpenRouter) ============== */
function AppControle() {
  return <ControleModular />;
}

/* ============== TENANTS (Spec 01) ============== */
function AppTenants({ tenants } = {}) {
  return <TenantsModular tenants={tenants} />;
}

/* ============== CURADORIA (painel-mãe admin) ============== */
function AppCuradoria() {
  return <CuradoriaModular />;
}

/* ============== LOJA (USER · planos, pacotes, plus, implantação) ============== */
function AppLoja() {
  return <LojaModular />;
}

function AppChatTeste() {
  return <ChatTesteModular />;
}
function AppProdutos() {
  return <ProdutosModular />;
}
function AppContratos({ onAbrirApp }) {
  return <ContratosModular onAbrirApp={onAbrirApp} />;
}
function AppConsulta() {
  return <ConsultaModular />;
}
function AppJuridico() {
  return <JuridicoModular />;
}
function AppJuridicoAdmin() {
  return <JuridicoAdminModular />;
}
function AppConsultaAdmin() {
  return <ConsultaAdminModular />;
}
function AppCalculadora() {
  return <CalculadoraModular />;
}
function AppAgenda() {
  return <AgendaModular />;
}

/* ============== CARGOS DO AGENTE (Tijolo 1 · RAG-first) ============== */
function UserCargos(props) {
  return <UserCargosModular {...props} />;
}

/* ============== MENTOR (commandbar · F3 — marcar/desmarcar tools) ============== */
function AppMentor(props) {
  return <AppMentorModular {...props} />;
}

/* ============== CONFIGURAÇÕES (USER) ============== */
function AppConfiguracoes() {
  return <ConfiguracoesModular />;
}

/* ============== TEXTOS (USER · primeiro app instalável da Loja) ============== */
function AppTextos() {
  return <TextosModular />;
}

/* ============== NOTAS (USER · 2º app instalável · post-its no Desktop) ============== */
function AppNotas() {
  return <NotasModular />;
}

function AppCaixaFinanceiro() {
  return <CaixaFinanceiroModular />;
}

/* ============== REUNIÃO (USER · videochamada WebRTC modo direto) ============== */
function AppReuniao() {
  return <ReuniaoModular />;
}

/* ============== MARKETING (USER · geração de imagens de post com IA) ============== */
function AppMarketing() {
  return <AppMarketingModular />;
}

/* ============== ADMIN · LOJA (CRUD: planos, pacotes, implantação, plus) ============== */
function AppLojaAdmin() {
  return <LojaAdminModular />;
}

/* ============== ADMIN · APLICATIVOS (CRUD do catálogo de apps instaláveis) ============== */
function AppAplicativosAdmin() {
  return <AplicativosAdminModular />;
}

/* ============== APARÊNCIA (Spec 03) ============== */
function AppAparencia(props) {
  /* Refatorado 2026-05-13 — delega ao módulo src/apps/admin/aparencia/. */
  return <AparenciaModular {...props} />;
}

function AppConversas(props) {
  /* Onda A 2026-05-13 — tela unificada (lista + chat + dossiê 5 abas + pílulas filtro). Mock. */
  return <ConversasModular {...props} />;
}

/* ============== EMPRESA (Onda 7.1 2026-05-13) ==============
 * Lê/grava public.empresas (1 row por tenant via upsert user_id).
 * Upload logo/banner via Storage bucket `logos`. */
function AppEmpresa() {
  return <EmpresaModular />;
}

/* Maquete-RPG — maquete isométrica da empresa (Pixi.js). Lazy porque Pixi é
   pesado e só carrega quando o app é aberto, sem inflar o OS inteiro. */
const MaqueteRpgModular = React.lazy(() =>
  import("@/apps/user/maquete-rpg/MaqueteRpg").then((mod) => ({ default: mod.MaqueteRpg })),
);
function AppMaqueteRpg({ onAbrirApp }) {
  return (
    <React.Suspense fallback={<div className="p-4 text-sm text-white/70">Carregando maquete…</div>}>
      <MaqueteRpgModular onAbrirApp={onAbrirApp} />
    </React.Suspense>
  );
}

function AppConversaIsolada(props) {
  /* Onda B.5 2026-05-13 — janela isolada com 1 conversa (drag-out da lista). */
  return <ConversaIsoladaModular {...props} />;
}

function Field({ label, v, on, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={v} onChange={(e) => on(e.target.value)} />
      {hint && <div className="muted tiny" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
function UploadBranding({ label, tipo, url, hint, enviando, onArquivo, onLimpar }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="row gap-3" style={{ alignItems:'center' }}>
        <div className="row center" style={{ width: 90, height: 90, borderRadius: 12, background:'rgba(255,255,255,0.04)', border:'1px dashed var(--os-vidro-borda)', overflow:'hidden', flexShrink: 0 }}>
          {url ? (
            <img src={url} alt={label} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
          ) : (
            <Icon name="image" size={20} stroke="var(--txt-3)" />
          )}
        </div>
        <div className="col gap-2" style={{ flex: 1 }}>
          <label className="btn" style={{ cursor:'pointer', justifyContent:'center' }}>
            <Icon name="upload" size={13} /> {enviando ? 'Enviando…' : (url ? `Trocar ${label.toLowerCase()}` : `Enviar ${label.toLowerCase()}`)}
            <input type="file" accept={tipo === 'favicon' ? 'image/*,.ico' : 'image/*'} style={{ display:'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onArquivo(f); e.target.value = ''; }} />
          </label>
          {url && <button className="btn btn-ghost btn-sm" onClick={onLimpar}>Remover</button>}
          {hint && <div className="muted tiny">{hint}</div>}
        </div>
      </div>
    </div>
  );
}
function ColorField({ label, v, on }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="row gap-2">
        <div style={{ width: 36, height: 36, borderRadius: 8, border:'1px solid var(--os-vidro-borda)', background: v }}></div>
        <input className="input mono" value={v} onChange={(e) => on(e.target.value)} style={{ fontSize: 12 }} />
      </div>
    </div>
  );
}

/* ============== FINANCEIRO (Spec 07) ============== */
function AppFinanceiro() {
  return <FinanceiroModular />;
}

function AppSocioComercial() {
  return <SocioComercialModular />;
}

function AppSocioComercialUser() {
  return <SocioComercialUserModular />;
}

function AppEquipe() {
  return <EquipeModular />;
}

function AppClientes() {
  return <ClientesModular />;
}

window.AppClientes = AppClientes;

/* ============== AGENTE — Ragentic Completo 2026-05-13 ==============
 * Extraído pra @/apps/user/agente/AgenteApp.tsx (5 abas reais lendo banco). */
function AppAgente() {
  return <AgenteAppModular />;
}

/* ============== Spec 19 — ONBOARDING (USER) wizard 5 steps ============== */
function AppOnboarding({ onConcluir }) {
  return <OnboardingModular onConcluir={onConcluir} />;
}

window.AppOnboarding = AppOnboarding;
window.AppContratos = AppContratos;

/* ==================================================================== */
/* === auth.jsx === */
/* ==================================================================== */

/* ============== LOGIN (Spec 13) ============== */
function Login({ brand, onEntrar, onSubmit, onEsqueciSenha }) {
  const t = useToast();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e) => {
    e?.preventDefault();
    if (!email || !senha) { t.error('Preencha e-mail e senha'); return; }
    setCarregando(true);
    try {
      if (onSubmit) {
        const r = await onSubmit(email, senha);
        if (r && r.erro) { t.error(r.erro); return; }
        t.success('Bem-vindo de volta');
        onEntrar && onEntrar();
      } else {
        await new Promise(r => setTimeout(r, 600));
        t.success('Bem-vindo de volta');
        onEntrar && onEntrar();
      }
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-left" style={{
        background: `linear-gradient(135deg, ${brand.cor_acento_1}, ${brand.cor_acento_2})`,
      }}>
        <div style={{ position:'absolute', inset:0, background:`radial-gradient(60% 60% at 80% 20%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(50% 50% at 20% 90%, rgba(0,0,0,0.25), transparent 60%)` }}></div>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 36px 36px, linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 36px 36px', mask:'radial-gradient(circle at 40% 40%, black 50%, transparent 90%)' }}></div>



        <div style={{ position:'relative', maxWidth: 480 }}>
          <div style={{ fontSize: 12, opacity: 0.85, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom: 8 }}>{brand.nome_produto}</div>
          <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1, letterSpacing:'-0.02em' }}>
            {brand.mensagem_login_titulo}
          </div>
          <div style={{ fontSize: 16, marginTop: 14, opacity: 0.92, maxWidth: 380, lineHeight: 1.5 }}>
            {brand.mensagem_login_sub}
          </div>

          <div className="col gap-3" style={{ marginTop: 36 }}>
            {(brand.login_features && brand.login_features.length > 0 ? brand.login_features : [
              { icone:'bot',   titulo:'Agentes IA 24/7', subtitulo:'Atendem WhatsApp, qualificam e fecham.' },
              { icone:'brain', titulo:'LLM-OS curado',   subtitulo:'Você cura o cérebro em tempo real.' },
              { icone:'spark', titulo:'Gen UI nativo',   subtitulo:'A interface se gera com seus dados.' },
            ]).map((f, i) => (
              <div key={i} className="row gap-3">
                <div style={{ width: 32, height: 32, borderRadius: 8, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>
                  <Icon name={f.icone} size={15} stroke="white" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{f.titulo}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{f.subtitulo}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position:'relative', fontSize: 11, opacity: 0.7 }}>
          {brand.login_copyright || `© 2026 ${brand.nome_produto} · todos os direitos reservados`}
        </div>
      </div>

      <div className="login-right">
        <div style={{ width:'100%', maxWidth: 360 }}>
          <div className="muted small">{brand.login_form_subtitulo || 'Entre na sua conta'}</div>
          <div className="h1" style={{ marginTop: 4, marginBottom: 28 }}>{brand.login_form_titulo || brand.nome_so}</div>

          <form className="col gap-3" onSubmit={entrar}>
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ height: 42 }} />
            </div>
            <div>
              <label className="label">Senha</label>
              <div style={{ position:'relative' }}>
                <input className="input" type={showSenha ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} style={{ height: 42, paddingRight: 42 }} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowSenha(s => !s)} style={{ position:'absolute', right: 6, top: 7 }}>
                  <Icon name={showSenha ? 'eyeOff' : 'eye'} size={14} />
                </button>
              </div>
            </div>

            <div className="row" style={{ justifyContent:'space-between', alignItems:'center' }}>
              <div className="row gap-2" style={{ cursor:'pointer' }} onClick={() => setLembrar(!lembrar)}>
                <span className={`chk ${lembrar ? 'on' : ''}`}>{lembrar && <Icon name="check" size={11} stroke="white"/>}</span>
                <span className="small">Lembrar senha</span>
              </div>
              <a href="#" className="small" style={{ color:'var(--os-acento-1)', textDecoration:'none' }}
                 onClick={(e) => { e.preventDefault(); onEsqueciSenha && onEsqueciSenha(email); }}>
                Esqueci minha senha
              </a>
            </div>

            <button className="btn btn-primary btn-lg" type="submit" disabled={carregando}>
              {carregando ? 'Entrando…' : <>Entrar <Icon name="arrowRight" size={14}/></>}
            </button>
          </form>

          <div className="hr" style={{ margin:'28px 0' }}></div>
          <div className="muted small" style={{ textAlign:'center' }}>
            Não tem conta? <strong style={{ color: 'var(--txt-2)' }}>Acesso por convite</strong> — fale com seu administrador.
          </div>
        </div>
      </div>
    </div>
  );
}

window.Login = Login;

/* ==================================================================== */
/* === app.jsx === */
/* ==================================================================== */
/* global React, ReactDOM, Icon, Toaster, useToast, Wallpaper, BarraSuperior, Dock, CommandBar, CommandBarInteligente, CursorGlow, Janela, Spotlight, Login, MinimizedDock, NotificationCenter, WorkspaceIndicator, EdgeHint, EdgeNav, SwipeArea, Launchpad, DESKTOP_WIDGETS, DesktopWidgets,
   AppDashboardAdmin, AppControle, AppTenants, AppLojaAdmin, AppAplicativosAdmin, AppAparencia, AppFinanceiro, AppSocioComercial, AppCuradoria,
   AppConversas, AppConversaIsolada, AppEmpresa, AppContratos, AppEquipe, AppLoja, UserCargos, AppMentor, AppConfiguracoes, AppCalculadora, AppAgenda,
   AppChatTeste, AppProdutos, AppAgente, AppOnboarding, AppClientes, AppSocioComercialUser, AppTextos, AppNotas, AppReuniao,
   TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakToggle */


/* ============== Registro de apps ============== */
function buildAppRegistry({ brand, setBrand, onAbrirApp, tenants }) {
  return [
    /* USER */
    { slug:'conversas',       titulo:'Conversas',        icone:'app:conversas',   lado:'user',  janela:{ w: 1280, h: 800 }, render: () => <AppConversas onAbrirApp={onAbrirApp} /> },
    { slug:'empresa',         titulo:'Empresa',          icone:'app:empresa',  lado:'user',  janela:{ w: 1100, h: 780 }, render: () => <AppEmpresa /> },
    { slug:'maquete-rpg',     titulo:'Maquete-RPG',      icone:'app:maquete-rpg',   lado:'user',  janela:{ w: 880,  h: 560 }, render: () => <AppMaqueteRpg onAbrirApp={onAbrirApp} /> },
    { slug:'conversa-isolada', titulo:'Conversa',        icone:'app:conversas', lado:'user',  oculto: true, janela:{ w: 880,  h: 720 }, render: ({ slug }) => <AppConversaIsolada slug={slug} /> },
    { slug:'equipe',          titulo:'Equipe',           icone:'app:equipe',     lado:'user',  janela:{ w: 1080, h: 680 }, render: () => <AppEquipe /> },
    // Revelado de volta 2026-09-04 a pedido do Theus (Diego não abria a loja e não instalava apps).
    // Fica visível SEM preços cravados — apps aparecem como "Grátis". Histórico: ficou oculto de 2026-08-19 até aqui.
    { slug:'loja',            titulo:'Loja',             icone:'store',     lado:'user',  janela:{ w: 1080, h: 720 }, render: () => <AppLoja /> },
    { slug:'configuracoes',   titulo:'Configurações',    icone:'app:configuracoes',   lado:'ambos', janela:{ w: 1000, h: 700 }, render: () => <AppConfiguracoes /> },
    { slug:'chat-teste',      titulo:'Chat Treino',      icone:'app:chat-teste', lado:'user',  janela:{ w: 1180, h: 720 }, render: () => <AppChatTeste /> },
    { slug:'produtos',        titulo:'Produtos',         icone:'app:produtos',   lado:'user',  janela:{ w: 1080, h: 700 }, render: () => <AppProdutos /> },
    { slug:'contratos',       titulo:'Contratos',        icone:'app:contratos', lado:'user',  janela:{ w: 1180, h: 760 }, render: () => <AppContratos onAbrirApp={onAbrirApp} /> },
    { slug:'consulta',        titulo:'Consulta',         icone:'app:consulta',    lado:'user',  janela:{ w: 1180, h: 760 }, render: () => <AppConsulta /> },
    { slug:'juridico',        titulo:'Jurídico',         icone:'app:juridico',    lado:'user',  janela:{ w: 1080, h: 720 }, render: () => <AppJuridico /> },
    { slug:'agente',          titulo:'Agente',           icone:'app:agente',       lado:'user',  janela:{ w: 1080, h: 720 }, render: () => <AppAgente /> },
    { slug:'mentor',          titulo:'Mentor',           icone:'app:mentor',  lado:'user',  janela:{ w: 880,  h: 700 }, render: () => <AppMentor /> },
    { slug:'clientes',        titulo:'Clientes',         icone:'app:clientes', lado:'user',  janela:{ w: 1100, h: 720 }, render: () => <AppClientes /> },
    { slug:'socio-comercial-user', titulo:'Sócio Comercial',  icone:'app:socio-comercial',  lado:'user',  janela:{ w: 1100, h: 760 }, render: () => <AppSocioComercialUser /> },
    { slug:'base',            titulo:'Base',             icone:'app:base',  lado:'user',  janela:{ w: 1200, h: 780 }, render: () => <BaseModular /> },
    { slug:'campanha',        titulo:'Campanha',         icone:'app:campanha', lado:'user',  janela:{ w: 1280, h: 780 }, render: () => <CampanhaModular /> },
    { slug:'textos',          titulo:'Textos',           icone:'app:textos',  lado:'user',  janela:{ w: 1180, h: 760 }, render: () => <AppTextos /> },
    { slug:'marketing',       titulo:'Marketing',        icone:'app:marketing',     lado:'user',  janela:{ w: 1000, h: 700 }, render: () => <AppMarketing /> },
    { slug:'notas',           titulo:'Notas',            icone:'app:notas',      lado:'user',  janela:{ w: 1080, h: 720 }, render: () => <AppNotas /> },
    { slug:'caixa',           titulo:'Financeiro',       icone:'app:financeiro',    lado:'user',  janela:{ w: 1080, h: 720 }, render: () => <AppCaixaFinanceiro /> },
    { slug:'reuniao',         titulo:'Reunião',          icone:'app:reuniao',     lado:'user',  janela:{ w: 1120, h: 760 }, render: () => <AppReuniao /> },
    { slug:'contabilidade',   titulo:'Contabilidade',    icone:'app:contabilidade', lado:'user', janela:{ w: 1080, h: 720 }, render: () => <ContabilidadeModular /> },
    { slug:'rh',              titulo:'RH',               icone:'app:rh',          lado:'user',  janela:{ w: 1120, h: 740 }, render: () => <RhModular /> },
    { slug:'email',           titulo:'E-mail',           icone:'app:email',       lado:'user',  janela:{ w: 1220, h: 780 }, render: () => <EmailModular /> },
    { slug:'credito',         titulo:'Crédito Bancário', icone:'app:credito',     lado:'user',  janela:{ w: 1100, h: 740 }, render: () => <CreditoModular /> },
    { slug:'rifas',           titulo:'Rifas',            icone:'app:rifas',       lado:'user',  janela:{ w: 1120, h: 740 }, abrirExterno: '/app/rifas', render: () => <RifasModular /> },
    { slug:'reino',           titulo:'Reino',            icone:'app:reino',  lado:'user', janela:{ w: 360, h: 240 },  render: () => <ReinoFantasmaModular /> },
    { slug:'estoque',         titulo:'Estoque',          icone:'package',         lado:'user',  janela:{ w: 980, h: 700 },  render: () => <EstoqueModular /> },

    { slug:'calculadora',     titulo:'Calculadora',      icone:'app:calculadora', lado:'user', janela:{ w: 360, h: 500 },  render: () => <AppCalculadora /> },
    { slug:'agenda',          titulo:'Agenda',           icone:'app:agenda',  lado:'user', janela:{ w: 920, h: 640 },  render: () => <AppAgenda /> },
    /* ADMIN */
    { slug:'dashboard',       titulo:'Dashboard',        icone:'app:dashboard',  lado:'admin', janela:{ w: 1140, h: 740 }, render: () => <AppDashboardAdmin /> },
    { slug:'controle',        titulo:'Controle',         icone:'shield',      lado:'admin', janela:{ w: 980, h: 720 },  render: () => <AppControle /> },
    { slug:'tenants',         titulo:'Tenants',          icone:'app:tenants', lado:'admin', janela:{ w: 1100, h: 700 }, render: () => <AppTenants tenants={tenants} /> },
    { slug:'loja-admin',      titulo:'Loja',             icone:'shoppingBag', lado:'admin', janela:{ w: 1100, h: 720 }, render: () => <AppLojaAdmin /> },
    { slug:'aplicativos',     titulo:'Aplicativos',      icone:'app:aplicativos',      lado:'admin', janela:{ w: 1100, h: 720 }, render: () => <AppAplicativosAdmin /> },
    { slug:'consulta-admin',  titulo:'Consulta',         icone:'app:consulta',    lado:'admin', janela:{ w: 1180, h: 760 }, render: () => <AppConsultaAdmin /> },
    { slug:'juridico-admin',  titulo:'Jurídico',         icone:'app:juridico',    lado:'admin', janela:{ w: 1180, h: 760 }, render: () => <AppJuridicoAdmin /> },
    { slug:'aparencia',       titulo:'Aparência',        icone:'app:aparencia',   lado:'admin', janela:{ w: 1100, h: 720 }, render: () => <AppAparencia brand={brand} setBrand={setBrand} /> },
    { slug:'financeiro',      titulo:'Financeiro',       icone:'app:financeiro',    lado:'admin', janela:{ w: 1040, h: 720 }, render: () => <AppFinanceiro /> },
    { slug:'socio-comercial', titulo:'Sócio Comercial',  icone:'app:socio-comercial',  lado:'admin', janela:{ w: 880, h: 680 },  render: () => <AppSocioComercial /> },
    { slug:'curadoria',       titulo:'Curadoria',        icone:'app:curadoria',     lado:'admin', janela:{ w: 1280, h: 780, sem_botao_maximizar: true, abrir_maximizado: true }, render: (api) => <AppCuradoria onFechar={api.onFechar} onMinimizar={api.onMinimizar} /> },
    { slug:'cargos-admin',    titulo:'Cargos',           icone:'app:cargos', lado:'admin', janela:{ w: 1240, h: 780 }, render: () => <AppCargosAdminModular /> },
    { slug:'nichos-admin',    titulo:'Nichos',           icone:'app:nichos', lado:'admin', janela:{ w: 860, h: 640 },  render: () => <AppNichos /> },
    { slug:'reunioes-admin',  titulo:'Reuniões',         icone:'app:reuniao', lado:'admin', janela:{ w: 720, h: 660 }, render: () => <AppReunioes /> },
    // Gestão (Financeiro/operação da própria babel). Fora do catálogo da Loja de propósito: só aparece para os
    // tenants em APPS_SO_PARA_TENANTS (hoje só o Diego) e para a equipe dele com o app liberado na Equipe; os dados
    // são protegidos por RLS via gestao_acessos.
    { slug:'gestao',          titulo:'Gestão',           icone:'app:gestao',  lado:'ambos', janela:{ w: 1120, h: 800 }, render: () => <AppGestao /> },
  ];
}

/* ============== App raiz ============== */
/* [TESTE 2026-09-13] Launcher só-logo com efeito ímã: dentro do raio, a logo é
   puxada na direção do cursor (proporcional à proximidade); saiu, volta com mola.
   Não escala nem gira — só o neon pulsa (Theus 2026-09-13). */
function BrandLauncherLogo({ brand, onAbrir }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const RAIO = 140;   // px ao redor do centro onde o ímã atua
    const FORCA = 0.35; // fração da distância que a logo percorre
    let raf = 0;
    const mover = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        // Centro "de repouso": desconta o deslocamento atual pra não realimentar.
        const tx = parseFloat(el.style.getPropertyValue('--ima-x')) || 0;
        const ty = parseFloat(el.style.getPropertyValue('--ima-y')) || 0;
        const cx = r.left + r.width / 2 - tx;
        const cy = r.top + r.height / 2 - ty;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const perto = dist < RAIO;
        const k = perto ? FORCA * (1 - dist / RAIO) + FORCA * 0.4 : 0;
        el.style.setProperty('--ima-x', `${(dx * k).toFixed(1)}px`);
        el.style.setProperty('--ima-y', `${(dy * k).toFixed(1)}px`);
        el.classList.toggle('is-imantado', perto);
      });
    };
    const soltar = () => {
      el.style.setProperty('--ima-x', '0px');
      el.style.setProperty('--ima-y', '0px');
      el.classList.remove('is-imantado');
    };
    window.addEventListener('pointermove', mover, { passive: true });
    document.addEventListener('pointerleave', soltar);
    window.addEventListener('blur', soltar);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerleave', soltar);
      window.removeEventListener('blur', soltar);
    };
  }, []);
  return (
    <button
      ref={ref}
      className="brand-launcher-logo"
      onClick={onAbrir}
      aria-label={`${brand.nome_so || 'Plataforma'} — abrir menu de aplicativos`}
      title={brand.nome_so || 'Menu de aplicativos'}
    >
      <img src={brand.logo_url || '/babel-logo.png'} alt="" draggable={false} />
    </button>
  );
}

function App({ initialBrand, onLogout, initialSide, onBrandSave, tenants } = {}) {
  const [tela, setTela] = useState('os'); // 'login' | 'os'
  const [side, setSide] = useState(initialSide || 'user');
  const [brand, setBrand] = useState(initialBrand || window.RAGENTIC_DATA.BRANDING_INICIAL);
  // Sincroniza quando o branding externo (Supabase realtime) muda.
  useEffect(() => { if (initialBrand) setBrand(initialBrand); }, [initialBrand]);
  useEffect(() => { if (initialSide) setSide(initialSide); }, [initialSide]);
  const [windows, setWindows] = useState([]); // {slug, x, y, w, h, baseW, baseH, zoom, z, maximized, minimized, desktop}
  const [nextZ, setNextZ] = useState(100);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [area, setArea] = useState(1); // 0 esquerda, 1 central, 2 direita
  const [dragEdge, setDragEdge] = useState(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  // Apps fixados no menu lateral (Dock). Calculadora e Agenda só no Launchpad.
  // Default cravado quando o usuário NÃO tem prefs salvas no banco.
  const DEFAULT_PINNED = [
    'conversas','atendimento','contratos','campanha','equipe','agente','clientes','configuracoes',
    'dashboard','controle','tenants','loja-admin','aplicativos','consulta-admin','aparencia','financeiro','socio-comercial','curadoria',
  ];
  const prefsIni = (typeof window !== 'undefined' ? window.RAGENTIC_PREFERENCIAS_UI : null) || {};
  const [pinned, setPinned] = useState(() => new Set(
    Array.isArray(prefsIni.apps_fixados) && prefsIni.apps_fixados.length > 0
      ? prefsIni.apps_fixados
      : DEFAULT_PINNED,
  ));
  const togglePin = (slug) => setPinned(p => {
    const n = new Set(p);
    if (n.has(slug)) n.delete(slug); else n.add(slug);
    queueMicrotask(() => salvarPrefs({ apps_fixados: Array.from(n) }));
    return n;
  });
  const [activeWidgets, setActiveWidgets] = useState(() => new Set(Array.isArray(prefsIni.widgets_ativos) ? prefsIni.widgets_ativos : ['relogio']));
  const [widgetPositions, setWidgetPositions] = useState(() => prefsIni.widgets_posicoes || {});
  const salvarPrefs = (patch) => { try { window.RAGENTIC_HOOKS?.salvarPreferenciasUi?.(patch); } catch (e) { /* ignore */ } };

  // Gate de "preferências carregadas": evita FLASH do widget no boot. Sem
  // isso, `activeWidgets` inicia com fallback `['relogio']`, pinta o widget,
  // e quando a query Supabase volta com `widgets_ativos: []` (user desativou)
  // o widget some — 100-300ms de flash desconfortável. Com o gate, só
  // renderizamos `<DesktopWidgets>` depois que sabemos o que o user quer.
  // True no init SE `prefsIni` já estava preenchido (cache da sessão anterior).
  const [prefsCarregadas, setPrefsCarregadas] = useState(
    Array.isArray(prefsIni.widgets_ativos),
  );

  // Reidratação tardia: quando `usePreferenciasUi` resolve a query Supabase,
  // dispara `ragentic:prefs-prontas`. Reidratamos pinned/widgets/posições.
  useEffect(() => {
    const onPrefsProntas = (ev) => {
      const p = ev?.detail;
      if (!p) return;
      // Papel de parede salvo: o effect de mount roda antes da query resolver
      // (window.RAGENTIC_PREFERENCIAS_UI ainda vazio), então reaplicamos aqui —
      // senão wallpaper não-padrão volta pro aurora após F5.
      if (p.papel_parede_id) aplicarPapelParede(p.papel_parede_id);
      if (Array.isArray(p.apps_fixados) && p.apps_fixados.length > 0) {
        setPinned(new Set(p.apps_fixados));
      }
      // Reidrata widgets_ativos SEMPRE que vier array (inclusive vazio — user
      // desativou todos). Combinar com `prefsCarregadas` evita o flash inicial.
      if (Array.isArray(p.widgets_ativos)) {
        setActiveWidgets(new Set(p.widgets_ativos));
      }
      if (p.widgets_posicoes && typeof p.widgets_posicoes === 'object') {
        setWidgetPositions(p.widgets_posicoes);
      }
      setPrefsCarregadas(true);
    };
    window.addEventListener('ragentic:prefs-prontas', onPrefsProntas);
    return () => window.removeEventListener('ragentic:prefs-prontas', onPrefsProntas);
  }, []);
  // IMPORTANTE: side-effects fora do reducer do setState (StrictMode roda reducer 2x).
  const toggleWidget = (id) => {
    setActiveWidgets(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      // Persistência fora do reducer: agendamos no microtask seguinte usando o próprio n calculado.
      queueMicrotask(() => salvarPrefs({ widgets_ativos: Array.from(n) }));
      return n;
    });
  };
  // Drag no Dock (2026-08-19): recria o Set na ordem nova (apps do lado atual
  // primeiro, resto preserva a ordem) e persiste — `apps_fixados` é array ordenado.
  const reordenarPinned = (ordemParcial) => {
    setPinned((atual) => {
      const resto = Array.from(atual).filter((s) => !ordemParcial.includes(s));
      const novo = new Set([...ordemParcial, ...resto]);
      queueMicrotask(() => salvarPrefs({ apps_fixados: Array.from(novo) }));
      return novo;
    });
  };
  const moveWidget = (id, x, y) => {
    setWidgetPositions(p => {
      const np = { ...p, [id]: { x, y } };
      if (window.__ragenticSavePosTimer) clearTimeout(window.__ragenticSavePosTimer);
      window.__ragenticSavePosTimer = setTimeout(() => salvarPrefs({ widgets_posicoes: np }), 400);
      return np;
    });
  };

  // Aplica papel de parede salvo no mount
  useEffect(() => {
    const id = prefsIni.papel_parede_id;
    if (id && typeof aplicarPapelParede === 'function') aplicarPapelParede(id);
  }, []);

  const [badgesZerados, setBadgesZerados] = useState(() => prefsIni.badges_zerados || {});
  const [notifs, setNotifs] = useState(() => Array.isArray(window.RAGENTIC_NOTIFICACOES) ? window.RAGENTIC_NOTIFICACOES : []);
  // Realtime: o hook externo dispara este evento sempre que houver mudança no banco.
  useEffect(() => {
    const onChange = (ev) => setNotifs(Array.isArray(ev.detail) ? ev.detail : []);
    window.addEventListener('ragentic-notificacoes-change', onChange);
    return () => window.removeEventListener('ragentic-notificacoes-change', onChange);
  }, []);
  // Re-renderiza quando o useDadosBundle termina de hidratar os dados reais,
  // pra a pílula do plano nascer já com o valor do banco (sem mock/flash).
  const [, setDadosTick] = useState(0);
  useEffect(() => {
    const onHidratou = () => setDadosTick((t) => t + 1);
    window.addEventListener('ragentic-dados-hidratados', onHidratou);
    return () => window.removeEventListener('ragentic-dados-hidratados', onHidratou);
  }, []);
  const planoUso = window.RAGENTIC_DATA.PLANO_ATUAL;

  const pushNotif = (n) => setNotifs(xs => [{ id:'n'+Date.now(), t:'agora', lido:false, ...n }, ...xs]);
  const dismissNotif = (id) => {
    setNotifs(xs => xs.filter(x => x.id !== id));
    try { window.RAGENTIC_HOOKS?.removerNotificacao?.(id); } catch (e) { /* ignore */ }
  };
  const clearNotifs = () => {
    setNotifs([]);
    try { window.RAGENTIC_HOOKS?.limparNotificacoes?.(); } catch (e) { /* ignore */ }
  };
  const actNotif = (n) => {
    setNotifs(xs => xs.map(x => x.id === n.id ? { ...x, lido: true } : x));
    try { window.RAGENTIC_HOOKS?.marcarNotificacaoLida?.(n.id); } catch (e) { /* ignore */ }
    if (n.acao) abrir(n.acao);
  };

  // Reveal dock when mouse is on the left edge OR over the dock itself
  useEffect(() => {
    const h = (e) => {
      const onLeft = e.clientX < 80;
      const onDock = e.target.closest?.('.dock');
      setDockOpen(onLeft || !!onDock);
    };
    document.addEventListener('mousemove', h);
    return () => document.removeEventListener('mousemove', h);
  }, []);

  const [t, setTweak] = useTweaks({
    side: initialSide || 'user',
    show_login: false,
  });

  // Em produção o lado vem do papel real no Supabase; o tweak só controla o mock standalone.
  useEffect(() => { setSide(initialSide || t.side); }, [initialSide, t.side]);
  useEffect(() => { setTela(t.show_login ? 'login' : 'os'); }, [t.show_login]);

  // Wrapper de setBrand que persiste no Supabase quando onBrandSave foi injetado.
  const setBrandPersistente = (next) => {
    const valor = typeof next === 'function' ? next(brand) : next;
    setBrand(valor);
    if (onBrandSave) { try { onBrandSave(valor); } catch (e) { console.error('[bundle] onBrandSave', e); } }
  };
  const apps = useMemo(() => buildAppRegistry({ brand, setBrand: setBrandPersistente, onAbrirApp: (s) => abrir(s), tenants }), [brand, side, tenants]);

  // Visibilidade dinâmica: apps cujo slug está no catálogo `loja_aplicativos`
  // só aparecem em Dock/Launchpad/Spotlight quando o user instalou. Apps "core"
  // (slug fora do catálogo) sempre aparecem.
  const lerSetSlugs = (k) => new Set((typeof window !== 'undefined' && window.RAGENTIC_DATA && window.RAGENTIC_DATA[k]) || []);
  const [catalogoSlugs, setCatalogoSlugs] = useState(() => lerSetSlugs('APLICATIVOS_CATALOGO_SLUGS'));
  const [instaladosSlugs, setInstaladosSlugs] = useState(() => lerSetSlugs('APLICATIVOS_INSTALADOS_SLUGS'));
  useEffect(() => {
    const sync = () => {
      setCatalogoSlugs(lerSetSlugs('APLICATIVOS_CATALOGO_SLUGS'));
      setInstaladosSlugs(lerSetSlugs('APLICATIVOS_INSTALADOS_SLUGS'));
    };
    const onAbrirApp = (ev) => {
      const slug = ev?.detail?.slug;
      if (typeof slug === 'string' && slug) abrir(slug);
    };
    window.addEventListener('ragentic-dados-hidratados', sync);
    window.addEventListener('ragentic-aplicativos-mudaram', sync);
    window.addEventListener('ragentic-abrir-app', onAbrirApp);
    return () => {
      window.removeEventListener('ragentic-dados-hidratados', sync);
      window.removeEventListener('ragentic-aplicativos-mudaram', sync);
      window.removeEventListener('ragentic-abrir-app', onAbrirApp);
    };
  }, []);
  // Apps restritos a tenants específicos (piloto). Slug -> lista de profiles.id autorizados.
  // Vale para Dock, Launchpad e Spotlight (os três recebem appsVisiveis). Para liberar a todos:
  // tirar o slug daqui e, se for para a Loja, cadastrar em loja_aplicativos.
  const APPS_SO_PARA_TENANTS = {
    gestao: ['1ec3f624-6555-482f-9b38-59579efd8016'],   // Diego Andrade (tenant de referência)
  };
  const [uidAtual, setUidAtual] = useState(null);
  // Membro de equipe (2026-09-24): quem é da equipe de um desses tenants também vê o app, se o dono liberou o app para
  // ele no app Equipe (profiles.page_permissions contém o slug). Ex.: o Diego libera "gestao" e escolhe a função.
  const [meuPerfil, setMeuPerfil] = useState({ pai: null, perms: [] });
  useEffect(() => {
    let ativo = true;
    let unsub = null;
    (async () => {
      try {
        const sb = window.supabaseClient || (await import('@/integrations/supabase/client')).supabase;
        const carregarPerfil = async (uid) => {
          if (!uid) { if (ativo) setMeuPerfil({ pai: null, perms: [] }); return; }
          const { data: p } = await sb.from('profiles').select('parent_user_id, page_permissions').eq('id', uid).maybeSingle();
          if (ativo) setMeuPerfil({ pai: p?.parent_user_id ?? null, perms: Array.isArray(p?.page_permissions) ? p.page_permissions : [] });
        };
        const { data: sess } = await sb.auth.getSession();
        const uid0 = sess?.session?.user?.id ?? null;
        if (ativo) setUidAtual(uid0);
        void carregarPerfil(uid0);
        const { data } = sb.auth.onAuthStateChange((_ev, s) => {
          if (!ativo) return;
          setUidAtual(s?.user?.id ?? null);
          void carregarPerfil(s?.user?.id ?? null);
        });
        unsub = data?.subscription;
      } catch (e) { console.warn('[bundle] uid atual', e); }
    })();
    return () => { ativo = false; try { unsub?.unsubscribe(); } catch (_) {} };
  }, []);
  const liberadoParaTenant = (slug) => {
    const donos = APPS_SO_PARA_TENANTS[slug];
    if (!donos) return true;
    if (uidAtual && donos.includes(uidAtual)) return true;
    return !!meuPerfil.pai && donos.includes(meuPerfil.pai) && meuPerfil.perms.includes(slug);
  };
  const appsVisiveis = useMemo(
    () => apps.filter(a =>
      !a.oculto &&
      (!catalogoSlugs.has(a.slug) || instaladosSlugs.has(a.slug)) &&
      liberadoParaTenant(a.slug)
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apps, catalogoSlugs, instaladosSlugs, uidAtual, meuPerfil],
  );

  const abrir = (slug) => {
    // Busca exata primeiro. Se não achar, tenta prefix-match: slugs como
    // `conversa-isolada__<id>` resolvem pro app base `conversa-isolada` mas
    // a janela mantém o slug COMPLETO (único) — permite N janelas paralelas.
    let app = apps.find(a => a.slug === slug);
    if (!app && slug.includes('__')) {
      const base = slug.split('__')[0];
      app = apps.find(a => a.slug === base);
    }
    if (!app) return;
    // App marcado com `abrirExterno` (ex: Rifas) não vira janela do OS — abre
    // em aba própria (rota com manifest/service worker dele mesmo, instalável
    // como app do celular sem o resto da plataforma junto). Pedido Theus 2026-09-01.
    if (app.abrirExterno) { window.open(app.abrirExterno, '_blank', 'noopener'); return; }
    // Registra o acesso pro widget "Apps recentes" (dedup, mais novo primeiro)
    try {
      const lista = JSON.parse(localStorage.getItem('os_apps_recentes') || '[]');
      const nova = [app.slug, ...lista.filter(s => s !== app.slug)].slice(0, 8);
      localStorage.setItem('os_apps_recentes', JSON.stringify(nova));
      window.dispatchEvent(new CustomEvent('os:apps-recentes'));
    } catch (e) { /* sem localStorage — widget só fica vazio */ }
    // Zera badge da app aberta e marca notificações relacionadas como lidas
    setBadgesZerados(z => {
      if (z[slug]) return z;
      const nz = { ...z, [slug]: true };
      salvarPrefs({ badges_zerados: nz });
      return nz;
    });
    setNotifs(xs => xs.map(n => (n.acao === slug && !n.lido) ? { ...n, lido: true } : n));
    try { window.RAGENTIC_HOOKS?.marcarNotificacoesAppLidas?.(slug); } catch (e) { /* ignore */ }
    setWindows(ws => {
      // Entrar num app minimiza o que estava aberto no mesmo desktop
      // (decisão Theus 2026-07-15: 1 janela visível por vez ao trocar de app).
      const minimizarVisiveis = (w) =>
        w.slug !== slug && w.desktop === area && !w.minimized ? { ...w, minimized: true } : w;
      const ex = ws.find(w => w.slug === slug);
      if (ex) return ws.map(w => w.slug === slug ? { ...w, z: nextZ + 1, minimized: false, desktop: area } : minimizarVisiveis(w));
      // Tamanho natural do app (= 100% de zoom). Em telas menores que isso, a
      // janela é escalada pra caber (moldura + conteúdo encolhem juntos via zoom),
      // em vez de estourar a viewport e cortar o rodapé. baseW/baseH seguem
      // nominais — o resize-por-canto continua tendo o 100% como referência.
      const baseW = app.janela.w;
      const baseH = app.janela.h;
      const { w, h, zoom } = calcularTamanhoInicial({
        baseW, baseH, vw: window.innerWidth, vh: window.innerHeight,
      });
      // Centraliza na FAIXA ÚTIL (abaixo da barra de topo, acima do rodapé).
      const cx = Math.max(MARGEM_BORDA_JANELA, (window.innerWidth - w) / 2);
      const folgaVertical = window.innerHeight - MARGEM_TOPO_JANELA - MARGEM_BORDA_JANELA - h;
      const cy = Math.max(MARGEM_TOPO_JANELA, MARGEM_TOPO_JANELA + folgaVertical / 2);
      const offset = ws.filter(w => w.desktop === area).length * 24;
      // App com janela.abrir_maximizado: true abre já em fullscreen (ex: Curadoria).
      // Em tela estreita (<640px, telefone) TODO app abre em tela cheia com
      // zoom 1 — janela flutuante encolhida vira miniatura ilegível e gera
      // scroll lateral; em tela cheia o layout mobile do próprio app assume.
      const abrirMaximizado = !!app.janela?.abrir_maximizado || window.innerWidth < 640;
      return [...ws.map(minimizarVisiveis), { slug, x: cx + offset, y: cy + offset, w, h, baseW, baseH, zoom, z: nextZ + 1, maximized: abrirMaximizado, minimized: false, desktop: area }];
    });
    setNextZ(z => z + 1);
  };

  const fechar = (slug) => setWindows(ws => ws.filter(w => w.slug !== slug));
  const minimizar = (slug) => setWindows(ws => ws.map(w => w.slug === slug ? { ...w, minimized: true } : w));
  const restaurar = (slug) => {
    const w = windows.find(x => x.slug === slug);
    if (!w) return;
    if (w.desktop !== undefined && w.desktop !== area) setArea(w.desktop);
    setWindows(ws => ws.map(x => x.slug === slug ? { ...x, minimized: false, z: nextZ + 1 } : x));
    setNextZ(z => z + 1);
  };

  // Snap metade (estilo Windows 11): soltar na borda esquerda/direita encaixa a
  // janela na metade fixa da tela. Substituiu o gesto antigo de jogar a janela
  // pro desktop vizinho (decisão Theus 2026-07-11) — troca de área continua no
  // WorkspaceIndicator/EdgeNav.
  const encaixarMetade = (slug, lado) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const metadeW = Math.round(vw / 2);
    setWindows(ws => ws.map(x => x.slug === slug
      ? { ...x, maximized: false, x: lado === 'left' ? 0 : vw - metadeW, y: 0, w: metadeW, h: vh, z: nextZ + 1 }
      : x));
    setNextZ(z => z + 1);
    setDragEdge(null);
  };
  const focar  = (slug) => {
    setWindows(ws => ws.map(w => w.slug === slug ? { ...w, z: nextZ + 1 } : w));
    setNextZ(z => z + 1);
  };
  const mover  = (slug, x, y) => setWindows(ws => ws.map(w => w.slug === slug ? { ...w, x, y } : w));
  const redim  = (slug, nx, ny, nw, nh, nzoom) => setWindows(ws => ws.map(w => w.slug === slug ? { ...w, x: nx, y: ny, w: nw, h: nh, zoom: nzoom ?? w.zoom ?? 1 } : w));
  const maximizar = (slug) => setWindows(ws => ws.map(w => w.slug === slug ? { ...w, maximized: !w.maximized } : w));

  const janelaNoPonto = (px, py, margem = MARGEM_RESIZE) => {
    return windows
      .filter(w => !w.minimized && !w.maximized && (w.desktop ?? 1) === area)
      .map(w => ({
        janela: w,
        edge: detectarBordaJanela(
          px,
          py,
          { left: w.x, top: w.y, right: w.x + w.w, bottom: w.y + w.h },
          margem,
        ),
      }))
      .filter(x => x.edge)
      .sort((a, b) => b.janela.z - a.janela.z)[0] || null;
  };

  const iniciarResizeGlobal = (alvo, e) => {
    e.preventDefault();
    e.stopPropagation();
    const { janela, edge } = alvo;
    const cursor = CURSORES_RESIZE[edge] || 'default';
    setWindows(ws => ws.map(w => w.slug === janela.slug ? { ...w, z: nextZ + 1 } : w));
    setNextZ(z => z + 1);
    document.body.classList.add('janela-redimensionando');
    document.body.style.cursor = cursor;

    const start = { mx: e.clientX, my: e.clientY, x: janela.x, y: janela.y, w: janela.w, h: janela.h };
    const baseW = janela.baseW ?? start.w;
    const baseH = janela.baseH ?? start.h;
    const move = (ev) => {
      ev.preventDefault();
      const dx = ev.clientX - start.mx;
      const dy = ev.clientY - start.my;
      // Canto: proporção travada + zoom no conteúdo (mesma função pura
      // do Janela.tsx — fonte única, testada).
      if (ehCanto(edge)) {
        const r = calcularResizeCanto({
          dir: edge,
          dx,
          dy,
          origX: start.x,
          origY: start.y,
          origW: start.w,
          origH: start.h,
          baseW,
          baseH,
        });
        setWindows(ws => ws.map(w => w.slug === janela.slug
          ? { ...w, x: r.x, y: r.y, w: r.w, h: r.h, zoom: r.zoom }
          : w));
        return;
      }
      // Borda: resize livre, zoom preservado (vem do ...w).
      let nx = start.x, ny = start.y, nw = start.w, nh = start.h;
      if (edge.includes('e')) nw = Math.max(MIN_JANELA_W, start.w + dx);
      if (edge.includes('s')) nh = Math.max(MIN_JANELA_H, start.h + dy);
      if (edge.includes('w')) { nw = Math.max(MIN_JANELA_W, start.w - dx); nx = start.x + (start.w - nw); }
      if (edge.includes('n')) { nh = Math.max(MIN_JANELA_H, start.h - dy); ny = start.y + (start.h - nh); }
      setWindows(ws => ws.map(w => w.slug === janela.slug ? { ...w, x: nx, y: ny, w: nw, h: nh } : w));
    };
    const up = () => {
      document.body.classList.remove('janela-redimensionando');
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };

  const onDesktopPointerDownCapture = (e) => {
    if (e.button !== 0 || launchOpen) return;
    // O header (barra de título + semáforo fechar/min/max) e qualquer
    // controle interativo NÃO são zona de resize — senão o capture global
    // engole o clique (preventDefault+stopPropagation) e os botões/arrasto
    // da barra param de funcionar.
    const alvoEl = e.target;
    if (alvoEl && alvoEl.closest) {
      if (alvoEl.closest(".janela-header")) return;
      if (
        alvoEl.closest(
          'button, input, textarea, select, a, [role="button"], [contenteditable=""], [contenteditable="true"]',
        )
      ) {
        return;
      }
    }
    const alvo = janelaNoPonto(e.clientX, e.clientY);
    if (alvo) iniciarResizeGlobal(alvo, e);
  };

  const onDesktopPointerMoveCapture = (e) => {
    if (document.body.classList.contains('janela-redimensionando')) return;
    // Mesmo recorte do pointerdown: sobre header/controle, cursor neutro
    // (não mostra seta de resize onde o clique não redimensiona).
    const alvoEl = e.target;
    if (
      alvoEl &&
      alvoEl.closest &&
      (alvoEl.closest(".janela-header") ||
        alvoEl.closest(
          'button, input, textarea, select, a, [role="button"], [contenteditable=""], [contenteditable="true"]',
        ))
    ) {
      document.body.style.cursor = "";
      return;
    }
    const alvo = janelaNoPonto(e.clientX, e.clientY);
    document.body.style.cursor = alvo ? (CURSORES_RESIZE[alvo.edge] || '') : '';
  };

  // Keyboard shortcuts
  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSpotlightOpen(true); }
      if (e.key === 'Escape') setSpotlightOpen(false);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  const heroSubmit = (text) => {
    const txt = text.toLowerCase();
    if (/atend|kanban|conversa/.test(txt)) abrir('atendimento');
    else if (/tenant|cliente/.test(txt)) abrir('tenants');
    else if (/curado|cerebro/.test(txt)) abrir('curadoria');
    else if (/dashboard|kpi/.test(txt) && side === 'admin') abrir('dashboard');
    else if (/financeiro|pedido/.test(txt)) abrir('financeiro');
    else abrir(side === 'user' ? 'conversas' : 'dashboard');
  };

  if (tela === 'login') {
    return (
      <>
        <Wallpaper />
        <Login brand={brand} onEntrar={() => { setTela('os'); setTweak('show_login', false); }} />
      </>
    );
  }

  return (
    <div
      style={{ position:'fixed', inset:0, overflow:'hidden' }}
      onPointerDownCapture={onDesktopPointerDownCapture}
      onPointerMoveCapture={onDesktopPointerMoveCapture}
      onPointerLeave={() => { if (!document.body.classList.contains('janela-redimensionando')) document.body.style.cursor = ''; }}
    >
      <Wallpaper />

      <PostitsFlutuantes />

      <SwipeArea area={area} onSwitch={setArea} />

      <BarraSuperior brand={brand} planoUso={planoUso} side={side}
        onSwitchSide={() => { if (initialSide) return; const ns = side === 'admin' ? 'user' : 'admin'; setSide(ns); setTweak('side', ns); setWindows([]); }}
        onAbrirLoja={() => abrir('loja')}
        onAbrirLaunchpad={() => setLaunchOpen(true)}
        onLogout={() => {
          if (onLogout) { onLogout(); return; }
          setTela('login'); setTweak('show_login', true);
        }}
        notif={<><PerguntasMentorBellModular onAbrirApp={abrir} /><NotificationCenter items={notifs} onClear={clearNotifs} onDismiss={dismissNotif} onAction={actNotif} /></>} />

      <Dock apps={appsVisiveis} side={side} abertos={windows.map(w => w.slug)} onLaunch={abrir} open={dockOpen} pinned={pinned} badgesZerados={badgesZerados} onReordenar={reordenarPinned} />

      <CursorGlow />

      {/* Brand launcher — pílula neon (referência do Theus 2026-08-11): hambúrguer num
          quadrado de contorno neon + nome da marca em caixa alta. Logo do tenant, quando
          existe, entra no lugar do quadrado-hambúrguer (white-label preservado). */}
      {/* [TESTE 2026-09-13] Launcher só-logo: em pé, sem pílula — a logo 3D pulsa
          neon nas próprias cores. Pílula antiga preservada abaixo, comentada. */}
      <BrandLauncherLogo brand={brand} onAbrir={() => setLaunchOpen(true)} />
      {/* <button
        className="brand-launcher"
        onClick={() => setLaunchOpen(true)}
        aria-label={`${brand.nome_so || 'Plataforma'} — abrir menu de aplicativos`}
        title={brand.nome_so || 'Menu de aplicativos'}
      >
        <span className="borda-neon" aria-hidden="true">
          <span /><span /><span /><span />
        </span>
        {brand.logo_url
          ? <img src={brand.logo_url} alt="" />
          : (
            <span className="brand-launcher-menu" aria-hidden="true">
              <i /><i /><i />
            </span>
          )}
        <span className="brand-launcher-nome">
          {(brand.nome_so || brand.nome_curto || 'BABEL').toUpperCase()}
        </span>
      </button> */}

      <CommandBarInteligente onAbrirApp={abrir} side={side} janelasAbertas={windows.length} />

      {windows.filter(w => !w.minimized && (w.desktop ?? 1) === area).map(w => {
        // Lookup do app: exato primeiro, depois prefix-match (slug `app__inst` → app base `app`)
        let app = apps.find(a => a.slug === w.slug);
        if (!app && w.slug.includes('__')) {
          app = apps.find(a => a.slug === w.slug.split('__')[0]);
        }
        if (!app) return null;
        // Título dinâmico: se janela tem título customizado (gravado em w.titulo), usa
        const tituloJanela = w.titulo || app.titulo;
        return (
          <Janela key={w.slug} id={w.slug} titulo={tituloJanela} x={w.x} y={w.y} w={w.w} h={w.h} z={w.z} maximized={w.maximized}
                  zoom={w.zoom ?? 1} baseW={app.janela?.w} baseH={app.janela?.h}
                  minContentW={app.janela?.w} minContentH={(app.janela?.h ?? 0) - 36}
                  onClose={fechar} onMinimize={minimizar} onFocus={focar} onMove={mover} onResize={redim} onMaximize={maximizar}
                  onEdgeDrop={encaixarMetade} onDragHint={setDragEdge}
                  semBotaoMaximizar={app.janela?.sem_botao_maximizar}>
            {/* api repassada pro app: pra app com chrome_proprio (Curadoria),
                expõe handlers e slug; pra apps que ignoram (a maioria), arg é ignorado. */}
            {app.render({ slug: w.slug, onFechar: () => fechar(w.slug), onMinimizar: () => minimizar(w.slug) })}
          </Janela>
        );
      })}

      <EdgeHint side={dragEdge} />

      <WorkspaceIndicator
        area={area}
        onSwitch={setArea}
        counts={[0,1,2].map(d => windows.filter(w => (w.desktop ?? 1) === d && !w.minimized).length)}
      />

      <MinimizedDock minimizados={windows.filter(w => w.minimized)} apps={apps} onRestaurar={restaurar} onFechar={fechar} />

      <Launchpad open={launchOpen} onClose={() => setLaunchOpen(false)} apps={appsVisiveis} side={side} onLaunch={abrir}
        pinned={pinned} onTogglePin={togglePin}
        widgets={DESKTOP_WIDGETS} activeWidgets={activeWidgets} onToggleWidget={toggleWidget}
        onSwitchSide={() => { if (initialSide) return; const ns = side === 'admin' ? 'user' : 'admin'; setSide(ns); setTweak('side', ns); setWindows([]); }} />

      {prefsCarregadas && <DesktopWidgets active={activeWidgets} positions={widgetPositions} onMove={moveWidget} apps={appsVisiveis} onLaunch={abrir} />}

      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} apps={appsVisiveis} side={side} onLaunch={abrir} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Visão" />
        <TweakRadio label="Lado" value={t.side} options={['user','admin']}
          onChange={(v) => { setTweak('side', v); setWindows([]); }} />
        <TweakToggle label="Mostrar tela de login" value={t.show_login}
          onChange={(v) => setTweak('show_login', v)} />

        <TweakSection label="Apps de demonstração" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 6, padding:'4px 0' }}>
          {apps.filter(a => a.lado === side && !a.oculto).map(a => (
            <button key={a.slug} className="btn btn-sm" onClick={() => abrir(a.slug)}>
              <Icon name={a.icone} size={11}/> {a.titulo}
            </button>
          ))}
        </div>

        <TweakSection label="Atalhos" />
        <div className="small muted" style={{ lineHeight: 1.8, padding: '4px 0' }}>
          ⌘K · Spotlight<br/>
          Mouse na borda esquerda · revela o Dock<br/>
          Arraste janelas pela barra de título
        </div>
      </TweaksPanel>
    </div>
  );
}

/* Original mount removido — agora montado via React Router em src/pages. */

/* === Export ESM === */
// O bundle expõe duas raízes:
//   <AppComToaster /> — sistema operacional completo (Login → OS interno).
//   <LoginIsolado />  — apenas a tela de login, ainda dentro do Toaster.
function AppComToaster(props) {
  return <Toaster><App {...props} /></Toaster>;
}
function LoginIsolado(props) {
  return <Toaster><Login {...props} /></Toaster>;
}
export { AppComToaster as App, LoginIsolado as Login };
export default AppComToaster;

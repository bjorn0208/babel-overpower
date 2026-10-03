/**
 * Peças de tela compartilhadas pelas 12 abas do app Gestão.
 * Mesmo papel de apps/admin/consulta/ui-admin.tsx (Campo, Vazio, Toggle): só classes de bundle.css
 * (os-card, btn, badge, tabs/tab, tbl, modal, label, input, h2, muted, tiny, kpi-num) e estilos inline como os apps reais.
 * Nenhuma cor nem medida nova: cada valor abaixo aparece em outro app (cita a origem).
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type React from "react";
import { motion } from "framer-motion";
import { Icon } from "@/bundle/bundle-shared";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { rotuloMes, somarMes } from "./tipos";
import { usarArrastarParaRolar } from "./arrastar-rolar";

export { usarArrastarParaRolar };

// ---------------------------------------------------------------------------
// Raiz de toda aba: entrada e saída suaves (apps/user/financeiro/aba-movimentos.tsx:201)
// ---------------------------------------------------------------------------

export function AbaCasca({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" exit="hidden">
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Cabeçalho de aba: título, subtítulo, filtros e ações
// Origem: apps/admin/financeiro/Financeiro.jsx:126-132 (h1 + muted small) e admin/juridico/aba-servicos.tsx (linha de ações)
// ---------------------------------------------------------------------------

export function CabecalhoAba({
  titulo,
  subtitulo,
  filtros,
  acoes,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  /** Controles de filtro (busca, select, .tabs de opções). */
  filtros?: React.ReactNode;
  /** Botões de ação: `btn` / `btn btn-primary` em tamanho cheio (36px, a altura do `.input` ao lado), como
   *  apps/user/clientes/Clientes.jsx:93-96 e admin/tenants/Tenants.jsx:629. */
  acoes?: React.ReactNode;
}) {
  return (
    <div
      className="row gap-3"
      style={{ alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}
    >
      <div>
        <div className="h2">{titulo}</div>
        {subtitulo && (
          <div className="muted small" style={{ marginTop: 4 }}>
            {subtitulo}
          </div>
        )}
      </div>
      <div className="flex-1" />
      {/* Filtros e ações num grupo só: mesma linha de centro (campo e botão com 36px, como o cabeçalho de
          apps/user/clientes/Clientes.jsx:87-96) e, na janela estreita, quebram juntos e alinhados à direita. */}
      {(filtros || acoes) && (
        <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          {filtros}
          {acoes}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estado vazio e carregando
// Origem: apps/admin/financeiro/Financeiro.jsx:143-147 (Carregando…) e :186-192 (vazio: os-card center + Icon + h2 + muted)
// ---------------------------------------------------------------------------

export function Vazio({
  titulo,
  mensagem,
  icone = "check",
  acao,
}: {
  titulo: string;
  mensagem?: string;
  icone?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="os-card center" style={{ padding: 60, flexDirection: "column" }}>
      <Icon name={icone} size={36} stroke="var(--txt-3)" />
      <div className="h3" style={{ marginTop: 12 }}>
        {titulo}
      </div>
      {mensagem && (
        <div className="muted small" style={{ marginTop: 4, textAlign: "center", maxWidth: 420 }}>
          {mensagem}
        </div>
      )}
      {acao && <div style={{ marginTop: 14 }}>{acao}</div>}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="os-card center" style={{ padding: 60 }}>
      <div className="muted">{texto}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI
// Origem: apps/admin/socio-comercial/SocioComercial.jsx:137-140 (os-card padding 14, muted small, kpi-num 24)
//         e apps/admin/dashboard/Dashboard.jsx:27-47 (o rótulo aqui é `muted small`, não `title-section`: txt-4 dá ~3:1 de contraste)
// ---------------------------------------------------------------------------

export function Kpi({
  rotulo,
  valor,
  sub,
  cor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  /** Cor do valor: "var(--os-sucesso)", "var(--os-erro)", "var(--os-aviso)" (bundle.css:18-20) ou "var(--os-acento-2-brilho)" (:15). */
  cor?: string;
  /** KPI principal do bloco: borda de acento (glow-aurora de bundle.css:2343). */
  destaque?: boolean;
}) {
  return (
    <div
      className={`os-card${destaque ? " glow-aurora" : ""}`}
      style={{ padding: 14, flex: 1, minWidth: 170 }}
    >
      <div className="muted small">{rotulo}</div>
      <div className="kpi-num" style={{ fontSize: 24, marginTop: 6, color: cor }}>
        {valor}
      </div>
      {sub && (
        <div className="muted tiny" style={{ marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function LinhaKpis({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="row gap-3"
      style={{ marginBottom: 16, flexWrap: "wrap", alignItems: "stretch" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aviso em faixa (o "banner" de atraso do original)
// Origem: badge-err de bundle.css:201 dentro de um os-card com borda de erro (aba-receber.tsx:144, "Atrasadas")
// ---------------------------------------------------------------------------

export function Faixa({
  tom = "erro",
  children,
}: {
  tom?: "erro" | "aviso" | "ok";
  children: React.ReactNode;
}) {
  const c = tom === "erro" ? "var(--os-erro)" : tom === "ok" ? "var(--os-sucesso)" : "var(--os-aviso)";
  // Fundo, borda e texto do selo do mesmo tom (badge-err/-success/-warn, bundle.css:199-201), como a
  // `.banner` do artefato (financeiro.html:295: fundo warn-soft, texto warn, borda da cor). Nenhuma cor nova.
  const [fundo, borda, texto] =
    tom === "erro"
      ? ["oklch(0.65 0.24 25 / 0.15)", "oklch(0.65 0.24 25 / 0.4)", "oklch(0.82 0.20 25)"]
      : tom === "ok"
        ? ["oklch(0.72 0.18 145 / 0.15)", "oklch(0.72 0.18 145 / 0.4)", "var(--txt-2)"] // artefato :2653: texto ink-2
        : ["oklch(0.78 0.18 80 / 0.15)", "oklch(0.78 0.18 80 / 0.4)", "oklch(0.88 0.18 80)"];
  return (
    <div
      className="row gap-2"
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        marginBottom: 16,
        background: fundo,
        color: texto,
        border: `1px solid ${borda}`,
      }}
      role="status"
    >
      <Icon name="triangle" size={16} stroke={c} />
      <div className="small">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selo (badge)
// Origem: bundle.css:190-203 — badge, badge-success/warn/err/info/aurora; uso em Financeiro.jsx:159 e Dashboard.jsx:38
// ---------------------------------------------------------------------------

export type TomSelo = "neutro" | "ok" | "aviso" | "erro" | "info" | "aurora";

const CLASSE_SELO: Record<TomSelo, string> = {
  neutro: "badge",
  ok: "badge badge-success",
  aviso: "badge badge-warn",
  erro: "badge badge-err",
  info: "badge badge-info",
  aurora: "badge badge-aurora",
};

export function Selo({ tom = "neutro", children }: { tom?: TomSelo; children: React.ReactNode }) {
  return <span className={CLASSE_SELO[tom]}>{children}</span>;
}

/**
 * Ponto de status no tom do selo (bundle.css:206-210: dot-on/-warn/-err/-off). Aurora e info não têm classe de
 * ponto: usam o token do acento (--os-acento-2 / --os-acento-1, bundle.css:7-8). Serve para dar cor a um cartão
 * sem a borda lateral colorida, que o DESIGN.md da babel proíbe.
 */
export function Ponto({ tom = "neutro", titulo }: { tom?: TomSelo; titulo?: string }) {
  const classe =
    tom === "ok" ? "dot dot-on" : tom === "aviso" ? "dot dot-warn" : tom === "erro" ? "dot dot-err" : tom === "neutro" ? "dot dot-off" : "dot";
  const fundo = tom === "aurora" ? "var(--os-acento-2)" : tom === "info" ? "var(--os-acento-1)" : undefined;
  return (
    <span
      className={classe}
      title={titulo}
      aria-hidden={titulo ? undefined : true}
      style={{ flexShrink: 0, ...(fundo ? { background: fundo } : null) }}
    />
  );
}

// ---------------------------------------------------------------------------
// Campo (rótulo + controle) e controles
// Origem: apps/user/socio-comercial/ModalSaque.tsx:65-77 (div.col.gap-1 > label.label + input.input)
// ---------------------------------------------------------------------------

export function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="col gap-1">
      <label className="label">{rotulo}</label>
      {children}
    </div>
  );
}

/** Fundo do `badge-aurora` (bundle.css:203): o roxo/azul da casa para o que está selecionado ou em destaque. */
export const FUNDO_AURORA = "linear-gradient(135deg, var(--os-acento-1-soft), var(--os-acento-2-soft))";

/** Opções de filtro como "abas pequenas". Origem: Dashboard.jsx:58-62 (`.tabs` + `.tab`/`.tab-on`, período 7d/30d/90d). */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: Array<[T, string]>;
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs">
      {opcoes.map(([k, rotulo]) => (
        <span
          key={k}
          role="tab"
          aria-selected={valor === k}
          tabIndex={0}
          className={`tab ${valor === k ? "tab-on" : ""}`}
          // filtro ativo com cor (chip roxo do artefato, financeiro.html:268): o fundo do badge-aurora (bundle.css:203)
          style={valor === k ? { background: FUNDO_AURORA } : undefined}
          onClick={() => onChange(k)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(k)}
        >
          {rotulo}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navegação de mês (‹ mês ›)
// Origem: apps/user/financeiro/aba-movimentos.tsx:203-209 e :291-295 (botaoNav)
// ---------------------------------------------------------------------------

const botaoNav: React.CSSProperties = {
  // 28px = altura do `btn-sm` (bundle.css:165), o "Backup" na mesma barra: antes 30px, ficava 2px fora de esquadro
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  borderRadius: 8,
  border: "1px solid oklch(0.98 0 0 / 0.1)",
  background: "oklch(0.18 0.06 280 / 0.4)",
  color: "oklch(0.98 0 0 / 0.8)",
  fontSize: 16,
  cursor: "pointer",
};

export function NavegacaoMes({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  return (
    <div className="row" style={{ gap: 8, flexShrink: 0 }}>
      <motion.button
        whileTap={tapPress}
        type="button"
        aria-label="Mês anterior"
        onClick={() => setMes(somarMes(mes, -1))}
        style={botaoNav}
      >
        ‹
      </motion.button>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "oklch(0.98 0 0)",
          textTransform: "capitalize",
          minWidth: 132,
          textAlign: "center",
        }}
      >
        {rotuloMes(mes)}
      </span>
      <motion.button
        whileTap={tapPress}
        type="button"
        aria-label="Próximo mês"
        onClick={() => setMes(somarMes(mes, 1))}
        style={botaoNav}
      >
        ›
      </motion.button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela em cartão
// Origem: apps/user/socio-comercial/AbaComissoes.tsx:19-21 (os-card padding 0 overflow auto > table.tbl)
// Cabeçalho `th` alinha com style textAlign (left/center/right) como em AbaComissoes.tsx:23-24.
// ---------------------------------------------------------------------------

export function CartaoTabela({ children }: { children: React.ReactNode }) {
  const arrastar = usarArrastarParaRolar();
  return (
    <div ref={arrastar} className="os-card" style={{ padding: 0, overflow: "auto" }}>
      <table className="tbl">{children}</table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal (só quando inline/drawer não servem: DESIGN.md "Modal como primeiro impulso" é anti-referência)
// Origem: apps/user/socio-comercial/ModalSaque.tsx:57-62 (modal-backdrop + modal, botão ✕ btn-ghost btn-icon btn-sm)
// Acrescenta Esc para fechar e role="dialog" (acessibilidade; bundle.css:14-23 e 53-63 já cuidam de foco e movimento).
// ---------------------------------------------------------------------------

/** Acima de tudo que o OS desenha (topo e dock 200, indicador de área 201, maior do bundle.css: 300). */
const Z_MODAL = 1200;

export function Modal({
  titulo,
  onClose,
  largura = 460,
  children,
  rodape,
}: {
  titulo: string;
  onClose: () => void;
  largura?: number;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const arrastar = usarArrastarParaRolar();
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  // O modal é desenhado no `body`, fora da janela do Babel OS (2026-09-22, defeito relatado pelo
  // Theus: "a tela da tentativa fica por baixo do app"). Duas coisas quebravam dentro da janela:
  // `.janela` tem `backdrop-filter`, e isso (a) faz dela o containing block de `position: fixed`,
  // então o modal era posicionado e CORTADO dentro da janela em vez de centralizado na tela, e
  // (b) cria um stacking context, prendendo o `z-index: 95` do modal abaixo das camadas do OS
  // (topo e dock 200, indicador 201). O portal resolve os dois de uma vez, para TODOS os modais
  // do app (tentativa, backup, cliente, venda, acesso, reunião, histórico de pagamento).
  return createPortal(
    <>
      <div className="modal-backdrop" style={{ zIndex: Z_MODAL }} onClick={onClose} />
      <div
        className="modal gestao-app"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        ref={arrastar}
        // maxHeight + overflowY: modal alto (Registrar venda) cabia só raspando em 800px de altura;
        // mesmo par de apps/admin/aplicativos/Aplicativos.jsx:185. maxWidth 90vw é o do .modal (bundle.css:2307).
        style={{ maxWidth: "min(" + largura + "px, 90vw)", width: largura, maxHeight: "88vh", overflowY: "auto", zIndex: Z_MODAL + 1 }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div className="h2">{titulo}</div>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Fechar"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="col gap-3">{children}</div>
        {rodape && (
          <div className="row gap-2" style={{ justifyContent: "flex-end", paddingTop: 16 }}>
            {rodape}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Botão de ação da linha
// Antes: o discreto era um botão próprio de 10px de fonte (linha-movimento.tsx:63-67), com ~25px de altura, ao
// lado do primário `btn-sm` de 28px: a mesma linha ficava com duas alturas (fora de esquadro). Agora os dois são
// `btn btn-sm` (bundle.css:144-165): mesma altura, raio, fonte e centro. O discreto é o `btn` neutro (vidro), o
// "perigo" é o mesmo `btn btn-sm` com o texto em --os-erro, como painel-indicacao.tsx faz no "Excluir".
// `tamanho="md"` tira o `btn-sm` (36px) para quando o botão fica no cabeçalho ao lado de um `.input`.
// ---------------------------------------------------------------------------

export function BotaoAcao({
  children,
  onClick,
  perigo,
  desabilitado,
  titulo,
  primario,
  tamanho = "sm",
}: {
  children: React.ReactNode;
  onClick: () => void;
  perigo?: boolean;
  desabilitado?: boolean;
  titulo?: string;
  /** Ação principal da linha: botão de acento (`btn btn-primary btn-sm`, bundle.css:155-166), como o `btn sm`
   *  roxo do artefato (financeiro.html:142). Uma por linha; as demais ficam no estilo discreto. */
  primario?: boolean;
  /** "sm" (28px, linhas e cartões) ou "md" (36px, cabeçalho de aba ao lado de campo). */
  tamanho?: "sm" | "md";
}) {
  const classe = `btn${primario ? " btn-primary" : ""}${tamanho === "sm" ? " btn-sm" : ""}`;
  return (
    <motion.button
      whileTap={tapPress}
      type="button"
      className={classe}
      onClick={onClick}
      disabled={desabilitado}
      title={titulo}
      style={{
        whiteSpace: "nowrap",
        flexShrink: 0,
        opacity: desabilitado ? 0.6 : 1,
        color: perigo && !primario ? "var(--os-erro)" : undefined,
      }}
    >
      {children}
    </motion.button>
  );
}

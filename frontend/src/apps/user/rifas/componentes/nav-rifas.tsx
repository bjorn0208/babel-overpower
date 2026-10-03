/**
 * Navegação do app Rifas — três telas + gaveta (Δ 2026-09-09), visual Arena (Δ 2026-09-12).
 *
 * Antes eram 12 abas numa fila só. O Fabrício responde três perguntas por dia — quem me deve,
 * quem pagou, quanto falta pra fechar a rifa — e precisava garimpar as três em abas diferentes.
 * Agora: **Minhas rifas**, **Balcão** e **Configurar** na frente; cada uma abre as seções que já
 * existiam, como sub-abas. Nada foi apagado: o Bricio segue em botão próprio (decisão do Theus) e o
 * Testar, que é bancada de quem constrói e não do dono, foi pra gaveta "mais".
 *
 * Arena: no celular o cabeçalho é fino (saudação + sino + 📱) e as telas moram numa TAB BAR no pé
 * (`TabBarRifas`, renderizada pelo Rifas.tsx DEPOIS do main — é sticky no fim do scroll, então
 * funciona igual dentro da janela do OS e em /app/rifas). As seções viram segmented control.
 * No desktop (≥1024px sem modo celular) as telas ficam em pílulas no cabeçalho.
 */

import { Bell, Handshake, MoreHorizontal, Settings2, Smartphone, Sparkles, Ticket, FlaskConical } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";

export type SecaoRifas =
  | "dashboard"
  | "atendimento"
  | "pedidos"
  | "dividas"
  | "minhas"
  | "criar"
  | "disparo"
  | "config"
  | "bricio"
  | "testar";

export type TelaRifas = "rifa" | "balcao" | "configurar" | "bricio" | "testar";

export interface DefinicaoTela {
  id: TelaRifas;
  rotulo: string;
  /** Rótulo curto pra tab bar do celular. */
  curto: string;
  icone: string;
  Icone: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Primeira seção = a que abre ao clicar na tela. */
  secoes: { id: SecaoRifas; rotulo: string }[];
  /** Fica na gaveta "mais" em vez da barra principal. */
  naGaveta?: boolean;
}

export const TELAS: DefinicaoTela[] = [
  {
    // Primeira da lista = a que abre o app (pedido do Fabrício, 08/09 22:35). A aba Início
    // saiu junto: o resumo dela virava mais um lugar pra olhar antes de chegar nas rifas.
    // Resultados também saiu da barra — o conteúdo dele agora mora dentro de "Lista".
    id: "rifa",
    rotulo: "Minhas rifas",
    curto: "Rifas",
    icone: "🎟️",
    Icone: Ticket,
    secoes: [
      { id: "minhas", rotulo: "Lista" },
      { id: "dashboard", rotulo: "Números" },
    ],
  },
  {
    id: "balcao",
    rotulo: "Balcão",
    curto: "Balcão",
    icone: "🤝",
    Icone: Handshake,
    secoes: [
      { id: "atendimento", rotulo: "Conversas" },
      { id: "pedidos", rotulo: "Pedidos" },
      { id: "dividas", rotulo: "Dívidas" },
    ],
  },
  {
    id: "configurar",
    rotulo: "Configurar",
    curto: "Config",
    icone: "⚙️",
    Icone: Settings2,
    secoes: [
      { id: "criar", rotulo: "Criar / editar" },
      { id: "disparo", rotulo: "Disparo" },
      { id: "config", rotulo: "Configuração" },
    ],
  },
  { id: "bricio", rotulo: "Bricio", curto: "Bricio", icone: "🎩", Icone: Sparkles, secoes: [{ id: "bricio", rotulo: "Bricio" }] },
  {
    id: "testar",
    rotulo: "Testar",
    curto: "Testar",
    icone: "💬",
    Icone: FlaskConical,
    secoes: [{ id: "testar", rotulo: "Testar" }],
    naGaveta: true,
  },
];

/** Em que tela mora cada seção — usado quando alguém navega direto pra uma seção. */
export const TELA_DA_SECAO: Record<SecaoRifas, TelaRifas> = TELAS.reduce((mapa, tela) => {
  for (const s of tela.secoes) mapa[s.id] = tela.id;
  return mapa;
}, {} as Record<SecaoRifas, TelaRifas>);

const saudacao = () => {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

export interface NavRifasProps {
  tela: TelaRifas;
  secao: SecaoRifas;
  /** true quando há detalhe/grade aberto por cima — nenhuma aba fica marcada. */
  emSubtela: boolean;
  aguardandoValidacao: number;
  modoCelular: boolean;
  aoAlternarModoCelular: () => void;
  aoIrParaSecao: (secao: SecaoRifas) => void;
  aoVoltarAoInicio: () => void;
}

// O contador de comprovantes aparece na tela que resolve isso (Balcão).
const badgeDaTela = (id: TelaRifas, aguardando: number) => (id === "balcao" ? aguardando : 0);

export const NavRifas = ({
  tela,
  secao,
  emSubtela,
  aguardandoValidacao,
  modoCelular,
  aoAlternarModoCelular,
  aoIrParaSecao,
  aoVoltarAoInicio,
}: NavRifasProps) => {
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const gavetaRef = useRef<HTMLDivElement | null>(null);

  // Clique fora fecha a gaveta — sem isso ela fica aberta atrás do conteúdo.
  useEffect(() => {
    if (!gavetaAberta) return;
    const fora = (e: MouseEvent) => {
      if (gavetaRef.current && !gavetaRef.current.contains(e.target as Node)) setGavetaAberta(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [gavetaAberta]);

  const principais = TELAS.filter((t) => !t.naGaveta);
  const naGaveta = TELAS.filter((t) => t.naGaveta);
  const telaAtual = TELAS.find((t) => t.id === tela);
  const secoes = telaAtual?.secoes ?? [];

  return (
    <header className="rifas-header">
      <div className="ar-header-linha">
        {/* Celular: saudação. Desktop: marca. */}
        <button type="button" onClick={aoVoltarAoInicio} className="flex items-center gap-3 shrink-0 text-left">
          <span className="ar-marca">
            <Ticket size={18} strokeWidth={2.2} />
          </span>
          <span className="rifas-nav-mobile flex flex-col lg:hidden">
            <span className="ar-saudacao">{saudacao()}</span>
            <span className="ar-saudacao-nome">{telaAtual?.rotulo ?? "Rifas"}</span>
          </span>
          <span className="rifas-nav-desktop hidden lg:block ar-saudacao-nome">Rifas</span>
        </button>

        {/* Desktop: telas em pílulas */}
        <nav className="rifas-nav-desktop hidden lg:flex flex-1 items-center gap-1 ml-4" aria-label="Telas">
          {principais.map((t) => {
            const ativa = tela === t.id && !emSubtela;
            const badge = badgeDaTela(t.id, aguardandoValidacao);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => aoIrParaSecao(t.secoes[0].id)}
                aria-current={ativa ? "page" : undefined}
                className={`ar-nav-pilula ${ativa ? "ar-nav-pilula--ativa" : ""}`}
              >
                <t.Icone size={16} />
                {t.rotulo}
                {badge > 0 && <span className="ar-badge" style={{ position: "static", boxShadow: "none" }}>{badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Sino: comprovantes esperando validação — leva direto pra Pedidos. */}
          <button
            type="button"
            onClick={() => aoIrParaSecao("pedidos")}
            title={aguardandoValidacao > 0 ? `${aguardandoValidacao} comprovante(s) aguardando validação` : "Pedidos"}
            aria-label="Pedidos aguardando validação"
            className="ar-icone-btn"
          >
            <Bell size={18} />
            {aguardandoValidacao > 0 && <span className="ar-badge">{aguardandoValidacao}</span>}
          </button>

          <button
            type="button"
            onClick={aoAlternarModoCelular}
            title={modoCelular ? "Sair do modo celular" : "Modo celular"}
            aria-pressed={modoCelular}
            aria-label="Modo celular"
            className={`rifas-btn-celular ar-icone-btn ${modoCelular ? "ar-icone-btn--ativo" : ""}`}
          >
            <Smartphone size={18} />
          </button>

          <div className="relative" ref={gavetaRef}>
            <button
              type="button"
              onClick={() => setGavetaAberta((v) => !v)}
              title="Mais"
              aria-label="Mais"
              aria-expanded={gavetaAberta}
              className={`ar-icone-btn ${naGaveta.some((t) => t.id === tela) ? "ar-icone-btn--ativo" : ""}`}
            >
              <MoreHorizontal size={18} />
            </button>
            {gavetaAberta && (
              <div className="ar-menu">
                {naGaveta.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setGavetaAberta(false);
                      aoIrParaSecao(t.secoes[0].id);
                    }}
                    className="ar-menu__item"
                  >
                    <t.Icone size={16} /> {t.rotulo}
                  </button>
                ))}
                <p className="ar-menu__nota">Bancada de quem constrói — o dono da rifa não precisa daqui.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seções da tela atual — some quando a tela tem uma só (Bricio, Testar) */}
      {secoes.length > 1 && (
        <div className="rifas-subnav px-4 pb-3 max-w-[1152px] mx-auto">
          <nav className="ar-seg" aria-label="Seções">
            {secoes.map((s) => {
              const ativa = secao === s.id && !emSubtela;
              const badge = s.id === "pedidos" ? aguardandoValidacao : 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => aoIrParaSecao(s.id)}
                  aria-current={ativa ? "page" : undefined}
                  className={`ar-seg__item ${ativa ? "ar-seg__item--ativo" : ""}`}
                >
                  {s.rotulo}
                  {badge > 0 ? ` · ${badge}` : ""}
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
};

/**
 * Tab bar do celular (some no desktop sem modo celular). Renderizar DEPOIS do `<main>`:
 * é `position: sticky; bottom: 0` no fim do `.rifas-app`, que é quem rola.
 */
export const TabBarRifas = ({
  tela,
  emSubtela,
  aguardandoValidacao,
  aoIrParaSecao,
}: Pick<NavRifasProps, "tela" | "emSubtela" | "aguardandoValidacao" | "aoIrParaSecao">) => {
  const principais = TELAS.filter((t) => !t.naGaveta);
  return (
    <nav className="ar-tabbar rifas-nav-mobile lg:hidden" aria-label="Telas">
      {principais.map((t) => {
        const ativa = tela === t.id && !emSubtela;
        const badge = badgeDaTela(t.id, aguardandoValidacao);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => aoIrParaSecao(t.secoes[0].id)}
            aria-current={ativa ? "page" : undefined}
            className={`ar-tabbar__item ${ativa ? "ar-tabbar__item--ativo" : ""}`}
          >
            <span className="ar-tabbar__icone">
              <t.Icone size={22} strokeWidth={ativa ? 2.4 : 2} />
              {badge > 0 && <span className="ar-badge">{badge}</span>}
            </span>
            <span className="ar-tabbar__rotulo">{t.curto}</span>
          </button>
        );
      })}
    </nav>
  );
};

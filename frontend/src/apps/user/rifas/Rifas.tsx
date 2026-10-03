/**
 * App Rifas — v3 (UI da plataforma transparente, banco real).
 *
 * O tenant cria rifas (prêmio, números, preço, promoções, cotas premiadas),
 * acompanha vendas e sorteia. Vendas entram pelo link público
 * /rifa/<chave_publica>, pelo agente do Conversas (tools consultar_rifa +
 * vender_numeros_rifa) e pela venda manual na grade de números.
 *
 * Banco: rifas · pedidos_rifa · numeros_rifa · rifas_config_tenant.
 * Instalável pela Loja (loja_aplicativos slug='rifas').
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/bundle/bundle-shared";
import { useModoCelularManual } from "@/hooks/use-breakpoint";
import { AbaAtendimento } from "./abas/aba-atendimento";
import { AbaConfig } from "./abas/aba-config";
import { AbaTestar } from "./abas/aba-testar";
import { AbaBricio } from "./abas/aba-bricio";
import { AbaDisparo } from "./abas/aba-disparo";
import { AbaCriar } from "./abas/aba-criar";
import { AbaDividas } from "./abas/aba-dividas";
import { AbaDashboard } from "./abas/aba-dashboard";
import { AbaMinhas } from "./abas/aba-minhas";
import { AbaPedidos } from "./abas/aba-pedidos";
import { AbaResultados } from "./abas/aba-resultados";
import { GradeNumeros } from "./abas/grade-numeros";
import { PainelDetalheRifa } from "./abas/detalhe-rifa";
import { ModalCompartilhar } from "./componentes/modal-compartilhar";
import { NavRifas, TabBarRifas, TELA_DA_SECAO, type SecaoRifas } from "./componentes/nav-rifas";
import type { DetalheRifa, Rifa } from "./tipos";
import { useRifas } from "./use-rifas";
import "./rifas.css";

export function AppRifas() {
  // `secao` é o que era "aba" até 09/09; a `tela` (Hoje/Balcão/A rifa) é derivada dela.
  // Guardar a seção como fonte da verdade manteve todo o resto do arquivo igual.
  const [secao, setSecao] = useState<SecaoRifas>("minhas");
  const [rifaAbertaId, setRifaAbertaId] = useState<string | null>(null);
  const [grade, setGrade] = useState<{ rifa: Rifa; detalhe: DetalheRifa | null } | null>(null);
  const [emEdicao, setEmEdicao] = useState<Rifa | null>(null);
  const [compartilhar, setCompartilhar] = useState<Rifa | null>(null);
  const [dashboardRifaId, setDashboardRifaId] = useState<string | null>(null);

  // Modo celular (reativado 2026-08-25, pedido Dominic): força o layout de
  // telefone dentro da janela do OS. Liga sozinho em tela estreita (<640px),
  // persiste a escolha manual, e aplica a classe `modo-celular` no <html> —
  // é ela que o rifas.css usa pra moldura, grids 1-coluna e scroll invisível.
  // Auto-detecção + persistência via hook único (Fase 0 do plano de
  // responsividade, 2026-08-29) — mesmo comportamento de antes, só que
  // reativo a resize/orientação em vez de checado 1x no mount.
  const { modoCelular: modoCel, alternar: alternarModoCel } = useModoCelularManual("rifas-modo-celular");
  useEffect(() => {
    document.documentElement.classList.toggle("modo-celular", modoCel);
    return () => document.documentElement.classList.remove("modo-celular");
  }, [modoCel]);

  const t = useToast();
  const { rifas, pedidos, statsDe, carregando, erro, recarregar } = useRifas();

  // Identidade ESTÁVEL: as abas usam notificar como dependência do carregar —
  // função inline recriada a cada render fazia as abas "recarregarem sozinhas"
  // a cada evento realtime (incidente aba Imagens, 2026-08-21).
  const notificar = useCallback((mensagem: string, tipo: "info" | "success" | "error" = "info") => {
    if (tipo === "success") t.success(mensagem);
    else if (tipo === "error") t.error(mensagem);
    else t.info(mensagem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aguardandoValidacao = useMemo(
    () => pedidos.filter((p) => p.status === "aguardando_validacao").length,
    [pedidos],
  );

  const rifaAberta = rifaAbertaId ? (rifas.find((r) => r.id === rifaAbertaId) ?? null) : null;

  const abrirRifa = (rifa: Rifa) => {
    setRifaAbertaId(rifa.id);
    setGrade(null);
    setEmEdicao(null);
  };

  const irParaSecao = (proxima: SecaoRifas) => {
    setSecao(proxima);
    setRifaAbertaId(null);
    setGrade(null);
    if (proxima !== "criar") setEmEdicao(null);
  };

  const conteudo = () => {
    if (grade) {
      return (
        <GradeNumeros
          rifa={grade.rifa}
          detalhe={grade.detalhe}
          aoVoltar={() => setGrade(null)}
          aoVendeu={() => void recarregar()}
          aoNotificar={notificar}
        />
      );
    }

    if (rifaAberta) {
      return (
        <PainelDetalheRifa
          rifa={rifaAberta}
          stats={statsDe(rifaAberta.id)}
          aoVoltar={() => setRifaAbertaId(null)}
          aoVenderNumeros={(rifa, detalhe) => setGrade({ rifa, detalhe })}
          aoEditar={(rifa) => {
            setEmEdicao(rifa);
            setSecao("criar");
            setRifaAbertaId(null);
          }}
          aoCompartilhar={setCompartilhar}
          aoMudou={() => void recarregar()}
          aoNotificar={notificar}
        />
      );
    }

    switch (secao) {
      case "criar":
        return (
          <AbaCriar
            rifaEmEdicao={emEdicao}
            aoSalvar={({ id }) => {
              void recarregar();
              setEmEdicao(null);
              if (id) {
                setSecao("minhas");
                setRifaAbertaId(id);
              } else {
                setSecao("minhas");
              }
            }}
            aoCancelar={() => irParaSecao("minhas")}
            aoNotificar={notificar}
          />
        );
      // Resultados deixou de ser aba (pedido do Fabrício, 08/09 22:59) e virou o fim desta
      // página: quem olha as rifas quer ver o sorteio ali, não em outro lugar.
      case "minhas":
        return (
          <>
            <AbaMinhas
              rifas={rifas}
              statsDe={statsDe}
              carregando={carregando}
              aguardandoValidacao={aguardandoValidacao}
              aoAbrir={abrirRifa}
              aoCompartilhar={setCompartilhar}
              aoCriar={() => irParaSecao("criar")}
            />
            {!carregando && (
              <div className="mt-10 pt-8" style={{ borderTop: "1px solid var(--ar-filete)" }}>
                <AbaResultados rifas={rifas} carregando={false} aoAbrir={abrirRifa} />
              </div>
            )}
          </>
        );
      case "pedidos":
        return (
          <AbaPedidos
            pedidos={pedidos}
            rifas={rifas}
            carregando={carregando}
            aoMudou={() => void recarregar()}
            aoNotificar={notificar}
          />
        );
      case "dividas":
        return <AbaDividas aoNotificar={notificar} />;
      case "dashboard":
        return (
          <AbaDashboard
            rifas={rifas}
            pedidos={pedidos}
            statsDe={statsDe}
            rifaSelecionadaId={dashboardRifaId}
            aoSelecionar={setDashboardRifaId}
            carregando={carregando}
            aoAbrir={abrirRifa}
            aoCriar={() => irParaSecao("criar")}
          />
        );
      case "disparo":
        return <AbaDisparo aoNotificar={notificar} />;
      case "atendimento":
        return <AbaAtendimento aoNotificar={notificar} />;
      case "testar":
        return <AbaTestar aoNotificar={notificar} />;
      case "bricio":
        return <AbaBricio aoNotificar={notificar} />;
      case "config":
        return <AbaConfig aoNotificar={notificar} />;
      default:
        return null;
    }
  };

  return (
    <div className="rifas-app min-h-full">
      <NavRifas
        tela={TELA_DA_SECAO[secao]}
        secao={secao}
        emSubtela={!!rifaAberta || !!grade}
        aguardandoValidacao={aguardandoValidacao}
        modoCelular={modoCel}
        aoAlternarModoCelular={alternarModoCel}
        aoIrParaSecao={irParaSecao}
        aoVoltarAoInicio={() => irParaSecao("minhas")}
      />

      {/* Conteúdo */}
      <main>
        {erro && <div className="ar-erro-box mb-6">⚠️ Falha ao carregar: {erro}</div>}
        {conteudo()}
      </main>

      {/* Tab bar do celular — depois do main, sticky no pé do scroll (ver nav-rifas.tsx). */}
      <TabBarRifas
        tela={TELA_DA_SECAO[secao]}
        emSubtela={!!rifaAberta || !!grade}
        aguardandoValidacao={aguardandoValidacao}
        aoIrParaSecao={irParaSecao}
      />

      {/* Compartilhar */}
      <ModalCompartilhar
        aberto={!!compartilhar}
        aoFechar={() => setCompartilhar(null)}
        rifa={compartilhar}
        aoNotificar={notificar}
      />
    </div>
  );
}

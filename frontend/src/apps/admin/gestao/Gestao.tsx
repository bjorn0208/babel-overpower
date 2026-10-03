/**
 * App Gestão — shell modular (mesmo idioma do app Financeiro do usuário e do Consulta admin).
 *
 * Financeiro e operação da própria babel: clientes, vendas, indicações, mensalidades, implantação, suporte,
 * tarefas e acessos. 12 abas; cada uma é um aba-*.tsx.
 *
 * Módulos:
 *   tipos.ts          — tipos, papéis, permissões, datas e formatação, inputStyle
 *   dados.ts          — TODAS as consultas e gravações às gestao_* e RPCs (RLS decide; a UI só esconde)
 *   calculos.ts       — faturamento, previsão, mensalidades, MRR, atrasos, atividade (provado contra o original)
 *   mapa-colecoes.ts  — Backup: documento ↔ linha
 *   ui-gestao.tsx     — cabeçalho de aba, KPI, selo, campo, modal, vazio
 *   grafico-barras.tsx, modal-backup.tsx
 *   aba-*.tsx         — uma por aba
 *
 * Acesso: os papéis vêm do banco (gestao_tem_papel). Quem não tem papel vê "acesso ainda não liberado".
 * Tempo real: assinatura em cada gestao_* que o papel lê; removida ao desmontar (AGENTS.md).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./gestao.css";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";
import { tarefaAtrasada } from "./calculos";
import {
  TABELAS,
  carregarAtividade,
  carregarDados,
  descobrirSessao,
  mensagemDeErro,
  pedirAcesso,
  type ChaveTabela,
  type Sessao,
} from "./dados";
import { ModalBackup } from "./modal-backup";
import {
  ABAS,
  DADOS_VAZIOS,
  PAPEIS,
  abasPermitidas,
  hojeLocal,
  mesAtual,
  pegarToast,
  podeLer,
  type Aba,
  type ChaveDados,
  type Dados,
  type Papel,
  type PropsAba,
  type SupabaseBruto,
} from "./tipos";
import { Carregando, NavegacaoMes, Selo, Vazio, usarArrastarParaRolar } from "./ui-gestao";
import { AbaAcessos } from "./aba-acessos";
import { AbaAtividade } from "./aba-atividade";
import { AbaClientes } from "./aba-clientes";
import { AbaImplementacao } from "./aba-implementacao";
import { AbaIndicacoes } from "./aba-indicacoes";
import { AbaMensalidades } from "./aba-mensalidades";
import { AbaPainel } from "./aba-painel";
import { AbaParcelas } from "./aba-parcelas";
import { AbaProgramador } from "./aba-programador";
import { AbaSuporte } from "./aba-suporte";
import { AbaTarefas } from "./aba-tarefas";
import { AbaVendas } from "./aba-vendas";

const SEM_PAPEIS: Papel[] = [];
/** Espera antes de recarregar depois de um aviso de tempo real (junta rajadas de mudança). */
const ESPERA_TEMPO_REAL_MS = 400;

type EstadoTempoReal = "conectando" | "ao-vivo" | "fora";

export function AppGestao() {
  const t = pegarToast();
  const tRef = useRef(t);
  tRef.current = t;

  const [sessao, setSessao] = useState<Sessao | null>(null);
  // arrastar com o mouse para rolar: a barra de abas (horizontal) e o conteúdo da aba (listas longas)
  const arrastarAbas = usarArrastarParaRolar<HTMLElement>('[role="tab"]');
  const arrastarConteudo = usarArrastarParaRolar();
  const [aba, setAba] = useState<Aba>("painel");
  const [mes, setMes] = useState<string>(mesAtual());
  const [dados, setDados] = useState<Dados>(DADOS_VAZIOS);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [tempoReal, setTempoReal] = useState<EstadoTempoReal>("conectando");
  const [backupAberto, setBackupAberto] = useState(false);

  const papeis = sessao?.papeis ?? SEM_PAPEIS;
  const permitidas = useMemo(() => abasPermitidas(papeis), [papeis]);
  const ehAdmin = papeis.includes("admin");
  const mesRef = useRef(mes);
  mesRef.current = mes;

  // ---- carregamento ----------------------------------------------------------------------------
  /**
   * A Atividade (rpc pesada) nunca derruba o resto da gestão: se falhar, avisa e devolve undefined,
   * e as outras abas carregam normalmente (2026-09-22: um 57014 nela deixava o app inteiro vazio).
   */
  const atividadeSemDerrubar = useCallback(async (p: Papel[], mes: string) => {
    try {
      return await carregarAtividade(p, mes);
    } catch (e) {
      tRef.current.error(mensagemDeErro(e, "Não consegui carregar a atividade da babel."));
      return undefined;
    }
  }, []);

  /** Recarrega do banco as chaves pedidas (ou tudo). Chamar DEPOIS de a gravação ser confirmada. */
  const recarregar = useCallback(
    async (chaves?: ChaveDados[]) => {
      try {
        const tabelas = chaves?.filter((k): k is ChaveTabela => k !== "atividade");
        const querAtividade = !chaves || chaves.includes("atividade");
        const [parcial, atividade] = await Promise.all([
          chaves && tabelas && tabelas.length === 0
            ? Promise.resolve({})
            : carregarDados(papeis, tabelas),
          querAtividade ? atividadeSemDerrubar(papeis, mesRef.current) : Promise.resolve(undefined),
        ]);
        setDados((d) => ({ ...d, ...parcial, ...(atividade ? { atividade } : {}) }));
        setFalhou(false);
      } catch (e) {
        setFalhou(true);
        tRef.current.error(mensagemDeErro(e, "Não consegui atualizar os dados da gestão."));
      }
    },
    [papeis, atividadeSemDerrubar],
  );

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const s = await descobrirSessao();
        if (!vivo) return;
        setSessao(s);
        if (s.papeis.length === 0) return;
        const [parcial, atividade] = await Promise.all([
          carregarDados(s.papeis),
          atividadeSemDerrubar(s.papeis, mesRef.current),
        ]);
        if (vivo) setDados((d) => ({ ...d, ...parcial, ...(atividade ? { atividade } : {}) }));
      } catch (e) {
        if (vivo) {
          setFalhou(true);
          tRef.current.error(mensagemDeErro(e, "Não consegui carregar a gestão."));
        }
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // A atividade cobre os 12 meses que terminam no mês do topo: troca de mês = nova janela
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    if (papeis.length > 0) void recarregar(["atividade"]);
  }, [mes, papeis.length, recarregar]);

  // ---- tempo real: 1 canal, 1 assinatura por tabela que o papel lê; limpo ao desmontar ------------
  useEffect(() => {
    if (!sessao || papeis.length === 0) return;
    const sb = supabase as SupabaseBruto;
    const pendentes = new Set<ChaveDados>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const agendar = (k: ChaveDados) => {
      pendentes.add(k);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const lote = [...pendentes];
        pendentes.clear();
        void recarregar(lote);
      }, ESPERA_TEMPO_REAL_MS);
    };
    const canal = sb.channel(`gestao-${sessao.uid ?? "anon"}`);
    for (const [chave, def] of Object.entries(TABELAS) as Array<
      [ChaveTabela, { tabela: string }]
    >) {
      if (!podeLer(papeis, chave)) continue;
      canal.on("postgres_changes", { event: "*", schema: "public", table: def.tabela }, () =>
        agendar(chave),
      );
    }
    if (podeLer(papeis, "atividade")) {
      canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gestao_atividade" },
        () => agendar("atividade"),
      );
    }
    canal.subscribe((status: string) => {
      setTempoReal(
        status === "SUBSCRIBED"
          ? "ao-vivo"
          : status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT"
            ? "fora"
            : "conectando",
      );
    });
    return () => {
      if (timer) clearTimeout(timer);
      sb.removeChannel(canal);
    };
  }, [sessao, papeis, recarregar]);

  // ---- abas ------------------------------------------------------------------------------------
  useAbaAlvo("gestao", (v) => {
    if (permitidas.includes(v as Aba)) setAba(v as Aba);
  });
  useEffect(() => {
    // como o original (render, linha 676): se a aba atual não é permitida, vai para a primeira permitida
    if (permitidas.length > 0 && !permitidas.includes(aba)) setAba(permitidas[0]);
  }, [permitidas, aba]);

  const tarefasAtrasadas = useMemo(() => {
    const h = hojeLocal();
    return dados.tarefas.filter((x) => tarefaAtrasada(x, h)).length;
  }, [dados.tarefas]);
  const pedidosPendentes = ehAdmin
    ? dados.pedidos.filter((p) => !dados.acessos.some((a) => a.id === p.id)).length
    : 0;

  const propsAba: PropsAba = {
    dados,
    papeis,
    mes,
    setMes,
    t,
    recarregar,
    uid: sessao?.uid ?? null,
    meuNome: sessao?.nome ?? null,
  };
  const abasVisiveis = ABAS.filter((a) => permitidas.includes(a.id));

  // ---- telas de exceção --------------------------------------------------------------------------
  if (carregando) {
    return (
      <div style={{ padding: 18 }}>
        <Carregando />
      </div>
    );
  }

  if (!sessao || !sessao.uid) {
    return (
      <div style={{ padding: 18 }}>
        <Vazio
          icone="lock"
          titulo="Não foi possível identificar sua conta"
          mensagem="Entre na plataforma com a sua conta. O acesso à gestão é liberado por pessoa."
        />
      </div>
    );
  }

  if (papeis.length === 0) {
    return (
      <div style={{ padding: 18 }}>
        <Vazio
          icone="lock"
          titulo="Seu acesso ainda não foi liberado"
          mensagem={
            sessao.pedido
              ? "Seu pedido foi enviado. Assim que um administrador definir a sua área, as abas aparecem aqui."
              : "Peça acesso e um administrador vai definir a sua área: implementação, suporte, programador, comercial ou financeiro."
          }
          acao={
            !sessao.pedido && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  void pedirAcesso(sessao.uid!)
                    .then(() => {
                      t.success("Pedido enviado.");
                      setSessao({
                        ...sessao,
                        pedido: { id: sessao.uid!, pedido_em: new Date().toISOString() },
                      });
                    })
                    .catch((e) => t.error(mensagemDeErro(e, "Não consegui enviar o pedido.")))
                }
              >
                Pedir acesso
              </button>
            )
          }
        />
      </div>
    );
  }

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      className="gestao-app"
      style={{ display: "flex", flexDirection: "column", height: "100%", padding: 18 }}
    >
      {/* Barra de abas (12 abas não cabem em janela pequena: rola na horizontal, sem espremer o texto —
          padrão de apps/user/financeiro/Financeiro.tsx:119-153) + mês, Backup e estado do tempo real */}
      <div
        className="row gap-3"
        style={{
          borderBottom: "1px solid oklch(0.98 0 0 / 0.08)",
          marginBottom: 16,
          alignItems: "flex-end",
        }}
      >
        <nav
          ref={arrastarAbas}
          role="tablist"
          style={{ display: "flex", gap: 4, overflowX: "auto", flex: 1, minWidth: 0 }}
          aria-label="Abas da gestão"
        >
          {abasVisiveis.map((a) => {
            const ativa = aba === a.id;
            const selo =
              a.id === "tarefas" ? tarefasAtrasadas : a.id === "acessos" ? pedidosPendentes : 0;
            return (
              <motion.button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={ativa}
                whileTap={tapPress}
                onClick={() => setAba(a.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: ativa ? 600 : 500,
                  color: ativa ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.55)",
                  background: ativa
                    ? "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.12), oklch(0.65 0.22 280 / 0.08))"
                    : "transparent",
                  border: "none",
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottom: ativa ? "2px solid oklch(0.7 0.18 220)" : "2px solid transparent",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: `color ${duration.normal}s cubic-bezier(${easing.glass.join(",")})`,
                }}
              >
                {a.rotulo}
                {/* bolha vermelha nas duas contagens, como o artefato (.tabbadge, financeiro.html:311) */}
                {selo > 0 && <Selo tom="erro">{selo}</Selo>}
              </motion.button>
            );
          })}
        </nav>
        <div className="row gap-3" style={{ paddingBottom: 6, flexShrink: 0 }}>
          <NavegacaoMes mes={mes} setMes={setMes} />
          {ehAdmin && (
            <button type="button" className="btn btn-sm" onClick={() => setBackupAberto(true)}>
              Backup
            </button>
          )}
          <span
            className="row gap-2 muted tiny"
            title={
              tempoReal === "ao-vivo"
                ? "Atualiza sozinho quando alguém grava"
                : "Sem atualização automática: os dados recarregam depois de cada gravação"
            }
          >
            <span
              className={`dot ${tempoReal === "ao-vivo" ? "dot-on" : tempoReal === "fora" ? "dot-warn" : "dot-off"}`}
            />
            {tempoReal === "ao-vivo"
              ? "ao vivo"
              : tempoReal === "fora"
                ? "sem ao vivo"
                : "conectando…"}
          </span>
        </div>
      </div>

      <div className="muted tiny" style={{ marginTop: -8, marginBottom: 10 }}>
        {papeis.map((p) => PAPEIS.find((x) => x.id === p)?.rotulo ?? p).join(" · ")}
        {falhou ? " · última atualização falhou" : ""}
      </div>

      {/* Área que rola. margin -18 / padding 18 nas laterais (2026-09-25, relato do Adrian: "Aguardando início",
          "Vendas no mês", "Indicações no mês" e "Tarefas em aberto" cortados): o cartão em destaque tem anel e brilho
          (box-shadow) e a área rolável cortava tudo o que passava da borda esquerda do cartão. Agora ela ocupa o recuo
          de 18px da raiz: o conteúdo fica no mesmo lugar e o brilho tem espaço dos dois lados. */}
      <div ref={arrastarConteudo} style={{ flex: 1, overflowY: "auto", minHeight: 0, margin: "0 -18px", padding: "0 18px" }}>
        <AnimatePresence mode="wait">
          {aba === "painel" && <AbaPainel key="painel" {...propsAba} />}
          {aba === "indicacoes" && <AbaIndicacoes key="indicacoes" {...propsAba} />}
          {aba === "vendas" && <AbaVendas key="vendas" {...propsAba} />}
          {aba === "clientes" && <AbaClientes key="clientes" {...propsAba} />}
          {aba === "implementacao" && <AbaImplementacao key="implementacao" {...propsAba} />}
          {aba === "programador" && <AbaProgramador key="programador" {...propsAba} />}
          {aba === "suporte" && <AbaSuporte key="suporte" {...propsAba} />}
          {aba === "tarefas" && <AbaTarefas key="tarefas" {...propsAba} />}
          {aba === "setup" && <AbaParcelas key="setup" {...propsAba} />}
          {aba === "mensalidades" && <AbaMensalidades key="mensalidades" {...propsAba} />}
          {aba === "atividade" && <AbaAtividade key="atividade" {...propsAba} />}
          {aba === "acessos" && <AbaAcessos key="acessos" {...propsAba} />}
        </AnimatePresence>
      </div>

      {backupAberto && (
        <ModalBackup
          t={t}
          onClose={() => setBackupAberto(false)}
          aoImportar={() => void recarregar()}
        />
      )}
    </motion.div>
  );
}

export default AppGestao;

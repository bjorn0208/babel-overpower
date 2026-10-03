// @ts-nocheck
/**
 * App Reunião — lobby de videochamadas (motor LiveKit na VPS), estilo Google Meet.
 *
 * Hero com "Nova reunião" + entrar com link/código, agendamento, lista de
 * salas, equipe e copiar link. Em sessão: TelaChamada com pin/destaque,
 * mão levantada, mute remoto (anfitrião), tela compartilhada como tile
 * próprio, fila de espera (aprovação) e card "Sua reunião está pronta".
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { urlContrato } from "@/lib/url-app";
import { useRole } from "@/auth/useRole";
import TelaChamada from "./TelaChamada";
import PainelDossie from "./PainelDossie";
import PainelTranscricao from "./PainelTranscricao";
import ModalRecursos from "./ModalRecursos";
import ModalRecursoAberto from "./ModalRecursoAberto";
import type { ContratoResumo } from "./ModalRecursos";
import ModalAgendar from "./ModalAgendar";
import LobbyReuniao from "./LobbyReuniao";
import HistoricoReunioes from "./HistoricoReunioes";
import PainelAdminLimite from "./PainelAdminLimite";
import HeroReuniao from "./HeroReuniao";
import CartaoReuniaoPronta from "./CartaoReuniaoPronta";
import PainelEspera from "./PainelEspera";
import { useCarregarLobby } from "./use-carregar-lobby";
import { useSalaEspera } from "./use-sala-espera";
import { useSessaoSala, linkPublico, encerrarSalaPorId } from "./use-sessao-sala";
import { definirRecursoAberto, rtcVivo, sinalizacaoViva } from "./sessao-viva";
import { EstiloReuniao, cor } from "./reuniao-ui";

// prettier-ignore
const s = {
  container: { display: "flex", flexDirection: "column" as const, height: "100%", background: cor.fundo, color: cor.texto1, overflow: "hidden" },
  corpo: { flex: 1, overflow: "auto", padding: "20px 20px 28px", display: "flex", flexDirection: "column" as const, gap: 24 },
} as const;

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Reuniao() {
  const { userId, meuNome, salas, setSalas, membros, carregando, teto, setTeto, configId } =
    useCarregarLobby();
  const [modalAgendar, setModalAgendar] = useState(false);
  const [modalRecursos, setModalRecursos] = useState(false);
  const [contratoEnviado, setContratoEnviado] = useState<{ id: string; titulo: string } | null>(null);
  const [contratoAssinado, setContratoAssinado] = useState(false);

  // A chamada vive em `sessao-viva.ts`, fora do React: minimizar ou fechar
  // esta janela não derruba mais nada. Aqui só lemos o estado e mandamos.
  const {
    sessao,
    estadoRTC,
    recursoAberto,
    aprovacaoAtiva,
    mostrarLinkPronto,
    setMostrarLinkPronto,
    entrando,
    reunirAgora,
    agendarReuniao,
    entrarNaSala,
    sairDaSessao,
    encerrarSala,
    alternarAprovacao,
    copiarLink,
  } = useSessaoSala({
    userId,
    meuNome,
    teto,
    setSalas,
    aoSair: () => {
      setContratoEnviado(null);
      setContratoAssinado(false);
    },
  });

  // ─ Detecção de admin (platform_admin via profiles.system_role) ─
  const { isAdmin } = useRole();

  // ─ Fila de espera (anfitrião com aprovação ligada) ─
  const { pendentes, responder } = useSalaEspera(
    sessao?.salaId ?? null,
    !!sessao?.ehAnfitriao && aprovacaoAtiva,
  );

  // ─ Contrato enviado na call: "assinado ✓" ao vivo (poll leve de 10s) ─
  useEffect(() => {
    if (!contratoEnviado || contratoAssinado) return;
    const id = setInterval(async () => {
      const { data } = await supabase
        .from("contratos")
        .select("status, assinado_em")
        .eq("id", contratoEnviado.id)
        .maybeSingle();
      if (data && (data.assinado_em || (data.status && data.status !== "pendente"))) {
        setContratoAssinado(true);
        toast.success(`Contrato "${contratoEnviado.titulo}" assinado na call ✓`);
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [contratoEnviado, contratoAssinado]);

  function enviarContratoNaCall(contrato: ContratoResumo) {
    const url = urlContrato(contrato.chave_publica);
    const titulo = contrato.titulo || "Contrato";
    void sinalizacaoViva()?.enviarComando("*", "abrir_recurso", { url, titulo });
    setContratoEnviado({ id: contrato.id, titulo });
    setContratoAssinado(false);
    setModalRecursos(false);
    toast.success("Contrato aberto na tela de todos da sala.");
  }

  // ─ Fecho anti-sala-zumbi ─
  // Mora em `sessao-viva.ts` e dispara ao fechar a ABA, não ao desmontar esta
  // janela — minimizar o app precisa manter a chamada de pé.

  // ─ Render: em chamada ─

  if (sessao) {
    return (
      <div style={{ ...s.container, position: "relative" }}>
        <TelaChamada
          estado={estadoRTC}
          meuNome={meuNome}
          ehAnfitriao={sessao.ehAnfitriao}
          meuDoTime
          tituloSala={sessao.titulo}
          alternarMicrofone={() => rtcVivo()?.alternarMicrofone()}
          alternarCamera={() => rtcVivo()?.alternarCamera()}
          alternarTela={async () => {
            await rtcVivo()?.alternarTela();
          }}
          alternarMao={() => rtcVivo()?.alternarMao()}
          alternarMesmoAmbiente={() => rtcVivo()?.alternarMesmoAmbiente()}
          aoSair={() => {
            // Anfitrião saindo de sala vazia = encerra (ninguém fica pra trás;
            // sala aberta sem ninguém era só zumbi no lobby).
            if (sessao.ehAnfitriao && estadoRTC.streamRemotos.length === 0) {
              void encerrarSala();
            } else {
              sairDaSessao();
            }
          }}
          aoEncerrar={
            sessao.ehAnfitriao
              ? () => {
                  // Avisa todo mundo ANTES de derrubar — sem o broadcast os
                  // participantes seguiam em P2P numa sala já encerrada.
                  void sinalizacaoViva()?.enviarComando("*", "encerrar");
                  void encerrarSala();
                }
              : undefined
          }
          aoCopiarLink={() => copiarLink(sessao.chavePublica)}
          aoSilenciarPeer={
            sessao.ehAnfitriao
              ? (peerIdAlvo) => {
                  rtcVivo()?.silenciarPeer(peerIdAlvo);
                  toast.info("Pedido de silêncio enviado.");
                }
              : undefined
          }
          aoAbrirRecursos={sessao.ehAnfitriao ? () => setModalRecursos(true) : undefined}
        />

        {/* Dossiê da call — só o time vê (este componente nem existe no convidado) */}
        <PainelDossie salaId={sessao.salaId} />

        {/* Legenda ao vivo — o que a VPS transcreve aparece aqui e vira ata */}
        <PainelTranscricao salaId={sessao.salaId} />

        {modalRecursos && (
          <ModalRecursos aoEnviar={enviarContratoNaCall} aoFechar={() => setModalRecursos(false)} />
        )}
        {recursoAberto && (
          <ModalRecursoAberto
            url={recursoAberto.url}
            titulo={recursoAberto.titulo}
            aoFechar={() => definirRecursoAberto(null)}
          />
        )}
        {contratoEnviado && (
          <span
            style={{
              position: "absolute", bottom: 96, left: 16, zIndex: 30,
              fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "6px 12px",
              background: contratoAssinado ? "oklch(0.72 0.17 150 / 0.2)" : "oklch(0.16 0.03 264 / 0.8)",
              color: contratoAssinado ? "oklch(0.8 0.15 150)" : "oklch(0.68 0.03 264)",
              border: `1px solid ${contratoAssinado ? "oklch(0.72 0.17 150 / 0.5)" : "oklch(0.3 0.05 264 / 0.45)"}`,
              backdropFilter: "blur(6px)",
            }}
          >
            {contratoAssinado ? "Contrato assinado ✓" : `Contrato na tela: ${contratoEnviado.titulo}`}
          </span>
        )}

        {/* Fila de espera — anfitrião com aprovação ligada */}
        {sessao.ehAnfitriao && <PainelEspera pendentes={pendentes} responder={responder} />}

        {/* Card "Sua reunião está pronta" — estilo Meet, só pro anfitrião recém-criado */}
        {mostrarLinkPronto && (
          <CartaoReuniaoPronta
            link={linkPublico(sessao.chavePublica)}
            onCopiar={() => copiarLink(sessao.chavePublica)}
            onFechar={() => setMostrarLinkPronto(false)}
            aprovacaoAtiva={aprovacaoAtiva}
            onAlternarAprovacao={(ativar) => void alternarAprovacao(ativar)}
          />
        )}
      </div>
    );
  }

  // ─ Render: lobby ─

  return (
    <div style={s.container}>
      <EstiloReuniao />
      {modalAgendar && (
        <ModalAgendar
          onSalvar={agendarReuniao}
          onFechar={() => setModalAgendar(false)}
          maxParticipantes={teto}
        />
      )}
      <div style={s.corpo}>
        <HeroReuniao
          criandoSala={entrando === "novo"}
          onNovaReuniao={() => void reunirAgora()}
          onAgendar={() => setModalAgendar(true)}
        />

        <LobbyReuniao
          salas={salas}
          membros={membros}
          carregando={carregando}
          entrando={entrando}
          onEntrar={(sala) => void entrarNaSala(sala)}
          onCopiarLink={copiarLink}
          onEncerrar={(sala) => {
            // Desligar a call sem entrar nela: era o único jeito antes, e por
            // isso sala ficava `ao_vivo` pra sempre quando ninguém encerrava.
            void (async () => {
              try {
                await encerrarSalaPorId(sala.id);
                setSalas((prev) =>
                  prev.map((s2) => (s2.id === sala.id ? { ...s2, status: "encerrada" } : s2)),
                );
                toast.success("Call desligada.");
              } catch (err) {
                console.error("[Reunião] desligar call pelo lobby", err);
                toast.error("Não consegui desligar a call.");
              }
            })();
          }}
        />

        {/* Calls encerradas com transcrição — análise por IA + ata completa */}
        <HistoricoReunioes />

        {/* Painel admin — visível apenas para platform_admin */}
        {isAdmin && configId && (
          <PainelAdminLimite configId={configId} tetoAtual={teto} onTetoAtualizado={setTeto} />
        )}
      </div>
    </div>
  );
}

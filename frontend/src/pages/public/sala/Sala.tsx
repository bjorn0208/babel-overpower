// @ts-nocheck
/**
 * Página pública da sala de reunião — pré-join branded estilo Google Meet.
 *
 * URL: /sala/:chave
 * Fluxo: info_sala_publica (marca do tenant) → preview + nome →
 * entrar_sala_publica. Sala com aprovação: fica em "aguardando" até o
 * anfitrião autorizar (canal espera). Aprovado → TelaChamada convidado,
 * com as preferências de mic/câmera do pré-join. Ao sair chama
 * sair_sala_publica.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import TelaChamada from "@/apps/user/reuniao/TelaChamada";
import { criarSinalizacao } from "@/apps/user/reuniao/use-sinalizacao";
import { criarWebRTC } from "@/apps/user/reuniao/use-livekit";
import { criarEsperaConvidado } from "@/apps/user/reuniao/use-sala-espera";
import { EstiloReuniao, cor } from "@/apps/user/reuniao/reuniao-ui";
import ModalRecursoAberto from "@/apps/user/reuniao/ModalRecursoAberto";
import PreJoin from "./PreJoin";
import SalaEncerrada from "./SalaEncerrada";
import AguardandoAprovacao from "./AguardandoAprovacao";
import { s } from "./sala-estilos";
import type { InfoMarca } from "./MarcaEmpresa";
import type { EstadoWebRTC, HandleWebRTC } from "@/apps/user/reuniao/use-livekit";
import type { HandleSinalizacao } from "@/apps/user/reuniao/use-sinalizacao";
import type { EsperaConvidado } from "@/apps/user/reuniao/use-sala-espera";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type InfoSala = {
  sala_id: string;
  participante_id: string;
  titulo: string;
  status: string;
  status_entrada?: string;
};

type Etapa = "nome" | "aguardando" | "negado" | "chamada" | "encerrada";

const ESTADO_RTC_VAZIO: EstadoWebRTC = {
  streamLocal: null,
  streamTelaLocal: null,
  streamRemotos: [],
  compartilhandoTela: false,
  mutado: false,
  semVideo: false,
  minhaMaoLevantada: false,
  mesmoAmbiente: false,
};

// ─── peerId único por sessão de aba ─────────────────────────────────────────

const peerId = crypto.randomUUID();

// ─── Componente ──────────────────────────────────────────────────────────────

export default function SalaPublica() {
  const { chave } = useParams<{ chave: string }>();

  const [etapa, setEtapa] = useState<Etapa>("nome");
  const [nome, setNome] = useState("");
  const [marca, setMarca] = useState<InfoMarca | null>(null);
  const [tituloSala, setTituloSala] = useState("Reunião");
  const [exigeAprovacao, setExigeAprovacao] = useState(false);
  const [infoSala, setInfoSala] = useState<InfoSala | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [erroEntrada, setErroEntrada] = useState<string | null>(null);
  const [micDesligado, setMicDesligado] = useState(false);
  const [camDesligada, setCamDesligada] = useState(false);
  const [estadoRTC, setEstadoRTC] = useState<EstadoWebRTC>(ESTADO_RTC_VAZIO);
  const [recursoAberto, setRecursoAberto] = useState<{ url: string; titulo: string } | null>(null);

  const webrtcRef = useRef<HandleWebRTC | null>(null);
  const sinalizacaoRef = useRef<HandleSinalizacao | null>(null);
  const participanteIdRef = useRef<string | null>(null);
  const esperaRef = useRef<EsperaConvidado | null>(null);
  const prefsRef = useRef({ micDesligado: false, camDesligada: false });

  // ─ Marca + estado da sala (antes de entrar) ─

  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.rpc("info_sala_publica", { p_chave: chave });
      if (!vivo || error || !data) return;
      const info = data as InfoMarca & {
        titulo?: string;
        status?: string;
        exige_aprovacao?: boolean;
      };
      setMarca(info);
      if (info.titulo) setTituloSala(info.titulo);
      setExigeAprovacao(info.exige_aprovacao ?? false);
      if (info.status === "encerrada" || info.status === "cancelada") setEtapa("encerrada");
    })();
    return () => {
      vivo = false;
    };
  }, [chave]);

  // ─ Inicializa WebRTC quando entra na sala ─

  useEffect(() => {
    if (!infoSala || etapa !== "chamada") return;

    const rtc = criarWebRTC({
      meuPeerId: peerId,
      chavePublica: chave ?? "",
      nome,
      onEstadoMudou: setEstadoRTC,
      onSilenciadoPeloAnfitriao: () => toast.info("O anfitrião silenciou seu microfone."),
      onEncerradaPeloAnfitriao: () => {
        toast.info("O anfitrião encerrou a reunião.");
        setEtapa("encerrada");
      },
      onAbrirRecurso: (url, titulo) => setRecursoAberto({ url, titulo }),
    });
    webrtcRef.current = rtc;

    const sig = criarSinalizacao({
      salaId: infoSala.sala_id,
      peerId,
      nome,
      onPeerEntrou: rtc.onPeerEntrou,
      onPeerSaiu: rtc.onPeerSaiu,
      onPeersSync: rtc.onPeersSync,
      onComando: rtc.onComando,
    });
    sinalizacaoRef.current = sig;
    rtc.conectarSinalizacao(sig);

    void rtc.iniciarMidia().then(() => {
      // Aplica as preferências escolhidas no pré-join
      if (prefsRef.current.micDesligado) rtc.alternarMicrofone();
      if (prefsRef.current.camDesligada) rtc.alternarCamera();
      void sig.iniciar();
    });

    return () => {
      rtc.destruir();
      void sig.destruir();
      webrtcRef.current = null;
      sinalizacaoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoSala?.sala_id, etapa]);

  // ─ beforeunload: registra saída ─

  useEffect(() => {
    const handle = () => {
      const pid = participanteIdRef.current;
      if (pid) void supabase.rpc("sair_sala_publica", { p_participante_id: pid });
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, []);

  // ─ Ações ─

  async function entrar() {
    if (!nome.trim()) {
      setErroEntrada("Digite seu nome para entrar na sala.");
      return;
    }
    if (!chave) {
      setErroEntrada("Link inválido.");
      return;
    }
    setEntrando(true);
    setErroEntrada(null);
    prefsRef.current = { micDesligado, camDesligada };
    try {
      const { data, error } = await supabase.rpc("entrar_sala_publica", {
        p_chave: chave,
        p_nome: nome.trim(),
      });
      if (error) throw error;
      const res = data as InfoSala;
      if (res.status === "encerrada" || res.status === "cancelada") {
        setEtapa("encerrada");
        return;
      }
      participanteIdRef.current = res.participante_id;

      if (res.status_entrada === "pendente") {
        setEtapa("aguardando");
        const espera = criarEsperaConvidado(res.sala_id, res.participante_id, nome.trim());
        esperaRef.current = espera;
        const aprovado = await espera.aguardar();
        await espera.cancelar();
        esperaRef.current = null;
        if (aprovado) {
          setInfoSala(res);
          setEtapa("chamada");
        } else {
          setEtapa("negado");
        }
        return;
      }

      setInfoSala(res);
      setEtapa("chamada");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : ((err as { message?: string })?.message ?? String(err));
      console.error("[Sala pública] entrar", msg);
      if (msg.includes("nao_encontrada") || msg.includes("indisponivel")) {
        setErroEntrada("Sala não encontrada ou link expirado.");
      } else if (msg.includes("lotada")) {
        setErroEntrada("A sala está lotada. Aguarde um participante sair.");
      } else {
        setErroEntrada("Não foi possível entrar na sala. Tente novamente.");
      }
    } finally {
      setEntrando(false);
    }
  }

  async function cancelarEspera() {
    await esperaRef.current?.cancelar();
    esperaRef.current = null;
    const pid = participanteIdRef.current;
    if (pid) {
      void supabase.rpc("sair_sala_publica", { p_participante_id: pid });
      participanteIdRef.current = null;
    }
    setEtapa("nome");
  }

  async function sair() {
    const pid = participanteIdRef.current;
    if (pid) {
      await supabase.rpc("sair_sala_publica", { p_participante_id: pid });
      participanteIdRef.current = null;
    }
    setInfoSala(null);
    setEtapa("nome");
    setEstadoRTC(ESTADO_RTC_VAZIO);
  }

  // ─ Render por etapa ─

  if (etapa === "encerrada") return <SalaEncerrada />;

  if (etapa === "chamada" && infoSala) {
    return (
      <div style={{ height: "100dvh", background: cor.fundoChamada }}>
        <TelaChamada
          estado={estadoRTC}
          meuNome={nome}
          ehAnfitriao={false}
          tituloSala={infoSala.titulo}
          alternarMicrofone={() => webrtcRef.current?.alternarMicrofone()}
          alternarCamera={() => webrtcRef.current?.alternarCamera()}
          alternarTela={async () => {
            await webrtcRef.current?.alternarTela();
          }}
          alternarMao={() => webrtcRef.current?.alternarMao()}
          alternarMesmoAmbiente={() => webrtcRef.current?.alternarMesmoAmbiente()}
          aoSair={() => void sair()}
          aoCopiarLink={() => void navigator.clipboard.writeText(window.location.href)}
        />
        {recursoAberto && (
          <ModalRecursoAberto
            url={recursoAberto.url}
            titulo={recursoAberto.titulo}
            aoFechar={() => setRecursoAberto(null)}
          />
        )}
      </div>
    );
  }

  if (etapa === "aguardando" || etapa === "negado") {
    return (
      <div style={s.pagina}>
        <EstiloReuniao />
        <AguardandoAprovacao
          nomeSala={tituloSala}
          negado={etapa === "negado"}
          onCancelar={() => void cancelarEspera()}
        />
      </div>
    );
  }

  return (
    <div style={s.pagina}>
      <EstiloReuniao />
      <PreJoin
        marca={marca}
        exigeAprovacao={exigeAprovacao}
        nome={nome}
        onNome={setNome}
        micDesligado={micDesligado}
        camDesligada={camDesligada}
        onAlternarMic={() => setMicDesligado((v) => !v)}
        onAlternarCam={() => setCamDesligada((v) => !v)}
        erro={erroEntrada}
        entrando={entrando}
        onEntrar={() => void entrar()}
      />
    </div>
  );
}

/**
 * Página pública de AGENDAMENTO (/agendar/:chave) — família visual dos links públicos (pp-*).
 *
 * Fluxo (decisão Theus 2026-06-11/12): o agente envia este link; o contato vê o CALENDÁRIO
 * do mês (navega pros próximos meses, limitado pela config do tenant), clica num dia com
 * horário LIVRE, escolhe horário + motivo + nome + WhatsApp e confirma. Ocupados nunca
 * aparecem — só não ficam clicáveis. Sucesso entrega o link da sala do app Reunião.
 * Branding (logo/banner/cor) é automático. Fontes: RPCs públicas obter_agenda_publica +
 * confirmar_agendamento_publico (rate limit).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { injetarEstilosGlobais } from "./contrato/estilos";
import { injetarEstilosAgenda } from "./agendar/calendario-estilos";
import { PpHeader, PpFooter, TelaCarregando, TelaErro } from "./contrato/PpLayout";
import { PpIcone } from "./contrato/PpIcone";
import { CalendarioMes } from "./agendar/CalendarioMes";
import { PainelDia } from "./agendar/PainelDia";

type Dados = {
  ok: boolean;
  erro?: string;
  status?: "pendente" | "agendado";
  slots?: string[];
  duracao_min?: number;
  meses_a_frente?: number;
  limite?: string; // "YYYY-MM-DD"
  nome_exibicao?: string;
  logo_url?: string | null;
  banner_url?: string | null;
  cor_pagina?: string | null;
  scheduled_at?: string;
  link_sala?: string;
};

// RPCs novas ainda fora dos types gerados — cast bruto (mesmo padrão da Consulta pública).
type RpcBruto = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const sb = supabase as unknown as RpcBruto;

const BRT = "America/Sao_Paulo";
const chaveDia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: BRT });
const horaLegivel = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: BRT, hour: "2-digit", minute: "2-digit" });
const diaLegivel = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: BRT, weekday: "long", day: "2-digit", month: "long" });
const diaLongo = (chave: string) =>
  new Date(`${chave}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

const hojeChave = () => new Date().toLocaleDateString("en-CA", { timeZone: BRT });
const mesDe = (chave: string) => ({ ano: Number(chave.slice(0, 4)), mes: Number(chave.slice(5, 7)) - 1 });
const cmpMes = (a: { ano: number; mes: number }, b: { ano: number; mes: number }) =>
  a.ano * 12 + a.mes - (b.ano * 12 + b.mes);
const addMes = (m: { ano: number; mes: number }, delta: number) => {
  const d = new Date(m.ano, m.mes + delta, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
};

export default function Agendar() {
  const { chave } = useParams<{ chave: string }>();
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mesVis, setMesVis] = useState(() => mesDe(hojeChave()));
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [slotSel, setSlotSel] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<{ scheduled_at: string; link_sala: string } | null>(null);

  useEffect(() => {
    injetarEstilosGlobais();
    injetarEstilosAgenda();
    if (!chave) return;
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  async function carregar() {
    const { data } = await sb.rpc("obter_agenda_publica", { p_token: chave });
    setDados((data as Dados | null) ?? { ok: false, erro: "erro" });
    setCarregando(false);
  }

  const slotsPorDia = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const iso of dados?.slots ?? []) {
      const k = chaveDia(iso);
      mapa.set(k, [...(mapa.get(k) ?? []), iso]);
    }
    return mapa;
  }, [dados]);

  const diasComSlot = useMemo(() => new Set(slotsPorDia.keys()), [slotsPorDia]);
  const hoje = hojeChave();
  const mesHoje = mesDe(hoje);
  const mesLimite = dados?.limite ? mesDe(dados.limite) : mesHoje;

  function selecionarDia(c: string) {
    setDiaSel(c);
    setSlotSel(null);
    setErroEnvio(null);
  }

  async function confirmar() {
    if (!chave || !slotSel || !nome.trim()) return;
    setEnviando(true);
    setErroEnvio(null);
    const { data, error } = await sb.rpc("confirmar_agendamento_publico", {
      p_token: chave,
      p_inicio: slotSel,
      p_dados: { nome: nome.trim(), telefone: telefone.trim(), motivo: motivo.trim() },
    });
    setEnviando(false);
    const r = data as { ok?: boolean; erro?: string; scheduled_at?: string; link_sala?: string } | null;
    if (error || !r?.ok) {
      setErroEnvio(r?.erro === "horario_indisponivel"
        ? "Esse horário acabou de ser ocupado. Escolha outro, por favor."
        : "Não foi possível confirmar agora. Tente de novo em instantes.");
      if (r?.erro === "horario_indisponivel") {
        setSlotSel(null);
        await carregar();
      }
      return;
    }
    setSucesso({ scheduled_at: r.scheduled_at!, link_sala: r.link_sala! });
  }

  if (carregando) return <TelaCarregando />;
  if (!dados?.ok && dados?.erro !== undefined && dados?.status !== "agendado") {
    return <TelaErro mensagem={dados.erro === "nao_encontrado" ? "Link de agendamento não encontrado." : "Esta agenda não está disponível no momento."} />;
  }

  const nomeEmpresa = dados?.nome_exibicao ?? "Agendamento";
  const agendado = sucesso ?? (dados?.status === "agendado"
    ? { scheduled_at: dados.scheduled_at!, link_sala: dados.link_sala! }
    : null);
  const slotsDoDia = diaSel ? (slotsPorDia.get(diaSel) ?? []) : [];

  return (
    <div className="pp-app" style={dados?.cor_pagina ? ({ ["--pp-acc" as string]: dados.cor_pagina }) : undefined}>
      <div className="pp-bg" />
      <PpHeader nomeEmpresa={nomeEmpresa} logoUrl={dados?.logo_url ?? null} letreiro="Agendamento" />

      {dados?.banner_url && (
        <div style={{ width: "100%", maxHeight: 180, overflow: "hidden", lineHeight: 0 }}>
          <img src={dados.banner_url} alt="" style={{ width: "100%", height: "auto", objectFit: "cover", display: "block" }} />
        </div>
      )}

      <main className="pp-main">
        {agendado ? (
          <div className="pp-card pp-fade">
            <div className="pp-step-icon"><PpIcone nome="check" tamanho={20} /></div>
            <h2 className="pp-step-title">Reunião confirmada!</h2>
            <p className="pp-step-sub">
              {diaLegivel(agendado.scheduled_at)} às {horaLegivel(agendado.scheduled_at)}.
              Guarde o link abaixo — é por ele que a reunião acontece.
            </p>
            <a className="pp-btn pp-btn-primary pp-btn-block" style={{ textDecoration: "none" }} href={agendado.link_sala}>
              Entrar na sala da reunião <PpIcone nome="chevr" tamanho={14} />
            </a>
            <p className="pp-step-sub" style={{ marginTop: 12, fontSize: 12 }}>
              Você também vai receber um lembrete antes do horário.
            </p>
          </div>
        ) : (
          <div className="pp-card pp-fade">
            <div className="pp-step-icon"><PpIcone nome="sparkles" tamanho={20} /></div>
            <h2 className="pp-step-title">Escolha o melhor dia</h2>
            <p className="pp-step-sub">Toque num dia destacado e veja os horários livres (horário de Brasília).</p>

            {!diasComSlot.size ? (
              <p className="pp-step-sub" style={{ padding: "8px 0 14px" }}>
                Nenhum horário livre por enquanto. Volte à conversa e combine direto com o atendimento.
              </p>
            ) : (
              <div className="pp-agendar-2col">
                <CalendarioMes
                  ano={mesVis.ano}
                  mes={mesVis.mes}
                  hoje={hoje}
                  diasComSlot={diasComSlot}
                  diaSel={diaSel}
                  podeVoltar={cmpMes(mesVis, mesHoje) > 0}
                  podeAvancar={cmpMes(mesVis, mesLimite) < 0}
                  onVoltar={() => setMesVis(addMes(mesVis, -1))}
                  onAvancar={() => setMesVis(addMes(mesVis, 1))}
                  onSelecionarDia={selecionarDia}
                />
                <PainelDia
                  diaLongo={diaSel ? diaLongo(diaSel) : ""}
                  slotsDoDia={slotsDoDia}
                  slotSel={slotSel}
                  onSelecionarSlot={setSlotSel}
                  nome={nome} setNome={setNome}
                  telefone={telefone} setTelefone={setTelefone}
                  motivo={motivo} setMotivo={setMotivo}
                  enviando={enviando}
                  erroEnvio={erroEnvio}
                  onConfirmar={() => void confirmar()}
                  horaLegivel={horaLegivel}
                />
              </div>
            )}
          </div>
        )}
      </main>

      <PpFooter chavePublica={chave ?? ""} nomeEmpresa={nomeEmpresa} />
    </div>
  );
}

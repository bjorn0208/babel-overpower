/**
 * Chat "limpo" do Kanban de atendimento (Theus 2026-09-02) — tema escuro
 * igual WhatsApp de verdade (referência do Theus: header escuro, bolha
 * verde/cinza, composer em pílula). Sem painel lateral fixo — o header tem
 * só seta de voltar (esquerda) + nome/toggle IA (meio) + ícone de Dossiê
 * (direita, abre sob demanda — ver `DossieCliente`).
 *
 * Arena (2026-09-12): a paleta WhatsApp saiu; o chat usa `.ar-chat*` / `.ar-balao*`
 * de `abas/aba-atendimento.css` — bolha de saída roxa, entrada em chumbo alto.
 */

import { useEffect, useRef, useState } from "react";
import {
  alternarAgenteConversa,
  assinarMensagensNovas,
  buscarConversaResumo,
  enviarMensagemHumano,
  listarMensagens,
  type MensagemChat,
} from "../dados-chat-atendimento";
import {
  listarTemplates,
  renderizarTemplate,
  variaveisDaRifaAtiva,
  type TemplateMensagem,
} from "../dados-templates";

export interface ChatAtendimentoProps {
  conversaId: string;
  nome: string | null;
  fotoUrl: string | null;
  aoVoltar: () => void;
  aoAbrirDossie: () => void;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

const iniciais = (nome: string | null) =>
  (nome ?? "")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export const ChatAtendimento = ({ conversaId, nome, fotoUrl, aoVoltar, aoAbrirDossie, aoNotificar }: ChatAtendimentoProps) => {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [agenteLigado, setAgenteLigado] = useState(true);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateMensagem[]>([]);
  const [templatesAberto, setTemplatesAberto] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listarMensagens(conversaId).then(setMensagens).catch(() => setMensagens([]));
    buscarConversaResumo(conversaId).then((r) => {
      if (r) {
        setAgenteLigado(r.agentEnabled);
        setLeadId(r.leadId);
      }
    });
    listarTemplates().then(setTemplates).catch(() => setTemplates([]));
    const cancelar = assinarMensagensNovas(conversaId, (m) => setMensagens((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m])));
    return cancelar;
  }, [conversaId]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  const toggleAgente = async () => {
    const novo = !agenteLigado;
    setAgenteLigado(novo);
    try {
      await alternarAgenteConversa(conversaId, novo);
    } catch (e) {
      setAgenteLigado(!novo);
      aoNotificar(`Falha ao alternar IA: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !leadId) return;
    setEnviando(true);
    try {
      await enviarMensagemHumano(conversaId, leadId, t);
      setTexto("");
    } catch (e) {
      aoNotificar(`Falha ao enviar: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="ar-chat">
      {/* Cabeçalho — seta voltar / nome+IA / dossiê */}
      <div className="ar-chat__topo">
        <button onClick={aoVoltar} className="ar-icone-btn" aria-label="Voltar">
          ←
        </button>
        <div className="ar-avatar">
          {fotoUrl ? <img src={fotoUrl} alt={nome ?? ""} /> : iniciais(nome)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="ar-txt-1 font-semibold truncate leading-tight">{nome || "Contato"}</p>
          <p className={`text-xs truncate ${agenteLigado ? "ar-txt-3" : "ar-chat__ia-aviso"}`}>
            {agenteLigado ? "IA respondendo" : "IA pausada — você está no controle"}
          </p>
        </div>
        <button
          onClick={() => void toggleAgente()}
          aria-pressed={agenteLigado}
          className={`ar-ia-toggle${agenteLigado ? " ar-ia-toggle--ligado" : " ar-ia-toggle--pausado"}`}
          title={agenteLigado ? "IA respondendo — clique pra pausar" : "IA pausada — clique pra reativar"}
        >
          {agenteLigado ? "🤖" : "⏸"}
        </button>
        <button onClick={aoAbrirDossie} className="ar-icone-btn" aria-label="Dossiê do cliente" title="Dossiê do cliente">
          📇
        </button>
      </div>

      {/* Bolhas */}
      <div className="ar-chat__msgs">
        {mensagens.length === 0 && <p className="ar-txt-4 text-center text-xs mt-6">Nenhuma mensagem ainda.</p>}
        {mensagens.map((m) => {
          const entrou = m.role === "user";
          return (
            <div key={m.id} className={`ar-balao ${entrou ? "ar-balao--entrou" : "ar-balao--saiu"}`}>
              {m.content}
              <span className="ar-balao__hora">{formatarHora(m.createdAt)}</span>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      {/* Composer em pílula */}
      <div className="ar-chat__composer">
        {templatesAberto && templates.length > 0 && (
          <div className="ar-chat__templates">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  // Δ 2026-09-08: as variáveis vêm da rifa ativa. Antes ia `{}` e o cliente
                  // recebia "{{titulo}}" escrito na mensagem.
                  setTemplatesAberto(false);
                  void variaveisDaRifaAtiva(nome).then((vars) =>
                    setTexto(renderizarTemplate(t.mensagem, vars)),
                  );
                }}
                className="ar-chat__template"
              >
                {t.titulo}
              </button>
            ))}
          </div>
        )}
        {templates.length > 0 && (
          <button
            onClick={() => setTemplatesAberto((v) => !v)}
            className="ar-icone-btn"
            title="Usar template"
            aria-label="Usar template"
          >
            📄
          </button>
        )}
        <div className="ar-chat__campo">
          <textarea
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                void enviar();
              }
            }}
            placeholder="Mensagem"
            rows={1}
          />
        </div>
        <button
          onClick={() => void enviar()}
          disabled={!texto.trim() || enviando}
          className="ar-chat__enviar"
          aria-label="Enviar"
        >
          {enviando ? "…" : "➤"}
        </button>
      </div>
    </div>
  );
};

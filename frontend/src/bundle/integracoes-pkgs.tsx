/*
 * Integrações dos 5 pacotes ativados em PR-13/13b/14/15/16:
 *  - @assistant-ui/react  → MentorChatAssistantUI
 *  - ai (Vercel AI SDK)   → conversor de mensagens + adapter HTTP
 *  - @tambo-ai/react      → wrapper TamboProvider (scaffold)
 *  - dockview-react       → AppWorkspaceDockview
 *  - react-resizable-panels → reexport conveniente p/ bundle.jsx
 *
 * Estratégia: tudo isolado neste arquivo; bundle.jsx consome via window.*.
 */
import * as React from "react";
import { AssistantRuntimeProvider, useLocalRuntime, ThreadPrimitive, MessagePrimitive, ComposerPrimitive } from "@assistant-ui/react";
import type { ChatModelAdapter } from "@assistant-ui/react";
import { TamboProvider } from "@tambo-ai/react";
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview-react";
import { Group as RpGroup, Panel as RpPanel, Separator as RpSeparator } from "react-resizable-panels";
import "dockview-react/dist/styles/dockview.css";
import { supabase } from "@/integrations/supabase/client";

/* ========================================================================
 *  Adapter HTTP que fala com a edge function `mentor-chat` (OpenRouter)
 *  Conversor de mensagens inspirado no Vercel AI SDK (formato { role, content }).
 * ====================================================================== */
const mentorChatAdapter: ChatModelAdapter = {
  async run({ messages, abortSignal }) {
    const historico = messages.map((m) => {
      const role: "user" | "assistant" | "system" =
        m.role === "user" ? "user" : m.role === "system" ? "system" : "assistant";
      const content = m.content
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n");
      return { role, content };
    });

    const { data, error } = await supabase.functions.invoke("mentor-chat", {
      body: { messages: historico },
    });
    if (abortSignal?.aborted) throw new Error("aborted");
    if (error) throw new Error(error.message || "falha_mentor_chat");
    if (data?.error) throw new Error(data.error);

    return {
      content: [{ type: "text", text: (data?.reply || "").trim() || "Sem resposta." }],
    };
  },
};

/* ========================================================================
 *  Thread UI mínima estilo aurora
 * ====================================================================== */
function MentorThreadUI() {
  return (
    <ThreadPrimitive.Root className="aui-root col" style={{ height: "100%", background: "transparent" }}>
      <ThreadPrimitive.Viewport className="flex-1 scroll col" style={{ overflowY: "auto", padding: 22, gap: 14 }}>
        <ThreadPrimitive.Empty>
          <div className="muted small">O Mentor está pronto. Mande sua primeira mensagem.</div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: () => (
              <MessagePrimitive.Root className="col gap-2" style={{ alignItems: "flex-end" }}>
                <div className="bolha-out">
                  <MessagePrimitive.Parts />
                </div>
              </MessagePrimitive.Root>
            ),
            AssistantMessage: () => (
              <MessagePrimitive.Root className="col gap-2" style={{ alignItems: "flex-start" }}>
                <div className="bolha-in">
                  <MessagePrimitive.Parts />
                </div>
              </MessagePrimitive.Root>
            ),
          }}
        />
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root
        className="row gap-2 os-vidro"
        style={{ padding: 6, paddingLeft: 14, margin: "12px 22px", borderRadius: 12 }}
      >
        <ComposerPrimitive.Input
          className="input"
          placeholder="Pergunte ao Mentor (assistant-ui)…"
          style={{ background: "transparent", border: "none", boxShadow: "none", height: 36, flex: 1 }}
        />
        <ComposerPrimitive.Send className="btn btn-primary">Enviar</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

/* ========================================================================
 *  MentorChatAssistantUI — embrulhado em TamboProvider (Gen UI scaffold)
 * ====================================================================== */
export function MentorChatAssistantUI() {
  const runtime = useLocalRuntime(mentorChatAdapter);
  const tamboKey = (typeof window !== "undefined" && (window as any).__TAMBO_KEY__) || "";
  const inner = (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="aurora-shadcn-bridge" style={{ height: "100%" }}>
        <MentorThreadUI />
      </div>
    </AssistantRuntimeProvider>
  );
  // Tambo exige apiKey. Sem chave configurada, render sem provider (scaffold pronto).
  if (!tamboKey) return inner;
  return <TamboProvider apiKey={tamboKey}>{inner}</TamboProvider>;
}

/* ========================================================================
 *  AppWorkspaceDockview — demonstra dockview-react com 3 painéis empilháveis
 *  Não substitui o <Janela> do shell (decisão deliberada PR-14).
 * ====================================================================== */
function PanelMentor(_props: IDockviewPanelProps) {
  return (
    <div style={{ height: "100%", background: "var(--os-vidro)", padding: 0 }}>
      <MentorChatAssistantUI />
    </div>
  );
}
function PanelNotas(_props: IDockviewPanelProps) {
  const [txt, setTxt] = React.useState("");
  return (
    <div className="col" style={{ height: "100%", padding: 12, gap: 8 }}>
      <div className="title-section">Notas rápidas</div>
      <textarea
        className="input"
        style={{ flex: 1, background: "var(--os-vidro)", border: "1px solid var(--os-vidro-borda)", padding: 12, resize: "none" }}
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        placeholder="Anote ideias do mentor…"
      />
    </div>
  );
}
function PanelKpis(_props: IDockviewPanelProps) {
  const kpis = [
    { l: "Conversas", v: "234" },
    { l: "Leads quentes", v: "18" },
    { l: "Conversão", v: "14.2%" },
    { l: "Ticket", v: "R$ 2.180" },
  ];
  return (
    <div className="col" style={{ height: "100%", padding: 12, gap: 10, overflow: "auto" }}>
      <div className="title-section">KPIs da semana</div>
      {kpis.map((k) => (
        <div key={k.l} className="os-card" style={{ padding: 12 }}>
          <div className="muted tiny">{k.l}</div>
          <div className="kpi-num os-aurora-text" style={{ fontSize: 22 }}>{k.v}</div>
        </div>
      ))}
    </div>
  );
}

const dockviewComponents = {
  mentor: PanelMentor,
  notas: PanelNotas,
  kpis: PanelKpis,
};

export function AppWorkspace() {
  const onReady = (event: DockviewReadyEvent) => {
    event.api.addPanel({ id: "mentor", component: "mentor", title: "Mentor" });
    event.api.addPanel({ id: "kpis", component: "kpis", title: "KPIs", position: { referencePanel: "mentor", direction: "right" } });
    event.api.addPanel({ id: "notas", component: "notas", title: "Notas", position: { referencePanel: "kpis", direction: "below" } });
  };
  return (
    <div className="aurora-shadcn-bridge dockview-theme-abyss" style={{ height: "100%" }}>
      <DockviewReact components={dockviewComponents} onReady={onReady} />
    </div>
  );
}

/* ========================================================================
 *  Reexports react-resizable-panels para uso direto em bundle.jsx via window.*
 * ====================================================================== */
export const RPanelGroup = RpGroup;
export const RPanel = RpPanel;
export const RPanelResizeHandle = RpSeparator;

/* ========================================================================
 *  Anexa em window.* para o bundle.jsx (legacy globals) consumir
 * ====================================================================== */
if (typeof window !== "undefined") {
  (window as any).MentorChatAssistantUI = MentorChatAssistantUI;
  (window as any).AppWorkspace = AppWorkspace;
  (window as any).RPanelGroup = RPanelGroup;
  (window as any).RPanel = RPanel;
  (window as any).RPanelResizeHandle = RPanelResizeHandle;
}

export default MentorChatAssistantUI;
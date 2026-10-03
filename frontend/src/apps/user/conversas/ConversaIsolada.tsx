/**
 * ConversaIsolada — janela com 1 conversa só + dossiê.
 *
 * Criada quando o usuário arrasta o avatar+nome pra fora da Lista (DaedalOS pattern).
 * Não tem lista esquerda — chat ocupa toda a esquerda + dossiê fica direita.
 *
 * Onda B.5 (2026-05-13): handoff de `conversaId` via `window.__CONVERSA_ISOLADA_ID`
 * (setado pelo Conversas.tsx antes de chamar `onAbrirApp('conversa-isolada')`).
 * Em Onda C/D substituir por sistema de props dinâmicos no register-de-apps.
 */

import { useEffect, useMemo, useState } from "react";
import type { AutorHumano, Conversa, MembroEquipe, Mensagem, PlanoTurno } from "./tipos";
import { carregarConversaUnica, carregarMensagensConversaImpl } from "./hooks/useConversasLive";
import { buscarEquipeReal, buscarPerfilAutor } from "./equipe-real";
import { persistirResponsavel, persistirAgenteLigado } from "./acoes-cliente";
import { subirMidiaConversa } from "./midia-upload";
import { enviarTextoParaLead, mensagemErroEnvio, reenviarMensagem } from "./envio-mensagem";
import { supabase } from "@/integrations/supabase/client";
import { ChatAtivo } from "./ChatAtivo";
import { Dossie } from "./Dossie";

interface RagenticToast {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info?: (msg: string) => void;
}

function obterToast(): RagenticToast {
  const w = window as unknown as { useToast?: () => RagenticToast };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

function lerPayloadInicial(slug?: string): { id: string | null; conversa: Conversa | null } {
  if (typeof window === "undefined") return { id: null, conversa: null };
  const w = window as unknown as {
    __CONVERSA_ISOLADA_ID?: string;
    __CONVERSA_ISOLADA_PAYLOAD?: Conversa;
    __PAYLOADS_CONVERSAS?: Record<string, Conversa>;
  };
  // Suporte a MÚLTIPLAS janelas: cada arrasto registra payload por slug único
  // em window.__PAYLOADS_CONVERSAS. Janela lê pelo seu próprio slug.
  // NÃO apaga a entrada aqui (achado 2026-08-29): minimizar desmonta a <Janela>
  // (filtrada de `!w.minimized` no shell) — ao restaurar, este componente
  // remonta do zero e lê o payload de novo pelo MESMO slug. Apagar na 1ª leitura
  // fazia a janela restaurada voltar vazia ("conversa não recebida"). Slug é
  // único por instância de janela (sufixo Date.now()), então manter aqui não
  // vaza pra outra janela — fica só um objeto pequeno na memória da aba até
  // recarregar a página (sem hook de "fechei de vez" pra limpar daqui).
  if (slug && w.__PAYLOADS_CONVERSAS && w.__PAYLOADS_CONVERSAS[slug]) {
    const conversa = w.__PAYLOADS_CONVERSAS[slug];
    return { id: conversa.id, conversa };
  }
  // Fallback legacy: single-window via __CONVERSA_ISOLADA_PAYLOAD
  const id = w.__CONVERSA_ISOLADA_ID ?? w.__CONVERSA_ISOLADA_PAYLOAD?.id ?? null;
  const conversa = w.__CONVERSA_ISOLADA_PAYLOAD ?? null;
  if (id) delete w.__CONVERSA_ISOLADA_ID;
  if (conversa) delete w.__CONVERSA_ISOLADA_PAYLOAD;
  return { id, conversa };
}

export function ConversaIsolada({ slug }: { slug?: string } = {}) {
  // Renderiza IMEDIATO com payload passado por window (snapshot do Conversas pai).
  // Sem useConversasLive aqui — esse hook é pesado (puxa 3473 conversas) e travava
  // a abertura por 5-10s. Aqui só precisa de 1 conversa que JÁ veio carregada.
  // `slug` vem da janela do OS — permite múltiplas instâncias paralelas.
  const [{ id: conversaId, conversa: conversaInicial }] = useState(() => lerPayloadInicial(slug));
  const [conversas, setConversas] = useState<Conversa[]>(conversaInicial ? [conversaInicial] : []);

  // Payload parcial (só id — veio da Maquete, não do drag completo do Conversas):
  // precisa carregar a conversa pelo id. Já começa "carregando" pra NÃO renderizar
  // o ChatAtivo com objeto incompleto (que quebrava ao ler conversa.lead).
  const precisaCarregar = !!conversaId && !conversaInicial?.lead?.id;
  const [carregandoUnica, setCarregandoUnica] = useState(precisaCarregar);

  useEffect(() => {
    if (!precisaCarregar || !conversaId) return;
    let ativo = true;
    (async () => {
      const c = await carregarConversaUnica(conversaId);
      if (!ativo) return;
      if (!c) {
        setCarregandoUnica(false);
        return;
      }
      const msgs = await carregarMensagensConversaImpl(conversaId);
      if (!ativo) return;
      const ultima = msgs[msgs.length - 1];
      setConversas([
        {
          ...c,
          mensagens: msgs,
          preview_ultima_mensagem: ultima?.conteudo.slice(0, 80) ?? "",
          ultima_mensagem_em: ultima?.criado_em ?? c.ultima_mensagem_em,
        },
      ]);
      setCarregandoUnica(false);
    })().catch((e) => {
      console.warn("[ConversaIsolada] carga pelo id falhou:", e);
      if (ativo) setCarregandoUnica(false);
    });
    return () => {
      ativo = false;
    };
  }, [conversaId, precisaCarregar]);

  // Equipe real do tenant — mesma fonte da tela principal. Sem isso o dropdown
  // "Responsável" caía no mock e listava gente que não existe.
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  useEffect(() => {
    let ativo = true;
    void buscarEquipeReal().then((membros) => { if (ativo) setEquipe(membros); });
    return () => { ativo = false; };
  }, []);

  // Identidade de quem escreve — vira a assinatura *Nome — Cargo* no WhatsApp.
  const [perfilAutor, setPerfilAutor] = useState<AutorHumano | null>(null);
  useEffect(() => {
    let ativo = true;
    void buscarPerfilAutor().then((p) => { if (ativo) setPerfilAutor(p); });
    return () => { ativo = false; };
  }, []);

  // Pronta = existe E tem lead hidratado. Enquanto não, não renderiza os filhos
  // (ChatAtivo/Dossie acessam conversa.lead.* e quebrariam com objeto parcial).
  const conversa = useMemo(() => {
    const c = conversas.find((x) => x.id === conversaId) ?? null;
    return c && c.lead?.id ? c : null;
  }, [conversas, conversaId]);

  const t = obterToast();

  if (!conversaId) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          flexDirection: "column",
          gap: 10,
          color: "var(--txt-3)",
        }}
      >
        <div style={{ fontSize: 40, opacity: 0.4 }}>🪟</div>
        <div className="muted small">
          Esta janela isolada não recebeu uma conversa.
        </div>
        <div className="muted tiny">
          Arraste o avatar+nome de uma conversa na tela Conversas pra abrir aqui.
        </div>
      </div>
    );
  }

  if (!conversa) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          flexDirection: "column",
          gap: 10,
          color: "var(--txt-3)",
        }}
      >
        <div className="muted small">
          {carregandoUnica ? "Carregando conversa…" : `Conversa não encontrada (id: ${conversaId}).`}
        </div>
      </div>
    );
  }

  const aplicarAgenteLigado = async (novo: boolean): Promise<void> => {
    setConversas((xs) => xs.map((c) => (c.id === conversa.id ? { ...c, agente_ligado: novo } : c)));
    try {
      await persistirAgenteLigado(conversa.id, novo);
    } catch (e) {
      console.error("[ConversaIsolada] toggle IA da conversa falhou:", e);
      setConversas((xs) => xs.map((c) => (c.id === conversa.id ? { ...c, agente_ligado: !novo } : c)));
      throw e;
    }
  };

  const onToggleAgente = async (novo: boolean) => {
    try {
      await aplicarAgenteLigado(novo);
      t.success(novo ? "IA reativada" : "IA pausada · modo humano");
    } catch (e) {
      t.error(`Falha ao alterar IA: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onEnviar = async (texto: string) => {
    const idTemp = `m-${Date.now()}`;
    const agora = new Date().toISOString();
    const nova = {
      id: idTemp,
      conversa_id: conversa.id,
      papel: "humano" as const,
      tipo: "texto" as const,
      conteudo: texto,
      autor: perfilAutor ?? { nome: "Você" },
      criado_em: agora,
      lido: true,
      enviado: false,
    };
    setConversas((xs) =>
      xs.map((c) =>
        c.id === conversa.id
          ? {
              ...c,
              mensagens: [...c.mensagens, nova],
              preview_ultima_mensagem: texto.slice(0, 60),
              ultima_mensagem_em: agora,
            }
          : c,
      ),
    );

    try {
      const { id } = await enviarTextoParaLead({
        conversaId: conversa.id,
        leadId: conversa.lead.id,
        texto,
        perfilAutor,
      });
      setConversas((xs) =>
        xs.map((c) =>
          c.id === conversa.id
            ? {
                ...c,
                mensagens: c.mensagens.map((m) => (m.id === idTemp ? { ...m, id, enviado: true } : m)),
              }
            : c,
        ),
      );
      t.success("Mensagem enviada");
    } catch (e) {
      console.error("[ConversaIsolada] onEnviar falhou:", e);
      // Marca a bolha como não entregue — sem isso ela fica com cara de enviada
      // e o atendente segue a conversa achando que o lead recebeu.
      setConversas((xs) =>
        xs.map((c) =>
          c.id === conversa.id
            ? { ...c, mensagens: c.mensagens.map((m) => (m.id === idTemp ? { ...m, falhou: true } : m)) }
            : c,
        ),
      );
      t.error(`Falha ao enviar: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onReenviar = async (msg: Mensagem) => {
    try {
      await reenviarMensagem({
        mensagemId: msg.id,
        leadId: conversa.lead.id,
        texto: msg.conteudo,
        perfilAutor,
      });
      setConversas((xs) =>
        xs.map((c) =>
          c.id === conversa.id
            ? { ...c, mensagens: c.mensagens.map((m) => (m.id === msg.id ? { ...m, falhou: false, enviado: true } : m)) }
            : c,
        ),
      );
      t.success("Mensagem reenviada");
    } catch (e) {
      console.error("[ConversaIsolada] reenvio falhou:", e);
      t.error(`Falha ao reenviar: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onEnviarMidia = async (
    midia: { arquivo?: File; blob?: Blob; tipo: "imagem" | "audio" | "video" | "documento"; nome?: string; duracao_segundos?: number },
    legenda: string,
  ) => {
    if (conversa.lead.canal === "instagram") {
      t.info?.(mensagemErroEnvio("midia_instagram_fase2"));
      return;
    }
    const conversaId = conversa.id;
    const leadId = conversa.lead.id;
    const arquivo =
      midia.arquivo ??
      (midia.blob
        ? new File([midia.blob], midia.nome ?? `audio-${Date.now()}.webm`, {
            type: midia.blob.type || "audio/webm",
          })
        : null);
    if (!arquivo) {
      t.error("Arquivo de mídia inválido");
      return;
    }

    const idTemp = `m-${Date.now()}`;
    const agora = new Date().toISOString();
    const previewUrl = URL.createObjectURL(arquivo);
    const nova = {
      id: idTemp,
      conversa_id: conversaId,
      papel: "humano" as const,
      tipo: midia.tipo,
      conteudo: legenda,
      autor: perfilAutor ?? { nome: "Você" },
      midia_url: previewUrl,
      nome_arquivo: arquivo.name,
      duracao_segundos: midia.duracao_segundos,
      tamanho_bytes: arquivo.size,
      criado_em: agora,
      lido: true,
      enviado: false,
    };
    setConversas((xs) =>
      xs.map((c) =>
        c.id === conversaId
          ? {
              ...c,
              mensagens: [...c.mensagens, nova],
              preview_ultima_mensagem: `📎 ${midia.tipo}${legenda ? ` · ${legenda.slice(0, 40)}` : ""}`,
              ultima_mensagem_em: agora,
            }
          : c,
      ),
    );

    try {
      const { data: sess } = await supabase.auth.getSession();
      const uidLogado = perfilAutor?.id ?? sess?.session?.user?.id;
      if (!uidLogado) throw new Error("sessão sem usuário");
      const up = await subirMidiaConversa(arquivo, uidLogado, conversaId);

      const { data: msgReal, error: erroIns } = await supabase
        .from("mensagens")
        .insert({
          conversation_id: conversaId,
          role: "human",
          content: legenda.trim() || `[arquivo] ${up.nome}`,
          sender_id: perfilAutor?.id ?? uidLogado,
          carga: {
            file: { url: up.url, name: up.nome, type: up.tipo, size: up.tamanho },
            ...(perfilAutor
              ? {
                  sender: {
                    name: perfilAutor.nome,
                    cargo: perfilAutor.cargo ?? null,
                    avatar_url: perfilAutor.foto_url ?? null,
                  },
                }
              : {}),
          },
        })
        .select("id")
        .single();
      if (erroIns) throw erroIns;

      const { data: respEnv, error: erroEnv } = await supabase.functions.invoke("enviar-mensagem", {
        body: {
          lead_id: leadId,
          file_url: up.url,
          file_name: up.nome,
          file_type: up.tipo,
          message_id: msgReal.id,
          sender_name: perfilAutor?.nome,
          sender_cargo: perfilAutor?.cargo ?? undefined,
        },
      });
      if (erroEnv) throw erroEnv;
      const corpo = respEnv as { ok?: boolean; reason?: string } | null;
      if (corpo && corpo.ok === false) {
        throw new Error(mensagemErroEnvio(corpo.reason ?? "edge retornou ok:false sem motivo"));
      }

      setConversas((xs) =>
        xs.map((c) =>
          c.id === conversaId
            ? {
                ...c,
                mensagens: c.mensagens.map((m) =>
                  m.id === idTemp ? { ...m, id: msgReal.id, midia_url: up.url, enviado: true } : m,
                ),
              }
            : c,
        ),
      );
      t.success("Mídia enviada");
    } catch (e) {
      console.error("[ConversaIsolada] onEnviarMidia falhou:", e);
      t.error(`Falha ao enviar mídia: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onAtribuirResponsavel = async (membroId: string | null) => {
    const alvo = conversa.id;
    const anterior = conversa.responsavel_id ?? null;
    setConversas((xs) => xs.map((c) => (c.id === alvo ? { ...c, responsavel_id: membroId } : c)));
    try {
      await persistirResponsavel(alvo, membroId);
      const membro = equipe.find((m) => m.id === membroId);
      // Humano assumiu → pausa a IA desta conversa. Voltou pra "IA responde"
      // (sem responsável) → reativa. Mesma regra da tela principal.
      let sufixo = "";
      if (membroId && conversa.agente_ligado) {
        await aplicarAgenteLigado(false);
        sufixo = " · IA pausada";
      } else if (!membroId && !conversa.agente_ligado) {
        await aplicarAgenteLigado(true);
        sufixo = " · IA responde";
      }
      t.success((membro ? `Conversa atribuída a ${membro.nome}` : "Responsável removido") + sufixo);
    } catch (e) {
      console.error("[ConversaIsolada] atribuir responsável falhou:", e);
      setConversas((xs) => xs.map((c) => (c.id === alvo ? { ...c, responsavel_id: anterior } : c)));
      t.error(`Falha ao atribuir: ${(e as Error).message ?? "erro desconhecido"}`);
    }
  };

  const onExecutarTurno = (turno: PlanoTurno) => {
    t.success(`Executando T+${turno.turno}: ${turno.o_que_fazer.slice(0, 60)}`);
  };

  const onTrocarCargo = () => {
    t.info?.("Onda B+: dropdown de cargos disponíveis pra essa conversa.");
  };

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <ChatAtivo
        conversa={conversa}
        onEnviar={onEnviar}
        onEnviarMidia={onEnviarMidia}
        onReenviar={onReenviar}
        onToggleAgente={(n) => void onToggleAgente(n)}
      />
      <div
        style={{
          flex: "0 0 360px",
          display: "flex",
          minHeight: 0,
          borderLeft: "1px solid var(--os-vidro-borda, rgba(255,255,255,0.10))",
        }}
      >
        <Dossie
          conversa={conversa}
          equipe={equipe}
          onTrocarCargo={onTrocarCargo}
          onExecutarTurno={onExecutarTurno}
          onAtribuirResponsavel={onAtribuirResponsavel}
          onToggleAgente={onToggleAgente}
        />
      </div>
    </div>
  );
}

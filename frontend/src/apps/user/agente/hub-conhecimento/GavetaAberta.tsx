/**
 * Gaveta aberta: lista os blocos por escopo (Tudo/Universo/Nicho/Você) com as
 * ações certas por escopo:
 *  - Você (tenant): editar + excluir.
 *  - Nicho: desligar/religar (override por tenant). Sem override ⇒ "em breve".
 *  - Universo (global): fixo, só leitura (cadeado).
 * Upgrade 2026-07-05: busca instantânea (título+conteúdo, ignora acento),
 * header com contexto da gaveta, cards legíveis, selo "desligado", exclusão
 * com confirmação inline (sem popup do navegador).
 */

import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { EscopoBloco, Gaveta } from "./gavetas";
import { ESCOPOS } from "./gavetas";
import { useGaveta, type BlocoHub, type CtxHub } from "./use-hub-conhecimento";
import { criarBloco, editarBloco, alternarAtivoBloco, alternarNicho, type ValoresBloco } from "./acoes-gaveta";
import { FiltroPilulas, BotaoPrimario, Vazio } from "./ui-hub";
import { CampoBusca } from "./CampoBusca";
import { CartaoBloco } from "./CartaoBloco";
import { ModalBloco } from "./ModalBloco";
import { SugestoesIA } from "./SugestoesIA";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type ToastApi = { success: (m: string) => void; error: (m: string) => void };
type ModalEstado = { modo: "novo" } | { modo: "editar"; id: string; valores: ValoresBloco } | null;

/** minúsculo e sem acento — busca acha "credito" em "Crédito". */
function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function GavetaAberta({
  gaveta,
  ctx,
  nichoId,
  toast,
  onVoltar,
  aoMudar,
}: {
  gaveta: Gaveta;
  ctx: CtxHub;
  nichoId: string | null;
  toast: ToastApi;
  onVoltar: () => void;
  aoMudar: () => void;
}) {
  const { blocos, desligados, carregando, recarregar } = useGaveta(gaveta, ctx, nichoId);
  const [escopo, setEscopo] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<ModalEstado>(null);
  const [analisando, setAnalisando] = useState(false);
  const [refrescarSugestoes, setRefrescarSugestoes] = useState(0);
  const { Icone } = gaveta;

  async function analisarConversas() {
    if (analisando) return;
    setAnalisando(true);
    try {
      const { data, error } = await sb.functions.invoke("analisar-conversas-fechamento", {});
      if (error) {
        let motivo = error.message;
        try {
          const txt = await (error as { context?: { text?: () => Promise<string> } }).context?.text?.();
          if (txt) { const j = JSON.parse(txt); if (j?.mensagem || j?.error) motivo = j.mensagem || j.error; }
        } catch { /* mantém error.message */ }
        toast.error(`Não deu pra analisar: ${motivo}`);
        return;
      }
      if (data?.ok === false) { toast.error(data.mensagem || "Não deu pra analisar as conversas."); return; }
      const total = (data?.criados ?? 0) + (data?.atualizados ?? 0);
      if (!total) {
        toast.success(data?.mensagem || `Analisei ${data?.conversas_analisadas ?? 0} conversa(s) — nenhuma novidade.`);
      } else {
        const partes = [
          data.criados ? `${data.criados} sugestão(ões) nova(s)` : null,
          data.atualizados ? `${data.atualizados} melhorada(s)` : null,
        ].filter(Boolean).join(" e ");
        toast.success(`${partes}, de ${data.conversas_analisadas} conversa(s) fechada(s) — revise na caixa de sugestões antes de aprovar.`);
        setRefrescarSugestoes((n) => n + 1);
      }
    } catch (e) {
      toast.error(`Não deu pra analisar: ${(e as Error).message}`);
    } finally {
      setAnalisando(false);
    }
  }

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: blocos.length, global: 0, nicho: 0, tenant: 0 };
    for (const b of blocos) c[b.escopo] = (c[b.escopo] ?? 0) + 1;
    return c;
  }, [blocos]);

  const lista = useMemo(() => {
    const porEscopo = escopo === "todos" ? blocos : blocos.filter((b) => b.escopo === escopo);
    const termo = normalizar(busca.trim());
    if (termo.length < 2) return porEscopo;
    return porEscopo.filter(
      (b) => normalizar(b.titulo).includes(termo) || normalizar(b.corpo).includes(termo),
    );
  }, [blocos, escopo, busca]);

  async function abrirEdicao(bloco: BlocoHub) {
    const cols = gaveta.campos.map((c) => c.chave).join(", ");
    const { data } = await sb.from(gaveta.tabela).select(cols).eq("id", bloco.id).maybeSingle();
    const valores: ValoresBloco = {};
    for (const c of gaveta.campos) {
      const bruto = data?.[c.chave];
      valores[c.chave] =
        gaveta.corpoJson && c.chave === gaveta.campoCorpo
          ? String(bruto?.instrucao ?? "")
          : String(bruto ?? "");
    }
    setModal({ modo: "editar", id: bloco.id, valores });
  }

  async function salvar(valores: ValoresBloco) {
    try {
      if (modal?.modo === "editar") {
        await editarBloco(gaveta, modal.id, valores);
        toast.success("Bloco atualizado.");
      } else {
        await criarBloco(gaveta, ctx, valores);
        toast.success("Bloco criado. O agente já passa a usar.");
      }
      await recarregar();
      aoMudar();
    } catch (e) {
      toast.error(`Não deu pra salvar: ${(e as Error).message}`);
    }
  }

  /** Marca/desmarca bloco do próprio tenant. Nada é apagado — ver acoes-gaveta.ts. */
  async function alternarAtivo(bloco: BlocoHub) {
    const marcando = !bloco.ativo;
    try {
      await alternarAtivoBloco(gaveta, bloco.id, marcando);
      toast.success(marcando ? "Marcado. O agente volta a considerar." : "Desmarcado. O agente não considera mais.");
      await recarregar();
      aoMudar();
    } catch (e) {
      toast.error(`Não deu pra alterar: ${(e as Error).message}`);
    }
  }

  async function toggle(bloco: BlocoHub) {
    const desligar = !desligados.has(bloco.id);
    try {
      await alternarNicho(gaveta, bloco.id, ctx.tenantId, desligar);
      toast.success(desligar ? "Bloco de nicho desligado pra você." : "Bloco religado.");
      await recarregar();
      aoMudar();
    } catch (e) {
      toast.error(`Não deu pra alterar: ${(e as Error).message}`);
    }
  }

  const buscando = normalizar(busca.trim()).length >= 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={onVoltar}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            fontSize: 12,
            color: "oklch(0.98 0 0 / 0.7)",
            background: "transparent",
            border: "1px solid oklch(0.98 0 0 / 0.12)",
            borderRadius: 10,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={14} aria-hidden="true" /> Voltar
        </button>
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            width: 30,
            height: 30,
            borderRadius: 8,
            flexShrink: 0,
            color: "oklch(0.75 0.14 280)",
            background: "oklch(0.68 0.14 290 / 0.14)",
            border: "1px solid oklch(0.68 0.14 290 / 0.2)",
          }}
        >
          <Icone size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.98 0 0)", lineHeight: 1.2 }}>
            {gaveta.rotulo}
          </div>
          <div style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.5)" }}>{gaveta.descricao}</div>
        </div>
        {gaveta.id === "conhecimento" && (
          <button
            type="button"
            onClick={analisarConversas}
            disabled={analisando}
            title="Lê as conversas fechadas (desfecho = convertido) e sugere blocos novos"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "oklch(0.98 0 0 / 0.85)",
              background: "transparent",
              border: "1px solid oklch(0.98 0 0 / 0.14)",
              borderRadius: 10,
              cursor: analisando ? "default" : "pointer",
              opacity: analisando ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            <Sparkles size={13} aria-hidden="true" /> {analisando ? "Analisando…" : "Analisar conversas"}
          </button>
        )}
        <BotaoPrimario onClick={() => setModal({ modo: "novo" })}>
          <Plus size={14} aria-hidden="true" /> Novo
        </BotaoPrimario>
      </div>

      {gaveta.id === "conhecimento" && (
        <SugestoesIA agenteId={ctx.agenteId} toast={toast} atualizarEm={refrescarSugestoes} />
      )}

      <CampoBusca
        valor={busca}
        onChange={setBusca}
        placeholder={`Buscar em ${contagem.todos} bloco${contagem.todos === 1 ? "" : "s"} — título ou conteúdo`}
      />

      <FiltroPilulas
        titulo="Escopo"
        ativo={escopo}
        onChange={setEscopo}
        opcoes={ESCOPOS.map((e) => ({ id: e.id, rotulo: e.rotulo, cont: contagem[e.id] ?? 0 }))}
      />

      {carregando ? (
        <Vazio mensagem="Carregando…" pequeno />
      ) : lista.length === 0 ? (
        buscando ? (
          <Vazio
            mensagem={`Nada com “${busca.trim()}” aqui.`}
            dica="Tente outra palavra ou limpe a busca pra ver tudo de novo."
          />
        ) : (
          <Vazio
            mensagem="Nada aqui ainda."
            dica="Toque em “Novo” pra criar o primeiro bloco — o agente passa a usar na hora."
          />
        )
      ) : (
        <>
          {buscando && (
            <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)" }}>
              {lista.length} resultado{lista.length === 1 ? "" : "s"} pra “{busca.trim()}”
            </span>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lista.map((b) => (
              <CartaoBloco
                key={b.id}
                bloco={b}
                gaveta={gaveta}
                desligado={desligados.has(b.id)}
                onEditar={() => abrirEdicao(b)}
                onAlternarAtivo={() => alternarAtivo(b)}
                onToggle={() => toggle(b)}
              />
            ))}
          </div>
        </>
      )}

      {modal && (
        <ModalBloco
          gaveta={gaveta}
          inicial={modal.modo === "editar" ? modal.valores : null}
          onFechar={() => setModal(null)}
          onSalvar={salvar}
        />
      )}
    </div>
  );
}


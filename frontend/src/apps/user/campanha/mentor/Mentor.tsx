/**
 * Mentor de Disparo — busca leads por critério (estado final/desfecho, dias
 * sem resposta, mês, tags), salva como lista, e decide na hora de agir:
 * manda pro agente conversar (campanha normal) ou dispara mensagem fixa
 * (texto/foto/vídeo agendado). Shell — mesmo padrão dos outros modos do app
 * Campanha (`../Campanha.tsx`).
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Compass, Keyboard, Plus, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";

import {
  botaoPrimarioStyle,
  botaoSecundarioStyle,
  inputStyle,
  Vazio,
  type SupabaseBruto,
  type ToastApi,
} from "../re-exports";
import type { EstadoStep2 } from "../wizard/Step2Publico";
import { ComposerDisparoManual } from "./ComposerDisparoManual";
import { EditorCriteriosMentor } from "./EditorCriteriosMentor";
import { ListaSalvaLinha } from "./ListaSalvaLinha";
import type { CriteriosListaDisparo, ListaDisparoLead } from "./tipos";

interface Props {
  ownerId: string;
  t: ToastApi;
  onVoltar: () => void;
  onMandarAgente: (estadoPublico: Partial<EstadoStep2>) => void;
}

const estadoInicial: CriteriosListaDisparo = {
  modo: "todos",
  operadorGlobal: "AND",
  criterios: [],
};

export function Mentor({ ownerId, t, onVoltar, onMandarAgente }: Props) {
  const [estado, setEstado] = useState<CriteriosListaDisparo>(estadoInicial);
  const [nomeLista, setNomeLista] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [listas, setListas] = useState<ListaDisparoLead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [disparoManualAberto, setDisparoManualAberto] = useState(false);

  const carregarListas = useCallback(async () => {
    const sb = supabase as SupabaseBruto;
    const { data, error } = await sb
      .from("listas_disparo_lead")
      .select("id, tenant_id, nome, criterios, lead_ids, created_at, updated_at, deleted_at")
      .eq("tenant_id", ownerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[mentor] carregarListas:", error.message);
      setCarregando(false);
      return;
    }
    setListas((data ?? []) as ListaDisparoLead[]);
    setCarregando(false);
  }, [ownerId]);

  useEffect(() => {
    void carregarListas();
  }, [carregarListas]);

  const salvarLista = useCallback(async () => {
    if (!nomeLista.trim()) {
      t.error("Dá um nome pra lista antes de salvar.");
      return;
    }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("listas_disparo_lead").insert({
        tenant_id: ownerId,
        nome: nomeLista.trim(),
        criterios: estado,
      });
      if (error) throw error;
      t.success("Lista salva.");
      setNomeLista("");
      setEstado(estadoInicial);
      await carregarListas();
    } catch (e) {
      t.error(e instanceof Error ? e.message : "Erro ao salvar lista");
    } finally {
      setSalvando(false);
    }
  }, [nomeLista, estado, ownerId, t, carregarListas]);

  const excluirLista = useCallback(
    async (lista: ListaDisparoLead) => {
      if (!confirm(`Excluir a lista "${lista.nome}"?`)) return;
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("listas_disparo_lead")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", lista.id);
      if (error) {
        t.error(error.message);
        return;
      }
      t.success("Lista excluída.");
      await carregarListas();
    },
    [t, carregarListas],
  );

  const resolverIds = useCallback(async (lista: ListaDisparoLead): Promise<string[]> => {
    if (lista.lead_ids?.length) return lista.lead_ids;
    const { data: sessao } = await supabase.auth.getSession();
    const token = sessao?.session?.access_token;
    const { data, error } = await supabase.functions.invoke("resolver-lista-disparo", {
      body: {
        modo: lista.criterios.modo,
        operadorGlobal: lista.criterios.operadorGlobal,
        criterios: lista.criterios.criterios,
        publico: lista.criterios.publico,
      },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (error) throw error;
    return (data as { lead_ids: string[] }).lead_ids;
  }, []);

  const mandarAgente = useCallback(
    async (lista: ListaDisparoLead) => {
      try {
        const ids = await resolverIds(lista);
        if (ids.length === 0) {
          t.error("Essa lista não tem leads elegíveis agora.");
          return;
        }
        onMandarAgente({ modo: "lead_ids", lead_ids: ids });
      } catch (e) {
        t.error(e instanceof Error ? e.message : "Erro ao resolver lista");
      }
    },
    [resolverIds, onMandarAgente, t],
  );

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Compass size={20} style={{ color: "oklch(0.7 0.18 220)" }} />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
            Mentor de Disparo
          </h2>
        </div>
        <button
          type="button"
          onClick={onVoltar}
          style={{
            padding: "6px 10px",
            fontSize: 11,
            color: "oklch(0.98 0 0 / 0.55)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          Voltar
        </button>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={() => setDisparoManualAberto((v) => !v)}
          style={{
            ...botaoSecundarioStyle,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
          }}
        >
          <Keyboard size={13} />
          Disparo manual (digitar números)
        </motion.button>
        {disparoManualAberto && (
          <ComposerDisparoManual
            ownerId={ownerId}
            t={t}
            onFechar={() => setDisparoManualAberto(false)}
          />
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "oklch(0.98 0 0 / 0.7)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Buscar leads
        </h3>
        <EditorCriteriosMentor ownerId={ownerId} estado={estado} setEstado={setEstado} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Nome da lista (ex.: Sumidos 30d — agosto)"
            value={nomeLista}
            onChange={(e) => setNomeLista(e.target.value)}
            style={{ ...inputStyle, maxWidth: 320 }}
          />
          <motion.button
            type="button"
            whileTap={tapPress}
            onClick={salvarLista}
            disabled={salvando}
            style={{
              ...botaoPrimarioStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: salvando ? 0.6 : 1,
            }}
          >
            <Save size={13} />
            {salvando ? "Salvando…" : "Salvar lista"}
          </motion.button>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "oklch(0.98 0 0 / 0.7)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Listas salvas
        </h3>
        {carregando ? (
          <div style={{ padding: 24, fontSize: 12, color: "oklch(0.98 0 0 / 0.5)" }}>
            Carregando…
          </div>
        ) : listas.length === 0 ? (
          <Vazio
            mensagem="Nenhuma lista salva ainda. Busca um critério acima e salva pra reusar."
            icone={Plus}
          />
        ) : (
          listas.map((l) => (
            <ListaSalvaLinha
              key={l.id}
              lista={l}
              ownerId={ownerId}
              t={t}
              onMandarAgente={() => mandarAgente(l)}
              onExcluir={() => excluirLista(l)}
              resolverIds={() => resolverIds(l)}
            />
          ))
        )}
      </section>
    </motion.div>
  );
}

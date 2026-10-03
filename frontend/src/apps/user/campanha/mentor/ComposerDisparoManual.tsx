/**
 * Composer de Disparo Manual — números digitados/colados direto, sem passar
 * por critério ou lista salva. Números não precisam corresponder a lead
 * nenhum na base (mesmo padrão do disparo manual já em produção no app
 * Rifas, `rifa_lista_disparo`). Mesma esteira de envio de
 * `ComposerDisparoFixo` (tabela `disparos_lead`, campo `contatos_manuais`).
 */

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { tapPress } from "@/os/motion/presets";
import {
  botaoPrimarioStyle,
  Campo,
  inputStyle,
  type SupabaseBruto,
  type ToastApi,
} from "../re-exports";
import { CamposConteudoDisparo } from "./CamposConteudoDisparo";
import type { ContatoManualDisparo } from "./tipos";
import { useConteudoDisparo } from "./use-conteudo-disparo";

interface Props {
  ownerId: string;
  t: ToastApi;
  onFechar: () => void;
}

const limparFone = (v: string) => v.replace(/\D/g, "");

/** 1 contato por linha: "telefone" ou "telefone, nome". Ignora linha vazia/inválida. */
function parsearContatos(texto: string): ContatoManualDisparo[] {
  const vistos = new Set<string>();
  const saida: ContatoManualDisparo[] = [];
  for (const linhaBruta of texto.split("\n")) {
    const linha = linhaBruta.trim();
    if (!linha) continue;
    const [foneBruto, ...resto] = linha.split(",");
    const telefone = limparFone(foneBruto);
    if (telefone.length < 10 || telefone.length > 13 || vistos.has(telefone)) continue;
    vistos.add(telefone);
    const nome = resto.join(",").trim();
    saida.push({ telefone, nome: nome || null });
  }
  return saida;
}

export function ComposerDisparoManual({ ownerId, t, onFechar }: Props) {
  const conteudo = useConteudoDisparo(ownerId, t);
  const {
    tipoConteudo,
    mensagem,
    midiaUrl,
    modoAgendamento,
    horario,
    tempoDescanso,
    precisaMidia,
  } = conteudo;
  const [textoNumeros, setTextoNumeros] = useState("");
  const [criando, setCriando] = useState(false);

  const contatos = useMemo(() => parsearContatos(textoNumeros), [textoNumeros]);

  const podeCriar =
    contatos.length > 0 && mensagem.trim().length > 0 && (!precisaMidia || !!midiaUrl) && !criando;

  const criarDisparo = useCallback(async () => {
    if (!podeCriar) return;
    const confirmado = confirm(
      `Confirma o disparo manual pra ${contatos.length} número(s) digitado(s)? Isso vai mandar mensagem de verdade via WhatsApp${
        modoAgendamento === "agora"
          ? " assim que o cron rodar (até 5min)."
          : ` todo dia às ${horario}.`
      } — esses números não precisam ser leads cadastrados.`,
    );
    if (!confirmado) return;

    setCriando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("disparos_lead").insert({
        tenant_id: ownerId,
        lista_disparo_id: null,
        nome: `Disparo manual — ${contatos.length} número(s)`,
        horario: modoAgendamento === "recorrente" ? horario : null,
        tipo_conteudo: tipoConteudo,
        mensagem: mensagem.trim(),
        midia_url: midiaUrl,
        contatos_manuais: contatos,
        tempo_descanso_segundos: tempoDescanso,
        ativo: true,
      });
      if (error) throw error;
      t.success(
        modoAgendamento === "agora"
          ? "Disparo agendado — sai no próximo ciclo do cron (até 5min)."
          : "Disparo recorrente ativado.",
      );
      onFechar();
    } catch (e) {
      t.error(e instanceof Error ? e.message : "Erro ao criar disparo");
    } finally {
      setCriando(false);
    }
  }, [
    podeCriar,
    contatos,
    modoAgendamento,
    horario,
    ownerId,
    tipoConteudo,
    mensagem,
    midiaUrl,
    tempoDescanso,
    t,
    onFechar,
  ]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 14,
        marginTop: 4,
        background: "oklch(0.12 0.04 280 / 0.6)",
        border: "1px solid oklch(0.7 0.18 220 / 0.3)",
        borderRadius: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.98 0 0 / 0.85)" }}>
          Disparo manual — números digitados
        </span>
        <button
          type="button"
          onClick={onFechar}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "oklch(0.98 0 0 / 0.5)",
          }}
        >
          <X size={14} />
        </button>
      </div>

      <Campo
        label="Números"
        hint="1 por linha — só o telefone, ou 'telefone, nome'. Não precisa ser lead cadastrado."
      >
        <textarea
          value={textoNumeros}
          onChange={(e) => setTextoNumeros(e.target.value)}
          rows={5}
          placeholder={"11 91234-5678, João\n11999998888"}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </Campo>

      <CamposConteudoDisparo conteudo={conteudo} />

      <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>
        Alvo agora: <strong style={{ color: "oklch(0.98 0 0 / 0.85)" }}>{contatos.length}</strong>{" "}
        número(s) válido(s) — sem checagem de opt-out (não são leads).
      </div>

      <motion.button
        type="button"
        whileTap={tapPress}
        onClick={criarDisparo}
        disabled={!podeCriar}
        style={{
          ...botaoPrimarioStyle,
          opacity: podeCriar ? 1 : 0.4,
          cursor: podeCriar ? "pointer" : "not-allowed",
        }}
      >
        {criando ? "Ativando…" : "Ativar disparo"}
      </motion.button>
    </div>
  );
}

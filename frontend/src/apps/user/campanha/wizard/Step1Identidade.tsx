/**
 * Passo 1 do Wizard — Identidade da campanha.
 *
 * Pra tipo=indicacao, exibe campos extras (cupom + indicador + comissão)
 * que vão pra tabela `meta_indicacao_campanha` no momento do salvar (Wizard).
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { supabase } from "@/integrations/supabase/client";
import { fadeSlideIn } from "@/os/motion/presets";

import {
  Campo,
  inputStyle,
  type ProdutoResumo,
  type SupabaseBruto,
  type TipoCampanha,
  type TipoComissao,
} from "../re-exports";

export interface EstadoStep1 {
  name: string;
  type: TipoCampanha;
  objective: string;
  description: string;
  product_id: string | null;
  // Pra tipo=indicacao
  indicador_nome: string;
  indicador_email: string;
  indicador_telefone: string;
  cupom: string;
  comissao_tipo: TipoComissao;
  comissao_valor: number;
}

interface Props {
  ownerId: string;
  estado: EstadoStep1;
  setEstado: (e: EstadoStep1) => void;
}

export function Step1Identidade({ ownerId, estado, setEstado }: Props) {
  const [produtos, setProdutos] = useState<ProdutoResumo[]>([]);

  useEffect(() => {
    (async () => {
      const sb = supabase as SupabaseBruto;
      const { data } = await sb
        .from("produtos")
        .select("id, nome")
        .eq("user_id", ownerId)
        .eq("ativo", true);
      setProdutos((data ?? []) as ProdutoResumo[]);
    })();
  }, [ownerId]);

  const set = <K extends keyof EstadoStep1>(k: K, v: EstadoStep1[K]) =>
    setEstado({ ...estado, [k]: v });

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}
    >
      <Campo label="Nome">
        <input
          type="text"
          value={estado.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Ex.: Black Friday 2026"
          style={inputStyle}
        />
      </Campo>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo label="Tipo">
          <select
            value={estado.type}
            onChange={(e) => set("type", e.target.value as TipoCampanha)}
            style={inputStyle}
          >
            <option value="divulgacao">Divulgação</option>
            <option value="venda">Venda</option>
            <option value="pos_venda">Pós-venda</option>
            <option value="cobranca">Cobrança</option>
            <option value="agendamento">Agendamento</option>
            <option value="indicacao">Indicação</option>
          </select>
        </Campo>

        <Campo label="Produto (opcional)">
          <select
            value={estado.product_id ?? ""}
            onChange={(e) => set("product_id", e.target.value || null)}
            style={inputStyle}
          >
            <option value="">— Nenhum —</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <Campo label="Objetivo" hint="O que essa campanha tem que entregar?">
        <input
          type="text"
          value={estado.objective}
          onChange={(e) => set("objective", e.target.value)}
          placeholder="Ex.: Reativar leads quentes parados há 30 dias"
          style={inputStyle}
        />
      </Campo>

      <Campo label="Descrição" hint="Briefing pro agente — entra no system prompt">
        <textarea
          value={estado.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Contexto, tom de voz, dúvidas comuns…"
          rows={4}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </Campo>

      {estado.type === "indicacao" && (
        <motion.div
          variants={fadeSlideIn}
          initial="hidden"
          animate="visible"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 14,
            background: "oklch(0.7 0.16 320 / 0.08)",
            border: "1px solid oklch(0.7 0.16 320 / 0.25)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.7 0.16 320)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Programa de indicação
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Indicador (nome)">
              <input
                type="text"
                value={estado.indicador_nome}
                onChange={(e) => set("indicador_nome", e.target.value)}
                placeholder="Quem vai indicar"
                style={inputStyle}
              />
            </Campo>
            <Campo label="Cupom único">
              <input
                type="text"
                value={estado.cupom}
                onChange={(e) => set("cupom", e.target.value.toUpperCase())}
                placeholder="Ex.: ANA10"
                style={{ ...inputStyle, textTransform: "uppercase" }}
              />
            </Campo>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="E-mail do indicador">
              <input
                type="email"
                value={estado.indicador_email}
                onChange={(e) => set("indicador_email", e.target.value)}
                style={inputStyle}
              />
            </Campo>
            <Campo label="Telefone do indicador">
              <input
                type="tel"
                value={estado.indicador_telefone}
                onChange={(e) => set("indicador_telefone", e.target.value)}
                placeholder="+55 11 99999-9999"
                style={inputStyle}
              />
            </Campo>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Tipo de comissão">
              <select
                value={estado.comissao_tipo}
                onChange={(e) => set("comissao_tipo", e.target.value as TipoComissao)}
                style={inputStyle}
              >
                <option value="fixo">Valor fixo (R$)</option>
                <option value="percentual">Percentual (%)</option>
              </select>
            </Campo>
            <Campo label={estado.comissao_tipo === "fixo" ? "Valor (R$)" : "Percentual"}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={estado.comissao_valor}
                onChange={(e) => set("comissao_valor", Number(e.target.value))}
                style={inputStyle}
              />
            </Campo>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

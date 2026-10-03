/**
 * Seção API — form singleton de configuração da API de consulta.
 * Armazena provedor, url_base e referência ao secret no vault.
 * O token real NUNCA é salvo em banco — vai para vault.create_secret.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Save, ShieldAlert, Eye, EyeOff } from "lucide-react";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { Campo, Toggle } from "./ui-admin";
import { supabase } from "@/integrations/supabase/client";
import { inputStyle, pegarToast } from "./tipos";
import type { ConfigApi, SupabaseBruto } from "./tipos";

interface Props {
  config: ConfigApi | null;
  onMudou: () => void;
}

export function SecaoApi({ config, onMudou }: Props) {
  const t = pegarToast();
  const [form, setForm] = useState<Partial<ConfigApi> & { token_raw?: string }>({
    provedor: config?.provedor ?? "",
    url_base: config?.url_base ?? "",
    secret_nome: config?.secret_nome ?? "",
    ativo: config?.ativo ?? true,
    token_raw: "",
  });
  const [mostrarToken, setMostrarToken] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!form.provedor?.trim()) { t.error("Nome do provedor é obrigatório."); return; }
    if (!form.url_base?.trim()) { t.error("URL base é obrigatória."); return; }

    const temTokenNovo = !!form.token_raw?.trim();
    const secretNomeGerado = form.secret_nome?.trim() || `consulta_api_credencial_${form.provedor?.trim()}`;

    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;

      // Credencial vai pro vault via RPC admin-only (nunca em texto plano no banco)
      if (temTokenNovo) {
        const { data, error } = await sb.rpc("definir_segredo_consulta", {
          p_nome: secretNomeGerado,
          p_valor: form.token_raw,
        });
        if (error) throw error;
        if (data && data.ok === false) {
          t.error("Não foi possível salvar a credencial: " + (data.erro ?? ""));
          return;
        }
      }

      const { error: errCfg } = await sb.from("consultas_config_api").upsert({
        ...(config?.id ? { id: config.id } : {}),
        provedor: form.provedor,
        url_base: form.url_base,
        secret_nome: secretNomeGerado,
        ativo: form.ativo,
        atualizado_em: new Date().toISOString(),
      });
      if (errCfg) throw errCfg;

      t.success("Configuração salva. Credencial armazenada no vault com segurança.");
      setForm((prev) => ({ ...prev, token_raw: "", secret_nome: secretNomeGerado }));
      onMudou();
    } catch {
      t.error("Falha ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" style={{ padding: 4, maxWidth: 560 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
          Configuração da API
        </div>
        <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 3 }}>
          Dados do provedor externo que executa as consultas de CPF/CNPJ.
        </div>
      </div>

      {/* Aviso de segurança */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 14px",
          background: "oklch(0.78 0.18 80 / 0.08)",
          border: "1px solid oklch(0.78 0.18 80 / 0.25)",
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <ShieldAlert size={14} style={{ color: "oklch(0.78 0.18 80)", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: "oklch(0.78 0.18 80 / 0.9)", lineHeight: 1.5 }}>
          O token/chave da API nunca é armazenado em texto simples no banco.
          Ele é salvo no <strong>Vault do Supabase</strong> (criptografado) e referenciado pelo nome do secret.
          Preencha o campo abaixo apenas quando precisar cadastrar ou rotacionar o token.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Campo label="Nome do provedor">
          <input
            style={inputStyle}
            value={form.provedor ?? ""}
            onChange={(e) => setForm({ ...form, provedor: e.target.value })}
            placeholder="Ex: DataValid, Serasa, BigDataCorp"
          />
        </Campo>

        <Campo label="URL base da API">
          <input
            style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            value={form.url_base ?? ""}
            onChange={(e) => setForm({ ...form, url_base: e.target.value })}
            placeholder="https://api.provedor.com/v1"
          />
        </Campo>

        <Campo label="Token / Chave da API (deixe em branco para manter o atual)">
          <div style={{ position: "relative" }}>
            <input
              style={{ ...inputStyle, paddingRight: 38 }}
              type={mostrarToken ? "text" : "password"}
              value={form.token_raw ?? ""}
              onChange={(e) => setForm({ ...form, token_raw: e.target.value })}
              placeholder={config?.secret_nome ? `Secret atual: ${config.secret_nome}` : "Cole o token aqui"}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setMostrarToken((v) => !v)}
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: "none", cursor: "pointer",
                color: "oklch(0.98 0 0 / 0.45)", display: "grid", placeItems: "center",
              }}
            >
              {mostrarToken ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <div style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.4)", marginTop: 4 }}>
            Ao salvar, esse token será gravado no vault com o nome{" "}
            <span style={{ fontFamily: "ui-monospace, monospace" }}>
              {form.secret_nome || "consulta_api_token_<timestamp>"}
            </span>
          </div>
        </Campo>

        <Campo label="Nome do secret no vault (preenchido automaticamente)">
          <input
            style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", opacity: 0.7 }}
            value={form.secret_nome ?? ""}
            readOnly
            placeholder="Gerado ao salvar o token"
          />
        </Campo>

        <Toggle
          ativo={form.ativo ?? true}
          onChange={(v) => setForm({ ...form, ativo: v })}
          rotulo="Integração ativa (permite executar consultas)"
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={salvar}
          disabled={salvando}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 20px",
            fontSize: 12,
            fontWeight: 600,
            background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.4), oklch(0.65 0.22 280 / 0.3))",
            color: "oklch(0.98 0 0)",
            border: "1px solid oklch(0.7 0.18 220 / 0.4)",
            borderRadius: 10,
            cursor: salvando ? "not-allowed" : "pointer",
            opacity: salvando ? 0.6 : 1,
          }}
        >
          <Save size={13} /> {salvando ? "Salvando…" : "Salvar configuração"}
        </motion.button>
      </div>
    </motion.div>
  );
}

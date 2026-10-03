/**
 * Form compartilhado de lançamento (edição inline + novo manual) com anexo.
 * Upload vai pro bucket `financeiro` com hash sha256 anti-duplicata:
 * arquivo repetido não sobe de novo — vincula o documento existente.
 */

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { tapPress } from "@/os/motion/presets";
import { inputStyle, type SupabaseBruto } from "./tipos";

export type FormLanc = { tipo: "entrada" | "saida"; valor: string; data: string; descricao: string; categoria: string };

export type AcaoAnexo = { tipo: "manter" } | { tipo: "remover" } | { tipo: "novo"; arquivo: File };

async function sha256Arquivo(arquivo: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extensao(nome: string): string {
  const m = nome.toLowerCase().match(/\.(pdf|png|jpe?g|webp)$/);
  if (!m) return "jpg";
  return m[1] === "jpeg" ? "jpg" : m[1];
}

/**
 * Sobe o comprovante e devolve o id em `documentos_financeiros`.
 * Duplicata por hash → devolve o documento existente (sem novo upload).
 */
export async function subirComprovante(sb: SupabaseBruto, ownerId: string, arquivo: File): Promise<string> {
  const hash = await sha256Arquivo(arquivo);
  const { data: existente } = await sb
    .from("documentos_financeiros")
    .select("id")
    .eq("tenant_id", ownerId)
    .eq("hash_arquivo", hash)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (existente?.id) return existente.id as string;

  const docId = crypto.randomUUID();
  const path = `${ownerId}/${docId}.${extensao(arquivo.name)}`;
  const { error: upErr } = await sb.storage
    .from("financeiro")
    .upload(path, arquivo, { contentType: arquivo.type || "application/octet-stream", upsert: false });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  const { error: insErr } = await sb.from("documentos_financeiros").insert({
    id: docId,
    tenant_id: ownerId,
    tipo: "comprovante",
    storage_path: path,
    hash_arquivo: hash,
    dados_extraidos: { origem: "upload_app" },
  });
  if (insErr) throw new Error(`registro: ${insErr.message}`);
  return docId;
}

/** Desvincula o doc do movimento; doc órfão vira soft delete + arquivo removido (best effort). */
export async function limparDocumentoOrfao(sb: SupabaseBruto, docId: string): Promise<void> {
  const { data: usos } = await sb
    .from("movimentos_financeiros")
    .select("id")
    .eq("documento_id", docId)
    .is("deleted_at", null)
    .limit(1);
  if (usos && usos.length > 0) return;
  const { data: doc } = await sb
    .from("documentos_financeiros")
    .select("storage_path")
    .eq("id", docId)
    .maybeSingle();
  await sb.from("documentos_financeiros").update({ deleted_at: new Date().toISOString() }).eq("id", docId);
  if (doc?.storage_path) {
    try { await sb.storage.from("financeiro").remove([doc.storage_path]); } catch { /* best effort */ }
  }
}

type Props = {
  form: FormLanc;
  setForm: (f: FormLanc) => void;
  temAnexo: boolean;
  acaoAnexo: AcaoAnexo;
  setAcaoAnexo: (a: AcaoAnexo) => void;
  salvando: boolean;
  onSalvar: () => void;
  onCancelar: () => void;
};

export function FormLancamento({ form, setForm, temAnexo, acaoAnexo, setAcaoAnexo, salvando, onSalvar, onCancelar }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);

  const rotuloAnexo = acaoAnexo.tipo === "novo"
    ? `anexo: ${nomeArquivo ?? "novo arquivo"}`
    : acaoAnexo.tipo === "remover"
      ? "anexo será removido"
      : temAnexo
        ? "anexo mantido"
        : "sem anexo";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={form.tipo}
          onChange={(e) => setForm({ ...form, tipo: e.target.value as FormLanc["tipo"] })}
          style={{ ...inputStyle, width: 110 }}>
          <option value="saida">Saída</option>
          <option value="entrada">Entrada</option>
        </select>
        <input style={{ ...inputStyle, width: 110 }} value={form.valor} inputMode="decimal"
          onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="Valor" />
        <input type="date" style={{ ...inputStyle, width: 150 }} value={form.data}
          onChange={(e) => setForm({ ...form, data: e.target.value })} />
        <input style={{ ...inputStyle, width: 150 }} value={form.categoria} maxLength={60}
          onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Categoria" />
      </div>
      <input style={inputStyle} value={form.descricao} maxLength={300}
        onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Descrição" />

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setAcaoAnexo({ tipo: "novo", arquivo: f }); setNomeArquivo(f.name); }
            e.target.value = "";
          }} />
        <motion.button whileTap={tapPress} type="button" onClick={() => fileRef.current?.click()} style={botaoAcao}>
          {temAnexo || acaoAnexo.tipo === "novo" ? "trocar anexo" : "anexar comprovante"}
        </motion.button>
        {(temAnexo || acaoAnexo.tipo === "novo") && acaoAnexo.tipo !== "remover" && (
          <motion.button whileTap={tapPress} type="button"
            onClick={() => { setAcaoAnexo({ tipo: "remover" }); setNomeArquivo(null); }}
            style={{ ...botaoAcao, color: "oklch(0.65 0.24 25)" }}>
            remover anexo
          </motion.button>
        )}
        <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>{rotuloAnexo}</span>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <motion.button whileTap={tapPress} type="button" onClick={onCancelar} style={botaoAcao}>
          cancelar
        </motion.button>
        {/* Data obrigatória: sem data o lançamento some de todos os meses (filtro gte/lt). */}
        <motion.button whileTap={tapPress} type="button" disabled={salvando || !form.data} onClick={onSalvar}
          title={!form.data ? "Escolha a data do lançamento" : undefined}
          style={{ ...botaoAcao, color: "oklch(0.72 0.18 145)", borderColor: "oklch(0.72 0.18 145 / 0.4)", opacity: salvando || !form.data ? 0.6 : 1 }}>
          {salvando ? "salvando…" : "salvar"}
        </motion.button>
      </div>
    </div>
  );
}

const botaoAcao: React.CSSProperties = {
  fontSize: 10, padding: "4px 8px", borderRadius: 8,
  border: "1px solid oklch(0.98 0 0 / 0.1)", background: "transparent",
  color: "oklch(0.98 0 0 / 0.55)", cursor: "pointer", whiteSpace: "nowrap",
};

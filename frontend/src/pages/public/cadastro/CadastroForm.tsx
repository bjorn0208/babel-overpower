/**
 * Formulário de auto-cadastro por indicação.
 * Standalone — estilos inline, não depende do OS bundle.css.
 */

import { Loader2, Upload, Eye, X, Check } from "lucide-react";
import type { CamposForm, ImplantacaoItem } from "./tipos";

const COR = "#6366f1";

type Props = {
  campos: CamposForm;
  setCampos: (parcial: Partial<CamposForm>) => void;
  implantacao: ImplantacaoItem | null;
  pixKey: string;
  termosUso: string;
  aceitouTermos: boolean;
  onAceitouTermos: (v: boolean) => void;
  onShowTermos: () => void;
  file: File | null;
  previewUrl: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  submitting: boolean;
  erro: string;
  onSubmit: (e: React.FormEvent) => void;
};

function formatBRL(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const estiloInput: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid #d4d4d8",
  background: "#fafafa",
  padding: "10px 12px",
  fontSize: 14,
  color: "#18181b",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const estiloLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#52525b",
  marginBottom: 6,
};

export function CadastroForm({
  campos,
  setCampos,
  implantacao,
  pixKey,
  termosUso,
  aceitouTermos,
  onAceitouTermos,
  onShowTermos,
  file,
  previewUrl,
  onFileChange,
  onClearFile,
  submitting,
  erro,
  onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Card da implantação + PIX */}
      {implantacao && (
        <div
          style={{
            borderRadius: 14,
            background: `${COR}0c`,
            border: `1px solid ${COR}30`,
            padding: "16px 18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#18181b" }}>
              {implantacao.nome}
            </p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: COR, whiteSpace: "nowrap" }}>
              {formatBRL(Number(implantacao.preco))}
            </p>
          </div>
          {pixKey && (
            <div
              style={{
                marginTop: 12,
                borderRadius: 10,
                background: "#fff",
                border: "1px solid #e4e4e7",
                padding: "10px 14px",
              }}
            >
              <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: "#71717a", letterSpacing: 0.6, textTransform: "uppercase" }}>
                Chave PIX para pagamento
              </p>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: 13, color: "#18181b", wordBreak: "break-all" }}>
                {pixKey}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Erro inline */}
      {erro && (
        <div
          role="alert"
          style={{
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            padding: "10px 14px",
            fontSize: 13,
            color: "#b91c1c",
            lineHeight: 1.5,
          }}
        >
          {erro}
        </div>
      )}

      {/* Nome */}
      <div>
        <label htmlFor="cad-nome" style={estiloLabel}>Nome completo</label>
        <input
          id="cad-nome"
          style={estiloInput}
          value={campos.nome}
          onChange={(e) => setCampos({ nome: e.target.value })}
          required
          placeholder="Seu nome completo"
          autoComplete="name"
        />
      </div>

      {/* CPF + WhatsApp */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label htmlFor="cad-cpf" style={estiloLabel}>CPF</label>
          <input
            id="cad-cpf"
            style={estiloInput}
            value={campos.cpf}
            onChange={(e) => setCampos({ cpf: e.target.value })}
            required
            placeholder="000.000.000-00"
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="cad-whatsapp" style={estiloLabel}>WhatsApp</label>
          <input
            id="cad-whatsapp"
            style={estiloInput}
            value={campos.whatsapp}
            onChange={(e) => setCampos({ whatsapp: e.target.value })}
            required
            placeholder="(00) 00000-0000"
            autoComplete="tel"
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label htmlFor="cad-email" style={estiloLabel}>Email</label>
        <input
          id="cad-email"
          type="email"
          style={estiloInput}
          value={campos.email}
          onChange={(e) => setCampos({ email: e.target.value })}
          required
          placeholder="seu@email.com"
          autoComplete="email"
        />
      </div>

      {/* Senha */}
      <div>
        <label htmlFor="cad-senha" style={estiloLabel}>Senha de acesso</label>
        <input
          id="cad-senha"
          type="password"
          style={estiloInput}
          value={campos.senha}
          onChange={(e) => setCampos({ senha: e.target.value })}
          required
          minLength={6}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
        />
      </div>

      {/* Upload comprovante */}
      <div>
        <label htmlFor="cad-comprovante" style={estiloLabel}>
          Comprovante de pagamento <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <label
          htmlFor="cad-comprovante"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 12,
            border: `2px dashed ${file ? COR : "#d4d4d8"}`,
            padding: "20px 16px",
            cursor: "pointer",
            background: file ? `${COR}06` : "#fafafa",
            transition: "border-color 0.15s",
            minHeight: 80,
          }}
        >
          {file ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview do comprovante"
                  style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }}
                />
              ) : (
                <Eye size={22} style={{ color: COR }} />
              )}
              <span style={{ fontSize: 13, color: "#18181b", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name}
              </span>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); onClearFile(); }}
                aria-label="Remover comprovante"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a1a1aa", padding: 2, display: "flex" }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <Upload size={24} style={{ color: "#a1a1aa" }} />
              <span style={{ fontSize: 12, color: "#71717a" }}>Clique para anexar imagem ou PDF</span>
            </>
          )}
          <input
            id="cad-comprovante"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={onFileChange}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {/* Termos */}
      {termosUso && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input
            id="cad-termos"
            type="checkbox"
            checked={aceitouTermos}
            onChange={(e) => onAceitouTermos(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, accentColor: COR, flexShrink: 0, cursor: "pointer" }}
          />
          <label htmlFor="cad-termos" style={{ fontSize: 12, color: "#71717a", lineHeight: 1.6, cursor: "pointer" }}>
            Li e aceito os{" "}
            <button
              type="button"
              onClick={onShowTermos}
              style={{ background: "transparent", border: "none", padding: 0, color: COR, fontWeight: 600, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
            >
              Termos de Uso
            </button>
          </label>
        </div>
      )}

      {/* Botão enviar */}
      <button
        type="submit"
        disabled={submitting || (!!termosUso && !aceitouTermos)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          borderRadius: 12,
          border: "none",
          background: submitting || (!!termosUso && !aceitouTermos) ? "#a1a1aa" : COR,
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          padding: "13px 20px",
          cursor: submitting || (!!termosUso && !aceitouTermos) ? "not-allowed" : "pointer",
          transition: "background 0.15s",
          fontFamily: "inherit",
        }}
      >
        {submitting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Check size={16} />
        )}
        {submitting ? "Criando conta..." : "Criar conta e enviar comprovante"}
      </button>
    </form>
  );
}

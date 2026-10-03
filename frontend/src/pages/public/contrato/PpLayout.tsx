/**
 * PpLayout — componentes de estrutura da página pública:
 * cabeçalho, barra de progresso, rodapé e telas de estado.
 */

import { PpIcone } from "./PpIcone";
import type { MetaStep } from "./tipos";

/* Cabeçalho com logo e badge de segurança */
export function PpHeader({
  nomeEmpresa,
  logoUrl,
  letreiro = "Contrato digital",
}: {
  nomeEmpresa: string;
  logoUrl: string | null;
  /** Rótulo da função da página (ex.: "Consulta de crédito") — cabeçalho é compartilhado entre links públicos. */
  letreiro?: string;
}) {
  const inicial = nomeEmpresa.charAt(0).toUpperCase();
  return (
    <header className="pp-header">
      <div className="pp-brand">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover" }}
          />
        ) : (
          <div className="pp-logo">{inicial}</div>
        )}
        <div className="pp-brand-text">
          <div className="pp-brand-eyebrow">{letreiro}</div>
          <div className="pp-brand-name">{nomeEmpresa}</div>
        </div>
      </div>
      <div className="pp-seguro" title="Conexão criptografada">
        <PpIcone nome="shield" tamanho={13} /> Conexão segura
      </div>
    </header>
  );
}

/* Barra de progresso por passo */
export function PpProgress({
  stepsAtivos,
  indiceAtual,
}: {
  stepsAtivos: MetaStep[];
  indiceAtual: number;
}) {
  const visiveis = stepsAtivos.filter((s) => s.id !== "concluido");
  const atual = visiveis[indiceAtual];
  return (
    <div className="pp-progress">
      <div className="pp-progress-bars">
        {visiveis.map((s, i) => (
          <div
            key={s.id}
            className={`pp-progress-bar ${
              i < indiceAtual ? "is-done" : i === indiceAtual ? "is-current" : ""
            }`}
          />
        ))}
      </div>
      <div className="pp-progress-meta">
        <span>
          Passo <b>{indiceAtual + 1}</b> de <b>{visiveis.length}</b>
        </span>
        <span>{atual?.titulo}</span>
      </div>
    </div>
  );
}

/* Rodapé com ID público e nome da empresa */
export function PpFooter({
  chavePublica,
  nomeEmpresa,
}: {
  chavePublica: string;
  nomeEmpresa: string;
}) {
  return (
    <footer className="pp-footer">
      <div className="pp-footer-trust">
        <PpIcone nome="shield" tamanho={12} style={{ color: "var(--pp-success)" }} />
        <span>Conexão criptografada · {nomeEmpresa}</span>
      </div>
      <span>ID público: {chavePublica.slice(0, 12)}</span>
    </footer>
  );
}

/* Tela de carregamento inicial */
export function TelaCarregando() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--pp-bg, #fafafa)",
      }}
    >
      <div className="pp-camera-spinner" style={{ width: 32, height: 32 }} />
    </div>
  );
}

/* Tela de erro (contrato não encontrado, token inválido etc.) */
export function TelaErro({ mensagem }: { mensagem: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--pp-bg, #fafafa)",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--pp-ink, #18181b)",
            marginBottom: 8,
          }}
        >
          Algo não bate
        </h1>
        <p style={{ fontSize: 14, color: "var(--pp-ink-3, #71717a)", lineHeight: 1.6 }}>
          {mensagem}
        </p>
      </div>
    </div>
  );
}

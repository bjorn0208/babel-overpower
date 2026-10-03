/**
 * PpShared — componentes compartilhados entre os steps da jornada pública.
 */

import { PpIcone } from "./PpIcone";

/* Zona de upload de arquivo com preview */
export function PpUpload({
  url,
  onChange,
  carregando,
  label,
  iconeName,
  comCamera,
}: {
  url: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  carregando: boolean;
  label: string;
  iconeName: string;
  comCamera?: boolean;
}) {
  return (
    <label className={`pp-upload ${url ? "has-file" : ""}`}>
      {url ? (
        <div className="pp-upload-preview">
          <img src={url} alt="" />
          <div className="pp-upload-trade">↻ Trocar arquivo</div>
        </div>
      ) : carregando ? (
        <div style={{ color: "var(--pp-ink-3)", fontSize: 13 }}>Enviando…</div>
      ) : (
        <>
          <div className="pp-upload-icon">
            <PpIcone nome={iconeName} tamanho={24} />
          </div>
          <div className="pp-upload-label">{label}</div>
          <div className="pp-upload-hint">JPG, PNG ou HEIC · máx 8 MB</div>
        </>
      )}
      <input
        type="file"
        accept="image/*"
        capture={comCamera ? "user" : undefined}
        onChange={onChange}
        style={{ display: "none" }}
      />
    </label>
  );
}

/* Botões de voltar / avançar */
export function PpAcoes({
  onVoltar,
  onAvancar,
  avancarDisabled,
  rotuloAvancar,
}: {
  onVoltar: () => void;
  onAvancar: () => void;
  avancarDisabled?: boolean;
  rotuloAvancar?: string;
}) {
  return (
    <div className="pp-actions" style={{ marginTop: 18 }}>
      <button className="pp-btn pp-btn-ghost" type="button" onClick={onVoltar}>
        <PpIcone nome="chevl" tamanho={14} /> Voltar
      </button>
      <button
        className="pp-btn pp-btn-primary"
        type="button"
        // Nunca repassar o evento de clique: onAvancar de alguns steps aceita
        // parâmetro opcional (ex.: URL da assinatura) e o MouseEvent vazava como
        // argumento — virava estrutura circular no payload da RPC (bug 2026-06-11).
        onClick={() => onAvancar()}
        disabled={avancarDisabled}
      >
        {rotuloAvancar ?? "Continuar"}{" "}
        <PpIcone nome="chevr" tamanho={14} />
      </button>
    </div>
  );
}

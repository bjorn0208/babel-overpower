/**
 * estados-gerar-ia.tsx — Sub-componentes dos estados upload/processando do ModalGerarIA.
 * Extraídos para manter modal-gerar-ia.tsx ≤ 300 linhas.
 * F3c: o antigo EstadoResultado (mock) virou ConferenciaProposta (conferencia-proposta.tsx).
 */

import React from "react";
import { estilosGerarIA as e } from "./estilos-gerar-ia";

// ---------------------------------------------------------------------------
// Estado: upload
// ---------------------------------------------------------------------------

export interface UploadProps {
  arquivo: File | null;
  texto: string;
  setTexto: (v: string) => void;
  arrastando: boolean;
  setArrastando: (v: boolean) => void;
  onDrop: (ev: React.DragEvent) => void;
  onFile: (ev: React.ChangeEvent<HTMLInputElement>) => void;
}

export function EstadoUpload({
  arquivo, texto, setTexto, arrastando, setArrastando, onDrop, onFile,
}: UploadProps): React.ReactElement {
  return (
    <div>
      <label
        style={{
          ...e.dropzone,
          borderColor: arrastando ? "oklch(0.72 0.22 295)" : "oklch(0.28 0.01 270)",
          background: arrastando ? "oklch(0.72 0.18 295 / 0.10)" : "oklch(0.14 0.01 270)",
        }}
        onDragOver={(ev) => { ev.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={onDrop}
      >
        <div style={e.dropzoneIcone}>📄</div>
        {arquivo ? (
          <>
            <span style={e.dropzoneNomeArq}>{arquivo.name}</span>
            <span style={e.dropzoneHint}>{(arquivo.size / 1024).toFixed(1)} KB · clique pra trocar</span>
          </>
        ) : (
          <>
            <span style={e.dropzoneTitulo}>Arraste o contrato existente</span>
            <span style={e.dropzoneHint}>PDF, DOCX, TXT · ou clique pra escolher</span>
          </>
        )}
        <input
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={onFile}
          style={{ display: "none" }}
        />
      </label>

      <div style={e.separador}>ou</div>
      <label style={e.label}>Cole o texto do contrato</label>
      <textarea
        value={texto}
        onChange={(ev) => setTexto(ev.target.value)}
        placeholder="Cole aqui o texto bruto do seu contrato atual…"
        rows={5}
        style={e.textarea}
      />

      <div style={e.infoBox}>
        <strong style={{ color: "oklch(0.72 0.16 235)" }}>O que a IA vai extrair:</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>Campos do contato (nome, CPF, e-mail, etc.) → aba <strong>Campos</strong></li>
          <li>Produtos vendidos e seus preços → aba <strong>Preço</strong></li>
          <li>Cláusulas e estrutura do documento → editor</li>
          <li>Provas de assinatura sugeridas → aba <strong>Provas</strong></li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estado: processando
// ---------------------------------------------------------------------------

export function EstadoProcessando({
  progresso, progressoMsg,
}: { progresso: number; progressoMsg: string }): React.ReactElement {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <div style={e.iconePulse}>✦</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: "oklch(0.97 0 0)" }}>
        Lendo seu contrato
      </div>
      <div style={{ fontSize: 13, color: "oklch(0.65 0.01 270)", marginBottom: 22, minHeight: 18 }}>
        {progressoMsg}
      </div>
      <div style={e.barraFundo}>
        <div style={{ ...e.barraPreenchimento, width: `${progresso}%` }} />
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "oklch(0.5 0.01 270)" }}>{progresso}%</div>
    </div>
  );
}


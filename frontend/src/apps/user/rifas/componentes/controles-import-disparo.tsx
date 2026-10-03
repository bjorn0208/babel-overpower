/** Controles do topo da lista de disparo: subir CSV/Excel, adicionar número à mão, escolher a rifa do dia. */

import type { RefObject } from "react";
import { Plus, UploadCloud } from "lucide-react";
import { Botao } from "./botao";
import { Campo, Selecao } from "./campo";
import "../abas/aba-disparo.css";

export interface RifaOpcao {
  id: string;
  titulo: string;
}

export interface ControlesImportDisparoProps {
  refArquivo: RefObject<HTMLInputElement | null>;
  importando: boolean;
  aoImportar: (arquivo: File) => void;
  manual: string;
  aoManualMudar: (v: string) => void;
  aoAdicionarManual: () => void;
  rifas: RifaOpcao[];
  rifaDisparoId: string;
  aoSalvarRifaDoDia: (id: string) => void;
}

export const ControlesImportDisparo = ({
  refArquivo,
  importando,
  aoImportar,
  manual,
  aoManualMudar,
  aoAdicionarManual,
  rifas,
  rifaDisparoId,
  aoSalvarRifaDoDia,
}: ControlesImportDisparoProps) => (
  <div className="space-y-4">
    <input
      ref={refArquivo}
      type="file"
      accept=".csv,.xlsx,.xls"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) aoImportar(f);
      }}
    />

    <button
      type="button"
      className="ard-upload"
      onClick={() => refArquivo.current?.click()}
      disabled={importando}
    >
      <span className="ard-upload__icone" aria-hidden>
        <UploadCloud size={20} />
      </span>
      <span className="ar-txt-1 font-medium">
        {importando ? "Lendo a planilha…" : "Subir CSV ou Excel"}
      </span>
      <span className="text-xs ar-txt-3">Toque pra escolher o arquivo (.csv, .xlsx, .xls)</span>
    </button>

    {/* Resumo do que a leitura aproveita do arquivo — evita a pergunta
        "qual coluna eu ponho o telefone?" antes de subir. */}
    <p className="ar-info-box">
      Do arquivo saem só duas coisas: a <strong>1ª coluna com telefone</strong> (10 a 13 dígitos,
      detectada sozinha) e o <strong>nome</strong> da coluna ao lado, quando existe. Todo contato lido
      entra já marcado pro disparo; repetido não duplica.
    </p>

    <div className="ar-form-grid">
      <div>
        <label className="ar-rotulo block mb-1.5" htmlFor="disparo-manual">
          Adicionar número à mão
        </label>
        <div className="flex gap-2">
          <Campo
            id="disparo-manual"
            value={manual}
            onChange={(e) => aoManualMudar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") aoAdicionarManual();
            }}
            placeholder="11 91234-5678"
            inputMode="tel"
          />
          <Botao onClick={aoAdicionarManual} aria-label="Adicionar número à lista" className="shrink-0 px-4">
            <Plus size={18} aria-hidden />
          </Botao>
        </div>
      </div>

      <Selecao
        rotulo="Rifa do dia"
        value={rifaDisparoId}
        onChange={(e) => aoSalvarRifaDoDia(e.target.value)}
        opcoes={[
          { valor: "", rotulo: "Automática (ativa mais recente)" },
          ...rifas.map((r) => ({ valor: r.id, rotulo: r.titulo })),
        ]}
      />
    </div>
  </div>
);

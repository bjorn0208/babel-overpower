import { documentoValido, extrairSocios, formatarDocumento, formatarSocios } from "./helpers";

type Props = {
  dados: Record<string, string>;
  setDados: (v: Record<string, string>) => void;
};

function comResumo(dados: Record<string, string>): Record<string, string> {
  const copia = { ...dados, socios_adicionais: "" };
  copia.socios_adicionais = formatarSocios(copia);
  return copia;
}

function proximoIndice(dados: Record<string, string>): number {
  let maior = 0;
  for (const chave of Object.keys(dados)) {
    const match = /^socio_(\d+)_/.exec(chave);
    if (match) maior = Math.max(maior, Number(match[1]));
  }
  return maior + 1;
}

export function PpListaSocios({ dados, setDados }: Props) {
  const socios = extrairSocios(dados);

  function atualizar(indice: number, campo: "nome" | "cpf", valor: string) {
    setDados(comResumo({ ...dados, [`socio_${indice}_${campo}`]: valor }));
  }

  function adicionar() {
    const indice = proximoIndice(dados);
    setDados(
      comResumo({
        ...dados,
        [`socio_${indice}_nome`]: "",
        [`socio_${indice}_cpf`]: "",
      }),
    );
  }

  function remover(indice: number) {
    const proximo = { ...dados };
    delete proximo[`socio_${indice}_nome`];
    delete proximo[`socio_${indice}_cpf`];
    setDados(comResumo(proximo));
  }

  return (
    <section
      style={{
        padding: 16,
        marginBottom: 16,
        background: "var(--pp-bg-2)",
        borderRadius: "var(--pp-r)",
        border: "1px solid var(--pp-border)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Sócios adicionais</div>
      <div style={{ fontSize: 11, color: "var(--pp-ink-3)", lineHeight: 1.5, marginBottom: 12 }}>
        Se a empresa tiver mais de um sócio, informe os demais participantes.
      </div>

      {socios.map((socio) => (
        <div
          key={socio.indice}
          style={{
            padding: 12,
            marginBottom: 10,
            border: "1px solid var(--pp-border)",
            borderRadius: 10,
            background: "var(--pp-paper)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--pp-ink-4)" }}>
              Sócio {socio.indice}
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="pp-btn pp-btn-ghost"
              style={{ padding: "6px 10px", fontSize: 11 }}
              onClick={() => remover(socio.indice)}
            >
              Remover
            </button>
          </div>
          <div className="pp-field">
            <label className="pp-label">Nome completo</label>
            <input
              className="pp-input"
              value={socio.nome}
              onChange={(e) => atualizar(socio.indice, "nome", e.target.value)}
            />
          </div>
          <div className="pp-field" style={{ marginBottom: 0 }}>
            <label className="pp-label">CPF</label>
            <input
              className="pp-input"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={socio.cpf}
              onChange={(e) => atualizar(socio.indice, "cpf", formatarDocumento("CPF", e.target.value))}
            />
            {socio.cpf.length > 0 && !documentoValido("CPF", socio.cpf) && (
              <div className="pp-erro-campo">CPF inválido. Confira os números.</div>
            )}
          </div>
        </div>
      ))}

      <button type="button" className="pp-btn pp-btn-ghost pp-btn-block" onClick={adicionar}>
        + Adicionar sócio
      </button>
    </section>
  );
}

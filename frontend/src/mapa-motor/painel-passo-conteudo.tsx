// Sub-componentes de renderização de conteúdo para PainelPasso
// Separados para manter PainelPasso.tsx ≤300 linhas

import type { ConteudoPasso } from "./tipos-replay";

export function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "oklch(0.55 0.05 240)",
          marginBottom: 4,
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "oklch(0.88 0.02 240)",
          background: "oklch(0.16 0.02 240)",
          borderRadius: 6,
          padding: "7px 10px",
          lineHeight: 1.55,
          wordBreak: "break-word",
          border: "1px solid oklch(0.24 0.03 240)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ValorOuVazio({ valor }: { valor: unknown }) {
  if (valor === null || valor === undefined || valor === "") {
    return (
      <span style={{ color: "oklch(0.45 0.03 240)", fontStyle: "italic" }}>
        sem dado neste turno
      </span>
    );
  }
  if (typeof valor === "object") {
    return (
      <pre
        style={{
          margin: 0,
          fontSize: 11,
          whiteSpace: "pre-wrap",
          fontFamily: "monospace",
          color: "oklch(0.88 0.02 240)",
        }}
      >
        {JSON.stringify(valor, null, 2)}
      </pre>
    );
  }
  return <>{String(valor)}</>;
}

export function ConteudoTrace({ c }: { c: ConteudoPasso }) {
  return (
    <>
      <Secao titulo="Decisão">
        <ValorOuVazio valor={c.trace_decisao} />
      </Secao>
      {c.trace_raciocinio && (
        <Secao titulo="Raciocínio interno">
          <ValorOuVazio valor={c.trace_raciocinio} />
        </Secao>
      )}
      {c.trace_prompt_resumo && (
        <Secao titulo="Prompt resumo">
          <ValorOuVazio valor={c.trace_prompt_resumo} />
        </Secao>
      )}
      <Secao titulo="Métricas">
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span>
            Modelo:{" "}
            <strong style={{ color: "oklch(0.78 0.08 240)" }}>
              {c.trace_modelo ?? "—"}
            </strong>
          </span>
          <span>
            Latência:{" "}
            <strong style={{ color: "oklch(0.78 0.08 240)" }}>
              {c.trace_latencia_ms != null ? `${c.trace_latencia_ms} ms` : "—"}
            </strong>
          </span>
          <span>
            Tokens entrada / saída:{" "}
            <strong style={{ color: "oklch(0.78 0.08 240)" }}>
              {c.trace_custo_in ?? "—"} / {c.trace_custo_out ?? "—"}
            </strong>
          </span>
        </div>
      </Secao>
    </>
  );
}

export function ConteudoMensagem({ c }: { c: ConteudoPasso }) {
  const ehUser = c.msg_role === "user" || c.msg_role === "human";
  return (
    <Secao titulo={ehUser ? "Texto do lead" : "Texto do agente"}>
      <ValorOuVazio valor={c.msg_content} />
    </Secao>
  );
}

export function ConteudoBolha({ c }: { c: ConteudoPasso }) {
  return (
    <>
      <Secao titulo="Conteúdo da bolha">
        <ValorOuVazio valor={c.bolha_content} />
      </Secao>
      <Secao titulo="Status na caixa de saída">
        <span
          style={{
            color:
              c.bolha_status === "enviada"
                ? "oklch(0.65 0.18 145)"
                : "oklch(0.78 0.12 60)",
          }}
        >
          {c.bolha_status ?? "—"}
        </span>
      </Secao>
    </>
  );
}

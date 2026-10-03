/**
 * Aba Validade — KPIs de assinatura e revalidação.
 * Extraído 1:1 do monolito — sem mudança de comportamento.
 */

import { CardKpi, statusAssinado, statusValidar } from "./re-exports";
import type { Contrato } from "./re-exports";

export function AbaValidade({ contratos }: { contratos: Contrato[] }) {
  const aValidar = contratos.filter((c) => statusValidar(c.status));
  const assinados = contratos.filter((c) => statusAssinado(c.status));

  return (
    <div className="os-vidro" style={{ padding: 18, borderRadius: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)", marginBottom: 10 }}>
        Validade e revalidacao
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <CardKpi rotulo="Aguardando validacao" valor={aValidar.length} cor="oklch(0.7 0.18 220)" />
        <CardKpi rotulo="Assinados no total" valor={assinados.length} cor="oklch(0.72 0.18 145)" />
        <CardKpi rotulo="Total emitidos" valor={contratos.length} cor="oklch(0.65 0.22 280)" />
      </div>

      <p style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.45)", marginTop: 14 }}>
        Heatmap calendario e alertas de vencimento chegam na Onda 1-b junto com a pagina publica.
      </p>
    </div>
  );
}

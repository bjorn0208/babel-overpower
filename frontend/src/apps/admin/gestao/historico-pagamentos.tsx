/**
 * Histórico de pagamentos (Lote J, item 19 do dossiê) — botão que abre, num Modal (DESIGN.md: modal
 * só quando inline não serve; uma lista de eventos numa linha de tabela é um desses casos), o que
 * mudou num pagamento: quem apagou, desmarcou ou alterou, quando e o que era antes. Lê por
 * `dados-pagamentos.ts` (nunca grava). Usado nas abas Parcelas e Mensalidades (cabeçalho e por linha).
 */

import { useState } from "react";
import { mensagemDeErro, perfis } from "./dados";
import { lerPagamentosLog, resumoHistoricoLinha } from "./dados-pagamentos";
import type { PagamentoLog } from "./tipos";
import { BotaoAcao, Modal } from "./ui-gestao";

export function HistoricoPagamentos({
  clienteId,
  linhaId,
  tabela,
  rotulo = "Histórico",
  tamanho = "sm",
}: {
  /** Filtra pelas alterações deste cliente (gaveta por linha de cliente). */
  clienteId?: string;
  /** Filtra pelas alterações desta linha exata (uma parcela ou mensalidade). */
  linhaId?: string;
  /** Filtra pela tabela ("gestao_parcelas" ou "gestao_mensalidades"), para não misturar as duas abas. */
  tabela?: string;
  rotulo?: string;
  /** "md" (36px) no cabeçalho da aba, ao lado do filtro; "sm" (28px) nas linhas. */
  tamanho?: "sm" | "md";
}) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [linhas, setLinhas] = useState<PagamentoLog[] | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  const abrir = async () => {
    setAberto(true);
    if (linhas !== null || carregando) return; // já carregado nesta sessão do componente
    setCarregando(true);
    setErro(null);
    try {
      const log = await lerPagamentosLog({ clienteId, linhaId, tabela });
      setLinhas(log);
      const ids = [...new Set(log.map((l) => l.por).filter((x): x is string => !!x))];
      if (ids.length > 0) {
        const p = await perfis(ids);
        setNomes(Object.fromEntries(p.map((x) => [x.id, x.nome || "alguém do time"])));
      }
    } catch (e) {
      setErro(mensagemDeErro(e, "Não consegui carregar o histórico."));
    } finally {
      setCarregando(false);
    }
  };

  const nomeDe = (id: string): string => nomes[id] || "alguém do time";

  return (
    <>
      <BotaoAcao tamanho={tamanho} onClick={() => void abrir()} titulo="Ver o que mudou neste pagamento">
        {rotulo}
      </BotaoAcao>
      {aberto && (
        <Modal titulo="Histórico de alterações" onClose={() => setAberto(false)} largura={520}>
          {carregando && <div className="muted small">Carregando…</div>}
          {erro && <div className="muted small">{erro}</div>}
          {!carregando && !erro && linhas && linhas.length === 0 && (
            <div className="muted small">Nenhuma alteração registrada.</div>
          )}
          {!carregando && !erro && linhas && linhas.length > 0 && (
            <div className="col gap-2" style={{ maxHeight: 380, overflowY: "auto" }}>
              {linhas.map((l) => (
                <div
                  key={l.id}
                  className="small"
                  style={{ padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                >
                  {resumoHistoricoLinha(l, nomeDe)}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

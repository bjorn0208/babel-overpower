import { useMemo, useState } from "react";
import { NavAbas } from "../componentes/abas-nav";
import { Botao } from "../componentes/botao";
import { CarregandoCentro, EstadoVazio } from "../componentes/basicos";
import { CartaoRifa } from "../componentes/cartao-rifa";
import { fmtBRL, fmtNumero } from "../formato";
import type { Rifa, StatsRifa, StatusRifa } from "../tipos";

export interface AbaMinhasProps {
  rifas: Rifa[];
  statsDe: (rifaId: string) => StatsRifa;
  carregando: boolean;
  aguardandoValidacao: number;
  aoAbrir: (rifa: Rifa) => void;
  aoCompartilhar: (rifa: Rifa) => void;
  aoCriar: () => void;
}

const FILTROS: Array<{ id: StatusRifa | "todas"; rotulo: string }> = [
  { id: "todas", rotulo: "Todas" },
  { id: "rascunho", rotulo: "Rascunhos" },
  { id: "ativa", rotulo: "Ativas" },
  { id: "pausada", rotulo: "Pausadas" },
  { id: "encerrada", rotulo: "Encerradas" },
  { id: "sorteada", rotulo: "Sorteadas" },
];

/**
 * Lista de rifas (Arena): resumo em chips de número, filtros roláveis e grid de cartões.
 * A primeira rifa ativa da lista filtrada é o destaque (cartão roxo, largura toda).
 */
export const AbaMinhas = ({
  rifas,
  statsDe,
  carregando,
  aguardandoValidacao,
  aoAbrir,
  aoCompartilhar,
  aoCriar,
}: AbaMinhasProps) => {
  const [filtro, setFiltro] = useState<StatusRifa | "todas">("todas");

  const filtradas = useMemo(
    () => (filtro === "todas" ? rifas : rifas.filter((r) => r.status === filtro)),
    [rifas, filtro],
  );

  const totais = useMemo(() => {
    let vendidos = 0;
    let arrecadado = 0;
    for (const r of rifas) {
      const s = statsDe(r.id);
      vendidos += s.vendidos;
      arrecadado += s.arrecadadoCentavos;
    }
    return { vendidos, arrecadado, ativas: rifas.filter((r) => r.status === "ativa").length };
  }, [rifas, statsDe]);

  const destaqueId = useMemo(() => filtradas.find((r) => r.status === "ativa")?.id ?? null, [filtradas]);

  if (carregando) return <CarregandoCentro rotulo="Carregando suas rifas…" />;

  return (
    <div className="space-y-6">
      {/* Sem botão de criar aqui (pedido do Fabrício, 08/09 22:35): esta é a tela de olhar as
          rifas que existem. Criar mora em Configurar › Criar / editar. O convite volta só
          quando não há rifa nenhuma — senão quem começa fica sem caminho. */}
      <div>
        <h2 className="ar-titulo-tela">Minhas rifas</h2>
        <p className="text-sm ar-txt-3 mt-1">Acompanhe vendas, valide pagamentos e sorteie.</p>
      </div>

      {/* Resumo em chips de número (as "odds" da referência) */}
      <div className="ar-scroll-x -mx-4 px-4">
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">ativas</span>
          <span className="ar-chip-num__valor" style={{ color: "var(--ar-ok)" }}>{totais.ativas}</span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">vendidos</span>
          <span className="ar-chip-num__valor">{fmtNumero(totais.vendidos)}</span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">caixa</span>
          <span className="ar-chip-num__valor" style={{ color: "var(--ar-roxo-alto)" }}>{fmtBRL(totais.arrecadado)}</span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">PIX a validar</span>
          <span className="ar-chip-num__valor" style={{ color: aguardandoValidacao > 0 ? "var(--ar-aviso)" : undefined }}>
            {aguardandoValidacao}
          </span>
        </span>
      </div>

      <NavAbas
        abas={FILTROS.map((f) => ({
          id: f.id,
          rotulo: f.rotulo,
          contagem: f.id === "todas" ? rifas.length : rifas.filter((r) => r.status === f.id).length,
        }))}
        abaAtiva={filtro}
        aoMudar={(id) => setFiltro(id as StatusRifa | "todas")}
      />

      {filtradas.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden>🎟️</span>}
          titulo={filtro === "todas" ? "Você ainda não criou rifas" : "Nenhuma rifa nesse status"}
          descricao="Crie a campanha, ative e venda pelo link público ou pelo agente no WhatsApp."
          acao={
            filtro === "todas" ? (
              <Botao variante="primario" onClick={aoCriar}>
                Criar minha primeira rifa
              </Botao>
            ) : undefined
          }
        />
      ) : (
        <div className="ar-grid-rifas">
          {filtradas.map((r) => (
            <CartaoRifa
              key={r.id}
              rifa={r}
              stats={statsDe(r.id)}
              aoAbrir={aoAbrir}
              aoCompartilhar={aoCompartilhar}
              destaque={r.id === destaqueId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

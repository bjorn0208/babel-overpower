/** Cards informativos do detalhe da rifa (Arena): cotas premiadas, ranking e últimas compras. */

import { Carregando } from "../componentes/basicos";
import type { DetalheRifa } from "../tipos";

const Cartao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div className="ar-cartao">
    <h3 className="ar-titulo-secao text-[var(--ar-t-md)] mb-3">{titulo}</h3>
    {children}
  </div>
);

const Vazio = ({ children }: { children: React.ReactNode }) => <p className="text-sm ar-txt-4">{children}</p>;

export const CartoesDetalhe = ({ detalhe }: { detalhe: DetalheRifa | null }) => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <Cartao titulo="🎁 Cotas premiadas">
      {detalhe ? (
        (detalhe.cotas_premiadas ?? []).length === 0 ? (
          <Vazio>Nenhuma cota nesta rifa.</Vazio>
        ) : (
          <div className="ar-lista text-sm">
            {detalhe.cotas_premiadas.map((c) => (
              <div key={c.numero} className="ar-linha min-h-0 py-2.5 items-start flex-col gap-0.5">
                <span className="ar-txt-1">
                  Nº <strong className="ar-num">{c.numero}</strong> — {c.premio}
                </span>
                {c.ganho ? (
                  <span className="text-xs" style={{ color: "var(--ar-ok)" }}>saiu pra {c.ganhador_nome}</span>
                ) : (
                  <span className="text-xs ar-txt-4">ainda não saiu</span>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <Carregando />
      )}
    </Cartao>

    <Cartao titulo="🏅 Maiores compradores">
      {detalhe ? (
        (detalhe.ranking ?? []).length === 0 ? (
          <Vazio>Ninguém pagou ainda.</Vazio>
        ) : (
          <div className="ar-lista text-sm">
            {detalhe.ranking.map((r, i) => (
              <div key={i} className="ar-linha min-h-0 py-2.5">
                <span className="ar-num ar-txt-3 w-6 shrink-0">{i + 1}º</span>
                <span className="flex-1 min-w-0 truncate">
                  <strong className="ar-txt-1">{r.nome}</strong> <span className="ar-txt-4 ar-num text-xs">{r.phone_mascarado}</span>
                </span>
                <span className="ar-num ar-txt-1 shrink-0">{r.qtd} nº</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <Carregando />
      )}
    </Cartao>

    <Cartao titulo="🕐 Últimas compras">
      {detalhe ? (
        (detalhe.ultimas_compras ?? []).length === 0 ? (
          <Vazio>Nenhuma compra viva ainda.</Vazio>
        ) : (
          <div className="ar-lista text-sm">
            {detalhe.ultimas_compras.map((u, i) => (
              <div key={i} className="ar-linha min-h-0 py-2.5">
                <span className="flex-1 min-w-0 truncate">
                  <strong className="ar-txt-1">{u.nome_mascarado}</strong> levou {u.qtd} {u.qtd === 1 ? "número" : "números"}
                </span>
                <span className="ar-txt-4 text-xs shrink-0">há {u.minutos_atras} min</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <Carregando />
      )}
    </Cartao>
  </div>
);

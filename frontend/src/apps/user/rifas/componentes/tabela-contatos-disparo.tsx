/**
 * Tabela de contatos da lista de disparo — busca, marcar/desmarcar, remover, exportar.
 * Arena: tabela só no desktop (`ar-tabela-envelope`); no celular a mesma lista
 * vira um cartão por contato (`ar-cartoes-linha`), os dois do mesmo array.
 */

import { Download, X } from "lucide-react";
import { Botao } from "./botao";
import { Campo } from "./campo";
import "../abas/aba-disparo.css";

export interface PessoaDisparo {
  id: string;
  nome: string | null;
  phone: string;
  marcado: boolean;
}

export interface TabelaContatosDisparoProps {
  pessoas: PessoaDisparo[];
  visiveis: PessoaDisparo[];
  marcados: number;
  busca: string;
  aoBuscarMudar: (v: string) => void;
  aoAlternar: (p: PessoaDisparo) => void;
  aoMarcarTodos: (valor: boolean) => void;
  aoRemover: (p: PessoaDisparo) => void;
  aoExportar: () => void;
}

export const TabelaContatosDisparo = ({
  pessoas,
  visiveis,
  marcados,
  busca,
  aoBuscarMudar,
  aoAlternar,
  aoMarcarTodos,
  aoRemover,
  aoExportar,
}: TabelaContatosDisparoProps) => {
  const caixaDe = (p: PessoaDisparo) => (
    <span className="ard-check-alvo">
      <input
        type="checkbox"
        className="ard-check"
        checked={p.marcado}
        onChange={() => aoAlternar(p)}
        aria-label={`${p.marcado ? "Desmarcar" : "Marcar"} ${p.nome || p.phone} pro disparo`}
      />
    </span>
  );

  const botaoRemover = (p: PessoaDisparo) => (
    <button
      type="button"
      className="ar-icone-btn"
      style={{ width: 36, height: 36, background: "transparent", color: "var(--ar-txt-4)" }}
      onClick={() => aoRemover(p)}
      aria-label={`Remover ${p.phone} da lista`}
    >
      <X size={16} aria-hidden />
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Cabeçalho: placar da lista + busca + ações em massa */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="ar-scroll-x">
          <span className="ar-chip-num">
            <span className="ar-chip-num__rotulo">contatos</span>
            <span className="ar-chip-num__valor">{pessoas.length}</span>
          </span>
          <span className="ar-chip-num">
            <span className="ar-chip-num__rotulo">marcados</span>
            <span className="ar-chip-num__valor" style={{ color: "var(--ar-ok)" }}>{marcados}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Botao tamanho="sm" variante="secundario" onClick={() => aoMarcarTodos(true)}>
            Marcar todos
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => aoMarcarTodos(false)}>
            Desmarcar todos
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={aoExportar} title="Baixar a lista em CSV">
            <Download size={15} aria-hidden />
            Exportar
          </Botao>
        </div>
      </div>

      <Campo
        value={busca}
        onChange={(e) => aoBuscarMudar(e.target.value)}
        placeholder="Buscar nome ou número…"
        aria-label="Buscar na lista de disparo"
      />

      {visiveis.length === 0 ? (
        <p className="text-sm ar-txt-3 text-center py-10">
          {pessoas.length === 0
            ? "Suba um CSV/Excel com os números — a 1ª coluna de telefone é detectada sozinha."
            : "Ninguém bate com a busca."}
        </p>
      ) : (
        <>
          {/* ≥1024px: tabela */}
          <div className="ar-tabela-envelope ar-cartao" style={{ padding: "4px 8px" }}>
            <div className="ard-rolavel" style={{ maxHeight: 420 }}>
              <table className="ar-tabela">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>
                      <span className="sr-only">Marcado</span>
                    </th>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th style={{ width: 56 }}>
                      <span className="sr-only">Remover</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => (
                    <tr key={p.id} style={p.marcado ? { background: "var(--ar-roxo-vidro)" } : undefined}>
                      <td>{caixaDe(p)}</td>
                      <td className="ar-txt-1">{p.nome || <span className="ar-txt-4">(sem nome)</span>}</td>
                      <td className="ar-num ar-txt-3 whitespace-nowrap">{p.phone}</td>
                      <td>{botaoRemover(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Celular / tablet: um cartão por contato */}
          <div className="ar-cartoes-linha ard-rolavel" style={{ maxHeight: 420 }}>
            {visiveis.map((p) => (
              <div
                key={p.id}
                className="ar-cartao ar-cartao--compacto flex items-center gap-2"
                style={p.marcado ? { boxShadow: "0 0 0 1px var(--ar-roxo), var(--ar-relevo)" } : undefined}
              >
                {caixaDe(p)}
                <div className="min-w-0 flex-1">
                  <p className="font-medium ar-txt-1 truncate leading-tight">
                    {p.nome || <span className="ar-txt-4">(sem nome)</span>}
                  </p>
                  <p className="ar-num text-sm ar-txt-3 mt-0.5">{p.phone}</p>
                </div>
                {botaoRemover(p)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

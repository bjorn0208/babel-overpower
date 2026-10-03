/** Apoio do wizard: cabeçalho de passos + listas dinâmicas (promoções e cotas). */

import { Check, Gift, ListChecks, Plus, Ticket, X } from "lucide-react";
import { Botao } from "../componentes/botao";
import { Campo } from "../componentes/campo";
import "./aba-criar.css";

export interface PromocaoRascunho {
  qtd: string;
  precoReais: string;
}

export interface CotaRascunho {
  numero: string;
  premio: string;
  pedido_ganhador?: string | null;
  ganhador_nome?: string | null;
}

const BotaoRemover = ({ aoClicar }: { aoClicar: () => void }) => (
  <button type="button" onClick={aoClicar} className="ar-icone-btn shrink-0" aria-label="Remover">
    <X size={16} />
  </button>
);

const BotaoAdicionar = ({ rotulo, aoClicar }: { rotulo: string; aoClicar: () => void }) => (
  <Botao type="button" variante="contorno" tamanho="sm" onClick={aoClicar}>
    <Plus size={16} aria-hidden />
    {rotulo}
  </Botao>
);

export const EditorPromocoes = ({
  promocoes,
  aoMudar,
}: {
  promocoes: PromocaoRascunho[];
  aoMudar: (lista: PromocaoRascunho[]) => void;
}) => (
  <section className="ar-cartao">
    <h3 className="ar-titulo-secao">Promoções por quantidade</h3>
    <p className="text-sm ar-txt-3 mt-1">
      Ex.: 10 números por R$ 40. O sistema aplica sempre o maior pacote primeiro.
    </p>
    <div className="flex flex-col gap-2 mt-4 mb-4">
      {promocoes.map((p, i) => (
        <div key={i} className="ar-linha-edit">
          <div className="w-[108px] shrink-0">
            <Campo
              type="number"
              min={2}
              inputMode="numeric"
              placeholder="qtd"
              className="ar-num"
              value={p.qtd}
              onChange={(e) => aoMudar(promocoes.map((x, j) => (j === i ? { ...x, qtd: e.target.value } : x)))}
            />
          </div>
          <span className="ar-linha-edit__meio">por R$</span>
          <div className="flex-1 min-w-0">
            <Campo
              inputMode="decimal"
              placeholder="40,00"
              className="ar-num"
              value={p.precoReais}
              onChange={(e) => aoMudar(promocoes.map((x, j) => (j === i ? { ...x, precoReais: e.target.value } : x)))}
            />
          </div>
          <div className="pt-0.5">
            <BotaoRemover aoClicar={() => aoMudar(promocoes.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
    </div>
    <BotaoAdicionar rotulo="Adicionar promoção" aoClicar={() => aoMudar([...promocoes, { qtd: "", precoReais: "" }])} />
  </section>
);

export const EditorCotas = ({
  cotas,
  aoMudar,
}: {
  cotas: CotaRascunho[];
  aoMudar: (lista: CotaRascunho[]) => void;
}) => (
  <section className="ar-cartao">
    <h3 className="ar-titulo-secao">Cotas premiadas</h3>
    <p className="text-sm ar-txt-3 mt-1">
      Número da sorte que ganha prêmio na hora em que o pagamento é confirmado.
    </p>
    <div className="flex flex-col gap-2 mt-4 mb-4">
      {cotas.map((c, i) => (
        <div key={i} className="ar-linha-edit">
          <span className="ar-linha-edit__prefixo">Nº</span>
          <div className="w-[92px] shrink-0">
            <Campo
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="7"
              className="ar-num"
              value={c.numero}
              disabled={Boolean(c.pedido_ganhador)}
              onChange={(e) => aoMudar(cotas.map((x, j) => (j === i ? { ...x, numero: e.target.value } : x)))}
            />
          </div>
          <div className="flex-1 min-w-0">
            <Campo
              placeholder="R$ 50 no PIX"
              value={c.premio}
              disabled={Boolean(c.pedido_ganhador)}
              onChange={(e) => aoMudar(cotas.map((x, j) => (j === i ? { ...x, premio: e.target.value } : x)))}
            />
          </div>
          {c.pedido_ganhador ? (
            <span
              className="ar-linha-edit__meio inline-flex items-center gap-1.5"
              style={{ color: "var(--ar-ok)" }}
            >
              <Check size={14} aria-hidden />
              já saiu{c.ganhador_nome ? ` · ${c.ganhador_nome}` : ""}
            </span>
          ) : (
            <div className="pt-0.5">
              <BotaoRemover aoClicar={() => aoMudar(cotas.filter((_, j) => j !== i))} />
            </div>
          )}
        </div>
      ))}
    </div>
    <BotaoAdicionar rotulo="Adicionar cota premiada" aoClicar={() => aoMudar([...cotas, { numero: "", premio: "" }])} />
  </section>
);

export const PASSOS_WIZARD = [
  { id: 1, rotulo: "Informações", icone: "📋" },
  { id: 2, rotulo: "Prêmio", icone: "🎁" },
  { id: 3, rotulo: "Números", icone: "🎟️" },
  { id: 4, rotulo: "Revisão", icone: "✅" },
];

/** Ícone lucide de cada passo — navegação não leva emoji (o campo `icone` fica só no export). */
const ICONE_PASSO: Record<number, typeof Check> = {
  1: ListChecks,
  2: Gift,
  3: Ticket,
  4: Check,
};

/** Cabeçalho do wizard: os 4 passos como segmented control (Arena). Rola em X no celular. */
export const Passos = ({ atual }: { atual: number }) => (
  <div className="ar-seg mb-6 max-w-full" role="list" aria-label="Passos da criação">
    {PASSOS_WIZARD.map((p) => {
      const feito = atual > p.id;
      const ativo = atual === p.id;
      const Icone = ICONE_PASSO[p.id];
      return (
        <span
          key={p.id}
          role="listitem"
          aria-current={ativo ? "step" : undefined}
          className={`ar-seg__item inline-flex items-center gap-1.5 ${ativo ? "ar-seg__item--ativo" : ""}`}
          style={!ativo && feito ? { color: "var(--ar-ok)" } : undefined}
        >
          {feito ? <Check size={14} aria-hidden /> : <Icone size={14} aria-hidden />}
          <span className="truncate">{p.rotulo}</span>
        </span>
      );
    })}
  </div>
);

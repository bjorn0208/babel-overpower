/** Passo final do wizard — resumo da rifa antes de criar/salvar. */

import { CheckCircle2, Gift, Lightbulb } from "lucide-react";
import { fmtBRL, ROTULO_METODO_SORTEIO } from "../formato";
import type { MetodoSorteio } from "../tipos";
import type { CotaRascunho, PromocaoRascunho } from "./aba-criar-listas";
import "./aba-criar.css";

export interface PassoRevisaoProps {
  titulo: string;
  premio: string;
  total: number;
  precoCentavos: number;
  metodo: MetodoSorteio;
  promocoes: PromocaoRascunho[];
  cotas: CotaRascunho[];
  editando: boolean;
}

export const PassoRevisao = ({ titulo, premio, total, precoCentavos, metodo, promocoes, cotas, editando }: PassoRevisaoProps) => (
  <div className="flex flex-col gap-4 animate-fade-in">
    <section className="ar-cartao">
      <div className="ar-secao-cab">
        <span className="ar-secao-cab__icone">
          <CheckCircle2 size={20} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="ar-titulo-secao">Revisão</h2>
          <p className="text-sm ar-txt-3 mt-1">Confira antes de {editando ? "salvar" : "criar"}.</p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="ar-titulo-secao">{titulo || "Sem título"}</h3>
        {premio && (
          <p className="text-base ar-txt-2 mt-1.5 inline-flex items-center gap-2">
            <Gift size={16} aria-hidden style={{ color: "var(--ar-rosa-alto)" }} />
            <span className="min-w-0">{premio}</span>
          </p>
        )}
      </div>

      <div className="ar-resumo-grid mt-5">
        {[
          { rotulo: "Números", valor: String(total) },
          { rotulo: "Preço", valor: fmtBRL(precoCentavos) },
          { rotulo: "Potencial", valor: fmtBRL(total * precoCentavos) },
          { rotulo: "Sorteio", valor: ROTULO_METODO_SORTEIO[metodo], texto: true },
        ].map((m) => (
          <div key={m.rotulo} className="ar-resumo-item">
            <p className="ar-rotulo truncate">{m.rotulo}</p>
            <p
              className={`mt-1.5 font-bold truncate ${m.texto ? "" : "ar-num"}`}
              style={{
                color: m.rotulo === "Potencial" ? "var(--ar-roxo-alto)" : "var(--ar-txt-1)",
                fontSize: "var(--ar-t-md)",
              }}
              title={m.valor}
            >
              {m.valor}
            </p>
          </div>
        ))}
      </div>

      <div className="ar-divisor" />

      <div className="ar-lista">
        <div className="ar-linha justify-between">
          <span className="text-sm ar-txt-3 shrink-0">Promoções</span>
          <span className="text-sm ar-txt-1 text-right min-w-0">
            {promocoes.filter((p) => p.qtd && p.precoReais).map((p) => `${p.qtd} por R$ ${p.precoReais}`).join(" · ") || "nenhuma"}
          </span>
        </div>
        <div className="ar-linha justify-between">
          <span className="text-sm ar-txt-3 shrink-0">Cotas premiadas</span>
          <span className="text-sm ar-txt-1 text-right min-w-0">
            {cotas.filter((c) => c.numero && c.premio).map((c) => `nº ${c.numero} (${c.premio})`).join(" · ") || "nenhuma"}
          </span>
        </div>
      </div>
    </section>

    {!editando && (
      <p className="ar-aviso-box flex items-start gap-2">
        <Lightbulb size={16} aria-hidden className="shrink-0 mt-0.5" />
        <span>
          A rifa nasce como <strong>rascunho</strong> — ninguém compra até você ativar no detalhe.
        </span>
      </p>
    )}
  </div>
);

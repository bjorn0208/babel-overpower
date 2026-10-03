/**
 * LaudoConsulta — laudo visual do resultado (app, tema dark glass), no lugar do
 * JSON cru. A leitura/classificação do jsonb vem de `laudo-dados` (compartilhada
 * com o link público e o PDF), então é robusta a dados faltando.
 */

import { useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ShieldCheck, ShieldAlert } from "lucide-react";
import { humaniza, normalizarLaudo, txt, CAMPOS_IDENT, CAMPOS_LOCAL } from "./laudo-dados";
import type { Obj } from "./laudo-dados";

const VERDE = "oklch(0.72 0.18 145)";
const VERMELHO = "oklch(0.65 0.24 25)";
const AZUL = "oklch(0.7 0.18 220)";
const TXT = "oklch(0.98 0 0)";
const alpha = (cor: string, a: number) => cor.replace(/\s*\)\s*$/, ` / ${a})`);
const cardBase: CSSProperties = {
  background: "oklch(0.18 0.06 280 / 0.4)",
  border: "1px solid oklch(0.98 0 0 / 0.07)",
  borderRadius: 14,
  padding: 16,
};

function Pares({ obj, ordem }: { obj: Obj; ordem?: string[] }) {
  const chaves = ordem
    ? ordem.filter((k) => txt(obj[k]).trim() !== "")
    : Object.keys(obj).filter((k) => txt(obj[k]).trim() !== "" && typeof obj[k] !== "object");
  if (chaves.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
      {chaves.map((k) => (
        <div key={k}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, color: "oklch(0.98 0 0 / 0.45)" }}>{humaniza(k)}</div>
          <div style={{ fontSize: 12, color: TXT, marginTop: 2, wordBreak: "break-word" }}>{txt(obj[k]) || "—"}</div>
        </div>
      ))}
    </div>
  );
}

export function LaudoConsulta({ resultado }: { resultado: Record<string, unknown> | null }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const l = normalizarLaudo(resultado);
  if (!l) return <div style={{ fontSize: 12, color: "oklch(0.98 0 0 / 0.5)" }}>Resultado indisponível.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Identidade */}
      <div style={{ ...cardBase, padding: 18 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: TXT }}>{l.nome}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4, fontSize: 11, color: "oklch(0.98 0 0 / 0.6)" }}>
          {l.documento && <span>Doc: {l.documento}</span>}
          {l.nascimento && <span>Nasc.: {l.nascimento}</span>}
          {l.situacao && <span>Situação: {l.situacao}</span>}
          {l.localResumo && <span>{l.localResumo}</span>}
        </div>
      </div>

      {/* Veredito + Score */}
      <div style={{ display: "grid", gridTemplateColumns: l.pontuacao ? "1.4fr 1fr" : "1fr", gap: 12 }}>
        <div style={{ ...cardBase, display: "flex", alignItems: "center", gap: 14, borderColor: l.limpo ? alpha(VERDE, 0.3) : l.totalApontamentos > 0 ? alpha(VERMELHO, 0.3) : "oklch(0.98 0 0 / 0.07)" }}>
          {l.limpo ? <ShieldCheck size={32} style={{ color: VERDE }} /> : l.totalApontamentos > 0 ? <ShieldAlert size={32} style={{ color: VERMELHO }} /> : <ShieldCheck size={32} style={{ color: "oklch(0.98 0 0 / 0.4)" }} />}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: l.limpo ? VERDE : l.totalApontamentos > 0 ? VERMELHO : TXT }}>
              {l.limpo ? "Nome limpo" : l.totalApontamentos > 0 ? `${l.totalApontamentos} apontamento${l.totalApontamentos > 1 ? "s" : ""}` : "Sem dados de restrição"}
            </div>
            <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", marginTop: 2 }}>
              {l.limpo ? "Nenhuma restrição nas bases consultadas." : l.totalApontamentos > 0 ? "Veja os detalhes abaixo." : "As bases de restrição não retornaram registros."}
            </div>
          </div>
        </div>
        {l.pontuacao && (
          <div style={{ ...cardBase, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, color: "oklch(0.98 0 0 / 0.45)" }}>Score de crédito</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: AZUL, fontFamily: "ui-monospace, monospace" }}>{l.pontuacao}</span>
              {l.classeRisco && <span style={{ fontSize: 12, color: "oklch(0.98 0 0 / 0.6)" }}>classe {l.classeRisco}</span>}
            </div>
            {l.probInadimplencia && <div style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.5)", marginTop: 2 }}>Inadimplência estimada: {l.probInadimplencia}</div>}
            {l.renda && <div style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.5)", marginTop: 2 }}>Renda presumida: {l.renda}</div>}
            {l.scoreSecundario && (
              <div style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.5)", marginTop: 4, paddingTop: 4, borderTop: "1px solid oklch(0.98 0 0 / 0.08)" }}>
                Score auxiliar: <span style={{ fontVariantNumeric: "tabular-nums", color: "oklch(0.98 0 0 / 0.7)" }}>{l.scoreSecundario.pontuacao}</span>
                {l.scoreSecundario.classe && ` · ${l.scoreSecundario.classe}`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Visão rápida — sumário de ocorrências */}
      {l.visaoRapida.length > 0 && (
        <div style={cardBase}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, color: "oklch(0.98 0 0 / 0.55)", marginBottom: 10 }}>Visão rápida</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {l.visaoRapida.map((v) => (
              <div key={v.chave} style={{ padding: "8px 10px", borderRadius: 10, background: "oklch(0.12 0.04 280 / 0.5)", border: "1px solid oklch(0.98 0 0 / 0.06)" }}>
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, color: "oklch(0.98 0 0 / 0.45)" }}>{v.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: TXT, fontVariantNumeric: "tabular-nums" }}>{v.quantidade}</span>
                  {v.valor && <span style={{ fontSize: 11, color: VERMELHO, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{v.valor}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Restrições — grid de chips */}
      {l.restricoes.length > 0 && (
        <div style={cardBase}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, color: "oklch(0.98 0 0 / 0.55)", marginBottom: 10 }}>Restrições verificadas</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {l.restricoes.map(({ chave, label, n, detalhes, valorTotal }) => (
              <div key={chave} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 10, background: n > 0 ? alpha(VERMELHO, 0.08) : alpha(VERDE, 0.06), border: `1px solid ${alpha(n > 0 ? VERMELHO : VERDE, 0.2)}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {n > 0 ? <AlertTriangle size={14} style={{ color: VERMELHO, flexShrink: 0 }} /> : <CheckCircle2 size={14} style={{ color: VERDE, flexShrink: 0 }} />}
                  <span style={{ fontSize: 11, color: TXT, flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: n > 0 ? VERMELHO : VERDE, fontVariantNumeric: "tabular-nums" }}>{n > 0 ? n : "OK"}</span>
                </div>
                {n > 0 && detalhes.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 22 }}>
                    {detalhes.map((d, i) => (
                      <span key={i} style={{ fontSize: 10, color: alpha(TXT, 0.7), fontVariantNumeric: "tabular-nums" }}>• {d}</span>
                    ))}
                    {valorTotal && <span style={{ fontSize: 10, fontWeight: 700, color: VERMELHO }}>Total: R$ {valorTotal}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SCR · Banco Central — operações de crédito (vencidas = dívida) */}
      {l.scr && (
        <div style={{ ...cardBase, borderColor: l.scr.temRestritiva ? alpha(VERMELHO, 0.3) : "oklch(0.98 0 0 / 0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, color: "oklch(0.98 0 0 / 0.55)" }}>SCR · Banco Central</span>
            {l.scr.totalVencido && <span style={{ fontSize: 12, fontWeight: 700, color: VERMELHO, fontVariantNumeric: "tabular-nums" }}>Vencido: {l.scr.totalVencido}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {l.scr.operacoes.map((op, i) => (
              <div key={i} style={{ padding: "8px 10px", borderRadius: 10, background: op.restritiva ? alpha(VERMELHO, 0.08) : "oklch(0.12 0.04 280 / 0.5)", border: `1px solid ${alpha(op.restritiva ? VERMELHO : AZUL, 0.18)}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, color: TXT, fontWeight: 600 }}>{op.modalidade || "Operação de crédito"}</span>
                  {op.valor && <span style={{ fontSize: 12, fontWeight: 700, color: op.restritiva ? VERMELHO : TXT, fontVariantNumeric: "tabular-nums" }}>{op.valor}</span>}
                </div>
                {op.subModalidade && <div style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.5)", marginTop: 2 }}>{op.subModalidade}</div>}
                {op.situacao && <div style={{ fontSize: 10, color: op.restritiva ? VERMELHO : "oklch(0.98 0 0 / 0.55)", marginTop: 2 }}>{op.situacao}</div>}
              </div>
            ))}
          </div>
          {(l.scr.qtdOperacoes || l.scr.dataBase) && (
            <div style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)", marginTop: 8 }}>
              {[l.scr.qtdOperacoes && `${l.scr.qtdOperacoes} operações`, l.scr.qtdInstituicoes && `${l.scr.qtdInstituicoes} instituição(ões)`, l.scr.dataBase && `base ${l.scr.dataBase}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      )}

      {/* Resumo financeiro consolidado */}
      {l.resumoFinanceiro && (
        <div style={cardBase}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, color: "oklch(0.98 0 0 / 0.55)", marginBottom: 10 }}>Resumo financeiro</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
            {([["Crédito vencido", l.resumoFinanceiro.creditoVencido, true], ["Prejuízo", l.resumoFinanceiro.prejuizo, true], ["Limite de crédito", l.resumoFinanceiro.limiteCredito, false], ["Crédito a vencer", l.resumoFinanceiro.creditoAVencer, false]] as const)
              .filter(([, v]) => v)
              .map(([rotulo, valor, neg]) => (
                <div key={rotulo} style={{ padding: "8px 10px", borderRadius: 10, background: neg ? alpha(VERMELHO, 0.08) : "oklch(0.12 0.04 280 / 0.5)", border: `1px solid ${alpha(neg ? VERMELHO : AZUL, 0.16)}` }}>
                  <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, color: "oklch(0.98 0 0 / 0.45)" }}>{rotulo}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: neg ? VERMELHO : TXT, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Seções informativas (expansíveis) */}
      {l.informativas.map(({ chave, label, registros }) => {
        const ab = aberta === chave;
        return (
          <div key={chave} style={cardBase}>
            <button type="button" onClick={() => setAberta(ab ? null : chave)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: TXT }}>{label} <span style={{ color: "oklch(0.98 0 0 / 0.45)" }}>· {registros.length}</span></span>
              <ChevronDown size={15} style={{ color: "oklch(0.98 0 0 / 0.5)", transform: ab ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {ab && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {registros.slice(0, 30).map((reg, i) => (
                  <div key={i} style={{ padding: 10, borderRadius: 8, background: "oklch(0.12 0.04 280 / 0.5)" }}>
                    <Pares obj={reg} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Cadastro completo (expansível) */}
      {(Object.keys(l.ident).length > 0 || Object.keys(l.local).length > 0) && (
        <div style={cardBase}>
          <button type="button" onClick={() => setAberta(aberta === "cadastro" ? null : "cadastro")} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: TXT }}>Dados cadastrais</span>
            <ChevronDown size={15} style={{ color: "oklch(0.98 0 0 / 0.5)", transform: aberta === "cadastro" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
          {aberta === "cadastro" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
              <Pares obj={l.ident} ordem={CAMPOS_IDENT} />
              {Object.keys(l.local).length > 0 && <Pares obj={l.local} ordem={CAMPOS_LOCAL} />}
            </div>
          )}
        </div>
      )}

      {/* Outras informações — tudo que as seções curadas não cobriram (nunca descarta dado) */}
      {l.extras.length > 0 && (
        <div style={cardBase}>
          <button type="button" onClick={() => setAberta(aberta === "extras" ? null : "extras")} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: TXT }}>Outras informações <span style={{ color: "oklch(0.98 0 0 / 0.45)" }}>· {l.extras.length}</span></span>
            <ChevronDown size={15} style={{ color: "oklch(0.98 0 0 / 0.5)", transform: aberta === "extras" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
          {aberta === "extras" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {l.extras.map((e) => (
                <div key={e.chave}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: AZUL, marginBottom: 4 }}>{e.label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {e.linhas.map((ln, i) => (
                      <div key={i} style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.75)", wordBreak: "break-word" }}>{ln}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

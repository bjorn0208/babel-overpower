/**
 * LaudoPublico — laudo do resultado da consulta na página pública (tema claro
 * `pp-`, mobile-first premium). Usa o mesmo cérebro de leitura do app
 * (`normalizarLaudo`), então é robusto a qualquer retorno da API.
 */

import { useState } from "react";
import { PpIcone } from "@/pages/public/contrato/PpIcone";
import { normalizarLaudo, humaniza, txt, CAMPOS_IDENT, CAMPOS_LOCAL } from "@/apps/user/consulta/laudo-dados";
import type { Obj } from "@/apps/user/consulta/laudo-dados";

function Pares({ obj, ordem }: { obj: Obj; ordem?: string[] }) {
  const chaves = (ordem ?? Object.keys(obj)).filter(
    (k) => txt(obj[k]).trim() !== "" && typeof obj[k] !== "object",
  );
  if (chaves.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
      {chaves.map((k) => (
        <div key={k}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-ink-4)" }}>{humaniza(k)}</div>
          <div style={{ fontSize: 13, color: "var(--pp-ink)", marginTop: 2, wordBreak: "break-word" }}>{txt(obj[k]) || "—"}</div>
        </div>
      ))}
    </div>
  );
}

function Secao({ children, titulo }: { children: React.ReactNode; titulo?: string }) {
  return (
    <section style={{ background: "var(--pp-paper)", border: "1px solid var(--pp-border)", borderRadius: "var(--pp-r)", padding: 16, boxShadow: "var(--pp-sh-sm)" }}>
      {titulo && (
        <h3 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--pp-ink-3)" }}>{titulo}</h3>
      )}
      {children}
    </section>
  );
}

export function LaudoPublico({ resultado }: { resultado: Record<string, unknown> | null }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const l = normalizarLaudo(resultado);
  if (!l) return <p className="pp-step-sub">Resultado indisponível no momento.</p>;

  const verde = l.limpo;
  const alerta = l.totalApontamentos > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Veredito — herói */}
      <div
        style={{
          borderRadius: "var(--pp-r-lg)",
          padding: "22px 20px",
          textAlign: "center",
          background: alerta ? "var(--pp-warn-soft)" : "var(--pp-success-soft)",
          border: `1px solid ${alerta ? "var(--pp-rose)" : "var(--pp-success)"}`,
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: "50%", margin: "0 auto 12px",
            display: "grid", placeItems: "center",
            background: alerta ? "var(--pp-rose)" : "var(--pp-success)", color: "#fff",
          }}
        >
          <PpIcone nome={alerta ? "warn" : "check"} tamanho={28} espessura={2.4} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--pp-font-doc)", color: alerta ? "var(--pp-rose)" : "var(--pp-success)" }}>
          {verde ? "Nome limpo" : alerta ? `${l.totalApontamentos} pendência${l.totalApontamentos > 1 ? "s" : ""}` : "Consulta concluída"}
        </div>
        <div style={{ fontSize: 13, color: "var(--pp-ink-2)", marginTop: 4 }}>
          {verde
            ? "Nenhuma restrição encontrada nas bases consultadas."
            : alerta
              ? "Foram localizados apontamentos. Veja o detalhamento abaixo."
              : "As bases de restrição não retornaram registros."}
        </div>
      </div>

      {/* Identidade */}
      <Secao>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--pp-font-doc)", color: "var(--pp-ink)" }}>{l.nome}</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: 12, color: "var(--pp-ink-3)" }}>
          {l.documento && <span style={{ fontFamily: "var(--pp-font-mono)" }}>{l.documento}</span>}
          {l.nascimento && <span>Nasc.: {l.nascimento}</span>}
          {l.situacao && <span>Situação: {l.situacao}</span>}
          {l.localResumo && <span>{l.localResumo}</span>}
        </div>
      </Secao>

      {/* Score */}
      {l.pontuacao && (
        <Secao titulo="Score de crédito">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 34, fontWeight: 800, fontFamily: "var(--pp-font-mono)", color: "var(--pp-acc)", fontVariantNumeric: "tabular-nums" }}>{l.pontuacao}</span>
            {l.classeRisco && <span style={{ fontSize: 13, color: "var(--pp-ink-3)" }}>classe de risco {l.classeRisco}</span>}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6, fontSize: 12, color: "var(--pp-ink-2)" }}>
            {l.probInadimplencia && <span>Inadimplência estimada: <strong>{l.probInadimplencia}</strong></span>}
            {l.renda && <span>Renda presumida: <strong>{l.renda}</strong></span>}
          </div>
          {l.scoreSecundario && (
            <div style={{ fontSize: 12, color: "var(--pp-ink-3)", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--pp-border)" }}>
              Score auxiliar: <strong style={{ fontVariantNumeric: "tabular-nums" }}>{l.scoreSecundario.pontuacao}</strong>
              {l.scoreSecundario.classe && ` · ${l.scoreSecundario.classe}`}
            </div>
          )}
        </Secao>
      )}

      {/* Visão rápida — sumário de ocorrências */}
      {l.visaoRapida.length > 0 && (
        <Secao titulo="Visão rápida">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {l.visaoRapida.map((v) => (
              <div key={v.chave} style={{ padding: "10px 12px", borderRadius: "var(--pp-r-sm)", background: "var(--pp-bg-2)" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-ink-4)" }}>{v.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "var(--pp-ink)", fontVariantNumeric: "tabular-nums" }}>{v.quantidade}</span>
                  {v.valor && <span style={{ fontSize: 12, color: "var(--pp-rose)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v.valor}</span>}
                </div>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Restrições */}
      {l.restricoes.length > 0 && (
        <Secao titulo="Restrições verificadas">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {l.restricoes.map(({ chave, label, n, detalhes, valorTotal }) => {
              const ruim = n > 0;
              return (
                <div key={chave} style={{ padding: "10px 12px", borderRadius: "var(--pp-r-sm)", background: ruim ? "var(--pp-warn-soft)" : "var(--pp-success-soft)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: "50%", background: ruim ? "var(--pp-rose)" : "var(--pp-success)", color: "#fff", flexShrink: 0 }}>
                      <PpIcone nome={ruim ? "warn" : "check"} tamanho={13} espessura={2.5} />
                    </span>
                    <span style={{ fontSize: 13, color: "var(--pp-ink)", flex: 1 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: ruim ? "var(--pp-rose)" : "var(--pp-success)", fontVariantNumeric: "tabular-nums" }}>{ruim ? `${n} registro${n > 1 ? "s" : ""}` : "Nada consta"}</span>
                  </div>
                  {ruim && detalhes.length > 0 && (
                    <div style={{ marginTop: 8, paddingLeft: 32, display: "flex", flexDirection: "column", gap: 4 }}>
                      {detalhes.map((d, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--pp-ink-2)", fontVariantNumeric: "tabular-nums" }}>• {d}</div>
                      ))}
                      {valorTotal && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pp-rose)", marginTop: 2 }}>Total: R$ {valorTotal}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Secao>
      )}

      {/* SCR · Banco Central — operações de crédito (vencidas = dívida) */}
      {l.scr && (
        <Secao titulo="SCR · Banco Central">
          {l.scr.totalVencido && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-rose)", marginBottom: 10, fontVariantNumeric: "tabular-nums" }}>Total vencido: {l.scr.totalVencido}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {l.scr.operacoes.map((op, i) => (
              <div key={i} style={{ padding: "10px 12px", borderRadius: "var(--pp-r-sm)", background: op.restritiva ? "var(--pp-warn-soft)" : "var(--pp-bg-2)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-ink)" }}>{op.modalidade || "Operação de crédito"}</span>
                  {op.valor && <span style={{ fontSize: 13, fontWeight: 700, color: op.restritiva ? "var(--pp-rose)" : "var(--pp-ink)", fontVariantNumeric: "tabular-nums" }}>{op.valor}</span>}
                </div>
                {op.subModalidade && <div style={{ fontSize: 11, color: "var(--pp-ink-3)", marginTop: 2 }}>{op.subModalidade}</div>}
                {op.situacao && <div style={{ fontSize: 11, color: op.restritiva ? "var(--pp-rose)" : "var(--pp-ink-3)", marginTop: 2 }}>{op.situacao}</div>}
              </div>
            ))}
          </div>
          {(l.scr.qtdOperacoes || l.scr.dataBase) && (
            <div style={{ fontSize: 11, color: "var(--pp-ink-4)", marginTop: 10 }}>
              {[l.scr.qtdOperacoes && `${l.scr.qtdOperacoes} operações`, l.scr.qtdInstituicoes && `${l.scr.qtdInstituicoes} instituição(ões)`, l.scr.dataBase && `base ${l.scr.dataBase}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </Secao>
      )}

      {/* Resumo financeiro consolidado */}
      {l.resumoFinanceiro && (
        <Secao titulo="Resumo financeiro">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {([["Crédito vencido", l.resumoFinanceiro.creditoVencido, true], ["Prejuízo", l.resumoFinanceiro.prejuizo, true], ["Limite de crédito", l.resumoFinanceiro.limiteCredito, false], ["Crédito a vencer", l.resumoFinanceiro.creditoAVencer, false]] as const)
              .filter(([, v]) => v)
              .map(([rotulo, valor, neg]) => (
                <div key={rotulo} style={{ padding: "10px 12px", borderRadius: "var(--pp-r-sm)", background: neg ? "var(--pp-warn-soft)" : "var(--pp-bg-2)" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-ink-4)" }}>{rotulo}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: neg ? "var(--pp-rose)" : "var(--pp-ink)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
                </div>
              ))}
          </div>
        </Secao>
      )}

      {/* Informativas + Cadastro — accordions */}
      {l.informativas.map(({ chave, label, registros }) => {
        const ab = aberta === chave;
        return (
          <Secao key={chave}>
            <button type="button" onClick={() => setAberta(ab ? null : chave)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: 24 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-ink)" }}>{label} <span style={{ color: "var(--pp-ink-4)" }}>· {registros.length}</span></span>
              <span style={{ color: "var(--pp-ink-3)", transform: ab ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><PpIcone nome="chevr" tamanho={14} /></span>
            </button>
            {ab && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {registros.slice(0, 30).map((reg, i) => (
                  <div key={i} style={{ padding: 10, borderRadius: "var(--pp-r-sm)", background: "var(--pp-bg-2)" }}>
                    <Pares obj={reg} />
                  </div>
                ))}
              </div>
            )}
          </Secao>
        );
      })}

      {(Object.keys(l.ident).length > 0 || Object.keys(l.local).length > 0) && (
        <Secao>
          <button type="button" onClick={() => setAberta(aberta === "cadastro" ? null : "cadastro")} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: 24 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-ink)" }}>Dados cadastrais</span>
            <span style={{ color: "var(--pp-ink-3)", transform: aberta === "cadastro" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><PpIcone nome="chevr" tamanho={14} /></span>
          </button>
          {aberta === "cadastro" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
              <Pares obj={l.ident} ordem={CAMPOS_IDENT} />
              {Object.keys(l.local).length > 0 && <Pares obj={l.local} ordem={CAMPOS_LOCAL} />}
            </div>
          )}
        </Secao>
      )}

      {/* Outras informações — nunca descarta dado do retorno */}
      {l.extras.length > 0 && (
        <Secao>
          <button type="button" onClick={() => setAberta(aberta === "extras" ? null : "extras")} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: 24 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-ink)" }}>Outras informações <span style={{ color: "var(--pp-ink-4)" }}>· {l.extras.length}</span></span>
            <span style={{ color: "var(--pp-ink-3)", transform: aberta === "extras" ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><PpIcone nome="chevr" tamanho={14} /></span>
          </button>
          {aberta === "extras" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {l.extras.map((e) => (
                <div key={e.chave}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pp-acc)", marginBottom: 4 }}>{e.label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {e.linhas.map((ln, i) => (
                      <div key={i} style={{ fontSize: 12, color: "var(--pp-ink-2)", wordBreak: "break-word" }}>{ln}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Secao>
      )}
    </div>
  );
}

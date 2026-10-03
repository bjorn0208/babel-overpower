/**
 * Aba "Mente do Agente" — padrão do Dossiê.
 *
 * Layout cravado a partir dos prints do Ragentic enviados pelo Theus:
 *  Card 1 — CARGO ATIVO (header bússola + nome + barras Cobertura Prancheta + Score do lead)
 *  Card 2 — Já capturado (X) (dados estruturados com empty state caloroso)
 *  Card 3 — Compromissos ativos (X) (promessas pendentes — diferente da aba Compromissos)
 *  Card 4 — Tags inferidas (X) (pílulas com ✦)
 *  Card 5 — Pensamento estruturado (Sistema 2 visível · 6 peças do Ragentic):
 *    🧠 pensa: + proxima_intencao + badge acao_pretendida
 *    LEITURA DA SITUAÇÃO
 *    POR QUE (italic)
 *    ⏱ volta: quando_voltar
 *    🎯 PLANO DOS PRÓXIMOS TURNOS · T+N · o_que_fazer · — por_que
 *  Card 6 — Prancheta (working memory JSON crú)
 *
 * Fontes reais (Onda B):
 *  - cargo: public.conversas.cargo_ativo_id → public.cargos
 *  - score_lead: public.conversas.score_lead
 *  - cobertura_prancheta: derivado de campos preenchidos / total do template
 *  - dados_capturados: public.fichas_lead.campos
 *  - compromissos_ativos: public.compromissos_do_lead WHERE status='agendado' AND prometido_pelo_agente=true
 *  - tags: public.fichas_lead.tags
 *  - pensamento: public.intencoes_pendentes (fallback derivado de prancheta.belief)
 *  - prancheta_belief: public.prancheta.belief
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  duration,
  easing,
  fadeSlideIn,
  springSoft,
  stagger,
  staggerItem,
  tapPress,
} from "@/os/motion/presets";
import { ROTULO_ACAO, type AcaoPretendida, type Conversa, type FatoLead, type PlanoTurno } from "../tipos";
import { enriquecerDossieViaRPC, type DossieEnriquecido } from "../hooks/useConversasLive";
import { usePerguntasRespondidasLead } from "../hooks/use-perguntas-respondidas-lead";

interface AbaMenteProps {
  conversa: Conversa;
  /** UUID real da conversa quando `conversa.id` é mock (ex: ChatTeste antes do 1º turno).
   *  Quando presente, o RPC recebe esse UUID em vez do `conversa.id`. Onda 2026-05-14. */
  conversaIdOverride?: string | null;
  onTrocarCargo?: () => void;
  onExecutarTurno?: (turno: PlanoTurno) => void;
}

/**
 * Helper de alpha em cor oklch. AbaMente usa cores `oklch(L C H)` (sem alpha embed)
 * — pra criar bordas/fundos translúcidos a sintaxe correta é o slash DENTRO do oklch:
 * `oklch(L C H / α)`. Antes vinha como ${cor}/0.5 (slash fora) e browsers parseavam
 * a cor sem alpha. Fix Onda 2026-05-14.
 */
function aplicarAlfa(cor: string, alpha: number): string {
  // cor: "oklch(0.7 0.18 220)" → "oklch(0.7 0.18 220 / 0.5)"
  // fallback: se já tem alpha (raro), retorna como veio.
  if (cor.includes(" / ")) return cor;
  return cor.replace(/\)$/, ` / ${alpha})`);
}

const ACOES_VALIDAS_FALLBACK: ReadonlySet<AcaoPretendida> = new Set([
  "responder_e_aguardar",
  "fazer_pergunta_de_qualificacao",
  "oferecer",
  "fechar",
  "agendar_retorno",
  "escalar_humano",
  "esperar_silencio",
  "registrar_e_seguir",
]);

function ehAcaoValidaMente(s: unknown): s is AcaoPretendida {
  return typeof s === "string" && ACOES_VALIDAS_FALLBACK.has(s as AcaoPretendida);
}

interface CardProps {
  titulo?: React.ReactNode;
  contagem?: number;
  children: React.ReactNode;
  ariaLabel?: string;
}

function Card({ titulo, contagem, children, ariaLabel }: CardProps) {
  return (
    <section
      aria-label={ariaLabel}
      style={{
        borderRadius: 12,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "12px 14px",
      }}
    >
      {titulo && (
        <div
          className="row"
          style={{
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--txt-2)",
          }}
        >
          {titulo}
          {typeof contagem === "number" && (
            <span className="muted tiny" style={{ fontWeight: 500 }}>
              ({contagem})
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

function Barra({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: number;
  cor: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
        }}
      >
        <span className="muted">{rotulo}</span>
        <span className="mono" style={{ color: cor, fontWeight: 600 }}>
          {valor}{rotulo.toLowerCase().includes("score") ? "/100" : "%"}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={valor}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={rotulo}
        style={{
          height: 5,
          borderRadius: 3,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${valor}%`,
            background: cor,
            transition: "width 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </div>
  );
}

export function AbaMente({ conversa, conversaIdOverride, onTrocarCargo, onExecutarTurno }: AbaMenteProps) {
  const m = conversa.mente;
  const cargo = m.cargo_ativo;
  const corCargo = cargo.cor_acento;

  // Onda 2026-05-14 — enriquecer dossiê via RPC consolidada (B2 + B3).
  // Hidrata fatos do lead, episódios, regras_livres do cargo, alertas — TUDO em 1 query.
  // Re-fetcha quando:
  //   - lead.id muda (troca de conversa)
  //   - conversaIdOverride muda (ChatTeste cria conversa real após 1º turno)
  //   - m.atualizado_em muda (parent sinalizou que houve update — realtime do ChatTeste)
  const [dossie, setDossie] = useState<DossieEnriquecido | null>(null);
  // UUID real prioritário: ChatTeste passa override, outros consumidores usam conversa.id.
  const convIdEfetivo = conversaIdOverride ?? conversa.id;
  useEffect(() => {
    let ativo = true;
    const leadId = conversa.lead?.id;
    if (!leadId) return;
    enriquecerDossieViaRPC(leadId, convIdEfetivo).then((d) => {
      if (ativo && d) setDossie(d);
    });
    return () => { ativo = false; };
  }, [conversa.lead?.id, convIdEfetivo, m.atualizado_em]);

  const regrasCargo = cargo.regras_livres ?? dossie?.cargo_ativo_regras_livres ?? null;
  const fatosLead = dossie?.fatos ?? m.fatos_do_lead ?? [];
  const alertas = dossie?.alertas ?? m.alertas ?? [];

  // Card 3 (Compromissos ativos) prioriza o RPC consolidado — mesmo da AbaCompromissos,
  // vindo da view `compromissos_ativos` (acoes_agendadas + compromissos_do_lead).
  // `m.compromissos_ativos` do useConversasLive filtra só `prometido_pelo_agente=true`
  // e fica vazio quando a promessa nasceu via acoes_agendadas (ex: callback do Porteiro).
  const compromissosAtivos = useMemo(() => {
    const doRpc = (dossie?.compromissos_ativos ?? []).map((item) => ({
      id: String(item.id),
      titulo:
        String(item.titulo ?? `Compromisso ${item.tipo ?? ""}`).trim() || "Compromisso",
      prometido_em: String(item.criado_em ?? new Date().toISOString()),
      vencimento_iso:
        typeof item.executar_em === "string" ? item.executar_em : undefined,
    }));
    return doRpc.length > 0 ? doRpc : m.compromissos_ativos;
  }, [dossie?.compromissos_ativos, m.compromissos_ativos]);

  // Onda 2026-05-14 — pensamento estruturado com fallback do RPC.
  // m.pensamento é alimentado pelo trace da edge (turnos novos) ou conversaInicial mock.
  // Sessão antiga / reabertura: m.pensamento é mock → usa pensamento_atual do RPC.
  const p = useMemo<typeof m.pensamento>(() => {
    const ehMock = m.pensamento.id === "inicial" || m.pensamento.id === "derivado";
    const pa = dossie?.pensamento_atual;
    if (!ehMock || !pa) return m.pensamento;
    const planoBruto = Array.isArray((pa as { plano_proximos_turnos?: unknown }).plano_proximos_turnos)
      ? ((pa as { plano_proximos_turnos: unknown[] }).plano_proximos_turnos as unknown[])
      : [];
    const plano: PlanoTurno[] = planoBruto
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({
        turno: Number(x.turno ?? 0),
        o_que_fazer: String(x.o_que_fazer ?? ""),
        por_que: String(x.por_que ?? ""),
      }));
    const acaoBruta = (pa as { acao_pretendida?: unknown }).acao_pretendida;
    return {
      id: `rpc-${dossie?.gerado_em ?? "now"}`,
      proxima_intencao: String((pa as { proxima_intencao?: unknown }).proxima_intencao ?? ""),
      acao_pretendida: ehAcaoValidaMente(acaoBruta) ? acaoBruta : "responder_e_aguardar",
      leitura_da_situacao: ((pa as { leitura_da_situacao?: unknown }).leitura_da_situacao as string | null) ?? null,
      motivo: ((pa as { motivo?: unknown }).motivo as string | null) ?? null,
      quando_voltar: ((pa as { quando_voltar?: unknown }).quando_voltar as string | null) ?? null,
      plano_proximos_turnos: plano,
      criado_em: dossie?.gerado_em ?? new Date().toISOString(),
    };
  }, [m.pensamento, dossie?.pensamento_atual, dossie?.gerado_em]);
  const rotuloAcao = ROTULO_ACAO[p.acao_pretendida] ?? p.acao_pretendida;

  const corCobertura = m.cobertura_prancheta >= 70 ? "oklch(0.78 0.20 70)" : "oklch(0.72 0.20 35)";
  const corScore =
    m.score_lead >= 70 ? "oklch(0.72 0.20 145)" : m.score_lead >= 40 ? "oklch(0.78 0.18 80)" : "oklch(0.70 0.20 30)";

  // Onda 8 RAG-first — Perguntas respondidas pelo ciclo Mentor pra este lead.
  const leadIdEfetivo = conversa.lead?.id ?? null;
  const { perguntas: perguntasRespondidas } = usePerguntasRespondidasLead(
    // Filtra lead mock do Chat de Teste (lead.id = "lead-teste")
    leadIdEfetivo && leadIdEfetivo !== "lead-teste" ? leadIdEfetivo : null,
  );

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px" }}
    >
      {/* ========= Card 1: Cargo Ativo ========= */}
      <Card ariaLabel="Cargo ativo e métricas da conversa">
        <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span
            className="muted tiny"
            style={{ textTransform: "uppercase", letterSpacing: 0.6, lineHeight: 1 }}
          >
            Cargo
          </span>
          <span
            style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: corCargo, lineHeight: 1.15 }}
          >
            {cargo.nome}
          </span>
          {onTrocarCargo && (
            <motion.button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onTrocarCargo}
              whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
              whileTap={tapPress}
              aria-label="Trocar cargo da conversa"
              style={{ padding: "2px 8px", fontSize: 11 }}
            >
              ⇄
            </motion.button>
          )}
        </div>
        {cargo.objetivo_principal && (
          <div
            className="muted small"
            style={{
              marginTop: -4,
              marginBottom: 12,
              lineHeight: 1.45,
              fontStyle: "italic",
              fontSize: 11,
              color: "var(--txt-3)",
            }}
          >
            <span style={{ color: corCargo, fontWeight: 600 }}>Bússola:</span> {cargo.objetivo_principal}
          </div>
        )}
        {regrasCargo && (
          <details style={{ marginTop: -4, marginBottom: 12 }}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: 11,
                color: corCargo,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              📜 Regras cravadas pelo tenant ({regrasCargo.length} chars)
            </summary>
            <pre
              className="muted"
              style={{
                fontSize: 10,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                fontFamily: "ui-monospace, monospace",
                margin: "6px 0 0 0",
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {regrasCargo}
            </pre>
          </details>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Barra rotulo="Cobertura da Prancheta" valor={m.cobertura_prancheta} cor={corCobertura} />
          <Barra rotulo="Score do lead" valor={m.score_lead} cor={corScore} />
        </div>
      </Card>

      {/* ========= Card NOVO 1.5: Alertas do dossiê (B3 RPC fn_alertas_dossie) ========= */}
      {alertas.length > 0 && (
        <Card
          ariaLabel="Alertas do dossiê"
          titulo={<><span aria-hidden="true">⚠️</span> Alertas</>}
          contagem={alertas.length}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alertas.map((a) => {
              const corSev =
                a.severity === "vermelho" ? "oklch(0.68 0.22 25)" :
                a.severity === "amarelo" ? "oklch(0.78 0.18 80)" :
                "oklch(0.72 0.20 145)";
              return (
                <div
                  key={a.tipo}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.025)",
                    borderLeft: `3px solid ${corSev}`,
                    fontSize: 11,
                  }}
                >
                  <span aria-hidden="true" style={{ color: corSev }}>●</span>
                  <span style={{ color: "var(--txt-1)" }}>{a.msg}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ========= Card NOVO 1.7: Fatos do lead (A1 RAG-FIRST memoria_lead) =========
          Fonte: RPC fn_dossie_lead_consolidado.fatos (top-10 ordenados por relevancia*confianca).
          Extrator escreve a cada turno (curto) → cron destila pra longo 06h UTC. */}
      {fatosLead.length > 0 && (
        <Card
          ariaLabel="Fatos consolidados sobre o lead"
          titulo={<><span aria-hidden="true">🧬</span> Fatos do lead</>}
          contagem={fatosLead.length}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(() => {
              // Agrupa por categoria pra leitura humana melhor
              const grupos: Record<string, FatoLead[]> = {};
              for (const f of fatosLead) {
                const k = f.categoria || "outro";
                if (!grupos[k]) grupos[k] = [];
                grupos[k].push(f);
              }
              const ROTULO_CAT: Record<string, string> = {
                fato_financeiro: "💰 Financeiro",
                fato_biografico: "👤 Biográfico",
                interesse: "🎯 Interesse",
                historico_negociacao: "📜 Histórico",
                objecao: "🚧 Objeção",
                outro: "Outro",
              };
              return Object.entries(grupos).map(([cat, fatos]) => (
                <div key={cat} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div className="muted tiny" style={{ fontWeight: 600, marginBottom: 2 }}>
                    {ROTULO_CAT[cat] ?? cat}
                  </div>
                  {fatos.map((f) => {
                    const opacidade = Math.max(0.4, Number(f.confianca) * 0.7 + 0.3);
                    const corRel =
                      f.relevancia === "alta" ? "oklch(0.78 0.20 70)" :
                      f.relevancia === "media" ? "oklch(0.72 0.16 180)" :
                      "var(--txt-3)";
                    return (
                      <div
                        key={f.id}
                        title={f.valido_desde ? `desde ${new Date(f.valido_desde).toLocaleDateString("pt-BR")}` : ""}
                        style={{
                          fontSize: 11,
                          lineHeight: 1.45,
                          opacity: opacidade,
                          padding: "4px 8px",
                          borderLeft: `2px solid ${corRel}`,
                          background: "rgba(255,255,255,0.02)",
                          borderRadius: 4,
                        }}
                      >
                        <span style={{ color: "var(--txt-1)" }}>{f.fato}</span>
                        <span className="mono" style={{ marginLeft: 6, fontSize: 9, color: "var(--txt-3)" }}>
                          ({Math.round(Number(f.confianca) * 100)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </Card>
      )}

      {/* ========= Card 2: Prancheta deste cargo (obrigatórios em checklist + opcionais em chips) ========= */}
      {/* Onda 2026-05-13 — Ragentic crava `campos_rastreio` como [{chave, descricao, obrigatorio}].
          Obrigatórios entram na Cobertura (checklist com ✓/○). Opcionais ficam abaixo como chips. */}
      <Card
        ariaLabel="Prancheta deste cargo"
        titulo={<><span aria-hidden="true">📋</span> Prancheta deste cargo</>}
      >
        {(() => {
          const todos = cargo.campos_rastreio ?? [];
          if (todos.length === 0) {
            return (
              <div className="muted small" style={{ fontStyle: "italic", lineHeight: 1.5 }}>
                Cargo sem prancheta configurada — defina <span className="mono">campos_rastreio</span> em Curadoria.
              </div>
            );
          }
          const obrigatorios = todos.filter((c) => c.obrigatorio !== false);
          const opcionais = todos.filter((c) => c.obrigatorio === false);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {obrigatorios.length > 0 && (
                <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  {obrigatorios.map((campo) => {
                    const valor = m.dados_capturados[campo.chave];
                    const preenchido = valor !== null && valor !== undefined && String(valor).trim() !== "";
                    return (
                      <div
                        key={campo.chave}
                        className="row"
                        title={campo.descricao || ""}
                        style={{
                          gap: 8,
                          fontSize: 12,
                          alignItems: "center",
                          padding: "5px 0",
                          borderBottom: "1px dashed rgba(255,255,255,0.04)",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            fontSize: 12,
                            lineHeight: 1,
                            color: preenchido ? "oklch(0.78 0.20 145)" : "oklch(0.62 0.04 270)",
                            width: 14,
                            display: "inline-block",
                            textAlign: "center",
                          }}
                        >
                          {preenchido ? "✓" : "○"}
                        </span>
                        <dt
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: preenchido ? corCargo : "var(--txt-3)",
                            flex: "0 0 auto",
                          }}
                        >
                          {campo.chave}
                        </dt>
                        {preenchido && (
                          <>
                            <span className="muted" style={{ fontSize: 11, lineHeight: 1 }}>—</span>
                            <dd
                              style={{
                                margin: 0,
                                fontWeight: 500,
                                color: "var(--txt-1)",
                                fontSize: 12,
                                flex: 1,
                                minWidth: 0,
                                textAlign: "right",
                                wordBreak: "break-word",
                              }}
                            >
                              {renderizarValorPrancheta(valor)}
                            </dd>
                          </>
                        )}
                        {!preenchido && (
                          <span className="muted tiny" style={{ marginLeft: "auto", fontStyle: "italic" }}>
                            aguardando
                          </span>
                        )}
                      </div>
                    );
                  })}
                </dl>
              )}
              {opcionais.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="muted tiny" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    Opcionais
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {opcionais.map((campo) => {
                      const valor = m.dados_capturados[campo.chave];
                      const preenchido = valor !== null && valor !== undefined && String(valor).trim() !== "";
                      return (
                        <span
                          key={campo.chave}
                          title={(campo.descricao || campo.chave) + (preenchido ? ` — ${renderizarValorPrancheta(valor)}` : "")}
                          className="mono"
                          style={{
                            fontSize: 10.5,
                            padding: "3px 8px",
                            borderRadius: 999,
                            border: preenchido
                              ? `1px solid ${corCargo}`
                              : "1px dashed rgba(255,255,255,0.14)",
                            color: preenchido ? "var(--txt-1)" : "var(--txt-3)",
                            background: preenchido ? aplicarAlfa(corCargo, 0.12) : "transparent",
                          }}
                        >
                          {preenchido ? "✓ " : ""}{campo.chave}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Card>

      {/* ========= Card 3: Já capturado ========= */}
      <Card
        ariaLabel="Dados já capturados"
        titulo={<><span aria-hidden="true">👤</span> Já capturado</>}
        contagem={Object.keys(m.dados_capturados).length}
      >
        {Object.keys(m.dados_capturados).length === 0 ? (
          <div className="muted small" style={{ fontStyle: "italic", lineHeight: 1.5 }}>
            Nada ainda. O agente vai inferindo conforme conversa.
          </div>
        ) : (
          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {Object.entries(m.dados_capturados).map(([chave, valor]) => (
              <div
                key={chave}
                className="row"
                style={{ justifyContent: "space-between", gap: 12, fontSize: 12 }}
              >
                <dt className="muted">{chave.replaceAll("_", " ")}</dt>
                <dd style={{ margin: 0, fontWeight: 500, textAlign: "right" }}>
                  {String(valor ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      {/* ========= Card 3: Compromissos ativos ========= */}
      <Card
        ariaLabel="Compromissos ativos do agente"
        titulo={<><span aria-hidden="true">🗓</span> Compromissos ativos</>}
        contagem={compromissosAtivos.length}
      >
        {compromissosAtivos.length === 0 ? (
          <div className="muted small" style={{ fontStyle: "italic", lineHeight: 1.5 }}>
            Nenhuma promessa pendente. O agente está livre para agendar novos retornos.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {compromissosAtivos.map((ca) => {
              const quando = formatarQuandoCompromisso(ca.vencimento_iso ?? ca.prometido_em);
              return (
                <li
                  key={ca.id}
                  style={{
                    paddingLeft: 8,
                    borderLeft: `2px solid ${aplicarAlfa(corCargo, 0.5)}`,
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <div>{ca.titulo}</div>
                  {quando && (
                    <div className="muted tiny" style={{ marginTop: 2 }}>
                      <span aria-hidden="true">🗓</span> {quando}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ========= Card 4: Tags inferidas ========= */}
      <Card
        ariaLabel="Tags inferidas pelo agente"
        titulo={<><span aria-hidden="true">🏷</span> Tags inferidas</>}
        contagem={m.tags.length}
      >
        {m.tags.length === 0 ? (
          <div className="muted small" style={{ fontStyle: "italic" }}>
            Nenhuma tag inferida ainda.
          </div>
        ) : (
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {m.tags.map((t) => (
              <span
                key={t}
                className="mono tiny"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "var(--txt-2)",
                  fontSize: 11,
                }}
              >
                <span aria-hidden="true" style={{ color: corCargo }}>✦</span>
                {t}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* ========= Card Onda 8: Perguntas respondidas (ciclo Mentor) ========= */}
      {perguntasRespondidas.length > 0 && (
        <Card
          ariaLabel="Perguntas respondidas pelo ciclo Mentor"
          titulo={<><span aria-hidden="true">💡</span> Perguntas respondidas</>}
          contagem={perguntasRespondidas.length}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {perguntasRespondidas.map((p) => {
              const gavetaLabel = p.gaveta_proposta
                ? p.gaveta_proposta.replace("blocos_", "").replace("_", " ")
                : null;
              const escopoLabel = p.escopo_proposto ?? "tenant";
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Pergunta original */}
                  <div
                    style={{
                      fontSize: 11,
                      fontStyle: "italic",
                      color: "var(--txt-2)",
                      lineHeight: 1.4,
                    }}
                  >
                    "{String(p.pergunta ?? "")}"
                  </div>
                  {/* Resposta do dono */}
                  {p.resposta_do_dono && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--txt-1)",
                        lineHeight: 1.45,
                        paddingLeft: 8,
                        borderLeft: "2px solid rgba(245,158,11,0.4)",
                      }}
                    >
                      {String(p.resposta_do_dono).slice(0, 200)}
                      {String(p.resposta_do_dono).length > 200 ? "…" : ""}
                    </div>
                  )}
                  {/* Badge gaveta/escopo */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                    {gavetaLabel && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "rgba(34,197,94,0.12)",
                          border: "1px solid rgba(34,197,94,0.30)",
                          color: "rgba(134,239,172,0.90)",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        <span aria-hidden="true">✓</span>
                        {gavetaLabel} / {escopoLabel}
                      </span>
                    )}
                    {p.status_loop === "entregue_lead" && !gavetaLabel && (
                      <span
                        className="muted tiny"
                        style={{ fontStyle: "italic" }}
                      >
                        entregue ao lead · bloco pendente
                      </span>
                    )}
                    {p.bloco_criado_id && (
                      <span
                        className="mono tiny"
                        style={{ color: "var(--txt-3)", marginLeft: "auto" }}
                        title={`Bloco ID: ${p.bloco_criado_id}`}
                      >
                        bloco: {String(p.bloco_criado_id).slice(0, 8)}…
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ========= Card 5: Pensamento estruturado (Ragentic 1:1) ========= */}
      <Card ariaLabel="Pensamento estruturado do agente">
        <div
          className="row"
          style={{ gap: 6, alignItems: "center", marginBottom: 8 }}
        >
          <span aria-hidden="true" style={{ fontSize: 13 }}>🧠</span>
          <div
            className="muted tiny"
            style={{
              flex: 1,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              fontSize: 9,
              fontWeight: 600,
            }}
          >
            Pensamento
          </div>
          <span
            className="mono tiny"
            style={{
              padding: "2px 7px",
              borderRadius: 999,
              background: aplicarAlfa(corCargo, 0.15),
              border: `1px solid ${aplicarAlfa(corCargo, 0.4)}`,
              color: corCargo,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontSize: 9,
              whiteSpace: "nowrap",
              fontWeight: 700,
            }}
          >
            {rotuloAcao}
          </span>
        </div>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: "var(--txt-1)",
            lineHeight: 1.45,
            marginBottom: 4,
          }}
        >
          {p.proxima_intencao}
        </div>

        {p.leitura_da_situacao && (
          <div style={{ marginTop: 12 }}>
            <div
              className="muted tiny"
              style={{
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 3,
                fontSize: 9,
              }}
            >
              Leitura da situação
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--txt-1)" }}>
              {p.leitura_da_situacao}
            </div>
          </div>
        )}

        {p.motivo && (
          <div style={{ marginTop: 10 }}>
            <div
              className="muted tiny"
              style={{
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 3,
                fontSize: 9,
              }}
            >
              Por que
            </div>
            <div
              className="muted"
              style={{ fontSize: 11, lineHeight: 1.55, fontStyle: "italic" }}
            >
              {p.motivo}
            </div>
          </div>
        )}

        {p.quando_voltar && (
          <div
            className="muted small"
            style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}
          >
            <span aria-hidden="true">⏱</span>
            <span>volta: {p.quando_voltar}</span>
          </div>
        )}

        {p.plano_proximos_turnos.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div
              className="muted tiny"
              style={{
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 9,
              }}
            >
              <span aria-hidden="true">🎯</span>
              Plano dos próximos turnos
            </div>
            <motion.ol
              variants={stagger(0.05, 0.03)}
              initial="hidden"
              animate="visible"
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {p.plano_proximos_turnos.map((turno) => (
                <motion.li
                  key={turno.turno}
                  variants={staggerItem}
                  style={{
                    paddingLeft: 10,
                    borderLeft: `2px solid ${aplicarAlfa(corCargo, 0.6)}`,
                  }}
                >
                  <motion.button
                    type="button"
                    onClick={() => onExecutarTurno?.(turno)}
                    whileHover={{ x: 2, transition: springSoft }}
                    whileTap={tapPress}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "2px 0",
                      textAlign: "left",
                      cursor: onExecutarTurno ? "pointer" : "default",
                      width: "100%",
                    }}
                    aria-label={`Executar turno ${turno.turno}: ${turno.o_que_fazer}`}
                  >
                    <span
                      className="mono tiny"
                      style={{
                        color: corCargo,
                        fontWeight: 700,
                        marginRight: 6,
                        fontSize: 10,
                      }}
                    >
                      T+{turno.turno}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--txt-1)", lineHeight: 1.5 }}>
                      {turno.o_que_fazer}
                    </span>
                    <div
                      className="muted"
                      style={{
                        marginTop: 2,
                        fontSize: 10,
                        fontStyle: "italic",
                        lineHeight: 1.5,
                      }}
                    >
                      — {turno.por_que}
                    </div>
                  </motion.button>
                </motion.li>
              ))}
            </motion.ol>
          </div>
        )}
      </Card>

    </motion.div>
  );
}

/**
 * Humaniza valores da Prancheta (working memory) pra exibir como linha de tabela.
 * - string/number/boolean: tal qual
 * - array: junta com vírgula
 * - object: stringify compacto
 */
/**
 * Formata o "quando" de um compromisso em BRT (America/Sao_Paulo) com dia da
 * semana + data + hora. Ex.: "domingo, 17/05/2026, 16:00". Retorna null se a
 * data for ausente/inválida (não renderiza a linha — seguro p/ app Conversas).
 */
function formatarQuandoCompromisso(iso?: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderizarValorPrancheta(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (Array.isArray(valor)) {
    return valor.length === 0 ? "—" : valor.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  }
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

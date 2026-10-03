/**
 * HistoricoReunioes — calls encerradas que têm transcrição salva.
 *
 * Lista as salas encerradas com falas em `salas_reuniao_turnos`. Clicar numa
 * call expande o painel: na primeira abertura a edge `analisar-reuniao`
 * transforma a transcrição em dado (assunto, resumo, tópicos, decisões,
 * pendências — gravados na própria sala) e a transcrição completa aparece
 * embaixo. Reanalisar disponível pra regenerar a análise.
 */

import { useEffect, useRef, useState } from "react";
import { Captions, ChevronDown, ChevronUp, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cor } from "./reuniao-ui";

// `salas_reuniao*` ainda não está nos tipos gerados do client — cast bruto,
// mesmo padrão do PainelTranscricao.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Analise = {
  assunto: string;
  resumo: string;
  topicos: string[];
  decisoes: string[];
  pendencias: string[];
};

type CallEncerrada = {
  id: string;
  titulo: string;
  assunto: string | null;
  resumo: string | null;
  topicos: Record<string, string[]> | null;
  analisada_em: string | null;
  iniciada_em: string | null;
  encerrada_em: string | null;
  falas: number;
};

type Fala = { id: string; nome: string; doTime: boolean; texto: string; hora: string };

// prettier-ignore
const s = {
  secao: { display: "flex", flexDirection: "column" as const, gap: 10 },
  secaoTitulo: { fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: cor.texto3, textTransform: "uppercase" as const },
  card: { background: cor.superficie, border: `1px solid ${cor.borda}`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column" as const, gap: 0 },
  cabecalho: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", background: "none", border: "none", padding: 0, textAlign: "left" as const, width: "100%", color: "inherit", font: "inherit" },
  cardInfo: { display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 180 },
  cardTextos: { display: "flex", flexDirection: "column" as const, gap: 3, minWidth: 0 },
  cardNome: { fontSize: 14, fontWeight: 600, color: cor.texto1, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  cardSub: { fontSize: 12, color: cor.texto2 },
  iconeCirculo: { width: 40, height: 40, borderRadius: "50%", background: "oklch(0.22 0.05 250 / 0.4)", color: "oklch(0.72 0.12 250)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  detalhe: { display: "flex", flexDirection: "column" as const, gap: 14, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${cor.borda}` },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: cor.texto3, textTransform: "uppercase" as const },
  resumo: { fontSize: 13, lineHeight: 1.6, color: cor.texto1, whiteSpace: "pre-wrap" as const, maxWidth: "72ch" },
  lista: { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, color: cor.texto1 },
  transcricao: { maxHeight: 380, overflowY: "auto" as const, display: "flex", flexDirection: "column" as const, gap: 8, paddingRight: 6 },
  fala: { fontSize: 13, lineHeight: 1.5, color: cor.texto1 },
  falaMeta: { color: cor.texto3, fontSize: 11, marginRight: 8 },
  analisando: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: cor.texto2, padding: "10px 0" },
  vazio: { display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 14, border: `1px dashed ${cor.borda}`, color: cor.texto3, fontSize: 13 },
} as const;

function formatarQuando(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dia} · ${hora}`;
  } catch {
    return "";
  }
}

function duracaoMin(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  return ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : null;
}

function analiseDaRow(c: CallEncerrada): Analise | null {
  if (!c.analisada_em || !c.assunto) return null;
  return {
    assunto: c.assunto,
    resumo: c.resumo ?? "",
    topicos: c.topicos?.topicos ?? [],
    decisoes: c.topicos?.decisoes ?? [],
    pendencias: c.topicos?.pendencias ?? [],
  };
}

function BlocoLista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={s.rotulo}>{titulo}</span>
      <ul style={s.lista}>
        {itens.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function HistoricoReunioes() {
  const [calls, setCalls] = useState<CallEncerrada[] | null>(null);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  // Espelho síncrono da call aberta — descarta resultados de fetch obsoletos quando
  // o usuário abre outra call no meio do carregamento das falas / da análise.
  const refAbertaId = useRef<string | null>(null);
  const [falas, setFalas] = useState<Fala[]>([]);
  const [carregandoFalas, setCarregandoFalas] = useState(false);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erroAnalise, setErroAnalise] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data, error } = await sb
        .from("salas_reuniao")
        .select(
          "id, titulo, assunto, resumo, topicos, analisada_em, iniciada_em, encerrada_em, salas_reuniao_turnos(count)",
        )
        .eq("status", "encerrada")
        .is("deleted_at", null)
        .order("encerrada_em", { ascending: false, nullsFirst: false })
        .limit(40);
      if (!vivo) return;
      if (error) {
        console.error("[HistoricoReunioes] carregar:", error);
        setCalls([]);
        return;
      }
      const comFalas = (data ?? [])
        .map((r: Record<string, unknown>) => ({
          ...r,
          falas: (r.salas_reuniao_turnos as Array<{ count: number }>)?.[0]?.count ?? 0,
        }))
        .filter((r: CallEncerrada) => r.falas > 0);
      setCalls(comFalas as CallEncerrada[]);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function analisar(call: CallEncerrada, forcar: boolean) {
    setAnalisando(true);
    setErroAnalise(null);
    try {
      const { data, error } = await sb.functions.invoke("analisar-reuniao", {
        body: { sala_id: call.id, forcar },
      });
      if (error || !data?.ok) throw new Error(data?.erro || error?.message || "falha na análise");
      const nova = data.analise as Analise;
      // Só aplica no painel se ESTA call ainda é a aberta (usuário pode ter trocado
      // durante a análise). A atualização da LISTA abaixo pode seguir — é a análise
      // persistida da row, útil independentemente do painel aberto.
      if (refAbertaId.current === call.id) setAnalise(nova);
      setCalls((prev) =>
        (prev ?? []).map((c) =>
          c.id === call.id
            ? {
                ...c,
                assunto: nova.assunto,
                resumo: nova.resumo,
                topicos: { topicos: nova.topicos, decisoes: nova.decisoes, pendencias: nova.pendencias },
                analisada_em: new Date().toISOString(),
              }
            : c,
        ),
      );
    } catch (err) {
      console.error("[HistoricoReunioes] analisar:", err);
      if (refAbertaId.current === call.id) {
        setErroAnalise(err instanceof Error ? err.message : "Não consegui analisar a call.");
      }
    } finally {
      setAnalisando(false);
    }
  }

  async function abrir(call: CallEncerrada) {
    if (abertaId === call.id) {
      setAbertaId(null);
      refAbertaId.current = null;
      return;
    }
    setAbertaId(call.id);
    refAbertaId.current = call.id;
    setFalas([]);
    setErroAnalise(null);
    setAnalise(analiseDaRow(call));
    setCarregandoFalas(true);
    const { data, error } = await sb
      .from("salas_reuniao_turnos")
      .select("id, nome, do_time, texto, falado_em")
      .eq("sala_id", call.id)
      .is("deleted_at", null)
      .order("falado_em", { ascending: true })
      .limit(3000);
    // Abriu outra call durante o fetch → descarta este resultado (senão as falas de
    // uma call apareciam na outra).
    if (refAbertaId.current !== call.id) return;
    setCarregandoFalas(false);
    if (error) {
      console.error("[HistoricoReunioes] turnos:", error);
    } else {
      setFalas(
        (data ?? []).map((t: Record<string, unknown>) => ({
          id: String(t.id),
          nome: String(t.nome ?? "Participante"),
          doTime: !!t.do_time,
          texto: String(t.texto ?? ""),
          hora: t.falado_em
            ? new Date(String(t.falado_em)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : "",
        })),
      );
    }
    // Primeira abertura: a call ainda não virou dado — analisa sozinha.
    if (!call.analisada_em) void analisar(call, false);
  }

  if (calls === null) {
    return (
      <div style={s.secao} aria-busy="true" aria-label="Carregando histórico">
        <span style={s.secaoTitulo}>Histórico</span>
        <div className="reu-skeleton" style={{ height: 68 }} />
      </div>
    );
  }

  return (
    <div style={s.secao}>
      <span style={s.secaoTitulo}>Histórico</span>
      {calls.length === 0 ? (
        <div style={s.vazio}>
          <Captions size={20} aria-hidden style={{ flexShrink: 0 }} />
          <span>Nenhuma call encerrada com transcrição ainda. As próximas calls com legenda ligada aparecem aqui.</span>
        </div>
      ) : (
        calls.map((call) => {
          const aberta = abertaId === call.id;
          const dur = duracaoMin(call.iniciada_em, call.encerrada_em);
          return (
            <div key={call.id} className="reu-card reu-surgir" style={s.card}>
              <button type="button" style={s.cabecalho} onClick={() => void abrir(call)} aria-expanded={aberta}>
                <div style={s.cardInfo}>
                  <div style={s.iconeCirculo}>
                    <Captions size={19} aria-hidden />
                  </div>
                  <div style={s.cardTextos}>
                    <span style={s.cardNome}>{call.assunto ?? call.titulo}</span>
                    <span style={s.cardSub}>
                      {formatarQuando(call.encerrada_em ?? call.iniciada_em)}
                      {dur ? ` · ${dur} min` : ""} · {call.falas} falas
                      {call.analisada_em ? "" : " · sem análise"}
                    </span>
                  </div>
                </div>
                {aberta ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
              </button>

              {aberta && (
                <div style={s.detalhe}>
                  {analisando ? (
                    <div style={s.analisando}>
                      <Sparkles size={16} aria-hidden />
                      Analisando a call e transformando o assunto em dados…
                    </div>
                  ) : analise ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={s.rotulo}>Resumo</span>
                        <p style={{ ...s.resumo, margin: 0 }}>{analise.resumo}</p>
                      </div>
                      <BlocoLista titulo="Tópicos" itens={analise.topicos} />
                      <BlocoLista titulo="Decisões" itens={analise.decisoes} />
                      <BlocoLista titulo="Pendências" itens={analise.pendencias} />
                      <button
                        type="button"
                        className="reu-btn reu-btn-fantasma"
                        onClick={() => void analisar(call, true)}
                        style={{ alignSelf: "flex-start", height: 32, gap: 8, padding: "0 12px", fontSize: 12 }}
                      >
                        <RefreshCw size={14} aria-hidden /> Reanalisar
                      </button>
                    </>
                  ) : erroAnalise ? (
                    <div style={{ ...s.analisando, color: cor.perigo }}>
                      {erroAnalise}
                      <button
                        type="button"
                        className="reu-btn reu-btn-fantasma"
                        onClick={() => void analisar(call, false)}
                        style={{ height: 32, gap: 8, padding: "0 12px", fontSize: 12 }}
                      >
                        <RefreshCw size={14} aria-hidden /> Tentar de novo
                      </button>
                    </div>
                  ) : null}

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={s.rotulo}>Transcrição completa ({call.falas} falas)</span>
                    {carregandoFalas ? (
                      <div className="reu-skeleton" style={{ height: 80 }} />
                    ) : (
                      <div style={s.transcricao}>
                        {falas.map((f) => (
                          <div key={f.id} style={s.fala}>
                            <span style={s.falaMeta}>
                              {f.hora} · {f.nome}
                            </span>
                            {f.texto}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

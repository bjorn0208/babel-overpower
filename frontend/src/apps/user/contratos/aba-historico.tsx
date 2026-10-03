/**
 * Aba Histórico — lista de contratos com filtros, expansão e ações.
 * DetalheContrato e Carregando extraídos para detalhe-contrato.tsx.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, ExternalLink, FileSignature, MessageCircle, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { urlContrato } from "@/lib/url-app";
import { DetalheContrato } from "./detalhe-contrato";
import {
  badgeOrigem, badgeStatus, BotaoIcone, FiltroPilulas, inputStyle, Linha,
  nomeContato, statusAssinado, statusValidar, Vazio,
} from "./re-exports";
import type { Contrato, FiltroOrigem, FiltroStatus, SupabaseBruto, ToastApi } from "./tipos";

export { Carregando } from "./detalhe-contrato";

// Setor de período (Dominic, 2026-08-25): chave "AAAA-MM" e rótulo humano
// ("Agosto 2026") derivados do created_at — organizam a lista por mês.
function chaveMes(iso: string): string {
  return iso.slice(0, 7);
}
function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split("-").map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${ano}`;
}

export function AbaHistorico({
  contratos,
  t,
  onMudou,
  onAbrirConversa,
}: {
  contratos: Contrato[];
  t: ToastApi;
  onMudou: () => void;
  /** Abre o app Conversas focado na conversa do lead (só quando o shell recebe onAbrirApp). */
  onAbrirConversa?: (conversaId: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [fOrigem, setFOrigem] = useState<FiltroOrigem>("todos");
  const [fStatus, setFStatus] = useState<FiltroStatus>("todos");
  const [fMes, setFMes] = useState<string>("todos");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [limite, setLimite] = useState(40);
  const buscaNorm = busca.trim().toLowerCase();

  useEffect(() => { setLimite(40); }, [busca, fOrigem, fStatus, fMes]);

  const casaOrigem = useCallback(
    (c: Contrato, f: FiltroOrigem) =>
      f === "todos" || (f === "agente" ? c.origem === "agente" : c.origem !== "agente"),
    [],
  );
  const casaStatus = useCallback((c: Contrato, f: FiltroStatus) => {
    if (f === "todos") return true;
    if (f === "assinados") return statusAssinado(c.status);
    if (f === "validar") return statusValidar(c.status);
    return !statusAssinado(c.status) && !statusValidar(c.status);
  }, []);
  const casaBusca = useCallback(
    (c: Contrato) => !buscaNorm || (nomeContato(c)?.toLowerCase() || "").includes(buscaNorm),
    [buscaNorm],
  );
  const casaMes = useCallback(
    (c: Contrato, f: string) => f === "todos" || chaveMes(c.created_at) === f,
    [],
  );

  const filtrados = useMemo(
    () => contratos.filter((c) => casaOrigem(c, fOrigem) && casaStatus(c, fStatus) && casaBusca(c) && casaMes(c, fMes)),
    [contratos, fOrigem, fStatus, fMes, casaOrigem, casaStatus, casaBusca, casaMes],
  );

  const contagemOrigem = useMemo(() => {
    const base = contratos.filter((c) => casaStatus(c, fStatus) && casaBusca(c) && casaMes(c, fMes));
    return {
      todos: base.length,
      agente: base.filter((c) => c.origem === "agente").length,
      manual: base.filter((c) => c.origem !== "agente").length,
    };
  }, [contratos, fStatus, fMes, casaStatus, casaBusca, casaMes]);

  const contagemStatus = useMemo(() => {
    const base = contratos.filter((c) => casaOrigem(c, fOrigem) && casaBusca(c) && casaMes(c, fMes));
    return {
      assinados: base.filter((c) => statusAssinado(c.status)).length,
      validar: base.filter((c) => statusValidar(c.status)).length,
      pendentes: base.filter((c) => !statusAssinado(c.status) && !statusValidar(c.status)).length,
      todos: base.length,
    };
  }, [contratos, fOrigem, fMes, casaOrigem, casaBusca, casaMes]);

  // Setor de período: meses existentes (mais recente primeiro), contados
  // sobre a base já filtrada por origem/status/busca — mesmo padrão dos outros.
  const meses = useMemo(() => {
    const base = contratos.filter((c) => casaOrigem(c, fOrigem) && casaStatus(c, fStatus) && casaBusca(c));
    const porMes = new Map<string, number>();
    for (const c of base) {
      const k = chaveMes(c.created_at);
      porMes.set(k, (porMes.get(k) ?? 0) + 1);
    }
    const ordenados = [...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    return [
      { id: "todos", rotulo: "Todos", cont: base.length },
      ...ordenados.map(([k, cont]) => ({ id: k, rotulo: rotuloMes(k), cont })),
    ];
  }, [contratos, fOrigem, fStatus, casaOrigem, casaStatus, casaBusca]);

  async function excluir(id: string) {
    if (!window.confirm("Excluir contrato permanentemente?")) return;
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("contratos").delete().eq("id", id);
    if (error) { t.error("Erro ao excluir"); return; }
    onMudou();
    t.success("Contrato excluido");
  }

  async function mudarStatus(id: string, novo: "assinado" | "rejeitado") {
    const sb = supabase as SupabaseBruto;
    const update: Record<string, string> = { status: novo };
    if (novo === "assinado") update.assinado_em = new Date().toISOString();
    const { error } = await sb.from("contratos").update(update).eq("id", id);
    if (error) { t.error("Erro ao atualizar"); return; }
    onMudou();
    t.success(novo === "assinado" ? "Contrato validado" : "Contrato rejeitado");
  }

  function copiarLink(c: Contrato) {
    const link = urlContrato(c.chave_publica);
    navigator.clipboard
      .writeText(link)
      .then(() => t.success("Link copiado"))
      .catch(() => t.error("Falha ao copiar"));
  }

  const origens = [
    { id: "todos" as const, rotulo: "Todos", cont: contagemOrigem.todos },
    { id: "agente" as const, rotulo: "Agente", cont: contagemOrigem.agente },
    { id: "manual" as const, rotulo: "Manual", cont: contagemOrigem.manual },
  ];
  const statuses = [
    { id: "assinados" as const, rotulo: "Assinados", cont: contagemStatus.assinados },
    { id: "validar" as const, rotulo: "Validar", cont: contagemStatus.validar },
    { id: "pendentes" as const, rotulo: "Pendentes", cont: contagemStatus.pendentes },
    { id: "todos" as const, rotulo: "Todos", cont: contagemStatus.todos },
  ];

  return (
    <div className="os-vidro" style={{ padding: 18, borderRadius: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)", marginBottom: 12 }}>
        Historico de contratos
      </h2>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "oklch(0.98 0 0 / 0.45)" }} />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome do contato..."
          style={{ ...inputStyle, paddingLeft: 32 }}
        />
      </div>

      <FiltroPilulas titulo="Origem" opcoes={origens} ativo={fOrigem} onChange={(v) => setFOrigem(v as FiltroOrigem)} />
      <div style={{ height: 8 }} />
      <FiltroPilulas titulo="Status" opcoes={statuses} ativo={fStatus} onChange={(v) => setFStatus(v as FiltroStatus)} />
      <div style={{ height: 8 }} />
      <FiltroPilulas titulo="Período" opcoes={meses} ativo={fMes} onChange={setFMes} />
      <div style={{ height: 14 }} />

      {filtrados.length === 0 ? (
        <Vazio
          mensagem={
            contratos.length === 0
              ? "Nenhum contrato gerado"
              : buscaNorm
              ? "Nenhum contrato com esse nome"
              : "Nenhum contrato nesse filtro"
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtrados.slice(0, limite).map((c, i, visiveis) => {
            const ab = expandida === c.id;
            // Cabeçalho de mês: abre uma seção sempre que o mês muda na lista
            // (ordenada por created_at desc) — organização visual por período.
            const mesAtual = chaveMes(c.created_at);
            const novoMes = i === 0 || chaveMes(visiveis[i - 1].created_at) !== mesAtual;
            const contMes = filtrados.filter((x) => chaveMes(x.created_at) === mesAtual).length;
            const link = urlContrato(c.chave_publica);
            const bS = badgeStatus(c.status);
            const bO = badgeOrigem(c.origem);
            const nome = nomeContato(c);
            const tel = c.lead?.phone;
            const foto = c.lead?.url_foto_perfil;
            const inicial = (nome?.trim().charAt(0) || "?").toUpperCase();

            return (
              <Fragment key={c.id}>
                {novoMes && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: i === 0 ? 0 : 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "oklch(0.7 0.18 220)", whiteSpace: "nowrap" }}>
                      {rotuloMes(mesAtual)}
                    </span>
                    <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.4)", whiteSpace: "nowrap" }}>
                      {contMes} {contMes === 1 ? "contrato" : "contratos"}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "oklch(0.98 0 0 / 0.08)" }} />
                  </div>
                )}
                <article
                  onClick={() => setExpandida(ab ? null : c.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1.4fr 1.4fr 90px 90px 110px auto",
                    gap: 12, alignItems: "center", padding: "10px 12px",
                    background: ab ? "oklch(0.18 0.06 280 / 0.5)" : "oklch(0.18 0.06 280 / 0.2)",
                    border: "1px solid oklch(0.98 0 0 / 0.06)", borderRadius: 12, cursor: "pointer",
                  }}
                >
                  {ab ? <ChevronUp size={14} /> : <ChevronDown size={14} />}

                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <FileSignature size={14} style={{ color: "oklch(0.7 0.18 220)", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.98 0 0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.titulo || "Sem titulo"}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {nome ? (
                      <>
                        {foto
                          ? <img src={foto} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                          : <div style={{ width: 28, height: 28, borderRadius: "50%", background: "oklch(0.98 0 0 / 0.08)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600, color: "oklch(0.98 0 0 / 0.7)", flexShrink: 0 }}>{inicial}</div>
                        }
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 500, color: "oklch(0.98 0 0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</span>
                          {tel && <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tel}</span>}
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.35)" }}>—</span>
                    )}
                  </div>

                  <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: bS.fundo, color: bS.cor, justifySelf: "start" }}>{bS.rotulo}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: bO.fundo, color: bO.cor, justifySelf: "start" }}>{bO.rotulo}</span>
                  <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </span>

                  <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    {c.conversa_id && onAbrirConversa && (
                      <BotaoIcone titulo="Ver conversa" onClick={() => onAbrirConversa(c.conversa_id as string)}><MessageCircle size={13} /></BotaoIcone>
                    )}
                    <BotaoIcone titulo="Copiar link" onClick={() => copiarLink(c)}><Copy size={13} /></BotaoIcone>
                    <BotaoIcone titulo="Abrir contrato" onClick={() => window.open(link, "_blank")}><ExternalLink size={13} /></BotaoIcone>
                    <BotaoIcone titulo="Excluir" perigo onClick={() => excluir(c.id)}><Trash2 size={13} /></BotaoIcone>
                  </div>
                </article>

                {ab && (
                  <DetalheContrato
                    c={c}
                    link={link}
                    onValidar={() => mudarStatus(c.id, "assinado")}
                    onRejeitar={() => mudarStatus(c.id, "rejeitado")}
                  />
                )}
              </Fragment>
            );
          })}

          {filtrados.length > limite && (
            <button
              type="button"
              onClick={() => setLimite((n) => n + 40)}
              style={{
                marginTop: 8, padding: "10px 14px", fontSize: 11, fontWeight: 500,
                background: "oklch(0.18 0.06 280 / 0.4)", color: "oklch(0.98 0 0 / 0.85)",
                border: "1px solid oklch(0.98 0 0 / 0.1)", borderRadius: 10,
                cursor: "pointer", alignSelf: "center",
              }}
            >
              Ver mais {Math.min(40, filtrados.length - limite)} de {filtrados.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

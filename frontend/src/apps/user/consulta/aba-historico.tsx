/**
 * Aba Histórico — lista de consultas com filtros, expansão e ações.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, ExternalLink, Search, Trash2 } from "lucide-react";
import { urlPublica } from "@/lib/url-app";
import { DetalheConsulta } from "./detalhe-consulta";
import { supabase } from "@/integrations/supabase/client";
import { badgeOrigem, badgeStatus, BotaoIcone, FiltroPilulas, inputStyle, nomeContato, Vazio } from "./re-exports";
import type { Consulta, FiltroOrigem, FiltroStatus, ToastApi, SupabaseBruto } from "./tipos";

export { Carregando } from "./detalhe-consulta";

export function AbaHistorico({
  consultas,
  t,
  onMudou,
}: {
  consultas: Consulta[];
  t: ToastApi;
  onMudou: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [fOrigem, setFOrigem] = useState<FiltroOrigem>("todos");
  const [fStatus, setFStatus] = useState<FiltroStatus>("todos");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [limite, setLimite] = useState(40);
  const buscaNorm = busca.trim().toLowerCase();

  useEffect(() => { setLimite(40); }, [busca, fOrigem, fStatus]);

  const casaOrigem = useCallback((c: Consulta, f: FiltroOrigem) => f === "todos" || c.origem === f, []);
  const casaStatus = useCallback((c: Consulta, f: FiltroStatus) => f === "todos" || c.status === f, []);
  const casaBusca = useCallback(
    (c: Consulta) =>
      !buscaNorm ||
      (nomeContato(c)?.toLowerCase() || "").includes(buscaNorm) ||
      (c.documento || "").includes(buscaNorm),
    [buscaNorm],
  );

  const filtradas = useMemo(
    () => consultas.filter((c) => casaOrigem(c, fOrigem) && casaStatus(c, fStatus) && casaBusca(c)),
    [consultas, fOrigem, fStatus, casaOrigem, casaStatus, casaBusca],
  );

  const contOrigem = useMemo(() => {
    const base = consultas.filter((c) => casaStatus(c, fStatus) && casaBusca(c));
    return {
      todos: base.length,
      manual: base.filter((c) => c.origem === "manual").length,
      link: base.filter((c) => c.origem === "link").length,
    };
  }, [consultas, fStatus, casaStatus, casaBusca]);

  const contStatus = useMemo(() => {
    const base = consultas.filter((c) => casaOrigem(c, fOrigem) && casaBusca(c));
    const n = (s: Consulta["status"]) => base.filter((c) => c.status === s).length;
    return {
      todos: base.length,
      rascunho: n("rascunho"),
      aguardando_pagamento: n("aguardando_pagamento"),
      comprovante_enviado: n("comprovante_enviado"),
      consultando: n("consultando"),
      concluida: n("concluida"),
      erro: n("erro"),
    };
  }, [consultas, fOrigem, casaOrigem, casaBusca]);

  async function excluir(id: string) {
    if (!window.confirm("Excluir consulta permanentemente?")) return;
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("consultas")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      t.success("Consulta excluída.");
      onMudou();
    } catch {
      t.error("Falha ao excluir.");
    }
  }

  function copiarLink(c: Consulta) {
    const link = urlPublica("/consulta/" + c.chave_publica);
    navigator.clipboard.writeText(link).then(() => t.success("Link copiado")).catch(() => t.error("Falha ao copiar"));
  }

  const origens = [
    { id: "todos" as const, rotulo: "Todos", cont: contOrigem.todos },
    { id: "manual" as const, rotulo: "Manual", cont: contOrigem.manual },
    { id: "link" as const, rotulo: "Link", cont: contOrigem.link },
  ];
  const statusOpts = [
    { id: "todos" as const, rotulo: "Todos", cont: contStatus.todos },
    { id: "concluida" as const, rotulo: "Concluídas", cont: contStatus.concluida },
    { id: "consultando" as const, rotulo: "Consultando", cont: contStatus.consultando },
    { id: "aguardando_pagamento" as const, rotulo: "Aguardando", cont: contStatus.aguardando_pagamento },
    { id: "erro" as const, rotulo: "Erro", cont: contStatus.erro },
    { id: "rascunho" as const, rotulo: "Rascunho", cont: contStatus.rascunho },
  ];

  return (
    <div className="os-vidro" style={{ padding: 18, borderRadius: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)", marginBottom: 12 }}>
        Histórico de consultas
      </h2>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "oklch(0.98 0 0 / 0.45)" }} />
        <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou documento..." style={{ ...inputStyle, paddingLeft: 32 }} />
      </div>

      <FiltroPilulas titulo="Origem" opcoes={origens} ativo={fOrigem} onChange={(v) => setFOrigem(v as FiltroOrigem)} />
      <div style={{ height: 8 }} />
      <FiltroPilulas titulo="Status" opcoes={statusOpts} ativo={fStatus} onChange={(v) => setFStatus(v as FiltroStatus)} />
      <div style={{ height: 14 }} />

      {filtradas.length === 0 ? (
        <Vazio mensagem={
          consultas.length === 0 ? "Nenhuma consulta realizada"
          : buscaNorm ? "Nenhuma consulta com esse termo"
          : "Nenhuma consulta nesse filtro"
        } />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtradas.slice(0, limite).map((c) => {
            const ab = expandida === c.id;
            const link = urlPublica("/consulta/" + c.chave_publica);
            const bS = badgeStatus(c.status);
            const bO = badgeOrigem(c.origem);
            const nome = nomeContato(c);
            const foto = c.lead?.url_foto_perfil;
            const inicial = (nome?.trim().charAt(0) || "?").toUpperCase();

            return (
              <Fragment key={c.id}>
                <article
                  onClick={() => setExpandida(ab ? null : c.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1.4fr 1.2fr 100px 80px 110px auto",
                    gap: 12, alignItems: "center", padding: "10px 12px",
                    background: ab ? "oklch(0.18 0.06 280 / 0.5)" : "oklch(0.18 0.06 280 / 0.2)",
                    border: "1px solid oklch(0.98 0 0 / 0.06)", borderRadius: 12, cursor: "pointer",
                  }}
                >
                  {ab ? <ChevronUp size={14} /> : <ChevronDown size={14} />}

                  <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.98 0 0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.titulo || c.documento || "Sem título"}
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {nome ? (
                      <>
                        {foto
                          ? <img src={foto} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                          : <div style={{ width: 28, height: 28, borderRadius: "50%", background: "oklch(0.98 0 0 / 0.08)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600, color: "oklch(0.98 0 0 / 0.7)", flexShrink: 0 }}>{inicial}</div>
                        }
                        <span style={{ fontSize: 11, fontWeight: 500, color: "oklch(0.98 0 0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.35)" }}>—</span>
                    )}
                  </div>

                  <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: bS.fundo, color: bS.cor, justifySelf: "start" }}>{bS.rotulo}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: bO.fundo, color: bO.cor, justifySelf: "start" }}>{bO.rotulo}</span>
                  <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>

                  <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <BotaoIcone titulo="Copiar link" onClick={() => copiarLink(c)}><Copy size={13} /></BotaoIcone>
                    <BotaoIcone titulo="Abrir link público" onClick={() => window.open(link, "_blank")}><ExternalLink size={13} /></BotaoIcone>
                    <BotaoIcone titulo="Excluir" perigo onClick={() => excluir(c.id)}><Trash2 size={13} /></BotaoIcone>
                  </div>
                </article>

                {ab && <DetalheConsulta c={c} link={link} />}
              </Fragment>
            );
          })}

          {filtradas.length > limite && (
            <button type="button" onClick={() => setLimite((n) => n + 40)}
              style={{ marginTop: 8, padding: "10px 14px", fontSize: 11, fontWeight: 500, background: "oklch(0.18 0.06 280 / 0.4)", color: "oklch(0.98 0 0 / 0.85)", border: "1px solid oklch(0.98 0 0 / 0.1)", borderRadius: 10, cursor: "pointer", alignSelf: "center" }}>
              Ver mais {Math.min(40, filtradas.length - limite)} de {filtradas.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

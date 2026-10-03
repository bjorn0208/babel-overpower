// Oferta da mentoria — o "Quero saber mais" da conta de apresentação.
// Botão discreto no canto → confete + bordas pulsantes + cronômetro de 17min
// (condição válida só nesta call) + planos REAIS da Loja + contrato real
// (Pix/link no trilho do app Contratos). Quando o mentor valida o pagamento
// (confirmar_ativacao), a conta vira definitiva: celebração + agendamento da
// implementação + entrada no sistema próprio.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck, FileSignature, PartyPopper, Timer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { explodirConfete } from "./confete";

type Plano = { id: string; nome: string; preco_mensal: number; max_conversas: number | null };
type Implantacao = { id: string; nome: string; preco: number };
type Modo = "botao" | "oferta" | "ativada" | "agendado";

const CHAVE_CRONO = "mentoria-oferta-inicio";
const DURACAO_S = 17 * 60;
const HORARIOS = ["09:00", "10:30", "14:00", "15:30", "17:00"];

function reais(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function proximosDiasUteis(qtd: number): Date[] {
  const dias: Date[] = [];
  const d = new Date();
  while (dias.length < qtd) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) dias.push(new Date(d));
  }
  return dias;
}

export default function OfertaMentoria({ userId, metadataInicial }: { userId: string; metadataInicial: Record<string, unknown> }) {
  const [modo, setModo] = useState<Modo>("botao");
  const [restante, setRestante] = useState(DURACAO_S);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [implantacao, setImplantacao] = useState<Implantacao | null>(null);
  const [planoSel, setPlanoSel] = useState("");
  const [contratoUrl, setContratoUrl] = useState(String(metadataInicial.contrato_url ?? ""));
  const [diaSel, setDiaSel] = useState<Date | null>(null);
  const [horaSel, setHoraSel] = useState("");
  const [salvandoAgenda, setSalvandoAgenda] = useState(false);
  const metaRef = useRef(metadataInicial);

  // Planos e implantação reais da Loja (RLS: authenticated lê os ativos).
  useEffect(() => {
    (async () => {
      const [{ data: pl }, { data: impl }] = await Promise.all([
        supabase.from("loja_planos").select("id, nome, preco_mensal, max_conversas").eq("is_active", true).order("ordem"),
        supabase.from("loja_implantacao").select("id, nome, preco").eq("is_active", true).limit(1).maybeSingle(),
      ]);
      setPlanos((pl ?? []) as Plano[]);
      if (impl) setImplantacao(impl as Implantacao);
      if (pl?.length) setPlanoSel(pl[0].id);
    })();
  }, []);

  // Vigia da virada: mentor validou o pagamento → conta ativa → celebração.
  // Também pega o contrato gerado no meio da call (metadata.contrato_url).
  useEffect(() => {
    if (modo === "agendado") return;
    const t = setInterval(async () => {
      const { data: p } = await supabase.from("profiles")
        .select("account_status, metadata").eq("id", userId).maybeSingle();
      if (!p) return;
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      metaRef.current = meta;
      if (meta.contrato_url) setContratoUrl(String(meta.contrato_url));
      if (p.account_status === "ativo") {
        setModo((m) => {
          if (m === "ativada" || m === "agendado") return m;
          explodirConfete();
          return "ativada";
        });
      }
    }, 8000);
    return () => clearInterval(t);
  }, [userId, modo]);

  // Cronômetro persistente na sessão: F5 não zera a condição.
  useEffect(() => {
    if (modo !== "oferta") return;
    const tick = () => {
      const inicio = Number(sessionStorage.getItem(CHAVE_CRONO) || Date.now());
      setRestante(Math.max(0, DURACAO_S - Math.floor((Date.now() - inicio) / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [modo]);

  const abrirOferta = () => {
    if (!sessionStorage.getItem(CHAVE_CRONO)) sessionStorage.setItem(CHAVE_CRONO, String(Date.now()));
    explodirConfete();
    setModo("oferta");
  };

  const agendarImplementacao = async () => {
    if (!diaSel || !horaSel) return;
    setSalvandoAgenda(true);
    const data = diaSel.toISOString().slice(0, 10);
    // RELÊ metadata FRESH e faz MERGE antes de escrever. metaRef é um snapshot que
    // pode estar velho: o poll e a escrita do mentor (contrato_url / diagnostico_
    // digital) mexem no mesmo JSONB — gravar por cima do snapshot antigo apagaria
    // as chaves que esses processos cravaram nesse meio-tempo.
    const { data: pAtual } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle();
    const metaAtual = (pAtual?.metadata ?? metaRef.current ?? {}) as Record<string, unknown>;
    await supabase.from("profiles").update({
      metadata: { ...metaAtual, implementacao_agendada: { data, hora: horaSel } },
    }).eq("id", userId);
    metaRef.current = { ...metaAtual, implementacao_agendada: { data, hora: horaSel } };
    setSalvandoAgenda(false);
    setModo("agendado");
  };

  const mm = String(Math.floor(restante / 60)).padStart(2, "0");
  const ss = String(restante % 60).padStart(2, "0");
  const alerta = restante < 120;
  const total = (planos.find((p) => p.id === planoSel)?.preco_mensal ?? 0) + (implantacao?.preco ?? 0);

  return (
    <>
      {/* botão discreto — canto de quem terminou de olhar a tela */}
      {modo === "botao" && (
        <button
          onClick={abrirOferta}
          className="os-vidro"
          style={{
            position: "fixed", right: 16, bottom: 88, zIndex: 9100, borderRadius: 999,
            padding: "9px 18px", fontSize: 12, color: "var(--txt-2)", cursor: "pointer",
          }}
        >
          Quero saber mais
        </button>
      )}

      {/* bordas pulsando roxo → dourado → vermelho → azul */}
      {modo === "oferta" && (
        <motion.div
          style={{ position: "fixed", inset: 0, zIndex: 9050, pointerEvents: "none", border: "3px solid" }}
          animate={{
            borderColor: ["#8b5cf6", "#d9a83f", "#ff4d5a", "#4fa8e8", "#8b5cf6"],
            boxShadow: [
              "inset 0 0 110px rgba(139,92,246,.30)", "inset 0 0 110px rgba(217,168,63,.30)",
              "inset 0 0 110px rgba(255,77,90,.30)", "inset 0 0 110px rgba(79,168,232,.30)",
              "inset 0 0 110px rgba(139,92,246,.30)",
            ],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
      )}

      <AnimatePresence>
        {modo === "oferta" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 9060, background: "rgba(8,8,16,.55)", backdropFilter: "blur(8px)", overflowY: "auto", padding: "72px 16px 40px" }}
          >
            {/* cronômetro da condição */}
            <div className="os-vidro-forte" style={{ position: "fixed", top: 14, right: 16, zIndex: 9070, display: "flex", alignItems: "center", gap: 10, borderRadius: 16, padding: "7px 16px" }}>
              <Timer size={15} style={{ color: alerta ? "var(--os-erro)" : "var(--txt-3)" }} />
              <small style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".13em", color: "var(--txt-3)", lineHeight: 1.3, textAlign: "right" }}>
                condição válida<br />nesta call
              </small>
              <b style={{ fontSize: 22, fontVariantNumeric: "tabular-nums", color: alerta ? "var(--os-erro)" : "var(--txt-1)" }}>{mm}:{ss}</b>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="os-vidro-forte"
              style={{ maxWidth: 680, margin: "0 auto", borderRadius: 18, padding: "26px 28px", position: "relative" }}
            >
              <button onClick={() => setModo("botao")} className="btn btn-ghost btn-icon" title="Voltar pro sistema"
                style={{ position: "absolute", top: 14, right: 14 }}>
                <X size={15} />
              </button>

              <h1 style={{ fontSize: "clamp(21px, 3vw, 27px)", color: "var(--txt-1)", margin: "0 0 6px", letterSpacing: "-.015em", textAlign: "center" }}>
                Tudo que você acabou de ver funcionando <span className="os-aurora-text">na sua empresa</span>
              </h1>
              <p style={{ color: "var(--txt-3)", fontSize: 13, textAlign: "center", margin: "0 0 20px" }}>
                O sistema já conhece seu negócio. Fechando nesta call, ele não desliga mais.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {planos.map((p) => {
                  const marcado = p.id === planoSel;
                  return (
                    <button key={p.id} onClick={() => setPlanoSel(p.id)} className={marcado ? "os-vidro-forte" : "os-vidro"}
                      style={{
                        borderRadius: 14, padding: "14px 15px", textAlign: "left", cursor: "pointer",
                        border: marcado ? "1px solid var(--os-acento-2)" : "1px solid var(--os-vidro-borda)",
                      }}>
                      <b style={{ display: "block", color: "var(--txt-1)", fontSize: 13, marginBottom: 2 }}>{p.nome}</b>
                      <span style={{ fontSize: 19, fontWeight: 700, color: "var(--txt-1)" }}>
                        {reais(p.preco_mensal)}<small style={{ fontSize: 11, color: "var(--txt-3)", fontWeight: 400 }}>/mês</small>
                      </span>
                      {p.max_conversas ? (
                        <p style={{ fontSize: 11, color: "var(--txt-3)", margin: "6px 0 0" }}>até {p.max_conversas} conversas por mês</p>
                      ) : null}
                    </button>
                  );
                })}
                {!planos.length && <p style={{ color: "var(--txt-3)", fontSize: 13, gridColumn: "1 / -1", textAlign: "center" }}>Carregando os planos…</p>}
              </div>

              {implantacao && (
                <div className="os-vidro" style={{ borderRadius: 12, padding: "11px 14px", marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--txt-2)" }}>{implantacao.nome} — a equipe monta tudo com você</span>
                  <b style={{ color: "var(--txt-1)", fontSize: 15 }}>{reais(implantacao.preco)} <small style={{ color: "var(--txt-3)", fontWeight: 400 }}>única vez</small></b>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "16px 2px 0" }}>
                <span style={{ fontSize: 12, color: "var(--txt-3)" }}>Hoje, pra começar</span>
                <b style={{ fontSize: 26, color: "var(--txt-1)", fontVariantNumeric: "tabular-nums" }}>{reais(total)}</b>
              </div>

              {contratoUrl ? (
                <a href={contratoUrl} target="_blank" rel="noreferrer" className="btn btn-primary"
                  style={{ width: "100%", marginTop: 14, padding: "14px", fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none" }}>
                  <FileSignature size={16} /> Assinar e pagar agora (Pix ou link)
                </a>
              ) : (
                <div className="os-vidro" style={{ borderRadius: 12, padding: "13px 16px", marginTop: 14, textAlign: "center", fontSize: 13, color: "var(--txt-2)" }}>
                  Fala pro mentor: <b style={{ color: "var(--txt-1)" }}>"quero fechar"</b> — o contrato chega aqui em segundos.
                </div>
              )}
              <p style={{ textAlign: "center", color: "var(--txt-4)", fontSize: 11, margin: "10px 0 0" }}>
                Assinatura digital + Pix no contrato · o mentor confirma o pagamento ao vivo, nesta call.
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* virada: pagamento validado → conta definitiva */}
        {(modo === "ativada" || modo === "agendado") && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ position: "fixed", inset: 0, zIndex: 9080, background: "rgba(8,8,16,.6)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 16, overflowY: "auto" }}
          >
            <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              className="os-vidro-forte" style={{ maxWidth: 560, width: "100%", borderRadius: 20, padding: "26px 28px", textAlign: "center" }}>
              <div className="os-aurora-bg" style={{ width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
                <PartyPopper size={26} style={{ color: "#fff" }} />
              </div>

              {modo === "ativada" ? (
                <>
                  <h1 style={{ fontSize: 20, color: "var(--txt-1)", margin: "0 0 4px" }}>Sistema seu. Pra sempre ligado.</h1>
                  <p style={{ color: "var(--txt-3)", fontSize: 13, margin: "0 0 18px" }}>
                    Agora escolhe o melhor horário pra call de implementação — a equipe monta tudo com você.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
                    {proximosDiasUteis(8).map((d) => {
                      const marcado = diaSel?.toDateString() === d.toDateString();
                      return (
                        <button key={d.toISOString()} onClick={() => setDiaSel(d)} className={marcado ? "os-aurora-bg" : "os-vidro"}
                          style={{ borderRadius: 10, padding: "9px 4px", cursor: "pointer", border: "1px solid var(--os-vidro-borda)", color: marcado ? "#fff" : "var(--txt-1)", fontSize: 12, fontVariantNumeric: "tabular-nums", fontWeight: marcado ? 700 : 400 }}>
                          {d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}<br />{d.getDate()}/{d.getMonth() + 1}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
                    {HORARIOS.map((h) => (
                      <button key={h} onClick={() => setHoraSel(h)} className={horaSel === h ? "os-aurora-bg" : "os-vidro"}
                        style={{ borderRadius: 10, padding: "9px 16px", cursor: "pointer", border: "1px solid var(--os-vidro-borda)", color: horaSel === h ? "#fff" : "var(--txt-1)", fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: horaSel === h ? 700 : 400 }}>
                        {h}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-primary" disabled={!diaSel || !horaSel || salvandoAgenda} onClick={agendarImplementacao}
                    style={{ width: "100%", padding: 13, fontSize: 14, opacity: !diaSel || !horaSel || salvandoAgenda ? 0.5 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <CalendarCheck size={16} /> {salvandoAgenda ? "Agendando…" : "Agendar implementação"}
                  </button>
                </>
              ) : (
                <>
                  <h1 style={{ fontSize: 20, color: "var(--txt-1)", margin: "0 0 4px" }}>Implementação agendada.</h1>
                  <p style={{ color: "var(--txt-3)", fontSize: 13, margin: "0 0 18px" }}>
                    {diaSel?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} às {horaSel}.
                    A equipe confirma no seu WhatsApp. O sistema já é todo seu.
                  </p>
                  <button className="btn btn-primary" onClick={() => location.reload()} style={{ width: "100%", padding: 13, fontSize: 14 }}>
                    Entrar no meu sistema
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

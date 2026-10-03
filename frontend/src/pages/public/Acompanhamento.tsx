/**
 * Página pública de acompanhamento do serviço do cliente — pedaço 2/3
 * (2026-05-16). URL: /acompanhamento/:token (token = leads.chave_rastreamento).
 *
 * Lógica portada do frontend antigo; visual espelha o padrão de página pública
 * novo (`pages/public/Contrato.tsx`): light mode mobile-first (cliente na rua),
 * fundo editorial aurora, cartão branco, motion ease-out. Gate G4 — copia o
 * padrão existente, não inventa estilo.
 */
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Circle, ExternalLink,
  FileSignature, FileText, Loader2, MapPin, Phone, Timer,
} from "lucide-react";
import { useAcompanhamento } from "./use-acompanhamento";
import { urlContrato } from "@/lib/url-app";

const COR_ACENTO = "#0ea5e9";

export default function AcompanhamentoPublico() {
  const { token } = useParams<{ token: string }>();
  const ac = useAcompanhamento(token);

  if (ac.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fafafa" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: COR_ACENTO }} />
      </div>
    );
  }

  if (ac.error) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fafafa", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <AlertCircle size={40} style={{ color: "#a1a1aa", margin: "0 auto 12px" }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181b", marginBottom: 8 }}>Link inválido ou expirado</h1>
          <p style={{ fontSize: 14, color: "#71717a", lineHeight: 1.6 }}>Confira o link com seu prestador de serviço.</p>
        </div>
      </div>
    );
  }

  const { empresa, flow } = ac;

  return (
    <div style={estilos.pagina}>
      <FundoEditorial />
      {empresa?.banner_url && (
        <div style={{ height: 160, width: "100%", overflow: "hidden", position: "relative", zIndex: 1 }}>
          <img src={empresa.banner_url} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} />
        </div>
      )}
      <header style={estilos.cabecalho}>
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {empresa?.logo_url ? (
            <img src={empresa.logo_url} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover", boxShadow: `0 4px 16px ${COR_ACENTO}25` }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg, ${COR_ACENTO}, #7c3aed)`, display: "grid", placeItems: "center", color: "white", fontWeight: 700, fontSize: 20 }}>
              {(empresa?.nome || "?").charAt(0)}
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, color: "#71717a", letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600 }}>Acompanhamento do serviço</div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#18181b", margin: 0 }}>{empresa?.nome || "Seu prestador"}</h1>
            {(empresa?.cidade || empresa?.estado) && (
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#71717a", display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={11} />{[empresa?.cidade, empresa?.estado].filter(Boolean).join(" - ")}
              </p>
            )}
          </div>
        </motion.div>
        {empresa?.whatsapp && (
          <a href={`https://wa.me/${empresa.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#16a34a", textDecoration: "none" }}>
            <Phone size={13} />{empresa.whatsapp}
          </a>
        )}
      </header>

      <main style={estilos.container}>
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} style={estilos.cartao}>
          <p style={{ fontSize: 19, fontWeight: 700, color: "#18181b", margin: 0 }}>{ac.leadName}</p>
          <p style={{ marginTop: 4, fontSize: 14, color: "#52525b" }}>Serviço: <strong style={{ color: "#18181b" }}>{ac.produto || "—"}</strong></p>
          {ac.convertedAt && (
            <p style={{ marginTop: 6, fontSize: 12, color: "#71717a" }}>Início: <strong style={{ color: "#18181b" }}>{new Date(ac.convertedAt).toLocaleDateString("pt-BR")}</strong></p>
          )}
          {ac.days !== null && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, background: `${ac.timerColor}14` }}>
              {ac.isLate ? <AlertTriangle size={20} style={{ color: ac.timerColor }} /> : <Timer size={20} style={{ color: ac.timerColor }} />}
              <div>
                <span style={{ fontSize: 17, fontWeight: 700, color: ac.timerColor }}>{ac.days} {ac.days === 1 ? "dia" : "dias"}</span>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: ac.timerColor }}>{ac.timerLabel}</p>
              </div>
            </div>
          )}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "#71717a" }}>Progresso geral</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: COR_ACENTO }}>{ac.progressPct}%</span>
            </div>
            <div style={{ height: 8, width: "100%", borderRadius: 999, background: "#e4e4e7", overflow: "hidden" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${ac.progressPct}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${COR_ACENTO}, #7c3aed)` }} />
            </div>
          </div>
        </motion.section>

        {!flow ? (
          <p style={{ ...estilos.aviso }}>O painel de etapas ainda não foi configurado para o serviço <strong>{ac.produto || "—"}</strong>. Fale com seu prestador.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {flow.stages.map((stage, idx) => {
              const done = stage.checkpoints.filter((cp) => ac.checkpoints[cp.id]);
              const completa = stage.checkpoints.length > 0 && done.length === stage.checkpoints.length;
              const atual = stage.id === ac.faseCliente;
              const idxAtual = flow.stages.findIndex((s) => s.id === ac.faseCliente);
              const passada = idxAtual >= 0 && idx < idxAtual;
              return (
                <div key={stage.id} style={{ ...estilos.cartao, padding: 18, border: atual ? `1px solid ${COR_ACENTO}` : "1px solid #e4e4e7" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, color: "white", background: completa || passada ? "#16a34a" : atual ? COR_ACENTO : "#d4d4d8" }}>
                      {completa || passada ? <CheckCircle2 size={16} /> : idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: atual ? COR_ACENTO : "#18181b" }}>{stage.label}</p>
                      {stage.checkpoints.length > 0 && (
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#71717a" }}>{done.length}/{stage.checkpoints.length} concluídos</p>
                      )}
                    </div>
                  </div>
                  {stage.checkpoints.length > 0 && (atual || done.length > 0 || completa) && (
                    <div style={{ marginLeft: 42, marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      {stage.checkpoints.map((cp) => (
                        <button key={cp.id} type="button" onClick={() => ac.alternarCheckpoint(cp.id)} disabled={ac.toggling === cp.id}
                          style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: 2, cursor: "pointer", textAlign: "left", opacity: ac.toggling === cp.id ? 0.5 : 1 }}>
                          {ac.checkpoints[cp.id] ? <CheckCircle2 size={16} style={{ color: "#16a34a", flexShrink: 0 }} /> : <Circle size={16} style={{ color: "#d4d4d8", flexShrink: 0 }} />}
                          <span style={{ fontSize: 13, color: ac.checkpoints[cp.id] ? "#a1a1aa" : "#52525b", textDecoration: ac.checkpoints[cp.id] ? "line-through" : "none" }}>{cp.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {ac.contrato && (
          <a href={urlContrato(ac.contrato.chave_publica)} target="_blank" rel="noopener noreferrer"
            style={{ ...estilos.cartao, marginTop: 16, display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", background: `${COR_ACENTO}15` }}>
              <FileSignature size={16} style={{ color: COR_ACENTO }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#18181b" }}>
                {ac.contrato.status === "assinado" || ac.contrato.status === "signed" ? "Contrato assinado" : "Contrato — abrir"}
              </p>
              {ac.contrato.assinado_em && (
                <p style={{ margin: 0, fontSize: 11, color: "#71717a" }}>Assinado em {new Date(ac.contrato.assinado_em).toLocaleDateString("pt-BR")}</p>
              )}
            </div>
            <ExternalLink size={15} style={{ color: "#a1a1aa" }} />
          </a>
        )}

        {ac.documentos.length > 0 && (
          <div style={{ ...estilos.cartao, marginTop: 16 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#18181b" }}>Documentos</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ac.documentos.map((doc) => (
                <a key={doc.id} href={ac.urlDocumento(doc.file_path)} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, border: "1px solid #e4e4e7", textDecoration: "none" }}>
                  <FileText size={18} style={{ color: "#71717a", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "#18181b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.label || doc.file_name}</span>
                  <ExternalLink size={14} style={{ color: "#a1a1aa", flexShrink: 0 }} />
                </a>
              ))}
            </div>
          </div>
        )}

        {empresa && (empresa.instagram || empresa.site) && (
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {empresa.instagram && (
              <a href={empresa.instagram.startsWith("http") ? empresa.instagram : `https://instagram.com/${empresa.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer"
                style={{ ...estilos.linkContato }}>Instagram</a>
            )}
            {empresa.site && (
              <a href={empresa.site.startsWith("http") ? empresa.site : `https://${empresa.site}`} target="_blank" rel="noopener noreferrer"
                style={{ ...estilos.linkContato }}>Site</a>
            )}
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 11, color: "#a1a1aa", marginTop: 24 }}>Atualizado automaticamente pelo seu prestador de serviço.</p>
      </main>
    </div>
  );
}

function FundoEditorial() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -200, right: -100, width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${COR_ACENTO}15, transparent 70%)`, filter: "blur(40px)" }} />
      <div style={{ position: "absolute", bottom: -300, left: -150, width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, #7c3aed10, transparent 70%)", filter: "blur(60px)" }} />
    </div>
  );
}

const estilos: Record<string, React.CSSProperties> = {
  pagina: { minHeight: "100vh", background: "#fafafa", color: "#18181b", position: "relative", overflowX: "hidden", fontFamily: "'Inter', system-ui, sans-serif" },
  cabecalho: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "22px 24px", maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 1 },
  container: { maxWidth: 640, margin: "0 auto", padding: "8px 20px 60px", position: "relative", zIndex: 1 },
  cartao: { background: "white", borderRadius: 18, padding: "22px 20px", border: "1px solid #e4e4e7", boxShadow: "0 12px 40px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)" },
  aviso: { marginTop: 16, padding: 18, borderRadius: 14, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 13, color: "#92400e", lineHeight: 1.6 },
  linkContato: { flex: 1, textAlign: "center", padding: "10px 14px", borderRadius: 10, border: "1px solid #e4e4e7", background: "white", fontSize: 13, fontWeight: 600, color: COR_ACENTO, textDecoration: "none" },
};

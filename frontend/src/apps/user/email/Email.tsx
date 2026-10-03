/**
 * App E-mail — caixa própria da empresa (fase visual).
 *
 * Três colunas: pastas + endereço próprio · lista de mensagens · leitura.
 * Botão Escrever abre o composer. Dados demo — a caixa real entra quando
 * o domínio próprio do tenant for conectado ao provedor de e-mail.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/bundle/bundle-shared";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { MENSAGENS_DEMO, PASTAS_DEMO, type Mensagem } from "./dados-demo";

const BORDA = "1px solid oklch(0.98 0 0 / 0.08)";

export function AppEmail() {
  const [pasta, setPasta] = useState("entrada");
  const [lidas, setLidas] = useState<Set<string>>(() => new Set());
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [escrevendo, setEscrevendo] = useState(false);

  const mensagens = useMemo(() => MENSAGENS_DEMO.filter((m) => m.pasta === pasta), [pasta]);
  const aberta: Mensagem | null = mensagens.find((m) => m.id === abertaId) ?? null;

  const abrir = (m: Mensagem) => {
    setAbertaId(m.id);
    setLidas((s) => new Set(s).add(m.id));
  };

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" style={{ display: "flex", height: "100%", position: "relative" }}>
      {/* Coluna 1 — pastas */}
      <aside style={{ width: 208, flexShrink: 0, borderRight: BORDA, padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={() => setEscrevendo(true)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "10px 12px", marginBottom: 10, borderRadius: 11, border: "none", cursor: "pointer",
            fontSize: 12.5, fontWeight: 700, color: "oklch(0.98 0 0)",
            background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.35), oklch(0.65 0.22 280 / 0.28))",
          }}
        >
          <Icon name="edit" size={15} /> Escrever
        </motion.button>

        {PASTAS_DEMO.map((p) => {
          const ativa = pasta === p.id;
          const pendentes = p.id === "entrada"
            ? MENSAGENS_DEMO.filter((m) => m.pasta === "entrada" && m.naoLida && !lidas.has(m.id)).length
            : p.naoLidos;
          return (
            <motion.button
              key={p.id}
              type="button"
              whileTap={tapPress}
              onClick={() => { setPasta(p.id); setAbertaId(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                borderRadius: 9, border: "none", cursor: "pointer", textAlign: "left",
                fontSize: 12.5, fontWeight: ativa ? 600 : 500,
                color: ativa ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.6)",
                background: ativa ? "oklch(0.98 0 0 / 0.07)" : "transparent",
              }}
            >
              <span style={{ flex: 1 }}>{p.nome}</span>
              {pendentes > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, color: "oklch(0.98 0 0)", background: "oklch(0.7 0.18 220 / 0.35)" }}>
                  {pendentes}
                </span>
              )}
            </motion.button>
          );
        })}

        <div style={{ marginTop: "auto", padding: "10px 10px 2px", borderTop: BORDA }}>
          <div style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.45)", marginBottom: 3 }}>Sua caixa</div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.9 0.05 220)", wordBreak: "break-all" }}>voce@suaempresa.com.br</div>
          <div style={{ fontSize: 10, color: "oklch(0.72 0.18 145)", marginTop: 4, fontWeight: 700 }}>● Domínio próprio</div>
        </div>
      </aside>

      {/* Coluna 2 — lista */}
      <section style={{ width: 320, flexShrink: 0, borderRight: BORDA, overflowY: "auto" }}>
        {mensagens.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center", fontSize: 12.5, color: "oklch(0.98 0 0 / 0.45)" }}>
            Nada por aqui ainda.
          </div>
        )}
        {mensagens.map((m) => {
          const naoLida = m.naoLida && !lidas.has(m.id);
          const ativa = abertaId === m.id;
          return (
            <motion.button
              key={m.id}
              type="button"
              whileTap={tapPress}
              onClick={() => abrir(m)}
              style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                padding: "13px 16px", border: "none", borderBottom: BORDA,
                background: ativa ? "oklch(0.7 0.18 220 / 0.09)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                {naoLida && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "oklch(0.7 0.18 220)", flexShrink: 0 }} />}
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: naoLida ? 700 : 500, color: "oklch(0.98 0 0 / 0.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.remetente}
                </span>
                <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.45)", fontVariantNumeric: "tabular-nums" }}>{m.hora}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: naoLida ? 600 : 500, color: "oklch(0.98 0 0 / 0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.assunto}
              </div>
              <div style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.5)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.previa}
              </div>
            </motion.button>
          );
        })}
      </section>

      {/* Coluna 3 — leitura */}
      <section style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {!aberta ? (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: "oklch(0.98 0 0 / 0.4)" }}>
            <div style={{ textAlign: "center" }}>
              <Icon name="send" size={34} />
              <div style={{ fontSize: 12.5, marginTop: 10 }}>Escolha uma mensagem pra ler.</div>
            </div>
          </div>
        ) : (
          <motion.article key={aberta.id} variants={fadeSlideIn} initial="hidden" animate="visible">
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "oklch(0.98 0 0)", margin: 0 }}>{aberta.assunto}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 20px", paddingBottom: 14, borderBottom: BORDA }}>
              <span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: "50%", fontSize: 13, fontWeight: 700, color: "oklch(0.95 0.03 220)", background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.28), oklch(0.65 0.22 280 / 0.2))" }}>
                {aberta.remetente[0]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.98 0 0 / 0.92)" }}>{aberta.remetente}</div>
                <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)" }}>{aberta.de} · {aberta.hora}</div>
              </div>
              <motion.button type="button" whileTap={tapPress} onClick={() => setEscrevendo(true)} style={{ padding: "7px 14px", fontSize: 11.5, fontWeight: 600, borderRadius: 9, border: BORDA, background: "oklch(0.98 0 0 / 0.05)", color: "oklch(0.98 0 0 / 0.85)", cursor: "pointer" }}>
                Responder
              </motion.button>
            </div>
            {aberta.corpo.map((p, i) => (
              <p key={i} style={{ fontSize: 13, lineHeight: 1.65, color: "oklch(0.98 0 0 / 0.82)", margin: "0 0 12px" }}>{p}</p>
            ))}
          </motion.article>
        )}
      </section>

      {/* Composer */}
      <AnimatePresence>
        {escrevendo && (
          <motion.div
            initial={{ opacity: 0, transform: "translateY(16px) scale(0.98)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transform: "translateY(16px) scale(0.98)" }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            style={{
              position: "absolute", right: 18, bottom: 18, width: 440, maxWidth: "calc(100% - 36px)",
              borderRadius: 16, border: "1px solid oklch(0.98 0 0 / 0.12)", overflow: "hidden",
              background: "oklch(0.22 0.02 265 / 0.92)", backdropFilter: "blur(18px) saturate(140%)",
              boxShadow: "0 18px 48px oklch(0 0 0 / 0.45)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", padding: "11px 16px", borderBottom: BORDA }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "oklch(0.98 0 0)" }}>Nova mensagem</span>
              <motion.button type="button" whileTap={tapPress} onClick={() => setEscrevendo(false)} aria-label="Fechar" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "oklch(0.98 0 0 / 0.6)", cursor: "pointer", padding: 4 }}>
                <Icon name="x" size={15} />
              </motion.button>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <input placeholder="Para" style={{ padding: "9px 12px", fontSize: 12.5, borderRadius: 9, border: BORDA, background: "oklch(0.98 0 0 / 0.04)", color: "oklch(0.98 0 0)", outline: "none" }} />
              <input placeholder="Assunto" style={{ padding: "9px 12px", fontSize: 12.5, borderRadius: 9, border: BORDA, background: "oklch(0.98 0 0 / 0.04)", color: "oklch(0.98 0 0)", outline: "none" }} />
              <textarea placeholder="Escreva sua mensagem…" rows={6} style={{ padding: "10px 12px", fontSize: 12.5, lineHeight: 1.6, borderRadius: 9, border: BORDA, background: "oklch(0.98 0 0 / 0.04)", color: "oklch(0.98 0 0)", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <motion.button type="button" whileTap={tapPress} onClick={() => setEscrevendo(false)} style={{ padding: "9px 20px", fontSize: 12.5, fontWeight: 700, borderRadius: 10, border: "none", cursor: "pointer", color: "oklch(0.98 0 0)", background: "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.35), oklch(0.65 0.22 280 / 0.28))" }}>
                  Enviar
                </motion.button>
                <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.45)" }}>Demonstração — envio real com o domínio conectado.</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default AppEmail;

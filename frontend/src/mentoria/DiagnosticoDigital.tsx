// Diagnóstico Digital — primeira cena da conta de apresentação.
// Retrato da empresa levantado pelo BabelPhone (dossiê via ponte) renderizado
// com a identidade REAL do OS (bundle.css global: wallpaper, os-vidro, tokens).
// O lead vê o que a Babel já sabe; dor/meta/observações são completadas na call.
import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";

type Diag = Record<string, unknown>;
export type RespostasDiagnostico = { dor: string; desejo: string; observacoes: string };

function txt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" · ");
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${txt(x)}`).join(" · ");
  return String(v);
}

// Só o que pode ser mostrado ao lead — nada de gancho/temperatura/objeções.
const CARTOES: { chave: string; rotulo: string; vazio?: string }[] = [
  { chave: "avaliacao_google", rotulo: "Nota no Google" },
  { chave: "instagram", rotulo: "Instagram" },
  { chave: "instagram_seguidores", rotulo: "Seguidores" },
  { chave: "site", rotulo: "Site próprio", vazio: "não identificado" },
  { chave: "google_meu_negocio", rotulo: "Google Meu Negócio" },
  { chave: "reclame_aqui", rotulo: "Reclame Aqui" },
  { chave: "sistema_atual", rotulo: "Sistema de atendimento", vazio: "nenhum detectado" },
  { chave: "ferramentas_atuais", rotulo: "Ferramentas em uso" },
  { chave: "como_atendem", rotulo: "Como atendem hoje" },
  { chave: "razao_social", rotulo: "Razão social" },
  { chave: "cnpj", rotulo: "CNPJ" },
  { chave: "situacao_cadastral", rotulo: "Situação cadastral" },
];

const VOZES: { chave: string; rotulo: string; boa: boolean }[] = [
  { chave: "elogios", rotulo: "O que elogiam", boa: true },
  { chave: "melhores_avaliacoes", rotulo: "Melhores avaliações", boa: true },
  { chave: "reclamacoes", rotulo: "O que reclamam", boa: false },
];

const campo: React.CSSProperties = {
  width: "100%", background: "rgba(0,0,0,.25)", border: "1px solid var(--os-vidro-borda)",
  borderRadius: 10, color: "var(--txt-1)", fontSize: 13, padding: "9px 12px",
  fontFamily: "inherit", resize: "vertical",
};
const rotuloCampo: React.CSSProperties = {
  display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: ".11em",
  color: "var(--txt-3)", fontWeight: 600, margin: "12px 0 4px",
};

export default function DiagnosticoDigital({
  empresaNome,
  nomeLead,
  diagnostico,
  salvando,
  erro,
  aoConcluir,
}: {
  empresaNome: string;
  nomeLead: string;
  diagnostico: Diag;
  salvando: boolean;
  erro: string;
  aoConcluir: (r: RespostasDiagnostico) => void;
}) {
  const [dor, setDor] = useState(txt(diagnostico.dor));
  const [desejo, setDesejo] = useState(txt(diagnostico.desejo));
  const [observacoes, setObservacoes] = useState("");

  const cartoes = CARTOES
    .map((c) => ({ ...c, valor: txt(diagnostico[c.chave]) || c.vazio || "" }))
    .filter((c) => c.valor);
  const vozes = VOZES
    .map((v) => ({ ...v, valor: txt(diagnostico[v.chave]) }))
    .filter((v) => v.valor);
  const temLevantamento = cartoes.length > 0 || !!txt(diagnostico.resumo);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="os-vidro-forte"
      style={{
        maxWidth: 860, margin: "0 auto", borderRadius: 16, overflow: "hidden",
        boxShadow: "0 30px 90px rgba(0,0,0,.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--os-vidro-borda)" }}>
        <Sparkles size={14} style={{ color: "var(--os-acento-2)" }} />
        <span style={{ fontSize: 12, color: "var(--txt-3)" }}>Diagnóstico Digital · Babel</span>
      </div>

      <div style={{ padding: "20px 22px 22px", maxHeight: "calc(100vh - 170px)", overflowY: "auto" }}>
        <h1 style={{ fontSize: "clamp(20px, 3vw, 26px)", color: "var(--txt-1)", margin: 0, letterSpacing: "-.01em" }}>
          {empresaNome}
        </h1>
        <p style={{ color: "var(--txt-3)", fontSize: 13, margin: "6px 0 18px", maxWidth: "70ch", lineHeight: 1.55 }}>
          {nomeLead ? `${nomeLead}, isso` : "Isso"} é o que qualquer cliente encontra hoje ao procurar por você.
          Nada aqui é opinião: foi levantado de fontes públicas antes desta conversa.
        </p>

        {txt(diagnostico.resumo) && (
          <p className="os-vidro" style={{ borderRadius: 13, padding: "12px 15px", fontSize: 13, lineHeight: 1.6, color: "var(--txt-2)", margin: "0 0 14px" }}>
            {txt(diagnostico.resumo)}
          </p>
        )}

        {!temLevantamento && (
          <p className="os-vidro" style={{ borderRadius: 13, padding: "14px 16px", fontSize: 13, color: "var(--txt-3)", margin: "0 0 14px", textAlign: "center" }}>
            O levantamento da sua empresa está chegando — o mentor acabou de enviar.
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 6 }}>
          {cartoes.map((c, i) => (
            <motion.div
              key={c.chave}
              className="os-vidro"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07, duration: 0.4 }}
              style={{ borderRadius: 13, padding: "11px 14px" }}
            >
              <b style={{ display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: ".11em", color: "var(--txt-4)", fontWeight: 600, marginBottom: 4 }}>
                {c.rotulo}
              </b>
              <span style={{ fontSize: 13.5, color: c.valor === c.vazio ? "var(--os-aviso)" : "var(--txt-1)", lineHeight: 1.4 }}>
                {c.valor}
              </span>
            </motion.div>
          ))}
        </div>

        {vozes.length > 0 && (
          <>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--txt-3)", fontWeight: 700, margin: "18px 0 10px" }}>
              A voz dos seus clientes
            </p>
            {vozes.map((v) => (
              <div key={v.chave} className="os-vidro" style={{ borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 8, display: "flex", gap: 10, alignItems: "baseline" }}>
                <b style={{ color: v.boa ? "var(--os-sucesso)" : "var(--os-aviso)", fontSize: 11, flexShrink: 0, fontWeight: 700 }}>{v.rotulo}</b>
                <span style={{ color: "var(--txt-2)", lineHeight: 1.5 }}>{v.valor}</span>
              </div>
            ))}
          </>
        )}

        {txt(diagnostico.diagnostico) && (
          <div style={{ border: "1px solid var(--os-acento-2-soft)", background: "var(--os-acento-2-soft)", borderRadius: 14, padding: "13px 16px", marginTop: 16 }}>
            <b style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".13em", color: "var(--os-acento-2)", fontWeight: 700 }}>
              Onde a Babel entra
            </b>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--txt-1)", margin: "6px 0 0" }}>{txt(diagnostico.diagnostico)}</p>
          </div>
        )}

        <div style={{ border: "1px dashed var(--os-vidro-borda-forte)", borderRadius: 14, padding: "14px 16px 16px", marginTop: 16 }}>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--os-aviso)", fontWeight: 700, margin: 0 }}>
            Levantado nesta conversa
          </p>
          <label style={rotuloCampo} htmlFor="diagDor">O que mais pesa hoje na operação</label>
          <input id="diagDor" style={campo} value={dor} onChange={(e) => setDor(e.target.value)}
            placeholder="ex.: cliente esperando resposta, equipe sobrecarregada…" />
          <label style={rotuloCampo} htmlFor="diagMeta">Onde você quer chegar</label>
          <input id="diagMeta" style={campo} value={desejo} onChange={(e) => setDesejo(e.target.value)}
            placeholder="ex.: dobrar agendamentos, atender 24h sem contratar…" />
          <label style={rotuloCampo} htmlFor="diagObs">Observações da conversa</label>
          <textarea id="diagObs" rows={2} style={campo} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
            placeholder="contexto, decisores, o que ficou combinado…" />
        </div>

        {erro && <p style={{ color: "var(--os-erro)", fontSize: 13, margin: "10px 0 0" }}>{erro}</p>}

        <button
          className="btn btn-primary"
          disabled={salvando}
          onClick={() => aoConcluir({ dor: dor.trim(), desejo: desejo.trim(), observacoes: observacoes.trim() })}
          style={{ width: "100%", marginTop: 18, padding: "13px 20px", fontSize: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: salvando ? 0.6 : 1 }}
        >
          {salvando ? "Salvando no dossiê…" : "Salvar no dossiê e entrar na Babel OS"}
          {!salvando && <ArrowRight size={16} />}
        </button>
      </div>
    </motion.div>
  );
}

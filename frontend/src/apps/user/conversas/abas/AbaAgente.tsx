/**
 * Aba "Agente" — com o que ela está atendendo esta conversa.
 *
 * Cartão curto: quem ela diz que é, empresa, PIX, contrato em jogo, e quanto do
 * conhecimento e das ferramentas está ligado — em número, não em lista. Resposta
 * errada quase sempre é PIX velho, contrato trocado ou tool desligada.
 *
 * Embaixo, os SERVIÇOS E VALORES (2026-09-07, pedido do Theus): a tabela do
 * catálogo (à vista · parcelado) e, ao lado, os valores que aparecem no
 * conhecimento ativo dela — com destaque pros que não existem em produto
 * nenhum, que são os que fazem ela prometer preço que o contrato não faz.
 *
 * Nasce vazia de propósito. Só busca no clique de "Atualizar": o painel serve pra
 * saber o que ela tem em mãos NESTE instante, e número que já aparece pronto ao
 * abrir a aba mente sobre quando foi lido.
 *
 * Leitura pura — nada aqui escreve no banco. Fontes em `useContextoAgente`.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import type { Conversa } from "../tipos";
import {
  useContextoAgente,
  type Contagem,
  type ItemCatalogo,
  type PrecoNoConhecimento,
} from "../hooks/useContextoAgente";

interface AbaAgenteProps {
  conversa: Conversa;
  /** UUID real da conversa quando `conversa.id` é mock (ChatTeste). */
  conversaIdOverride?: string | null;
}

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "379/380" — e a cor avisa quando tem coisa desligada. */
function Numeros({ c }: { c: Contagem | null }) {
  if (!c) return <span className="muted">—</span>;
  const desligadas = c.total - c.ativos;
  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        color: desligadas === 0 ? "var(--txt-1)" : "oklch(0.82 0.18 80)",
      }}
    >
      {c.ativos}/{c.total}
      <span className="muted tiny" style={{ marginLeft: 6 }}>
        {desligadas === 0 ? "todas ativas" : `${desligadas} desligada${desligadas > 1 ? "s" : ""}`}
      </span>
    </span>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(92px, 38%) 1fr",
        gap: 10,
        alignItems: "baseline",
        padding: "7px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        {rotulo}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

/** Texto que pode faltar — falta vira travessão discreto, nunca campo vazio. */
function Valor({ v }: { v: string | null }) {
  return v ? <>{v}</> : <span className="muted">—</span>;
}

const CELULA: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  fontSize: 12,
  verticalAlign: "top",
};

/**
 * Serviços e valores do catálogo — o que vale no link de pagamento e no contrato.
 * Preço em números tabulares pra coluna alinhar e dar pra somar com o olho.
 */
function TabelaCatalogo({ itens }: { itens: ItemCatalogo[] }) {
  if (itens.length === 0) {
    return (
      <div className="muted tiny" style={{ padding: "10px 4px" }}>
        Nenhum produto ativo com preço cadastrado. Ela fecha pelo que estiver no conhecimento —
        confira a lista abaixo.
      </div>
    );
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Serviço", "À vista", "Parcelado"].map((c) => (
            <th
              key={c}
              className="muted tiny"
              style={{
                ...CELULA,
                textAlign: c === "Serviço" ? "left" : "right",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                fontWeight: 600,
              }}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {itens.map((i, n) => (
          <tr key={`${i.nome}-${n}`}>
            <td style={{ ...CELULA, fontWeight: 600 }}>{i.nome}</td>
            <td style={{ ...CELULA, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              <Valor v={i.a_vista} />
            </td>
            <td
              style={{
                ...CELULA,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              <Valor v={i.parcelado} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Valores que aparecem no conhecimento ativo dela.
 *
 * Existe porque o catálogo não é a fonte do que ela FALA: no tenant da Tríade
 * o catálogo tinha 2 produtos e o conhecimento citava R$ 1.500, R$ 900 e
 * R$ 297, que não são preço de produto nenhum. Os sem respaldo vêm primeiro e
 * em âmbar — são os que fazem ela prometer preço que o contrato não faz.
 */
function PrecosDoConhecimento({ precos }: { precos: PrecoNoConhecimento[] }) {
  if (precos.length === 0) return null;
  const soltos = precos.filter((p) => !p.no_catalogo);
  const ancorados = precos.filter((p) => p.no_catalogo);
  const Pilula = ({ p }: { p: PrecoNoConhecimento }) => (
    <span
      title={`aparece em ${p.blocos} bloco${p.blocos > 1 ? "s" : ""} ativo${p.blocos > 1 ? "s" : ""}`}
      style={{
        display: "inline-flex",
        gap: 5,
        alignItems: "baseline",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontVariantNumeric: "tabular-nums",
        border: "1px solid rgba(255,255,255,0.1)",
        color: p.no_catalogo ? "var(--txt-2)" : "oklch(0.82 0.18 80)",
        background: p.no_catalogo ? "transparent" : "oklch(0.82 0.18 80 / 0.08)",
      }}
    >
      R$ {p.valor}
      <span className="muted tiny">{p.blocos}</span>
    </span>
  );
  return (
    <section aria-label="Valores no conhecimento do agente" style={{ display: "grid", gap: 8 }}>
      <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
        Valores no conhecimento dela
      </div>
      {soltos.length > 0 && (
        <>
          <div className="tiny" style={{ color: "oklch(0.82 0.18 80)" }}>
            {soltos.length} valor{soltos.length > 1 ? "es" : ""} que ela pode falar e que NÃO existe
            {soltos.length > 1 ? "m" : ""} no catálogo:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {soltos.map((p) => (
              <Pilula key={p.valor} p={p} />
            ))}
          </div>
        </>
      )}
      {ancorados.length > 0 && (
        <>
          <div className="muted tiny">Batem com o catálogo:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ancorados.map((p) => (
              <Pilula key={p.valor} p={p} />
            ))}
          </div>
        </>
      )}
      <div className="muted tiny">O número ao lado é em quantos blocos ativos ele aparece.</div>
    </section>
  );
}

export function AbaAgente({ conversa, conversaIdOverride }: AbaAgenteProps) {
  const convId = conversaIdOverride ?? conversa.id;
  const { contexto, carregando, carregado, recarregar } = useContextoAgente(convId);
  const [promptAberto, setPromptAberto] = useState(false);

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 18px" }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
      >
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
          Contexto do agente
        </div>
        <motion.button
          type="button"
          onClick={recarregar}
          disabled={carregando}
          whileTap={tapPress}
          className="btn btn-sm"
          style={{ fontSize: 11, padding: "3px 10px", opacity: carregando ? 0.6 : 1 }}
          aria-label="Ler o contexto do agente agora"
        >
          {carregando ? "Lendo…" : "Atualizar"}
        </motion.button>
      </div>

      {!carregado ? (
        <div
          className="muted tiny"
          style={{
            padding: "18px 14px",
            borderRadius: 12,
            border: "1px dashed rgba(255,255,255,0.12)",
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          Clique em <strong>Atualizar</strong> pra ler o que ela tem em mãos agora.
          <br />
          Nada carrega sozinho — número velho na tela engana.
        </div>
      ) : (
        <>
          <div
            className="os-vidro"
            style={{
              padding: "4px 14px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Linha rotulo="Atendente">
              <Valor v={contexto.atendente} />
            </Linha>
            <Linha rotulo="Empresa">
              <Valor v={contexto.empresa} />
            </Linha>
            <Linha rotulo="PIX">
              <span className="mono">
                <Valor v={contexto.pix} />
              </span>
            </Linha>
            <Linha rotulo="Contrato">
              <Valor v={contexto.contrato} />
            </Linha>
            <Linha rotulo="Conhecimentos">
              <Numeros c={contexto.conhecimento} />
            </Linha>
            <Linha rotulo="Tools">
              <Numeros c={contexto.tools} />
            </Linha>
          </div>

          <section aria-label="Serviços e valores" style={{ display: "grid", gap: 6 }}>
            <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
              Serviços e valores (catálogo)
            </div>
            <div
              className="os-vidro"
              style={{
                padding: "4px 6px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                overflowX: "auto",
              }}
            >
              <TabelaCatalogo itens={contexto.catalogo} />
            </div>
          </section>

          <PrecosDoConhecimento precos={contexto.precos_no_conhecimento} />

          {contexto.lido_em && (
            <div className="muted tiny" style={{ textAlign: "right" }}>
              lido às {horaCurta(contexto.lido_em)}
            </div>
          )}

          {contexto.prompt_completo && (
            <section aria-label="Prompt completo do turno">
              <motion.button
                type="button"
                onClick={() => setPromptAberto((v) => !v)}
                whileTap={tapPress}
                className="btn btn-ghost btn-sm"
                aria-expanded={promptAberto}
                style={{ fontSize: 11 }}
              >
                {promptAberto ? "Esconder prompt do turno" : "Ver prompt do turno"}
              </motion.button>
              {promptAberto && (
                <pre
                  className="mono tiny"
                  style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.28)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "var(--txt-2)",
                    maxHeight: 340,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {contexto.prompt_completo}
                </pre>
              )}
            </section>
          )}
        </>
      )}
    </motion.div>
  );
}

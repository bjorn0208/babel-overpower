/**
 * PainelRecursos — provas que o contato precisa enviar pra assinar.
 *
 * Caixa de marcar (toggle real), não texto livre. Cada chave marcada vai pra
 * `campos_obrigatorios` e dirige um passo da página pública de assinatura
 * (pages/public/Contrato.tsx → useStepsAtivos):
 *   selfie               → passo Selfie
 *   documento            → passo Documento
 *   assinatura_manuscrita→ assinatura manuscrita no canvas
 *   testemunha           → passo Testemunha (usa num_testemunhas)
 * Bloco de pagamento (PIX / link / posição) embaixo — o comprovante é pedido
 * na página pública quando há PIX ou link configurado.
 */

import { Camera, IdCard, PenLine, Users } from "lucide-react";
import { Campo, inputStyle } from "./re-exports";
import type { RecursosEditaveis } from "./tipos";

type PainelRecursosProps = {
  ed: RecursosEditaveis;
  /** Recebe o estado completo já mesclado — emissão atômica, sem clobber. */
  aoMudar: (proximo: RecursosEditaveis) => void;
  /** Esconde a nota de {SE_A_VISTA}/{SE_PARCELADO} — só faz sentido no template. */
  ocultarNotaValores?: boolean;
};

/** Chaves de recurso (toggle). Não confundir com tokens {{campo}} do texto. */
const RECURSOS = [
  {
    chave: "selfie",
    rotulo: "Selfie ao vivo do contato",
    descricao: "Foto do rosto tirada na hora, pela câmera",
    icone: Camera,
  },
  {
    chave: "documento",
    rotulo: "Foto do documento (RG/CNH)",
    descricao: "Contato anexa a imagem do documento com foto",
    icone: IdCard,
  },
  {
    chave: "assinatura_manuscrita",
    rotulo: "Assinatura manuscrita",
    descricao: "Contato desenha a assinatura no canvas",
    icone: PenLine,
  },
  {
    chave: "testemunha",
    rotulo: "Testemunha obrigatória",
    descricao: "Pede nome e CPF de quem testemunha a assinatura",
    icone: Users,
  },
] as const;

export const RECURSO_CHAVES = RECURSOS.map((r) => r.chave) as readonly string[];

const INSTRUCOES_SELFIE = [
  { valor: "", rotulo: "Sem instrução específica" },
  { valor: "mostrar_2_dedos", rotulo: "Mostrar 2 dedos na selfie" },
  { valor: "segurar_documento", rotulo: "Segurar o documento na selfie" },
  { valor: "documento_e_2_dedos", rotulo: "Segurar documento e mostrar 2 dedos" },
] as const;

const ACENTO = "oklch(0.65 0.22 280)";
const CURVA = "cubic-bezier(0.23, 1, 0.32, 1)";

function Interruptor({
  ligado,
  onToggle,
}: {
  ligado: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={onToggle}
      style={{
        flexShrink: 0,
        width: 38,
        height: 22,
        padding: 2,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: ligado ? ACENTO : "oklch(0.98 0 0 / 0.12)",
        transition: `background 180ms ${CURVA}`,
        display: "flex",
        alignItems: "center",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "oklch(0.99 0 0)",
          transform: ligado ? "translateX(16px)" : "translateX(0)",
          transition: `transform 180ms ${CURVA}`,
          boxShadow: "0 1px 3px oklch(0 0 0 / 0.4)",
        }}
      />
    </button>
  );
}

export function PainelRecursos({
  ed,
  aoMudar,
  ocultarNotaValores,
}: PainelRecursosProps) {
  const marcados = ed.campos_obrigatorios ?? [];
  const temSelfie = marcados.includes("selfie");
  const temTestemunha = marcados.includes("testemunha");

  /** Patch de campo único — sempre parte do estado atual, sem clobber. */
  function patch<K extends keyof RecursosEditaveis>(
    k: K,
    v: RecursosEditaveis[K],
  ) {
    aoMudar({ ...ed, [k]: v } as RecursosEditaveis);
  }

  function alternar(chave: string) {
    const atual = ed.campos_obrigatorios ?? [];
    const ligado = atual.includes(chave);
    // Estado completo de uma vez: campos + instrução/testemunha juntos.
    // Antes eram patches sequenciais sobre o mesmo snapshot — o segundo
    // sobrescrevia o primeiro e a escolha de testemunha se perdia.
    const proximo: RecursosEditaveis = {
      ...ed,
      campos_obrigatorios: ligado
        ? atual.filter((c) => c !== chave)
        : [...atual, chave],
    };
    if (chave === "selfie" && ligado) proximo.instrucao_selfie = null;
    if (chave === "testemunha" && !ligado && (ed.num_testemunhas ?? 0) < 1) {
      proximo.num_testemunhas = 1;
    }
    if (chave === "testemunha" && ligado) proximo.num_testemunhas = 0;
    aoMudar(proximo);
  }

  return (
    <div
      style={{
        padding: "16px 16px 14px",
        borderTop: "1px solid oklch(0.98 0 0 / 0.06)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "oklch(0.98 0 0 / 0.55)",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        Provas exigidas na assinatura
      </div>
      <p
        style={{
          fontSize: 10,
          color: "oklch(0.98 0 0 / 0.4)",
          margin: "0 0 12px",
          lineHeight: 1.45,
        }}
      >
        Marque o que o contato precisa enviar. Cada item vira um passo na página
        pública de assinatura.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {RECURSOS.map((r) => {
          const on = marcados.includes(r.chave);
          const Icone = r.icone;
          return (
            <div key={r.chave}>
              <div
                onClick={() => alternar(r.chave)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  background: on
                    ? "oklch(0.65 0.22 280 / 0.1)"
                    : "oklch(0.18 0.06 280 / 0.4)",
                  border: `1px solid ${
                    on ? "oklch(0.65 0.22 280 / 0.35)" : "oklch(0.98 0 0 / 0.08)"
                  }`,
                  transition: `background 180ms ${CURVA}, border-color 180ms ${CURVA}`,
                }}
              >
                <Icone
                  size={16}
                  style={{
                    flexShrink: 0,
                    color: on ? ACENTO : "oklch(0.98 0 0 / 0.45)",
                    transition: `color 180ms ${CURVA}`,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "oklch(0.98 0 0 / 0.92)",
                    }}
                  >
                    {r.rotulo}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "oklch(0.98 0 0 / 0.42)",
                      marginTop: 1,
                    }}
                  >
                    {r.descricao}
                  </div>
                </div>
                <Interruptor ligado={on} onToggle={() => alternar(r.chave)} />
              </div>

              {r.chave === "selfie" && temSelfie && (
                <div style={{ padding: "8px 12px 2px 40px" }}>
                  <Campo label="Instrução da selfie">
                    <select
                      value={ed.instrucao_selfie ?? ""}
                      onChange={(e) =>
                        patch("instrucao_selfie", e.target.value || null)
                      }
                      style={inputStyle}
                    >
                      {INSTRUCOES_SELFIE.map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>
              )}

              {r.chave === "testemunha" && temTestemunha && (
                <div style={{ padding: "8px 12px 2px 40px", maxWidth: 180 }}>
                  <Campo label="Quantas testemunhas (1 a 3)">
                    <input
                      type="number"
                      min={1}
                      max={3}
                      value={ed.num_testemunhas || 1}
                      onChange={(e) =>
                        patch(
                          "num_testemunhas",
                          Math.max(1, Math.min(3, Number(e.target.value) || 1)),
                        )
                      }
                      style={inputStyle}
                    />
                  </Campo>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagamento — o comprovante é pedido quando há PIX ou link */}
      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: "1px solid oklch(0.98 0 0 / 0.06)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "oklch(0.98 0 0 / 0.55)",
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          Pagamento (opcional)
        </div>
        <p
          style={{
            fontSize: 10,
            color: "oklch(0.98 0 0 / 0.4)",
            margin: "0 0 12px",
            lineHeight: 1.45,
          }}
        >
          Com PIX ou link preenchido, a página pública pede o comprovante de
          pagamento ao contato.
        </p>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <Campo label="Chave PIX">
            <input
              type="text"
              value={ed.chave_pix ?? ""}
              onChange={(e) => patch("chave_pix", e.target.value || null)}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              style={inputStyle}
            />
          </Campo>

          <Campo label="Link de parcelamento">
            <input
              type="url"
              value={ed.link_parcelamento ?? ""}
              onChange={(e) =>
                patch("link_parcelamento", e.target.value || null)
              }
              placeholder="https://..."
              style={inputStyle}
            />
          </Campo>

          <div style={{ gridColumn: "1 / -1" }}>
            <Campo label="Quando pedir o pagamento">
              <select
                value={ed.posicao_pagamento ?? ""}
                onChange={(e) =>
                  patch("posicao_pagamento", e.target.value || null)
                }
                style={inputStyle}
              >
                <option value="">Não solicitar pagamento</option>
                <option value="antes_assinatura">Antes da assinatura</option>
                <option value="after_sign">Após a assinatura</option>
              </select>
            </Campo>
          </div>
        </div>

        {!ocultarNotaValores && (
          <p
            style={{
              marginTop: 10,
              fontSize: 10,
              color: "oklch(0.98 0 0 / 0.35)",
              lineHeight: 1.45,
            }}
          >
            Valor à vista e opções de parcelamento são editados nos painéis
            inline dentro do editor, nas seções {"{SE_A_VISTA}"} e{" "}
            {"{SE_PARCELADO}"}.
          </p>
        )}
      </div>
    </div>
  );
}

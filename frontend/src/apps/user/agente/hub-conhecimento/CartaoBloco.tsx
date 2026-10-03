/**
 * Cartão de um bloco na gaveta aberta: badge de escopo + título + prévia de
 * 2 linhas + ações por escopo (editar/desligar o próprio · desligar nicho · cadeado
 * global).
 *
 * O tenant NÃO apaga conhecimento. A caixa de seleção diz se o agente CONSIDERA o bloco:
 * marcada, ele usa; desmarcada, ele ignora. Nada some, nada é destruído. Apagar é do admin.
 *
 * O botão de excluir saiu daqui em 2026-09-03: `blocos_conhecimento` não tem policy de
 * DELETE, então ele devolvia 204 sem apagar nada e a saída da pessoa foi desmarcar os 10
 * blocos na mão — o que pareceu, de fora, que o conhecimento tinha evaporado (incidente
 * do tenant Otmar).
 */

import { useState } from "react";
import { Pencil, Power, PowerOff, Lock, MessagesSquare } from "lucide-react";
import { ModalConversaPadrao } from "./ModalConversaPadrao";
import type { Gaveta } from "./gavetas";
import type { BlocoHub } from "./use-hub-conhecimento";
import { BadgeEscopo, BotaoIcone } from "./ui-hub";

export function CartaoBloco({
  bloco,
  gaveta,
  desligado,
  onEditar,
  onAlternarAtivo,
  onToggle,
}: {
  bloco: BlocoHub;
  gaveta: Gaveta;
  desligado: boolean;
  onEditar: () => void;
  onAlternarAtivo: () => void;
  onToggle: () => void;
}) {
  const ehProprio = bloco.escopo === "tenant";
  const ehNicho = bloco.escopo === "nicho";
  // Bloco especial do Chat Treino: clicar abre a conversa padrão (não edita texto à mão).
  const ehConversaPadrao = bloco.categoria === "conversa_padrao";
  const [abrirConversa, setAbrirConversa] = useState(false);

  return (
    <>
      {/* Fora do cartão: o clique de fechar não pode subir pro onClick que abre. */}
      {ehConversaPadrao && abrirConversa && (
        <ModalConversaPadrao blocoId={bloco.id} onFechar={() => setAbrirConversa(false)} />
      )}
      <div
        onClick={ehConversaPadrao ? () => setAbrirConversa(true) : undefined}
        role={ehConversaPadrao ? "button" : undefined}
        title={ehConversaPadrao ? "Abrir a conversa padrão" : undefined}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 12,
          background: ehConversaPadrao
            ? "linear-gradient(135deg, oklch(0.72 0.2 145 / 0.14), oklch(0.78 0.16 75 / 0.10))"
            : "oklch(0.18 0.06 280 / 0.4)",
          border: ehConversaPadrao
            ? "1px solid oklch(0.72 0.2 145 / 0.4)"
            : "1px solid oklch(0.98 0 0 / 0.07)",
          cursor: ehConversaPadrao ? "pointer" : undefined,
          opacity: desligado || !bloco.ativo ? 0.55 : 1,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <BadgeEscopo escopo={bloco.escopo} />
            {ehConversaPadrao && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 999,
                  color: "oklch(0.88 0.14 145)",
                  background: "oklch(0.72 0.2 145 / 0.16)",
                  border: "1px solid oklch(0.72 0.2 145 / 0.4)",
                }}
              >
                <MessagesSquare size={10} aria-hidden="true" /> Conversa padrão
              </span>
            )}
            {ehProprio && !bloco.ativo && (
              <span
                title={
                  bloco.aprovado
                    ? "O agente não considera este bloco enquanto estiver desmarcado"
                    : "Resposta do Mentor esperando sua aprovação. Marque pra colocar no conhecimento do agente."
                }
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 999,
                  // Pré-aprovado (roxo, chama atenção pra ação) vs desmarcado à mão (âmbar).
                  color: bloco.aprovado ? "oklch(0.78 0.18 80)" : "oklch(0.62 0.19 295)",
                  background: bloco.aprovado
                    ? "oklch(0.78 0.18 80 / 0.12)"
                    : "oklch(0.62 0.19 295 / 0.12)",
                  border: `1px solid ${bloco.aprovado ? "oklch(0.78 0.18 80 / 0.3)" : "oklch(0.62 0.19 295 / 0.35)"}`,
                }}
              >
                {bloco.aprovado ? "Desmarcado" : "Aguardando aprovação"}
              </span>
            )}
            {desligado && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 999,
                  color: "oklch(0.78 0.18 80)",
                  background: "oklch(0.78 0.18 80 / 0.12)",
                  border: "1px solid oklch(0.78 0.18 80 / 0.3)",
                }}
              >
                Desligado pra você
              </span>
            )}
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "oklch(0.98 0 0)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {bloco.titulo || "(sem título)"}
            </span>
          </div>
          {bloco.corpo && (
            <span
              style={{
                fontSize: 12,
                color: "oklch(0.98 0 0 / 0.62)",
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {bloco.corpo}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          {ehProprio && (
            <>
              {!ehConversaPadrao && (
                <BotaoIcone titulo="Editar" onClick={onEditar}>
                  <Pencil size={15} aria-hidden="true" />
                </BotaoIcone>
              )}
              <label
                title={
                  bloco.ativo
                    ? "Marcado: o agente considera este bloco. Desmarque pra ele ignorar."
                    : "Desmarcado: o agente ignora este bloco. Marque pra ele voltar a considerar."
                }
                style={{ display: "grid", placeItems: "center", padding: 5, cursor: "pointer" }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={bloco.ativo}
                  onChange={onAlternarAtivo}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Considerar o bloco ${bloco.titulo}`}
                  style={{
                    width: 15,
                    height: 15,
                    cursor: "pointer",
                    accentColor: "oklch(0.72 0.19 150)",
                  }}
                />
              </label>
            </>
          )}
          {ehNicho &&
            (gaveta.tabelaOverride ? (
              <BotaoIcone
                titulo={desligado ? "Religar pra você" : "Desligar pra você"}
                onClick={onToggle}
              >
                {desligado ? (
                  <Power size={15} aria-hidden="true" />
                ) : (
                  <PowerOff size={15} aria-hidden="true" />
                )}
              </BotaoIcone>
            ) : (
              <span style={{ fontSize: 9, color: "oklch(0.98 0 0 / 0.4)", padding: "0 6px" }}>
                desligar em breve
              </span>
            ))}
          {bloco.escopo === "global" && (
            <span
              title="Bloco fixo da plataforma — vale pra todo mundo e não pode ser alterado"
              style={{
                color: "oklch(0.98 0 0 / 0.3)",
                padding: 5,
                display: "grid",
                placeItems: "center",
              }}
            >
              <Lock size={14} aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </>
  );
}

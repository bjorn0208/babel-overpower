/**
 * Seção de Pagamento do produto (app Produtos).
 * Edita as condições comerciais que alimentam os planos de pagamento do contrato:
 * preço à vista, entrada, máximo de parcelas, valor da parcela (travado) e
 * QUAIS parcelas o contrato deve oferecer (`parcelas_oferecidas`).
 *
 * Fonte única dos planos: `public.produtos` (lida por `calcular_plano_pagamento`).
 * Seletor vazio = leque completo 1..máx (legado); marcado = só as marcadas.
 *
 * Link de pagamento (gateway externo — Kiwify, Hotmart, Cakto…): mora num item de
 * `produto_conhecimento` tipo `pagamento` com o título fixo abaixo. Assim ele entra no
 * RAG do agente pelo `sincronizar-blocos` sem mexer no motor. Vazio = remove o item.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info?: (m: string) => void;
}

function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

interface DadosPagamento {
  preco: number; // reais
  entrada: number; // reais
  maxParcelas: number;
  valorParcela: number; // reais (travado; 0 = calcula automático)
  oferecidas: number[]; // quais parcelas oferecer (vazio = todas até o máx)
}

const VAZIO: DadosPagamento = {
  preco: 0,
  entrada: 0,
  maxParcelas: 1,
  valorParcela: 0,
  oferecidas: [],
};

const TITULO_LINK = "Link de pagamento";

function textoDoLink(url: string): string {
  return `Link de pagamento (gateway externo) para enviar ao cliente quando ele quiser pagar ou fechar: ${url}\nEnvie o link exatamente como está, sem alterar.`;
}

function extrairUrl(conteudo: string): string {
  return conteudo.match(/https?:\/\/\S+/)?.[0] ?? "";
}

function brl(reais: number): string {
  return reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SecaoPagamentoProdutoProps {
  produtoId: string;
  /** Chamado depois de salvar — o pai regenera o RAG do agente (o link entra no conhecimento). */
  onSalvou?: () => void;
}

export function SecaoPagamentoProduto({ produtoId, onSalvou }: SecaoPagamentoProdutoProps) {
  const t = pegarToast();
  const [d, setD] = useState<DadosPagamento>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [link, setLink] = useState("");
  const [linkId, setLinkId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const sb = supabase as SupabaseBruto;
    const [{ data }, { data: itemLink }] = await Promise.all([
      sb
        .from("produtos")
        .select(
          "preco_centavos, entrada_centavos, max_parcelas, valor_parcela_cravado_centavos, parcelas_oferecidas",
        )
        .eq("id", produtoId)
        .single(),
      sb
        .from("produto_conhecimento")
        .select("id, conteudo")
        .eq("produto_id", produtoId)
        .eq("tipo", "pagamento")
        .eq("titulo", TITULO_LINK)
        .limit(1)
        .maybeSingle(),
    ]);
    setLinkId(itemLink?.id ?? null);
    setLink(itemLink ? extrairUrl(String(itemLink.conteudo ?? "")) : "");
    if (data) {
      setD({
        preco: (data.preco_centavos ?? 0) / 100,
        entrada: (data.entrada_centavos ?? 0) / 100,
        maxParcelas: data.max_parcelas ?? 1,
        valorParcela: (data.valor_parcela_cravado_centavos ?? 0) / 100,
        oferecidas: Array.isArray(data.parcelas_oferecidas)
          ? (data.parcelas_oferecidas as number[]).filter((n) => Number.isInteger(n))
          : [],
      });
    }
    setCarregando(false);
  }, [produtoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function alternarParcela(n: number) {
    setD((x) => ({
      ...x,
      oferecidas: x.oferecidas.includes(n)
        ? x.oferecidas.filter((p) => p !== n)
        : [...x.oferecidas, n].sort((a, b) => a - b),
    }));
  }

  async function salvar() {
    const url = link.trim();
    if (url && !/^https?:\/\/\S+$/.test(url)) {
      t.error("Link de pagamento inválido — cole o endereço completo, começando com https://");
      return;
    }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const lista = d.oferecidas.filter((n) => n >= 1 && n <= d.maxParcelas);
      const { error } = await sb
        .from("produtos")
        .update({
          preco_centavos: Math.round(d.preco * 100),
          entrada_centavos: Math.round(d.entrada * 100),
          max_parcelas: Math.max(1, Math.round(d.maxParcelas)),
          valor_parcela_cravado_centavos:
            d.valorParcela > 0 ? Math.round(d.valorParcela * 100) : null,
          parcelas_oferecidas: lista.length > 0 ? lista : null,
        })
        .eq("id", produtoId);
      if (error) throw error;

      if (url && linkId) {
        const r = await sb
          .from("produto_conhecimento")
          .update({ conteudo: textoDoLink(url) })
          .eq("id", linkId);
        if (r.error) throw r.error;
      } else if (url) {
        const r = await sb
          .from("produto_conhecimento")
          .insert({
            produto_id: produtoId,
            tipo: "pagamento",
            titulo: TITULO_LINK,
            conteudo: textoDoLink(url),
            ordem: 0,
          })
          .select("id")
          .single();
        if (r.error) throw r.error;
        setLinkId(r.data.id);
      } else if (linkId) {
        const r = await sb.from("produto_conhecimento").delete().eq("id", linkId);
        if (r.error) throw r.error;
        setLinkId(null);
      }

      t.success("Pagamento salvo");
      onSalvou?.();
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  /** Valor de cada parcela como o lead verá: trava no máx (se houver), senão divide o restante. */
  function valorDoChip(n: number): number {
    if (d.valorParcela > 0 && n === d.maxParcelas) return d.valorParcela;
    return n > 0 ? (d.preco - d.entrada) / n : 0;
  }

  const chips = Array.from({ length: Math.max(0, d.maxParcelas - 1) }, (_, i) => i + 2);

  return (
    <section
      style={{
        background:
          "linear-gradient(180deg, oklch(0.18 0.06 280 / 0.42), oklch(0.15 0.04 264 / 0.30))",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: "16px 18px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 22px rgba(0,0,0,0.22)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: "oklch(0.72 0.20 145)",
            boxShadow: "0 0 8px oklch(0.72 0.20 145 / 0.55)",
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.7,
            color: "var(--txt-3)",
          }}
        >
          Pagamento
        </h3>
      </header>

      {carregando ? (
        <div className="tiny" style={{ color: "var(--txt-4)" }}>
          Carregando…
        </div>
      ) : (
        <>
          <CampoNumero
            rotulo="Preço à vista (R$)"
            valor={d.preco}
            onChange={(v) => setD((x) => ({ ...x, preco: v }))}
          />
          <CampoNumero
            rotulo="Entrada do parcelado (R$)"
            valor={d.entrada}
            onChange={(v) => setD((x) => ({ ...x, entrada: v }))}
          />
          <CampoNumero
            rotulo="Máximo de parcelas"
            valor={d.maxParcelas}
            inteiro
            onChange={(v) =>
              setD((x) => ({ ...x, maxParcelas: Math.max(1, Math.min(36, Math.round(v))) }))
            }
          />
          <CampoNumero
            rotulo="Valor da parcela (R$) — 0 = calcula automático"
            valor={d.valorParcela}
            onChange={(v) => setD((x) => ({ ...x, valorParcela: v }))}
          />

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              className="muted tiny"
              style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Link de pagamento
            </span>
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://pay.kiwify.com.br/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <span className="tiny" style={{ color: "var(--txt-4)", lineHeight: 1.5 }}>
              Link do gateway externo (Kiwify, Hotmart, Cakto…). O agente envia ao cliente na hora
              de pagar. Vazio = sem link.
            </span>
          </label>

          {/* Seletor de parcelas oferecidas */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
            <span
              className="muted tiny"
              style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Parcelas oferecidas ao cliente
            </span>
            <p className="tiny" style={{ margin: 0, color: "var(--txt-4)", lineHeight: 1.5 }}>
              Marque quais parcelas o cliente pode escolher. Nada marcado = oferece de 2× até o
              máximo.
            </p>
            {chips.length === 0 ? (
              <span className="tiny" style={{ color: "var(--txt-4)", fontStyle: "italic" }}>
                Aumente o máximo de parcelas pra liberar o parcelado.
              </span>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                {chips.map((n) => {
                  const on = d.oferecidas.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => alternarParcela(n)}
                      aria-pressed={on}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 1,
                        padding: "6px 10px",
                        borderRadius: 10,
                        cursor: "pointer",
                        background: on
                          ? "oklch(0.72 0.20 145 / 0.16)"
                          : "oklch(0.18 0.06 280 / 0.40)",
                        border: on
                          ? "1px solid oklch(0.72 0.20 145 / 0.45)"
                          : "1px solid rgba(255,255,255,0.10)",
                        color: on ? "oklch(0.85 0.20 145)" : "var(--txt-3)",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{n}×</span>
                      <span className="mono" style={{ fontSize: 9, opacity: 0.8 }}>
                        {brl(valorDoChip(n))}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={salvando}
            onClick={() => void salvar()}
            style={{ alignSelf: "flex-start", marginTop: 4, fontSize: 12, fontWeight: 600 }}
          >
            {salvando ? "Salvando…" : "Salvar pagamento"}
          </button>
        </>
      )}
    </section>
  );
}

interface CampoNumeroProps {
  rotulo: string;
  valor: number;
  inteiro?: boolean;
  onChange: (v: number) => void;
}

function CampoNumero({ rotulo, valor, inteiro, onChange }: CampoNumeroProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        className="muted tiny"
        style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {rotulo}
      </span>
      <input
        className="input"
        type="number"
        min={0}
        step={inteiro ? 1 : 0.01}
        value={Number.isFinite(valor) ? valor : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}

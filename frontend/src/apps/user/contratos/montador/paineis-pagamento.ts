/**
 * Painéis de pagamento inline no editor WYSIWYG.
 * Portado de painel-contrato-panels.ts (front antigo) com cores OKLCH glass dark.
 * São inseridos dentro das seções {SE_A_VISTA} e {SE_PARCELADO} como elementos
 * contentEditable=false — o usuário edita valores neles, não no texto livre.
 */

import type { OpcaoParcelamento } from "../tipos";
import { el, makeInput } from "./montador-dom";

type UpdateFn = (campo: string, valor: unknown) => void;

// ---------------------------------------------------------------------------
// Estilos inline glass dark — espelham o design system atual
// ---------------------------------------------------------------------------

const inputGlassVerde =
  "w-full mt-1 rounded-lg border border-[oklch(0.72_0.18_145_/_0.3)] " +
  "bg-[oklch(0.18_0.06_280_/_0.4)] px-2 py-1.5 text-[11px] text-[oklch(0.98_0_0)] " +
  "outline-none focus:ring-1 focus:ring-[oklch(0.72_0.18_145_/_0.5)]";

const inputGlassVermelho =
  "w-full mt-0.5 rounded border border-[oklch(0.65_0.24_25_/_0.3)] " +
  "bg-[oklch(0.18_0.06_280_/_0.4)] px-2 py-1 text-[11px] text-[oklch(0.98_0_0)] " +
  "outline-none focus:ring-1 focus:ring-[oklch(0.65_0.24_25_/_0.5)]";

// ---------------------------------------------------------------------------
// Painel Valor à vista
// ---------------------------------------------------------------------------

export function buildAVistaPanel(
  panel: HTMLElement,
  valor: number | null,
  onUpdate: UpdateFn,
): void {
  panel.textContent = "";

  panel.setAttribute(
    "style",
    "margin:6px 0;border-radius:8px;" +
      "border:1px solid oklch(0.72 0.18 145 / 0.3);" +
      "background:oklch(0.72 0.18 145 / 0.06);padding:10px 12px",
  );

  const label = el(
    "span",
    { style: "display:block;font-size:10px;font-weight:600;color:oklch(0.72 0.18 145);margin-bottom:6px" },
    ["Valor a vista"],
  );

  const rs = el(
    "span",
    { style: "font-size:13px;font-weight:700;color:oklch(0.72 0.18 145)" },
    ["R$"],
  );

  const inp = makeInput(
    valor != null ? String(valor) : "",
    "Ex: 997,00",
    inputGlassVerde,
    (v) => onUpdate("valor_a_vista", v ? Number(v) : null),
  );

  const row = el("div", { style: "display:flex;align-items:center;gap:8px" }, [rs, inp]);
  panel.append(label, row);
}

// ---------------------------------------------------------------------------
// Painel Opções de parcelamento
// ---------------------------------------------------------------------------

export function buildParceladoPanel(
  panel: HTMLElement,
  opts: OpcaoParcelamento[],
  onUpdate: UpdateFn,
): void {
  panel.textContent = "";

  panel.setAttribute(
    "style",
    "margin:6px 0;border-radius:8px;" +
      "border:1px solid oklch(0.65 0.24 25 / 0.3);" +
      "background:oklch(0.65 0.24 25 / 0.06);padding:10px 12px",
  );

  // Header com label + botão adicionar
  const header = el("div", {
    style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px",
  });
  header.appendChild(
    el(
      "span",
      { style: "font-size:10px;font-weight:600;color:oklch(0.65 0.24 25)" },
      ["Opcoes de parcelamento"],
    ),
  );

  const addBtn = el(
    "button",
    {
      style:
        "font-size:10px;font-weight:600;color:oklch(0.65 0.24 25);cursor:pointer;" +
        "background:transparent;border:none;padding:0 2px",
    },
    ["+ Adicionar"],
  );
  addBtn.onclick = () => {
    const newOpts: OpcaoParcelamento[] = [
      ...opts,
      { entrada: 0, parcelas: 1, valor_parcela: 0 },
    ];
    onUpdate("opcoes_parcelamento", newOpts);
  };
  header.appendChild(addBtn);
  panel.appendChild(header);

  if (opts.length === 0) {
    panel.appendChild(
      el(
        "p",
        { style: "font-size:10px;color:oklch(0.65 0.24 25 / 0.5);font-style:italic" },
        ["Clique + para adicionar opcao de parcelamento"],
      ),
    );
    return;
  }

  opts.forEach((opt, idx) => {
    const card = el("div", {
      style:
        "margin-bottom:8px;border-radius:8px;" +
        "border:1px solid oklch(0.65 0.24 25 / 0.25);" +
        "background:oklch(0.18 0.06 280 / 0.3);padding:8px 10px",
    });

    // Label da opção + botão remover
    const optLabel = el("div", {
      style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px",
    });
    optLabel.appendChild(
      el(
        "span",
        { style: "font-size:10px;font-weight:500;color:oklch(0.65 0.24 25)" },
        [`Opcao ${idx + 1}`],
      ),
    );
    const removeBtn = el(
      "button",
      {
        style:
          "font-size:11px;color:oklch(0.65 0.24 25 / 0.6);cursor:pointer;" +
          "background:transparent;border:none;padding:0 2px",
      },
      ["x"],
    );
    removeBtn.onclick = () => {
      const newOpts = opts.filter((_, i) => i !== idx);
      onUpdate("opcoes_parcelamento", newOpts);
    };
    optLabel.appendChild(removeBtn);
    card.appendChild(optLabel);

    // Linha com os 3 inputs
    const row1 = el("div", { style: "display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px" });

    const entradaWrap = el("div", {});
    entradaWrap.appendChild(
      el(
        "span",
        { style: "font-size:9px;color:oklch(0.65 0.24 25 / 0.7)" },
        ["Entrada R$"],
      ),
    );
    entradaWrap.appendChild(
      makeInput(
        opt.entrada ? String(opt.entrada) : "",
        "0,00",
        inputGlassVermelho,
        (v) => {
          const n = [...opts];
          n[idx] = { ...n[idx], entrada: Number(v) || 0 };
          onUpdate("opcoes_parcelamento", n);
        },
      ),
    );

    const parcelasWrap = el("div", {});
    parcelasWrap.appendChild(
      el(
        "span",
        { style: "font-size:9px;color:oklch(0.65 0.24 25 / 0.7)" },
        ["Parcelas"],
      ),
    );
    const parcelasInp = makeInput(
      opt.parcelas ? String(opt.parcelas) : "",
      "12",
      inputGlassVermelho,
      (v) => {
        const n = [...opts];
        n[idx] = { ...n[idx], parcelas: Number(v) || 1 };
        onUpdate("opcoes_parcelamento", n);
      },
    );
    parcelasInp.min = "1";
    parcelasInp.step = "1";
    parcelasWrap.appendChild(parcelasInp);

    const valorWrap = el("div", {});
    valorWrap.appendChild(
      el(
        "span",
        { style: "font-size:9px;color:oklch(0.65 0.24 25 / 0.7)" },
        ["Valor parcela R$"],
      ),
    );
    valorWrap.appendChild(
      makeInput(
        opt.valor_parcela ? String(opt.valor_parcela) : "",
        "0,00",
        inputGlassVermelho,
        (v) => {
          const n = [...opts];
          n[idx] = { ...n[idx], valor_parcela: Number(v) || 0 };
          onUpdate("opcoes_parcelamento", n);
        },
      ),
    );

    row1.append(entradaWrap, parcelasWrap, valorWrap);
    card.appendChild(row1);
    panel.appendChild(card);
  });
}

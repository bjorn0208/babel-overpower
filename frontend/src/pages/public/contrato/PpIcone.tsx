/**
 * Ícones inline SVG do design system pp (mapeados de icons.jsx do bundle).
 * O projeto usa lucide-react em geral, mas a página pública usa ícones
 * customizados do design para fidelidade total ao bundle Claude design.
 */

import type { CSSProperties } from "react";

interface IconeProps {
  nome: string;
  tamanho?: number;
  espessura?: number;
  style?: CSSProperties;
}

export function PpIcone({ nome, tamanho = 14, espessura = 1.6, style }: IconeProps) {
  const base = {
    width: tamanho,
    height: tamanho,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: espessura,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { display: "inline-block", flexShrink: 0, ...style },
  };

  switch (nome) {
    case "chevr":
      return <svg {...base}><path d="M9 6l6 6-6 6"/></svg>;
    case "chevl":
      return <svg {...base}><path d="M15 6l-6 6 6 6"/></svg>;
    case "id":
      return <svg {...base}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4M14 13h4M5 17h6"/></svg>;
    case "doc":
      return <svg {...base}><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>;
    case "dollar":
      return <svg {...base}><path d="M12 3v18M17 7c0-2-2.2-3-5-3s-5 1-5 3.5S9.5 11 12 11s5 1 5 3.5S14.8 18 12 18s-5-1-5-3"/></svg>;
    case "money":
      return <svg {...base}><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/></svg>;
    case "camera":
      return <svg {...base}><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>;
    case "pen":
      return <svg {...base}><path d="M3 21l3-1 11-11-2-2L4 18l-1 3z"/><path d="M14 7l3 3"/></svg>;
    case "user":
      return <svg {...base}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
    case "shield":
      return <svg {...base}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></svg>;
    case "check":
      return <svg {...base}><path d="M5 13l4 4L19 7"/></svg>;
    case "warn":
      return <svg {...base}><path d="M12 4l10 16H2z"/><path d="M12 10v5M12 18v0.5"/></svg>;
    case "sparkles":
      return <svg {...base}><path d="M12 3l1.5 4 4 1.5-4 1.5L12 14l-1.5-4-4-1.5 4-1.5zM19 14l.8 2 2 .8-2 .8L19 19.6l-.8-1.8-2-.8 2-.8z"/></svg>;
    default:
      return null;
  }
}

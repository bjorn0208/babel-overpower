/**
 * Campo de busca da gaveta — filtra na hora, botão de limpar quando tem texto.
 */

import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { tapPress } from "@/os/motion/presets";

export function CampoBusca({
  valor,
  onChange,
  placeholder,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 10,
        background: "oklch(0.98 0 0 / 0.05)",
        border: "1px solid oklch(0.98 0 0 / 0.1)",
      }}
    >
      <Search size={14} aria-hidden="true" style={{ color: "oklch(0.98 0 0 / 0.4)", flexShrink: 0 }} />
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12.5,
          color: "oklch(0.98 0 0)",
          background: "transparent",
          border: "none",
          outline: "none",
          fontFamily: "inherit",
        }}
      />
      {valor && (
        <motion.button
          whileTap={tapPress}
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          style={{
            display: "grid",
            placeItems: "center",
            padding: 2,
            background: "transparent",
            border: "none",
            borderRadius: 6,
            color: "oklch(0.98 0 0 / 0.5)",
            cursor: "pointer",
          }}
        >
          <X size={13} aria-hidden="true" />
        </motion.button>
      )}
    </div>
  );
}

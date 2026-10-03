/**
 * SalaEncerrada — estado final da página pública quando a reunião
 * já foi encerrada ou o link não está mais disponível.
 */

import { VideoOff } from "lucide-react";
import { EstiloReuniao, cor } from "@/apps/user/reuniao/reuniao-ui";

export default function SalaEncerrada() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: cor.fundo,
        display: "flex",
        fontFamily: "system-ui, sans-serif",
        color: cor.texto1,
      }}
    >
      <EstiloReuniao />
      <div
        className="reu-surgir"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          textAlign: "center",
          maxWidth: 380,
          margin: "auto",
          padding: 24,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "oklch(0.2 0.04 264)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: cor.texto2,
          }}
        >
          <VideoOff size={26} aria-hidden />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Esta reunião foi encerrada</h1>
        <p style={{ fontSize: 13.5, color: cor.texto2, margin: 0, lineHeight: 1.5, maxWidth: 300 }}>
          A sala não está mais disponível. Se precisar, peça um novo link pra quem te convidou.
        </p>
      </div>
    </div>
  );
}

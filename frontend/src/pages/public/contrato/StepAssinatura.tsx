/**
 * StepAssinatura — canvas de assinatura digital com suporte a touch e mouse.
 */

import { useEffect, useRef, useState } from "react";
import { PpAcoes } from "./PpShared";
import { PpIcone } from "./PpIcone";

export function StepAssinatura({
  manuscrita,
  upload,
  onAvancar,
  onVoltar,
}: {
  /** true = canvas manuscrito (checkbox assinatura_manuscrita); false = aceite simples. */
  manuscrita: boolean;
  upload: (f: File, p: string) => Promise<string | null>;
  /** F3b: recebe a URL da assinatura manuscrita — antes era descartada e o payload ia sem ela. */
  onAvancar: (urlAssinatura?: string | null) => void;
  onVoltar: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [desenhando, setDesenhando] = useState(false);
  const [vazio, setVazio] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aceito, setAceito] = useState(false);

  useEffect(() => {
    if (!manuscrita) return;
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "oklch(0.18 0.015 270)";
  }, []);

  function posicao(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function inicio(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicao(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDesenhando(true);
    setVazio(false);
  }

  function mover(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!desenhando) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicao(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function fim() {
    setDesenhando(false);
  }

  function limpar() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setVazio(true);
  }

  async function confirmar() {
    const c = canvasRef.current;
    if (!c) return;
    setSalvando(true);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
    if (!blob) { setSalvando(false); return; }
    const file = new File([blob], "assinatura.png", { type: "image/png" });
    const url = await upload(file, "assinatura");
    setSalvando(false);
    if (url) onAvancar(url);
  }

  // Sem assinatura manuscrita: aceite simples (declara leitura e concordância).
  if (!manuscrita) {
    return (
      <div className="pp-fade">
        <div className="pp-step-icon">
          <PpIcone nome="check" tamanho={20} />
        </div>
        <h2 className="pp-step-title">Confirmar e assinar</h2>
        <p className="pp-step-sub">
          Revise as informações. Ao confirmar, você declara que leu e concorda
          com todos os termos deste contrato.
        </p>
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: 14,
            marginBottom: 4,
            background: "var(--pp-bg-2)",
            border: "1px solid var(--pp-border)",
            borderRadius: "var(--pp-r)",
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--pp-ink-2)",
          }}
        >
          <input
            type="checkbox"
            checked={aceito}
            onChange={(e) => setAceito(e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, cursor: "pointer" }}
          />
          <span>Li e concordo com os termos deste contrato.</span>
        </label>
        <PpAcoes
          onVoltar={onVoltar}
          onAvancar={onAvancar}
          avancarDisabled={!aceito}
          rotuloAvancar="Assinar contrato"
        />
      </div>
    );
  }

  return (
    <div className="pp-fade">
      <div className="pp-step-icon">
        <PpIcone nome="pen" tamanho={20} />
      </div>
      <h2 className="pp-step-title">Sua assinatura</h2>
      <p className="pp-step-sub">
        Assine com o dedo (se estiver no celular) ou com o mouse. É como
        assinar no papel.
      </p>

      <div className="pp-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="pp-canvas"
          onMouseDown={inicio}
          onMouseMove={mover}
          onMouseUp={fim}
          onMouseLeave={fim}
          onTouchStart={inicio}
          onTouchMove={mover}
          onTouchEnd={fim}
        />
        <div className="pp-canvas-line" />
        {vazio && (
          <div className="pp-canvas-hint">
            <PpIcone nome="pen" tamanho={11} /> assine acima da linha
          </div>
        )}
      </div>

      <div className="pp-canvas-actions">
        <button className="pp-link" type="button" onClick={limpar} disabled={vazio}>
          Limpar e refazer
        </button>
        <div style={{ fontSize: 11, color: "var(--pp-ink-4)" }}>
          Tente fazer no maior tamanho possível
        </div>
      </div>

      <PpAcoes
        onVoltar={onVoltar}
        onAvancar={confirmar}
        avancarDisabled={vazio || salvando}
        rotuloAvancar={salvando ? "Salvando…" : "Confirmar assinatura"}
      />
    </div>
  );
}

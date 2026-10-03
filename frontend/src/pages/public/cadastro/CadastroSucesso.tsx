/**
 * Tela de sucesso exibida após o cadastro por indicação ser enviado.
 * Standalone — não depende do OS bundle.
 */

import { CheckCircle2 } from "lucide-react";

const COR = "#6366f1";

export function CadastroSucesso() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafafa",
        padding: 24,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <FundoEditorial />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          borderRadius: 22,
          boxShadow: "0 12px 48px rgba(0,0,0,0.08)",
          border: "1px solid #e4e4e7",
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "#d1fae5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <CheckCircle2 size={32} style={{ color: "#16a34a" }} />
        </div>

        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#18181b",
            margin: "0 0 10px",
          }}
        >
          Cadastro enviado!
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#52525b",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Seu comprovante foi recebido e será analisado em breve.
          Você receberá acesso assim que a implantação for confirmada.
        </p>

        <div
          style={{
            marginTop: 28,
            padding: "14px 18px",
            borderRadius: 12,
            background: `${COR}0f`,
            border: `1px solid ${COR}30`,
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: COR,
              fontWeight: 600,
              margin: 0,
            }}
          >
            Fique de olho no seu email — enviaremos a confirmação por lá.
          </p>
        </div>
      </div>
    </div>
  );
}

function FundoEditorial() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -200,
          right: -100,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COR}18, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -300,
          left: -150,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, #0ea5e910, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
    </div>
  );
}

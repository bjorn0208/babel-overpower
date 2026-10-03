import { useState } from "react";
import { CAMPOS, CAMPOS_PRODUTO, type Produto, type Valores } from "./campos";
import { Formulario, Marca, type MetodoConexao } from "./Formulario";
import { TelaConexao } from "./TelaConexao";

const CHAVE_RASCUNHO = "chupa-cabra:rascunho";

/** Como isso aparece na coluna "Como conectou" da planilha. */
const ROTULO_METODO: Record<MetodoConexao, string> = {
  qr: "QR code",
  codigo: "Código",
  sem: "Sem conexão",
};

type Fase =
  | { tipo: "formulario"; erroEnvio?: string }
  | { tipo: "enviando"; metodo: MetodoConexao }
  | { tipo: "conexao"; metodo: Exclude<MetodoConexao, "sem">; aba: string; idEnvio: string; responsavel: string }
  | { tipo: "pronto"; aba: string; responsavel: string; conversas: number; mensagens: number; conectou: boolean };

export function App() {
  const [fase, setFase] = useState<Fase>({ tipo: "formulario" });

  async function enviar(valores: Valores, produtos: Produto[], metodo: MetodoConexao, aceite: boolean) {
    setFase({ tipo: "enviando", metodo });
    try {
      // A planilha é gravada ANTES de qualquer conexão: se o WhatsApp falhar,
      // o preenchimento não se perde.
      const resp = await fetch("/api/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campos: valores,
          ordem: CAMPOS.map((c) => c.chave),
          cabecalho: CAMPOS.map((c) => c.rotulo),
          produtos: produtos.map((p) => p.valores),
          ordem_produto: CAMPOS_PRODUTO.map((c) => c.chave),
          cabecalho_produto: CAMPOS_PRODUTO.map((c) => c.rotulo),
          metodo_conexao: ROTULO_METODO[metodo],
          aceite: aceite ? "Sim" : "Não",
        }),
      });
      const corpo = (await resp.json().catch(() => ({}))) as { ok?: boolean; aba?: string; id_envio?: string; erro?: string };
      if (!resp.ok || !corpo.ok || !corpo.aba || !corpo.id_envio) {
        setFase({ tipo: "formulario", erroEnvio: corpo.erro ?? `Não consegui enviar (HTTP ${resp.status}). Tente de novo.` });
        return;
      }
      try {
        localStorage.removeItem(CHAVE_RASCUNHO);
        localStorage.removeItem(`${CHAVE_RASCUNHO}:produtos`);
      } catch { /* sem storage */ }
      const responsavel = String(valores.responsavel_nome ?? "").trim().split(/\s+/)[0] || "";
      if (metodo === "sem") setFase({ tipo: "pronto", aba: corpo.aba, responsavel, conversas: 0, mensagens: 0, conectou: false });
      else setFase({ tipo: "conexao", metodo, aba: corpo.aba, idEnvio: corpo.id_envio, responsavel });
    } catch (e) {
      setFase({ tipo: "formulario", erroEnvio: (e as Error).message || "Falha de rede. Tente de novo." });
    }
  }

  if (fase.tipo === "formulario" || fase.tipo === "enviando") {
    return (
      <Formulario
        chaveRascunho={CHAVE_RASCUNHO}
        enviando={fase.tipo === "enviando" ? fase.metodo : null}
        erroEnvio={fase.tipo === "formulario" ? fase.erroEnvio : undefined}
        onEnviar={enviar}
      />
    );
  }

  if (fase.tipo === "conexao") {
    return (
      <TelaConexao
        aba={fase.aba}
        idEnvio={fase.idEnvio}
        metodoInicial={fase.metodo}
        onConcluido={(conversas, mensagens) => setFase({ tipo: "pronto", aba: fase.aba, responsavel: fase.responsavel, conversas, mensagens, conectou: true })}
        onPular={() => setFase({ tipo: "pronto", aba: fase.aba, responsavel: fase.responsavel, conversas: 0, mensagens: 0, conectou: false })}
      />
    );
  }

  return <TelaPronto {...fase} />;
}

function TelaPronto({ aba, responsavel, conversas, mensagens, conectou }: Extract<Fase, { tipo: "pronto" }>) {
  return (
    <main className="coluna-estreita">
      <div className="topo-marca"><Marca /></div>
      <div className="cartao centro">
        <div className="selo-ok" aria-hidden="true">✓</div>
        <h1>Pronto{responsavel ? `, ${responsavel}` : ""}</h1>
        {conectou ? (
          <p className="texto-2">
            As respostas de <strong>{aba}</strong> e <strong>{conversas} conversa{conversas === 1 ? "" : "s"}</strong>
            {" "}({mensagens.toLocaleString("pt-BR")} mensagens) já estão com a Babel. O WhatsApp foi desconectado.
          </p>
        ) : (
          <p className="texto-2">As respostas de <strong>{aba}</strong> já estão com a Babel. Pode fechar esta página.</p>
        )}
      </div>
    </main>
  );
}

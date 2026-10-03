/**
 * Tela de conexão do WhatsApp — abre o SSE de /api/whatsapp-qr e mostra o
 * caminho escolhido: QR code de "aparelho conectado" ou código de pareamento
 * (pra quem só tem o celular na mão). Depois é tudo igual nos dois: progresso
 * da leitura do histórico e envio pra planilha. Portado do
 * ImportarWhatsappPessoal.tsx da Babel (sem a fase de revisão/IA).
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { lerSse } from "./sse";
import { CampoTelefone, Marca, telefoneValido, type MetodoConexao } from "./Formulario";
import { somenteDigitos } from "./campos";

export type Metodo = "qr" | "codigo";

type Celular = "iphone" | "android";

// Caminho do menu muda entre iPhone e Android (textos do WhatsApp em pt-BR).
const PASSOS_QR: Record<Celular, string[][]> = {
  iphone: [
    ["No iPhone com o WhatsApp da empresa, toque em ", "Configurações", " (canto de baixo, à direita)"],
    ["Toque em ", "Aparelhos conectados", " → ", "Conectar um aparelho"],
    ["Desbloqueie com Face ID ou senha e aponte a câmera pro QR abaixo"],
  ],
  android: [
    ["No Android com o WhatsApp da empresa, toque nos ", "três pontinhos", " (canto de cima, à direita)"],
    ["Toque em ", "Aparelhos conectados", " → ", "Conectar um aparelho"],
    ["Aponte a câmera pro QR abaixo"],
  ],
};

const PASSOS_CODIGO: string[][] = [
  ["No WhatsApp da empresa, vá em ", "Configurações", " → ", "Aparelhos conectados"],
  ["Toque em ", "Conectar um aparelho", " → ", "Conectar com número de telefone"],
  ["Digite o código que aparece aqui em cima"],
];

function celularProvavel(): Celular {
  // Quem abre no computador não dá pista; iPhone é o padrão mais comum entre os clientes.
  return /android/i.test(navigator.userAgent) ? "android" : "iphone";
}

/** 8 chars vindos do WhatsApp; parte no meio só pra ficar fácil de ler/digitar. */
function formatarCodigo(codigo: string): string {
  const limpo = codigo.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return limpo.length === 8 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : limpo;
}

type Fase =
  | { tipo: "pedindo_numero" }
  | { tipo: "conectando" }
  | { tipo: "qr"; qrDataUrl: string }
  | { tipo: "codigo"; codigo: string }
  | { tipo: "andando"; mensagem: string }
  | { tipo: "erro"; mensagem: string };

type Props = {
  aba: string;
  idEnvio: string;
  /** "qr" ou "codigo" — o botão que a pessoa apertou no formulário. */
  metodoInicial: Exclude<MetodoConexao, "sem">;
  onConcluido: (conversas: number, mensagens: number) => void;
  onPular: () => void;
};

export function TelaConexao({ aba, idEnvio, metodoInicial, onConcluido, onPular }: Props) {
  const [metodo, setMetodo] = useState<Metodo>(metodoInicial);
  const [telefone, setTelefone] = useState("");
  // Cada sessão é uma tentativa de conexão: mudar o número aqui reabre o SSE.
  const [sessao, setSessao] = useState<{ n: number; metodo: Metodo; telefone: string } | null>(
    metodoInicial === "qr" ? { n: 1, metodo: "qr", telefone: "" } : null,
  );
  const [fase, setFase] = useState<Fase>(metodoInicial === "qr" ? { tipo: "conectando" } : { tipo: "pedindo_numero" });
  const [copiou, setCopiou] = useState(false);
  const [celular, setCelular] = useState<Celular>(celularProvavel);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!sessao) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setFase({ tipo: "conectando" });
    void iniciar(ctrl.signal, sessao);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao]);

  async function iniciar(signal: AbortSignal, atual: { metodo: Metodo; telefone: string }) {
    try {
      const resp = await fetch("/api/whatsapp-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aba,
          id_envio: idEnvio,
          metodo: atual.metodo,
          telefone: atual.metodo === "codigo" ? `55${somenteDigitos(atual.telefone)}` : undefined,
        }),
        signal,
      });
      if (!resp.ok || !resp.body) {
        setFase({ tipo: "erro", mensagem: `Não consegui abrir a conexão (HTTP ${resp.status}).` });
        return;
      }
      await lerSse(resp, async (evento, dados) => {
        if (evento === "qr") {
          const qrDataUrl = await QRCode.toDataURL(String(dados.qr), { margin: 1, width: 260 });
          setFase({ tipo: "qr", qrDataUrl });
        } else if (evento === "codigo") {
          setCopiou(false);
          setFase({ tipo: "codigo", codigo: formatarCodigo(String(dados.codigo)) });
        } else if (evento === "status") {
          setFase({ tipo: "andando", mensagem: String(dados.mensagem ?? "Processando…") });
        } else if (evento === "done") {
          onConcluido(Number(dados.conversas ?? 0), Number(dados.mensagens ?? 0));
        } else if (evento === "erro") {
          setFase({ tipo: "erro", mensagem: String(dados.mensagem ?? "Falha ao conectar.") });
        }
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setFase({ tipo: "erro", mensagem: (e as Error).message || "Falha inesperada." });
    }
  }

  function comecar(qual: Metodo) {
    abortRef.current?.abort();
    setMetodo(qual);
    if (qual === "codigo" && !telefoneValido(telefone)) {
      setSessao(null);
      setFase({ tipo: "pedindo_numero" });
      return;
    }
    setSessao((s) => ({ n: (s?.n ?? 0) + 1, metodo: qual, telefone }));
  }

  function trocarMetodo() {
    comecar(metodo === "qr" ? "codigo" : "qr");
  }

  function pedirOutroNumero() {
    abortRef.current?.abort();
    setSessao(null);
    setFase({ tipo: "pedindo_numero" });
  }

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo.replace("-", ""));
      setCopiou(true);
    } catch { /* sem permissão de área de transferência: a pessoa digita olhando */ }
  }

  function pular() {
    abortRef.current?.abort();
    onPular();
  }

  const esperandoVinculo = fase.tipo === "pedindo_numero" || fase.tipo === "conectando" || fase.tipo === "qr" || fase.tipo === "codigo";

  return (
    <main className="coluna-estreita">
      <div className="topo-marca"><Marca /></div>
      <div className="cartao">
        <span className="pill ok"><i aria-hidden="true"></i> Respostas enviadas</span>
        <h1 className="titulo-qr">Agora conecte o WhatsApp de {aba}</h1>
        <p className="sub">Leitura única do histórico. Ao terminar, o aparelho é desconectado sozinho — nada fica vinculado.</p>

        {fase.tipo === "pedindo_numero" && (
          <div className="estado">
            <label className="campo" htmlFor="telefone-codigo">
              <span className="rotulo-solto">Número do WhatsApp que você vai conectar</span>
              <CampoTelefone id="telefone-codigo" valor={telefone} onChange={setTelefone} autoFoco />
              <span className="ajuda">Com DDD. É nesse aparelho que o código vai ser digitado.</span>
            </label>
            <div className="acoes-linha">
              <button
                type="button"
                className="btn btn-primario"
                disabled={!telefoneValido(telefone)}
                onClick={() => comecar("codigo")}
              >
                Gerar código
              </button>
              <button type="button" className="btn btn-leve" onClick={() => comecar("qr")}>Prefiro o QR code</button>
            </div>
          </div>
        )}

        {(fase.tipo === "conectando" || fase.tipo === "qr") && (
          <>
            <div className="abas-celular" role="group" aria-label="Qual celular tem o WhatsApp da empresa?">
              <button type="button" aria-pressed={celular === "iphone"} onClick={() => setCelular("iphone")}>iPhone</button>
              <button type="button" aria-pressed={celular === "android"} onClick={() => setCelular("android")}>Android</button>
            </div>
            <ol className="passos">
              {PASSOS_QR[celular].map((partes, i) => (
                <li key={i}><b>{i + 1}</b><span>{partes.map((t, j) => (j % 2 === 1 ? <strong key={j}>{t}</strong> : t))}</span></li>
              ))}
            </ol>
          </>
        )}

        {fase.tipo === "conectando" && (
          <div className="qr-box qr-vazio">
            <span className="pill andando"><i aria-hidden="true"></i> {metodo === "codigo" ? "Gerando o código…" : "Gerando o QR…"}</span>
          </div>
        )}

        {fase.tipo === "qr" && (
          <>
            <div className="qr-box"><img src={fase.qrDataUrl} alt="QR code pra conectar o WhatsApp" width={260} height={260} /></div>
            <p className="sub centro">
              Abra este link num computador. No celular que tem o WhatsApp, vá em <strong>Configurações</strong> →{" "}
              <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e aponte a câmera para o QR code.
            </p>
            <div className="acoes-linha" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-leve" onClick={() => comecar("qr")}>Gerar novamente</button>
              <button type="button" className="btn btn-leve" onClick={trocarMetodo}>Conectar por código</button>
            </div>
          </>
        )}

        {fase.tipo === "codigo" && (
          <>
            <div className="codigo-box">
              <strong>{fase.codigo}</strong>
              <button type="button" className="btn-mini" onClick={() => copiar(fase.codigo)}>{copiou ? "Copiado" : "Copiar"}</button>
            </div>
            <ol className="passos">
              {PASSOS_CODIGO.map((partes, i) => (
                <li key={i}><b>{i + 1}</b><span>{partes.map((t, j) => (j % 2 === 1 ? <strong key={j}>{t}</strong> : t))}</span></li>
              ))}
            </ol>
            <p className="sub centro">O código vale por alguns minutos. Não feche esta página.</p>
            <div className="acoes-linha" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-leve" onClick={() => comecar("codigo")}>Gerar novamente</button>
              <button type="button" className="btn btn-leve" onClick={pedirOutroNumero}>Trocar o número</button>
              <button type="button" className="btn btn-leve" onClick={trocarMetodo}>Conectar por QR code</button>
            </div>
          </>
        )}

        {fase.tipo === "andando" && (
          <div className="estado">
            <span className="pill andando"><i aria-hidden="true"></i> Conectado</span>
            <p className="linha-status">WhatsApp conectado. A Babel já está trazendo as conversas para aprender como vocês atendem.</p>
            <p className="linha-status">{fase.mensagem}</p>
            <p className="sub">Deixe esta página aberta — pode levar alguns minutos, dependendo do tamanho do histórico.</p>
          </div>
        )}

        {fase.tipo === "erro" && (
          <div className="estado">
            <p className="erro-geral" role="alert">{fase.mensagem}</p>
            <div className="dica-erro">
              Antes de tentar de novo:
              <ul>
                <li>Atualize o WhatsApp do celular (App Store ou Play Store).</li>
                <li>Veja se o celular está com internet e com o WhatsApp aberto.</li>
                <li>Em <strong>Aparelhos conectados</strong>, o limite é 4 aparelhos. Se estiver cheio, desconecte um.</li>
              </ul>
            </div>
            <div className="acoes-linha">
              <button type="button" className="btn btn-primario" onClick={() => comecar(metodo)}>Gerar novamente</button>
              <button type="button" className="btn btn-leve" onClick={trocarMetodo}>
                {metodo === "qr" ? "Conectar por código" : "Conectar por QR code"}
              </button>
              <button type="button" className="btn btn-leve" onClick={pular}>Seguir sem conectar</button>
            </div>
          </div>
        )}
      </div>

      <div className="aviso"><i aria-hidden="true"></i><span>Só conversas de texto, individuais. Grupos e mídias não entram. O histórico é o que o celular sincroniza no vínculo — normalmente os últimos meses.</span></div>

      {esperandoVinculo && (
        <button type="button" className="btn btn-leve auto-centro" onClick={pular}>Não quero conectar agora</button>
      )}
    </main>
  );
}

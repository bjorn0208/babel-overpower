/**
 * PreJoin — etapa de entrada da sala pública (estilo Google Meet):
 * marca do tenant no topo, preview da câmera com toggles e painel
 * "Pronto para participar?". Quando a sala exige aprovação, o botão
 * vira "Pedir para entrar".
 */

import { estiloInput } from "@/apps/user/reuniao/reuniao-ui";
import PreviewCamera from "./PreviewCamera";
import MarcaEmpresa, { type InfoMarca } from "./MarcaEmpresa";
import { s } from "./sala-estilos";

type Props = {
  marca: InfoMarca | null;
  exigeAprovacao: boolean;
  nome: string;
  onNome: (valor: string) => void;
  micDesligado: boolean;
  camDesligada: boolean;
  onAlternarMic: () => void;
  onAlternarCam: () => void;
  erro: string | null;
  entrando: boolean;
  onEntrar: () => void;
};

export default function PreJoin({
  marca,
  exigeAprovacao,
  nome,
  onNome,
  micDesligado,
  camDesligada,
  onAlternarMic,
  onAlternarCam,
  erro,
  entrando,
  onEntrar,
}: Props) {
  const rotuloBotao = entrando
    ? "Enviando…"
    : exigeAprovacao
      ? "Pedir para entrar"
      : "Participar agora";

  return (
    <>
      {marca ? (
        <MarcaEmpresa marca={marca} />
      ) : (
        <div style={s.topo}>
          <span style={s.marca}>Reunião</span>
        </div>
      )}

      <div style={s.principal}>
        <div style={s.colunaPreview} className="reu-surgir">
          <PreviewCamera
            nome={nome}
            micDesligado={micDesligado}
            camDesligada={camDesligada}
            onAlternarMic={onAlternarMic}
            onAlternarCam={onAlternarCam}
          />
        </div>

        <div style={s.colunaPainel} className="reu-surgir">
          <h1 style={s.tituloPainel}>Pronto para participar?</h1>
          <p style={s.subPainel}>
            {exigeAprovacao
              ? "Esta sala tem entrada controlada: o anfitrião precisa autorizar você."
              : "Você vai entrar como convidado. Diga seu nome pra todo mundo te reconhecer na chamada."}
          </p>

          <input
            type="text"
            className="reu-input"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => onNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEntrar();
            }}
            style={{ ...estiloInput, maxWidth: 320, textAlign: "center", borderRadius: 999 }}
            autoFocus
            maxLength={60}
            aria-label="Seu nome na chamada"
          />

          {erro && (
            <p style={{ ...s.erro, maxWidth: 320 }} role="alert">
              {erro}
            </p>
          )}

          <button
            type="button"
            className="reu-btn reu-btn-primario"
            onClick={onEntrar}
            disabled={entrando}
            style={{ minWidth: 200, padding: "13px 28px", fontSize: 15 }}
          >
            {rotuloBotao}
          </button>
        </div>
      </div>
    </>
  );
}

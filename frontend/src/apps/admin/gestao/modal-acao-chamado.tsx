/** Escalar, devolver, resolver, não resolvido e reabrir (spec 7b). Valida aqui (logica-chamados) e o banco confere de novo. */
import { useState } from "react";
import { BotaoAcao, Campo, Modal } from "./ui-gestao";
import { numeroChamado, validarAcao, type AcaoChamado } from "./logica-chamados";
import { mudarChamado } from "./dados-chamados";
import { mensagemDeErro } from "./dados";
import type { Chamado, ToastApi } from "./tipos";

type AcaoModal = Exclude<AcaoChamado, "registrar" | "editar">;
const TITULO: Record<AcaoModal, string> = {
  escalar: "Escalar para o P&D", devolver: "Devolver ao Suporte", resolver: "Resolver chamado", nao_resolvido: "Fechar como não resolvido", reabrir: "Reabrir chamado",
};

export function ModalAcaoChamado({ chamado, acao, onClose, onFeito, t }: {
  chamado: Chamado; acao: AcaoModal; onClose: () => void; onFeito: () => void; t: ToastApi;
}) {
  const [motivo, setMotivo] = useState("");
  const [causa, setCausa] = useState(chamado.causa ?? "");
  const [solucao, setSolucao] = useState(chamado.solucao ?? "");
  const [resultado, setResultado] = useState(chamado.resultado ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    const e = validarAcao(acao, { motivo, causa, solucao, resultado });
    if (e) return setErro(e);
    setSalvando(true); setErro(null);
    try {
      if (acao === "escalar") await mudarChamado(chamado.id, { status: "aguardando_equipe" }, motivo);
      if (acao === "devolver") await mudarChamado(chamado.id, { status: "andamento" }, motivo);
      if (acao === "reabrir") await mudarChamado(chamado.id, { status: "andamento" }, motivo);
      if (acao === "resolver") await mudarChamado(chamado.id, { status: "resolvido", causa, solucao, resultado });
      if (acao === "nao_resolvido") await mudarChamado(chamado.id, { status: "nao_resolvido", resultado });
      t.success(`${TITULO[acao]}: feito.`);
      onFeito();
    } catch (err) {
      setErro(mensagemDeErro(err, "Não consegui salvar."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={`${TITULO[acao]} ${numeroChamado(chamado.numero)}`} onClose={onClose} largura={520}
      rodape={<><BotaoAcao onClick={onClose}>Cancelar</BotaoAcao><BotaoAcao primario desabilitado={salvando} onClick={confirmar}>Confirmar</BotaoAcao></>}>
      {(acao === "escalar" || acao === "devolver" || acao === "reabrir") && (
        <Campo rotulo={acao === "escalar" ? "O que o P&D precisa resolver" : acao === "devolver" ? "O que foi feito" : "Por que reabrir"}>
          <textarea className="input" rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      )}
      {acao === "resolver" && (<>
        <Campo rotulo="Causa (o que provocou o problema)"><textarea className="input" rows={2} value={causa} onChange={(e) => setCausa(e.target.value)} /></Campo>
        <Campo rotulo="Solução (o que foi feito)"><textarea className="input" rows={3} value={solucao} onChange={(e) => setSolucao(e.target.value)} /></Campo>
        <Campo rotulo="Resultado (como ficou para o cliente)"><textarea className="input" rows={2} value={resultado} onChange={(e) => setResultado(e.target.value)} /></Campo>
      </>)}
      {acao === "nao_resolvido" && (
        <Campo rotulo="Justificativa"><textarea className="input" rows={3} value={resultado} onChange={(e) => setResultado(e.target.value)} /></Campo>
      )}
      {erro && <p className="small" role="alert" style={{ color: "var(--os-erro)" }}>{erro}</p>}
    </Modal>
  );
}

/** Abrir chamado (spec 7b "Novo chamado"). O nome do cliente vem do banco (gestao_chamado_abrir), nunca desta tela. */
import { useEffect, useState } from "react";
import { BotaoAcao, Campo, Modal } from "./ui-gestao";
import { CANAIS_CHAMADO, CATEGORIAS_CHAMADO } from "./logica-chamados";
import { abrirChamado, clientesParaChamado } from "./dados-chamados";
import { mensagemDeErro } from "./dados";
import type { PrioridadeChamado, ToastApi } from "./tipos";

/**
 * Responsável do chamado (2026-09-25, Adrian): escolhido entre as pessoas de suporte do app Equipe
 * (calculos.membrosSuporte), nunca digitado. Um valor antigo que não está na lista continua visível, marcado.
 */
export function SeletorResponsavel({ valor, equipe, onChange, desabilitado }: {
  valor: string; equipe: string[]; onChange: (v: string) => void; desabilitado?: boolean;
}) {
  return (
    <select className="input" value={valor} disabled={desabilitado} aria-label="Responsável" onChange={(e) => onChange(e.target.value)}>
      <option value="">Ninguém ainda</option>
      {equipe.map((n) => <option key={n} value={n}>{n}</option>)}
      {valor && !equipe.includes(valor) && <option value={valor}>{valor} (fora do app Equipe)</option>}
    </select>
  );
}

export function ModalNovoChamado({ onClose, onCriado, t, responsavelPadrao, equipe, clienteFixo, atendId }: {
  onClose: () => void; onCriado: (id: string) => void; t: ToastApi; responsavelPadrao: string;
  /** Pessoas de suporte do app Equipe (calculos.membrosSuporte). */
  equipe: string[];
  clienteFixo?: { id: string; nome: string }; atendId?: string | null;
}) {
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string }>>(clienteFixo ? [clienteFixo] : []);
  const [clienteId, setClienteId] = useState(clienteFixo?.id ?? "");
  const [titulo, setTitulo] = useState("");
  const [relato, setRelato] = useState("");
  const [canal, setCanal] = useState("whatsapp");
  const [relatadoPor, setRelatadoPor] = useState("");
  const [categoria, setCategoria] = useState("agente");
  const [prioridade, setPrioridade] = useState<PrioridadeChamado>("media");
  const [responsavel, setResponsavel] = useState(equipe.includes(responsavelPadrao) ? responsavelPadrao : "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (clienteFixo) return;
    clientesParaChamado().then(setClientes).catch((e) => setErro(mensagemDeErro(e, "Não consegui carregar os clientes.")));
  }, [clienteFixo]);

  const salvar = async () => {
    if (!clienteId) return setErro("Escolha o cliente.");
    if (titulo.trim().length < 3) return setErro("Escreva um título (3 letras ou mais).");
    if (!relato.trim()) return setErro("Escreva o que o cliente relatou.");
    setSalvando(true); setErro(null);
    try {
      const id = await abrirChamado({ clienteId, titulo, relato, canal, relatadoPor, categoria, prioridade, responsavel, atendId });
      t.success("Chamado aberto.");
      onCriado(id);
    } catch (e) {
      setErro(mensagemDeErro(e, "Não consegui abrir o chamado."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Novo chamado" onClose={onClose} largura={560}
      rodape={<><BotaoAcao onClick={onClose}>Cancelar</BotaoAcao><BotaoAcao primario desabilitado={salvando} onClick={salvar}>{salvando ? "Abrindo…" : "Abrir chamado"}</BotaoAcao></>}>
      <Campo rotulo="Cliente">
        <select className="input" value={clienteId} disabled={!!clienteFixo} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Escolha…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Título"><input className="input" value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: agente não responde no WhatsApp" /></Campo>
      <Campo rotulo="O que o cliente relatou"><textarea className="input" rows={4} value={relato} onChange={(e) => setRelato(e.target.value)} /></Campo>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Campo rotulo="Canal"><select className="input" value={canal} onChange={(e) => setCanal(e.target.value)}>{CANAIS_CHAMADO.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
        <Campo rotulo="Quem relatou"><input className="input" value={relatadoPor} onChange={(e) => setRelatadoPor(e.target.value)} placeholder="Ex.: dono da conta" /></Campo>
        <Campo rotulo="Categoria"><select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>{CATEGORIAS_CHAMADO.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
        <Campo rotulo="Prioridade"><select className="input" value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeChamado)}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></Campo>
      </div>
      <Campo rotulo="Responsável"><SeletorResponsavel valor={responsavel} equipe={equipe} onChange={setResponsavel} /></Campo>
      {erro && <p className="small" role="alert" style={{ color: "var(--os-erro)" }}>{erro}</p>}
    </Modal>
  );
}

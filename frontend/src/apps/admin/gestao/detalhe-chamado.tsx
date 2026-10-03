/** Janela do chamado (spec 7b): campos no topo (editáveis por quem pode), linha do tempo, caixa de registro e botões. */
import { useCallback, useEffect, useState } from "react";
import { BotaoAcao, Campo, Modal, Selo } from "./ui-gestao";
import {
  CATEGORIAS_CHAMADO, ROTULO_STATUS_CHAMADO, TOM_STATUS_CHAMADO, acoesDoChamado, numeroChamado, rotuloCanal, momentoDoRegistro, type AcaoChamado,
} from "./logica-chamados";
import { lerEventos, mudarChamado, registrarNoChamado } from "./dados-chamados";
import { LinhaTempoChamado } from "./linha-tempo-chamado";
import { SeletorResponsavel } from "./modal-novo-chamado";
import { ModalAcaoChamado } from "./modal-acao-chamado";
import { mensagemDeErro } from "./dados";
import type { Chamado, EventoChamado, Papel, PrioridadeChamado, StatusChamado, ToastApi } from "./tipos";

const agoraLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function DetalheChamado({ chamado, papeis, t, onClose, recarregar, onFicha, equipe }: {
  chamado: Chamado; papeis: Papel[]; t: ToastApi; onClose: () => void; recarregar: () => Promise<void>;
  /** Abre a ficha do cliente (spec 7d). Quem renderiza o detalhe decide onde a ficha aparece. */
  onFicha: (clienteId: string) => void;
  /** Pessoas de suporte do app Equipe (calculos.membrosSuporte), para o responsável. */
  equipe: string[];
}) {
  const [eventos, setEventos] = useState<EventoChamado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"nota_interna" | "contato_cliente">("nota_interna");
  const [texto, setTexto] = useState("");
  const [quando, setQuando] = useState(agoraLocal());
  // valor que o campo tinha ao abrir/limpar: se continuar igual, a hora exata é a do banco (momentoDoRegistro)
  const [quandoInicial, setQuandoInicial] = useState(quando);
  const [acao, setAcao] = useState<Exclude<AcaoChamado, "registrar" | "editar"> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const acoes = acoesDoChamado(chamado, papeis);
  const ehSuporte = papeis.includes("admin") || papeis.includes("suporte");

  const carregar = useCallback(() => lerEventos(chamado.id).then(setEventos).catch((e) => setErro(mensagemDeErro(e, "Não consegui carregar a linha do tempo."))), [chamado.id]);
  useEffect(() => { carregar(); }, [carregar, chamado.atualizado_em]);
  const depois = async () => { await recarregar(); await carregar(); };

  const registrar = async () => {
    if (!texto.trim()) return setErro("Escreva o texto do registro.");
    setSalvando(true); setErro(null);
    try {
      await registrarNoChamado(chamado.id, tipo, texto, momentoDoRegistro(quando, quandoInicial));
      setTexto(""); const q = agoraLocal(); setQuando(q); setQuandoInicial(q);
      await depois();
    } catch (e) { setErro(mensagemDeErro(e, "Não consegui registrar.")); } finally { setSalvando(false); }
  };
  const mudarCampo = async (campos: { status?: StatusChamado; prioridade?: PrioridadeChamado; categoria?: string; responsavel?: string | null }) => {
    setErro(null);
    try { await mudarChamado(chamado.id, campos); await depois(); } catch (e) { setErro(mensagemDeErro(e, "Não consegui salvar a mudança.")); }
  };
  const editavel = acoes.includes("editar");
  const STATUS_LIVRES: StatusChamado[] = ["aberto", "andamento", "aguardando_cliente"];

  return (
    <Modal titulo={`${numeroChamado(chamado.numero)} · ${chamado.titulo}`} onClose={onClose} largura={760}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Campo rotulo="Código">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="mono">{numeroChamado(chamado.numero)}</span>
            <BotaoAcao titulo="Copiar para usar no terminal" onClick={() => navigator.clipboard?.writeText(numeroChamado(chamado.numero)).then(() => t.success("Código copiado."), () => setErro("Não consegui copiar."))}>Copiar</BotaoAcao>
          </div>
        </Campo>
        <Campo rotulo="Cliente"><div>{chamado.cliente_nome} <BotaoAcao onClick={() => onFicha(chamado.cliente_id)}>Ficha do cliente</BotaoAcao></div></Campo>
        <Campo rotulo="Status">
          {editavel && STATUS_LIVRES.includes(chamado.status) ? (
            <select className="input" value={chamado.status} onChange={(e) => mudarCampo({ status: e.target.value as StatusChamado })}>
              {STATUS_LIVRES.map((s) => <option key={s} value={s}>{ROTULO_STATUS_CHAMADO[s]}</option>)}
            </select>
          ) : <div><Selo tom={TOM_STATUS_CHAMADO[chamado.status]}>{ROTULO_STATUS_CHAMADO[chamado.status]}</Selo></div>}
        </Campo>
        <Campo rotulo="Prioridade">
          <select className="input" disabled={!editavel} value={chamado.prioridade} onChange={(e) => mudarCampo({ prioridade: e.target.value as PrioridadeChamado })}>
            <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </select>
        </Campo>
        <Campo rotulo="Categoria">
          <select className="input" disabled={!editavel} value={chamado.categoria} onChange={(e) => mudarCampo({ categoria: e.target.value })}>
            {CATEGORIAS_CHAMADO.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Responsável">
          <SeletorResponsavel valor={chamado.responsavel ?? ""} equipe={equipe} desabilitado={!editavel}
            onChange={(v) => { if ((v || null) !== chamado.responsavel) mudarCampo({ responsavel: v || null }); }} />
        </Campo>
        <Campo rotulo="Canal / quem relatou"><div>{rotuloCanal(chamado.canal)}{chamado.relatado_por ? ` · ${chamado.relatado_por}` : ""}</div></Campo>
      </div>

      <div className="h3" style={{ margin: "8px 0 0" }}>Linha do tempo</div>
      <LinhaTempoChamado eventos={eventos} />

      {acoes.includes("registrar") && (
        <div className="os-card" style={{ padding: 14, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              <option value="nota_interna">Nota interna</option>
              {ehSuporte && <option value="contato_cliente">Contato com o cliente</option>}
            </select>
            <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              quando aconteceu <input className="input" type="datetime-local" value={quando} max={agoraLocal()} onChange={(e) => setQuando(e.target.value)} />
            </label>
          </div>
          <textarea className="input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que foi feito, falado ou descoberto" />
          <div><BotaoAcao primario desabilitado={salvando} onClick={registrar}>{salvando ? "Registrando…" : "Registrar"}</BotaoAcao></div>
        </div>
      )}

      {erro && <p className="small" role="alert" style={{ color: "var(--os-erro)" }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {acoes.includes("escalar") && <BotaoAcao onClick={() => setAcao("escalar")}>Escalar para P&D</BotaoAcao>}
        {acoes.includes("devolver") && <BotaoAcao onClick={() => setAcao("devolver")}>Devolver ao Suporte</BotaoAcao>}
        {acoes.includes("resolver") && <BotaoAcao primario onClick={() => setAcao("resolver")}>Resolver</BotaoAcao>}
        {acoes.includes("nao_resolvido") && <BotaoAcao onClick={() => setAcao("nao_resolvido")}>Não resolvido</BotaoAcao>}
        {acoes.includes("reabrir") && <BotaoAcao onClick={() => setAcao("reabrir")}>Reabrir</BotaoAcao>}
      </div>

      {acao && <ModalAcaoChamado chamado={chamado} acao={acao} t={t} onClose={() => setAcao(null)} onFeito={async () => { setAcao(null); await depois(); }} />}
    </Modal>
  );
}

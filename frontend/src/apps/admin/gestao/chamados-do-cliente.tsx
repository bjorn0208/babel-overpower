/** Ficha do cliente (spec 7b e 7d): cadastro, implementação, acompanhamento (SEM valores financeiros, vêm do banco já sem eles) e TODOS
 *  os chamados, abertos e fechados; qualquer um abre. Quem vê o chamado vê a ficha (gestao_chamado_ficha confere). */
import { useEffect, useState } from "react";
import { Campo, Modal, Selo, Vazio } from "./ui-gestao";
import { definirLinkDrive, lerFicha, type FichaCliente } from "./dados-chamados";
import { mensagemDeErro } from "./dados";
import {
  ROTULO_STATUS_CHAMADO, TOM_STATUS_CHAMADO, chamadosDoCliente, clienteEmDia, numeroChamado, podeEditarDrive, rotuloCategoria, validarLinkDrive,
} from "./logica-chamados";
import type { Chamado, Papel, ToastApi } from "./tipos";

/** Defesa extra (spec 7): só vira link o que começa com https:// — o banco já barra o resto, mas a tela não confia. */
const linkSeguro = (v: string | null | undefined): string | null => (v && /^https:\/\/\S+$/.test(v) ? v : null);

export function ChamadosDoCliente({ clienteId, chamados, onAbrir, onClose, papeis = [], t }: {
  clienteId: string; chamados: Chamado[]; onAbrir: (id: string) => void; onClose: () => void; papeis?: Papel[]; t?: ToastApi;
}) {
  const lista = chamadosDoCliente(chamados, clienteId);
  const [ficha, setFicha] = useState<FichaCliente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editandoDrive, setEditandoDrive] = useState(false);
  const [textoDrive, setTextoDrive] = useState("");
  const [erroDrive, setErroDrive] = useState<string | null>(null);
  const [salvandoDrive, setSalvandoDrive] = useState(false);
  const carregar = () => lerFicha(clienteId).then(setFicha).catch((e) => setErro(mensagemDeErro(e, "Não consegui carregar a ficha.")));
  useEffect(() => { void carregar(); }, [clienteId]); // eslint-disable-line react-hooks/exhaustive-deps
  const editaDrive = podeEditarDrive(papeis);
  const salvarDrive = async () => {
    const msg = validarLinkDrive(textoDrive);
    if (msg) { setErroDrive(msg); return; }
    setSalvandoDrive(true); setErroDrive(null);
    try {
      await definirLinkDrive(clienteId, textoDrive.trim());
      t?.success(textoDrive.trim() ? "Link da pasta salvo." : "Link da pasta removido.");
      setEditandoDrive(false);
      await carregar();
    } catch (e) {
      const m = mensagemDeErro(e, "Não consegui salvar o link do Drive.");
      setErroDrive(m); t?.error(m);
    } finally { setSalvandoDrive(false); }
  };
  const emDia = ficha ? clienteEmDia(ficha.acompanhamentos, lista) : false;
  const drive = linkSeguro(ficha?.cliente.link_drive);
  const nome = ficha?.cliente.nome ?? lista[0]?.cliente_nome ?? "Cliente";
  const data = (v: string | null) => (v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR") : "—");
  const k = ficha?.cliente;
  return (
    <Modal titulo={`Ficha de ${nome}`} onClose={onClose} largura={720}>
      {erro && <p className="small" role="alert" style={{ color: "var(--os-erro)" }}>{erro}</p>}
      {emDia && <div style={{ marginBottom: 8 }}><Selo tom="ok">Em dia</Selo></div>}
      {k && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <Campo rotulo="E-mail"><div className="gestao-email">{k.email ?? "—"}</div></Campo>
          <Campo rotulo="Telefone"><div style={{ whiteSpace: "nowrap" }}>{k.telefone ?? "—"}</div></Campo>
          <Campo rotulo="Situação do plano"><div>{k.situacao ?? "—"}</div></Campo>
          <Campo rotulo="Fechamento"><div>{data(k.fechamento)}</div></Campo>
          <Campo rotulo="Implantação"><div>{data(k.implantacao)}</div></Campo>
          <Campo rotulo="Implementador / suporte"><div>{k.implementador ?? "—"} / {k.suporte ?? "—"}</div></Campo>
          <Campo rotulo="Pasta do cliente (Drive)">
            {editandoDrive ? (
              <div className="col gap-1">
                <input className="input" type="url" value={textoDrive} placeholder="https://drive.google.com/…" maxLength={500}
                  aria-label="Link da pasta do cliente no Drive" onChange={(e) => { setTextoDrive(e.target.value); setErroDrive(null); }} />
                {erroDrive && <span className="tiny" role="alert" style={{ color: "var(--os-erro)" }}>{erroDrive}</span>}
                <div className="row gap-1">
                  <button type="button" className="btn btn-primary btn-sm" disabled={salvandoDrive} onClick={() => void salvarDrive()}>Salvar</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={salvandoDrive} onClick={() => { setEditandoDrive(false); setErroDrive(null); }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="row gap-1" style={{ flexWrap: "wrap", alignItems: "center" }}>
                {drive ? <a href={drive} target="_blank" rel="noopener noreferrer">Abrir pasta do cliente ↗</a> : <span>—</span>}
                {editaDrive && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTextoDrive(k.link_drive ?? ""); setErroDrive(null); setEditandoDrive(true); }}>
                    {k.link_drive ? "Editar" : "Adicionar link"}
                  </button>
                )}
              </div>
            )}
          </Campo>
          {k.obs && <Campo rotulo="Observações"><div style={{ whiteSpace: "pre-wrap" }}>{k.obs}</div></Campo>}
        </div>
      )}
      {ficha && ficha.implementacoes.length > 0 && (<>
        <div className="h3">Implementação</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {ficha.implementacoes.map((im) => <li key={im.id}>{im.status ?? "—"} · resp. {im.responsavel ?? "—"} · enviada {data(im.enviado_em)} · concluída {data(im.concluido_em)}{im.obs_final ? ` · ${im.obs_final}` : ""}</li>)}
        </ul>
      </>)}
      {ficha && ficha.acompanhamentos.length > 0 && (<>
        <div className="h3">Acompanhamento 15 dias</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {ficha.acompanhamentos.map((a) => <li key={a.id}>{a.status ?? "—"} · resp. {a.responsavel ?? "—"} · início {data(a.inicio)} · concluído {data(a.concluido_em)}</li>)}
        </ul>
      </>)}
      <div className="h3">Chamados</div>
      {lista.length === 0 ? <Vazio titulo="Nenhum chamado deste cliente" /> : (
        <table className="tbl">
          <thead><tr><th>Nº</th><th>Aberto em</th><th>Título</th><th>Status</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => onAbrir(c.id)}>
                <td>{numeroChamado(c.numero)}</td>
                <td style={{ whiteSpace: "nowrap" }}>{new Date(c.aberto_em).toLocaleDateString("pt-BR")}</td>
                <td>{c.titulo}<div className="muted tiny">{rotuloCategoria(c.categoria)}</div></td>
                <td><Selo tom={TOM_STATUS_CHAMADO[c.status]}>{ROTULO_STATUS_CHAMADO[c.status]}</Selo></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

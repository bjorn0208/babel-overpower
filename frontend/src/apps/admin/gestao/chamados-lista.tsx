/** Vista "Chamados" da aba Suporte (spec 7b): destaque do que precisa de atenção, filtros, lista e botão Novo. */
import { useMemo, useState } from "react";
import { BotaoAcao, CartaoTabela, Selo, Vazio } from "./ui-gestao";
import {
  FILTRO_PADRAO, ROTULO_PRIORIDADE, ROTULO_STATUS_CHAMADO, TOM_PRIORIDADE, TOM_STATUS_CHAMADO, filtrarChamados, motivoAtencao,
  numeroChamado, ordenarChamados, precisaAtencao, rotuloCategoria, tempoDesde, type FiltroChamados,
} from "./logica-chamados";
import type { Chamado, PropsAba } from "./tipos";

export function VistaChamados({ dados, papeis, abrirChamado, onNovo, verCliente, filtroInicial }: Pick<PropsAba, "dados" | "papeis"> & {
  abrirChamado: (id: string) => void; onNovo: () => void; verCliente: (clienteId: string) => void; filtroInicial?: Partial<FiltroChamados>;
}) {
  const [f, setF] = useState<FiltroChamados>({ ...FILTRO_PADRAO, ...filtroInicial });
  const agora = useMemo(() => new Date(), [dados.chamados]);
  const atencao = useMemo(() => ordenarChamados(dados.chamados.filter((c) => precisaAtencao(c, agora)), agora), [dados.chamados, agora]);
  const lista = useMemo(() => ordenarChamados(filtrarChamados(dados.chamados, f), agora), [dados.chamados, f, agora]);
  const responsaveis = useMemo(() => [...new Set(dados.chamados.map((c) => c.responsavel).filter(Boolean) as string[])].sort(), [dados.chamados]);
  const podeAbrir = papeis.includes("admin") || papeis.includes("suporte");

  const linha = (c: Chamado) => (
    <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => abrirChamado(c.id)}>
      <td style={{ whiteSpace: "nowrap" }}>{numeroChamado(c.numero)}</td>
      <td><a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); verCliente(c.cliente_id); }}>{c.cliente_nome}</a></td>
      <td>{c.titulo}<div className="muted tiny">{rotuloCategoria(c.categoria)}</div></td>
      <td><Selo tom={TOM_PRIORIDADE[c.prioridade]}>{ROTULO_PRIORIDADE[c.prioridade]}</Selo></td>
      <td><Selo tom={TOM_STATUS_CHAMADO[c.status]}>{ROTULO_STATUS_CHAMADO[c.status]}</Selo></td>
      <td>{c.responsavel ?? <span className="muted">—</span>}</td>
      <td style={{ whiteSpace: "nowrap" }}>{tempoDesde(c.aberto_em, agora)}</td>
      <td style={{ whiteSpace: "nowrap" }}>{tempoDesde(c.atualizado_em, agora)}</td>
    </tr>
  );

  return (
    <>
      {atencao.length > 0 && (
        <div className="os-card glow-aurora" style={{ padding: "14px 16px", marginBottom: 12 }}>
          <strong>Precisam de atenção ({atencao.length})</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {atencao.slice(0, 6).map((c) => (
              <li key={c.id}><a href="#" onClick={(e) => { e.preventDefault(); abrirChamado(c.id); }}>{numeroChamado(c.numero)} {c.cliente_nome}: {c.titulo}</a>{" "}<span className="muted tiny">{motivoAtencao(c, agora)}</span></li>
            ))}
          </ul>
        </div>
      )}
      {/* mesma faixa de filtros da aba Implementação (aba-implementacao.tsx:212): largura fixa, lado a lado; o `input` sozinho ocupa 100% */}
      <div className="os-card row gap-2" style={{ padding: "14px 16px", margin: "12px 0", flexWrap: "wrap", alignItems: "center" }}>
        <select className="input" style={{ width: 170 }} aria-label="Filtrar por status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as FiltroChamados["status"] })}>
          <option value="abertos">Em aberto</option><option value="fechados">Fechados</option><option value="todos">Todos</option>
          {Object.entries(ROTULO_STATUS_CHAMADO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        <select className="input" style={{ width: 170 }} aria-label="Filtrar por prioridade" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value as FiltroChamados["prioridade"] })}>
          <option value="">Toda prioridade</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
        </select>
        <select className="input" style={{ width: 190 }} aria-label="Filtrar por responsável" value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })}>
          <option value="">Todo responsável</option>{responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input className="input" style={{ width: 220 }} aria-label="Buscar chamado" placeholder="Buscar nº, cliente ou texto" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} />
        {f.clienteId && <BotaoAcao onClick={() => setF({ ...f, clienteId: "" })}>Limpar cliente</BotaoAcao>}
        <span style={{ flex: 1 }} />
        {podeAbrir && <BotaoAcao primario tamanho="md" onClick={onNovo}>Novo chamado</BotaoAcao>}
      </div>
      {lista.length === 0 ? <Vazio titulo="Nenhum chamado com esses filtros" /> : (
        <CartaoTabela>
          <thead><tr><th>Nº</th><th>Cliente</th><th>Título</th><th>Prioridade</th><th>Status</th><th>Responsável</th><th>Aberto</th><th>Última mov.</th></tr></thead>
          <tbody>{lista.map(linha)}</tbody>
        </CartaoTabela>
      )}
    </>
  );
}

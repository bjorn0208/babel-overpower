/**
 * Aba Acessos — quem vê cada área; pedidos de acesso; papéis por pessoa. Só admin edita (D6c).
 * Original: financeiro.html:3309-3417 (viewAcessos, actAcessos, modalAcesso, modalAddPessoa), :3429-3436 (pessoasTime).
 *
 * Decisões aplicadas aqui:
 *  - "Em Acessos, pedidos de acesso mostram só a própria linha para quem não é admin": os dois filtros
 *    abaixo (`acessosVisiveis`, `pedidosVisiveis`) reduzem à própria linha (id === uid) quando o papel não
 *    inclui admin. Hoje não muda a tela: só o admin vê esta aba e lê acessos/pedidos (LEITURA em tipos.ts).
 *  - Lote 6 (2026-09-24, igual ao artefato :3375-3386): na própria linha, a pessoa só não pode TIRAR o próprio
 *    papel de admin (o checkbox "Admin" fica travado e, ao salvar, o admin é mantido). Os outros papéis e o
 *    "No time como" podem ser mudados. Antes o app travava todos os papéis da própria pessoa.
 *  - "+ Adicionar pessoa" busca com `buscarPerfis` (RPC gestao_buscar_perfis): equivalente do `USER.search()`.
 *  - Lote 6: "Como funciona" recolhível, com a nota adaptada à RLS; coluna "No time como" com "fora da equipe" e
 *    "não vinculado"; foto das pessoas; linha do administrador da plataforma quando ele não tem linha própria;
 *    confirmações com texto para Recusar e Remover acesso.
 */

import { useEffect, useState } from "react";
import { equipeSuporte } from "./calculos";
import { useConfirmacao } from "./confirmacao";
import { apagar, buscarPerfis, mensagemDeErro, perfis, removerAcesso, salvarAcesso, TABELAS } from "./dados";
import { nomesContexto } from "./logica-atendimento";
import {
  dataHoraBR,
  PAPEIS,
  podeEscrever,
  type Acesso,
  type Dados,
  type Papel,
  type PerfilBasico,
  type PropsAba,
  type ToastApi,
} from "./tipos";
import { AbaCasca, CabecalhoAba, Campo, CartaoTabela, Modal, Selo } from "./ui-gestao";

/** pessoasTime (:3429-3436): funcionários ativos + equipe de suporte + time comercial, sem repetir. */
function pessoasTime(dados: Pick<Dados, "funcionarios" | "config" | "vendedores">): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  const add = (n: string | null | undefined) => {
    const x = (n || "").trim();
    if (x && !vistos.has(x.toLowerCase())) {
      vistos.add(x.toLowerCase());
      out.push(x);
    }
  };
  dados.funcionarios.filter((f) => f.ativo !== false).forEach((f) => add(f.nome));
  equipeSuporte(dados.config).forEach(add);
  nomesContexto("ind", dados).forEach(add);
  return out.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const rotuloPapel = (k: Papel | string) => PAPEIS.find((p) => p.id === k)?.rotulo ?? k;

/** Foto da pessoa (:3287): imagem redonda do perfil ou as iniciais, com a classe `.avatar` da babel. */
function Foto({ perfil, nome }: { perfil?: PerfilBasico; nome: string }) {
  if (perfil?.avatar_url) {
    return <img src={perfil.avatar_url} alt="" className="avatar" style={{ objectFit: "cover" }} />;
  }
  const p = nome.trim().split(/\s+/).filter(Boolean);
  const ini = p.length ? ((p[0][0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] ?? ""))).toUpperCase() : "?";
  return (
    <span className="avatar" style={{ background: "var(--os-acento-2-soft)" }} aria-hidden>
      {ini}
    </span>
  );
}

export function AbaAcessos({ dados, papeis, uid, t, recarregar }: PropsAba) {
  const souAdmin = papeis.includes("admin");
  const pode = podeEscrever(papeis, "acessos");
  const conf = useConfirmacao();

  const acessosVisiveis = souAdmin ? dados.acessos : dados.acessos.filter((a) => a.id === uid);
  const pedidosAbertos = dados.pedidos.filter((p) => !dados.acessos.some((a) => a.id === p.id));
  const pedidosVisiveis = souAdmin ? pedidosAbertos : pedidosAbertos.filter((p) => p.id === uid);
  const equipe = pessoasTime(dados);
  // :3339-3341: o dono (aqui, o administrador da plataforma) aparece mesmo sem linha em gestao_acessos
  const donoSemLinha = souAdmin && !!uid && !dados.acessos.some((a) => a.id === uid);

  const [perfisPorId, setPerfisPorId] = useState<Record<string, PerfilBasico>>({});
  const [modalEditar, setModalEditar] = useState<string | null>(null);
  const [modalAdd, setModalAdd] = useState(false);

  // Nome e foto de cada pessoa (gestao_acessos/gestao_acesso_pedidos só guardam o id): perfis() é leitura
  // avulsa via RPC, fora do ciclo dados/recarregar — mesmo padrão de modal-backup.tsx.
  useEffect(() => {
    const ids = [
      ...new Set([
        ...acessosVisiveis.map((a) => a.id),
        ...pedidosVisiveis.map((p) => p.id),
        ...(donoSemLinha && uid ? [uid] : []),
      ]),
    ].filter((id) => !perfisPorId[id]);
    if (ids.length === 0) return;
    let vivo = true;
    perfis(ids)
      .then((lista) => {
        if (!vivo) return;
        setPerfisPorId((atual) => ({ ...atual, ...Object.fromEntries(lista.map((p) => [p.id, p])) }));
      })
      .catch(() => {
        /* nome é só exibição; uma falha aqui não trava a tela */
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acessosVisiveis, pedidosVisiveis, donoSemLinha]);

  const nomeDe = (id: string): string => perfisPorId[id]?.nome || (id === uid ? "Você" : "Pessoa sem nome visível");

  /** ac-recusar (:3362-3363). */
  const recusar = (id: string) => {
    conf.pedir({
      titulo: "Recusar pedido",
      mensagem: `Recusar o pedido de ${nomeDe(id)}? A pessoa continua sem acesso e pode pedir de novo.`,
      rotulo: "Recusar",
      aoConfirmar: async () => {
        try {
          await apagar(TABELAS.pedidos.tabela, id, "Não consegui recusar o pedido.");
          t.success("Pedido recusado.");
          await recarregar(["pedidos"]);
        } catch (e) {
          t.error(mensagemDeErro(e, "Não consegui recusar o pedido."));
        }
      },
    });
  };

  return (
    <AbaCasca>
      <CabecalhoAba
        titulo="Acessos"
        subtitulo="Quem vê cada área do sistema. O administrador da plataforma é sempre administrador aqui."
        acoes={
          pode && (
            <button type="button" className="btn btn-primary" onClick={() => setModalAdd(true)}>
              + Adicionar pessoa
            </button>
          )
        }
      />

      <details className="os-card" style={{ padding: 16, marginBottom: 16 }}>
        <summary className="row gap-2" style={{ cursor: "pointer", alignItems: "baseline", flexWrap: "wrap" }}>
          <span className="h3">Como funciona</span>
          <span className="muted small">o que cada papel vê e onde o bloqueio acontece</span>
        </summary>
        <div style={{ marginTop: 10 }}>
          <CartaoTabela>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Papel</th>
                <th style={{ textAlign: "left" }}>Vê</th>
              </tr>
            </thead>
            <tbody>
              {PAPEIS.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Selo tom={p.id === "admin" ? "aurora" : "neutro"}>{p.rotulo}</Selo>
                  </td>
                  <td className="small">
                    {p.descricao}
                    {p.id !== "admin" ? " + Tarefas do time" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </CartaoTabela>
        </div>
        <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
          Bloqueio no banco: cada tabela só entrega e só aceita gravação de quem tem o papel certo (políticas de
          acesso do Supabase). Esconder uma aba aqui é só conforto; quem decide é o banco. Só o Admin altera esta lista.
        </p>
      </details>

      {pedidosVisiveis.length > 0 && (
        <div className="os-card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="row gap-2" style={{ alignItems: "baseline", marginBottom: 8 }}>
            <div className="h3">Pedidos de acesso</div>
            <span className="muted small">{pedidosVisiveis.length} aguardando</span>
          </div>
          <div className="col gap-2">
            {pedidosVisiveis.map((p, i) => (
              <div
                key={p.id}
                className="row gap-3"
                style={{
                  padding: "8px 0",
                  borderTop: i ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}
              >
                <Foto perfil={perfisPorId[p.id]} nome={nomeDe(p.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small">{nomeDe(p.id)}</div>
                  <div className="muted tiny">pediu em {dataHoraBR(p.pedido_em)}</div>
                </div>
                {pode && (
                  <div className="row gap-2">
                    <button type="button" className="btn btn-ghost btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => recusar(p.id)}>
                      Recusar
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => setModalEditar(p.id)}>
                      Liberar acesso
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <CartaoTabela>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Pessoa</th>
            <th style={{ textAlign: "left" }}>Papéis</th>
            <th style={{ textAlign: "left" }}>No time como</th>
            <th style={{ textAlign: "left" }}>Atualizado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {donoSemLinha && uid && (
            <tr>
              <td>
                <div className="row gap-2">
                  <Foto perfil={perfisPorId[uid]} nome={nomeDe(uid)} />
                  <span className="small">{nomeDe(uid)}</span>
                </div>
              </td>
              <td>
                <Selo tom="aurora">Admin</Selo>
              </td>
              <td className="muted tiny">—</td>
              <td className="muted tiny">administrador da plataforma</td>
              <td />
            </tr>
          )}
          {acessosVisiveis.length === 0 && !donoSemLinha && (
            <tr>
              <td colSpan={5} className="muted small">
                Ninguém cadastrado ainda.
              </td>
            </tr>
          )}
          {[...acessosVisiveis]
            .sort((a, b) => nomeDe(a.id).localeCompare(nomeDe(b.id), "pt-BR"))
            .map((a) => {
              const foraDaEquipe = !!a.pessoa && !equipe.includes(a.pessoa);
              return (
                <tr key={a.id}>
                  <td>
                    <div className="row gap-2">
                      <Foto perfil={perfisPorId[a.id]} nome={nomeDe(a.id)} />
                      <span className="small">
                        {nomeDe(a.id)}
                        {a.id === uid && <span className="muted tiny"> (você)</span>}
                      </span>
                    </div>
                  </td>
                  <td>
                    {a.papeis.length === 0 && <span className="muted tiny">nenhum</span>}
                    {a.papeis.map((k) => (
                      <span key={k} style={{ marginRight: 4, display: "inline-block" }}>
                        <Selo tom={k === "admin" ? "aurora" : "neutro"}>{rotuloPapel(k)}</Selo>
                      </span>
                    ))}
                  </td>
                  <td className="small">
                    {a.pessoa ? (
                      <>
                        {a.pessoa} {foraDaEquipe && <Selo tom="aviso">fora da equipe</Selo>}
                      </>
                    ) : (
                      <span className="muted tiny">não vinculado</span>
                    )}
                  </td>
                  <td className="muted tiny">{dataHoraBR(a.atualizado_em)}</td>
                  <td style={{ textAlign: "right" }}>
                    {pode && (
                      <button type="button" className="btn btn-ghost btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => setModalEditar(a.id)}>
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </CartaoTabela>

      {modalEditar && (
        <ModalAcesso
          id={modalEditar}
          nome={nomeDe(modalEditar)}
          souEu={modalEditar === uid}
          acessoAtual={dados.acessos.find((a) => a.id === modalEditar) ?? null}
          temPedido={dados.pedidos.some((p) => p.id === modalEditar)}
          equipe={equipe}
          uid={uid}
          t={t}
          pedirConfirmacao={conf.pedir}
          onClose={() => setModalEditar(null)}
          aoSalvar={() => {
            setModalEditar(null);
            void recarregar(["acessos", "pedidos"]);
          }}
        />
      )}
      {modalAdd && (
        <ModalAddPessoa
          acessos={dados.acessos}
          t={t}
          onEscolher={(p) => {
            setPerfisPorId((atual) => ({ ...atual, [p.id]: p }));
            setModalAdd(false);
            setModalEditar(p.id);
          }}
          onClose={() => setModalAdd(false)}
        />
      )}
      {conf.elemento}
    </AbaCasca>
  );
}

/** modalAcesso (financeiro.html:3367-3393). */
function ModalAcesso({
  id,
  nome,
  souEu,
  acessoAtual,
  temPedido,
  equipe,
  uid,
  t,
  pedirConfirmacao,
  onClose,
  aoSalvar,
}: {
  id: string;
  nome: string;
  souEu: boolean;
  acessoAtual: Acesso | null;
  temPedido: boolean;
  equipe: string[];
  uid: string | null;
  t: ToastApi;
  pedirConfirmacao: ReturnType<typeof useConfirmacao>["pedir"];
  onClose: () => void;
  aoSalvar: () => void;
}) {
  const [sel, setSel] = useState<Papel[]>(acessoAtual?.papeis ?? []);
  const [pessoa, setPessoa] = useState(acessoAtual?.pessoa ?? "");
  const [salvando, setSalvando] = useState(false);
  // :3375: só o checkbox "Admin" da própria pessoa fica travado — ninguém tira o próprio admin
  const eraAdmin = (acessoAtual?.papeis ?? []).includes("admin");
  const travaAdmin = souEu;
  const opcoesTime = pessoa && !equipe.includes(pessoa) ? [...equipe, pessoa] : equipe;

  const alternar = (p: Papel) => {
    if (travaAdmin && p === "admin") return;
    setSel((atual) => (atual.includes(p) ? atual.filter((x) => x !== p) : [...atual, p]));
  };

  const salvar = async () => {
    // :3386: na própria linha, o admin que já existia é mantido
    const papeis = souEu && eraAdmin && !sel.includes("admin") ? [...sel, "admin" as Papel] : sel;
    if (papeis.length === 0) {
      t.error("Marque pelo menos um papel, ou use Remover acesso.");
      return;
    }
    setSalvando(true);
    try {
      await salvarAcesso(id, papeis, pessoa, uid);
      if (temPedido) {
        // best-effort: o acesso já foi salvo; se o pedido não sumir agora, sai no próximo recarregar
        await apagar(TABELAS.pedidos.tabela, id).catch(() => {});
      }
      t.success(`Acesso de ${nome} salvo.`);
      aoSalvar();
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar o acesso."));
    } finally {
      setSalvando(false);
    }
  };

  /** Remover acesso (:3379-3382), com confirmação. */
  const remover = () => {
    pedirConfirmacao({
      titulo: "Remover acesso",
      mensagem: `Remover o acesso de ${nome}? A pessoa passa a ver a tela de acesso pendente.`,
      rotulo: "Remover",
      perigo: true,
      aoConfirmar: async () => {
        try {
          await removerAcesso(id);
          t.success("Acesso removido.");
          aoSalvar();
        } catch (e) {
          t.error(mensagemDeErro(e, "Não consegui remover o acesso."));
        }
      },
    });
  };

  return (
    <Modal
      titulo={`Acesso de ${nome}`}
      onClose={onClose}
      rodape={
        <>
          {acessoAtual && !souEu && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: "var(--os-erro)" }}
                disabled={salvando}
                onClick={remover}
              >
                Remover acesso
              </button>
              <div className="flex-1" />
            </>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
            Salvar
          </button>
        </>
      }
    >
      <div className="muted small">Marque as áreas que esta pessoa vê.</div>
      <div className="col gap-2">
        {PAPEIS.map((p) => {
          const travado = travaAdmin && p.id === "admin";
          return (
            <label
              key={p.id}
              className="row gap-2"
              style={{ alignItems: "center", cursor: travado ? "default" : "pointer", opacity: travado ? 0.6 : 1 }}
            >
              <input
                type="checkbox"
                checked={sel.includes(p.id) || (travado && eraAdmin)}
                disabled={travado}
                onChange={() => alternar(p.id)}
              />
              <span className="small">
                <b>{p.rotulo}</b> <span className="muted tiny">· {p.descricao}</span>
              </span>
            </label>
          );
        })}
        {travaAdmin && (
          <div className="muted tiny">Você não pode tirar o seu próprio papel de admin.</div>
        )}
      </div>
      <Campo rotulo="No time como">
        <select className="input" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
          <option value="">— não vinculado —</option>
          {opcoesTime.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="muted tiny">
          O nome usado como responsável nas implementações, reuniões e tarefas. Abre “Tarefas do time” já filtrado
          nessa pessoa.
        </span>
      </Campo>
    </Modal>
  );
}

/** modalAddPessoa (financeiro.html:3394-3417), com buscarPerfis (gestao_buscar_perfis) no lugar de USER.search(). */
function ModalAddPessoa({
  acessos,
  t,
  onEscolher,
  onClose,
}: {
  acessos: Acesso[];
  t: ToastApi;
  onEscolher: (p: PerfilBasico) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<PerfilBasico[] | null>(null);
  const [buscando, setBuscando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setBuscando(true);
    const espera = setTimeout(() => {
      buscarPerfis(q.trim())
        .then((lista) => {
          if (vivo) setResultados(lista);
        })
        .catch((e) => {
          if (vivo) t.error(mensagemDeErro(e, "Não consegui buscar pessoas."));
        })
        .finally(() => {
          if (vivo) setBuscando(false);
        });
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <Modal
      titulo="Adicionar pessoa"
      onClose={onClose}
      rodape={
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div className="muted small">
        Busque alguém da organização pelo nome. Quem ainda não abriu o sistema também pode ser adicionado.
      </div>
      <Campo rotulo="Nome">
        <input
          className="input"
          type="search"
          autoFocus
          placeholder="Digite um nome"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </Campo>
      <div className="col gap-1" role="listbox" aria-label="Resultados">
        {buscando && <div className="muted small">Buscando…</div>}
        {!buscando && resultados && resultados.length === 0 && (
          <div className="muted small">{q.trim() ? "Ninguém encontrado." : "Digite para buscar."}</div>
        )}
        {!buscando &&
          resultados?.map((p) => {
            const ja = acessos.find((a) => a.id === p.id);
            const nome = p.nome || "Sem nome";
            return (
              <button
                key={p.id}
                type="button"
                className="os-linha-clicavel row gap-2"
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                }}
                onClick={() => onEscolher({ ...p, nome })}
              >
                <Foto perfil={p} nome={nome} />
                <span className="col">
                  <b className="small">{nome}</b>
                  <span className="muted tiny">
                    {ja ? `já tem acesso: ${ja.papeis.map(rotuloPapel).join(", ")}` : "sem acesso"}
                  </span>
                </span>
              </button>
            );
          })}
      </div>
    </Modal>
  );
}

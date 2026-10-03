/**
 * Indicação: modais, ações e o painel "Dados da indicação" do detalhe.
 * Original: financeiro.html:1278-1336 (modalIndicacao), :1418-1472 (modalIniciarInd, enviarIndParaVendas,
 * excluirIndicacao), :2219-2247 (painelIndicado), :2326-2330 e :2445-2457 (cabeçalho e botões do detalhe),
 * :2350-2358 (responsável e início editáveis), :3215-3217 (ind-reabrir).
 *
 * Por que um arquivo novo: o detalhe do atendimento (detalhe-atendimento.tsx) é de outro agente (operação).
 * Estas peças são encaixadas pela própria aba Indicações, logo acima do `DetalheAtendimento`
 * (aba-indicacoes.tsx). Ponto de encaixe definitivo, para quem cuida do detalhe: ver PROGRESSO-LOTE-COMERCIAL.
 *
 * Regras: só classes de bundle.css + ui-gestao.tsx; grava por dados.ts e só avisa sucesso depois de o banco
 * devolver a linha; apagar = soft delete (`apagar`); confirmações com texto (confirmacao.tsx), como o artefato.
 */

import { useState } from "react";
import type React from "react";
import { dataDeBR, horaValida, mascararData, mascararHora } from "./calculos";
import { useConfirmacao } from "./confirmacao";
import { apagar, atualizar, inserir, mensagemDeErro } from "./dados";
import { nomesContexto } from "./logica-atendimento";
import {
  HORARIOS,
  TOM_STATUS_INDICACAO,
  norm,
  resolverIndicador,
  rotuloHorario,
  rotuloStatusIndicacao,
  waLink,
} from "./logica-indicacao";
import {
  STATUS_INDICACAO,
  STATUS_VENDA,
  dataBR,
  dataHoraBR,
  hojeLocal,
  ymd,
  type Dados,
  type Indicacao,
  type PropsAba,
  type ToastApi,
} from "./tipos";
import { Campo, Modal, Selo } from "./ui-gestao";

const p2 = (n: number) => String(n).padStart(2, "0");
const hojeBR = (): string => {
  const d = hojeLocal();
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const agoraHM = (): string => {
  const d = new Date();
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/** isoParaBR do artefato: "2026-09-24" → "24/09/2026"; vazio → "". */
const isoParaBR = (s: string | null | undefined): string => (s ? dataBR(s).replace("—", "") : "");

/** statusIndPill (:2213-2217). */
export function seloDaIndicacao(i: Pick<Indicacao, "enviado_vendas_em" | "status">): {
  rotulo: string;
  tom: "ok" | "aviso" | "aurora" | "neutro" | "erro" | "info";
} {
  if (i.enviado_vendas_em) return { rotulo: "Enviada para Vendas", tom: "ok" };
  const st = i.status || "novo";
  return { rotulo: rotuloStatusIndicacao(st), tom: TOM_STATUS_INDICACAO[st] ?? "neutro" };
}

/** Link de contato (WhatsApp e e-mail) com a classe de link da babel (`.fmt-link`, bundle.css:1146). */
export function ContatosIndicado({
  whatsapp,
  email,
  vazio = "",
  quebra = true,
}: {
  whatsapp: string | null;
  email: string | null;
  vazio?: string;
  quebra?: boolean;
}) {
  const wa = waLink(whatsapp);
  if (!whatsapp && !email) return <>{vazio}</>;
  return (
    <>
      {whatsapp &&
        (wa ? (
          <a className="fmt-link" href={wa} target="_blank" rel="noopener noreferrer">
            {whatsapp}
          </a>
        ) : (
          whatsapp
        ))}
      {whatsapp && email && (quebra ? <br /> : " · ")}
      {email && (
        <a className="fmt-link" href={`mailto:${email}`}>
          {email}
        </a>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Ações: iniciar, enviar para Vendas, excluir, reabrir, editar e nova
// ---------------------------------------------------------------------------

export interface AcoesIndicacao {
  nova: (preset?: Partial<Indicacao>) => void;
  editar: (i: Indicacao) => void;
  iniciar: (i: Indicacao) => void;
  enviarParaVendas: (i: Indicacao) => void;
  excluir: (i: Indicacao) => void;
  reabrir: (i: Indicacao) => void;
  mudarStatus: (i: Indicacao, status: string) => Promise<void>;
  /** Modais e caixa de confirmação: pôr no fim do JSX de quem usa. */
  elemento: React.ReactNode;
}

/**
 * Todas as ações da indicação, com os textos de confirmação do artefato.
 * `aoAbrir`: depois de iniciar, o artefato abre o detalhe (:1443). `aoSair`: depois de enviar ou excluir,
 * o artefato volta para a lista (:1462, :1470).
 */
export function useAcoesIndicacao({
  dados,
  t,
  recarregar,
  aoAbrir,
  aoSair,
}: {
  dados: Dados;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
  aoAbrir?: (id: string) => void;
  aoSair?: () => void;
}): AcoesIndicacao {
  const conf = useConfirmacao();
  const [modal, setModal] = useState<{ indicacao: Indicacao | null; preset?: Partial<Indicacao> } | null>(null);
  const [iniciando, setIniciando] = useState<Indicacao | null>(null);

  async function mudarStatus(i: Indicacao, status: string) {
    try {
      await atualizar("gestao_indicacoes", i.id, { status });
      await recarregar(["indicacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui mudar o status."));
    }
  }

  /** enviarIndParaVendas — :1446-1464. */
  function enviarParaVendas(i: Indicacao) {
    conf.pedir({
      titulo: "Enviar para Vendas",
      mensagem: `Enviar ${i.lead_nome || "esta indicação"} para a aba Vendas? Uma venda “Em negociação” é criada com os dados do indicado, e a indicação vai para o histórico (enviadas p/ Vendas).`,
      rotulo: "Enviar para Vendas",
      aoConfirmar: async () => {
        try {
          const r = resolverIndicador(i, dados.clientes, dados.indicadores);
          const rn = norm(i.responsavel);
          const vendedor = rn ? dados.vendedores.find((v) => norm(v.nome) === rn) : undefined;
          const nova = await inserir("gestao_vendas", {
            vendedor_id: vendedor?.id ?? null,
            vendedor_nome: i.responsavel || null,
            data_venda: null,
            setup: 0,
            plano: null,
            cliente_nome: i.lead_nome || null,
            empresa: i.empresa,
            nicho: i.nicho,
            whatsapp: i.lead_whatsapp,
            email: i.lead_email,
            status: "negociacao",
            origem: "indicacao",
            indicacao_id: i.id,
            obs: [
              `Indicação de ${r.cliente ? r.cliente.nome : i.referrer_name || "não identificado"}`,
              i.necessidade ? `Busca: ${i.necessidade}` : "",
            ]
              .filter(Boolean)
              .join(" · "),
          });
          await atualizar("gestao_indicacoes", i.id, {
            enviado_vendas_em: new Date().toISOString(),
            venda_id: String(nova.id),
          });
          t.success(`${i.lead_nome || "Indicação"} foi enviada para Vendas.`);
          aoSair?.();
          await recarregar(["indicacoes", "vendas"]);
        } catch (e) {
          t.error(mensagemDeErro(e, "Não consegui enviar para Vendas."));
        }
      },
    });
  }

  /**
   * excluirIndicacao — :1465-1472: apaga a indicação e as reuniões com o indicado (area "ind").
   * Aqui é soft delete. As reuniões só são apagadas se quem exclui as enxerga (a RLS de
   * gestao_impl_reunioes hoje é só implementação/programador: pendência de banco, ver o relatório).
   */
  function excluir(i: Indicacao) {
    conf.pedir({
      titulo: "Excluir indicação",
      mensagem: `Excluir a indicação de ${i.lead_nome || "este lead"}? O atendimento, as tentativas e as reuniões dela também serão apagados. Se ela já virou uma venda, a venda continua na aba Vendas.`,
      rotulo: "Excluir",
      perigo: true,
      aoConfirmar: async () => {
        try {
          await apagar("gestao_indicacoes", i.id, "Não consegui excluir a indicação.");
        } catch (e) {
          t.error(mensagemDeErro(e, "Não consegui excluir a indicação."));
          return;
        }
        const reunioes = dados.implReunioes.filter((r) => r.impl_id === i.id && r.area === "ind");
        let falhas = 0;
        for (const r of reunioes) {
          try {
            await apagar("gestao_impl_reunioes", r.id);
          } catch {
            falhas++;
          }
        }
        if (falhas) t.error(`Indicação excluída, mas ${falhas} reunião(ões) dela não puderam ser apagadas.`);
        else t.success("Indicação excluída.");
        aoSair?.();
        await recarregar(reunioes.length ? ["indicacoes", "implReunioes"] : ["indicacoes"]);
      },
    });
  }

  /** ind-reabrir — :3215-3217: sai do histórico; a venda criada continua em Vendas. */
  function reabrir(i: Indicacao) {
    conf.pedir({
      titulo: "Reabrir indicação",
      mensagem: `Tirar ${i.lead_nome || "esta indicação"} do histórico e voltar para as indicações em aberto? A venda criada continua na aba Vendas.`,
      rotulo: "Reabrir",
      aoConfirmar: async () => {
        try {
          await atualizar("gestao_indicacoes", i.id, { enviado_vendas_em: null });
          t.success("Indicação reaberta.");
          await recarregar(["indicacoes"]);
        } catch (e) {
          t.error(mensagemDeErro(e, "Não consegui reabrir a indicação."));
        }
      },
    });
  }

  const elemento = (
    <>
      {modal && (
        <ModalIndicacao
          indicacao={modal.indicacao}
          preset={modal.preset}
          dados={dados}
          t={t}
          onClose={() => setModal(null)}
          onSalvo={() => void recarregar(["indicacoes"])}
          onExcluir={(i) => {
            setModal(null);
            excluir(i);
          }}
        />
      )}
      {iniciando && (
        <ModalIniciarIndicacao
          indicacao={iniciando}
          nomes={nomesContexto("ind", dados)}
          t={t}
          onClose={() => setIniciando(null)}
          onIniciado={(id) => {
            void recarregar(["indicacoes"]);
            aoAbrir?.(id);
          }}
        />
      )}
      {conf.elemento}
    </>
  );

  return {
    nova: (preset) => setModal({ indicacao: null, preset }),
    editar: (i) => setModal({ indicacao: i }),
    iniciar: (i) => setIniciando(i),
    enviarParaVendas,
    excluir,
    reabrir,
    mudarStatus,
    elemento,
  };
}

// ---------------------------------------------------------------------------
// Modal criar/editar — :1278-1336 (modalIndicacao)
// ---------------------------------------------------------------------------

export function ModalIndicacao({
  indicacao,
  preset,
  dados,
  t,
  onClose,
  onSalvo,
  onExcluir,
}: {
  indicacao: Indicacao | null;
  /** Nova indicação já vinculada a um cliente (artefato :1253, "+ Registrar indicação" no cliente). */
  preset?: Partial<Indicacao>;
  dados: Pick<Dados, "clientes" | "indicadores">;
  t: ToastApi;
  onClose: () => void;
  onSalvo: () => void;
  onExcluir?: (i: Indicacao) => void;
}) {
  const novo = !indicacao;
  const base: Partial<Indicacao> = indicacao ?? { status: "novo", ...preset };
  // :1280: o select já vem com o cliente resolvido (por vínculo, link ou nome)
  const resolvido = resolverIndicador(
    {
      indicador_id: base.indicador_id ?? null,
      referrer_code: base.referrer_code ?? null,
      referrer_name: base.referrer_name ?? null,
    },
    dados.clientes,
    dados.indicadores,
  );
  const [indicadorId, setIndicadorId] = useState(base.indicador_id || resolvido.cliente?.id || "");
  const [referrerName, setReferrerName] = useState(base.referrer_name ?? "");
  const [leadNome, setLeadNome] = useState(base.lead_nome ?? "");
  const [leadWhatsapp, setLeadWhatsapp] = useState(base.lead_whatsapp ?? "");
  const [leadEmail, setLeadEmail] = useState(base.lead_email ?? "");
  const [empresa, setEmpresa] = useState(base.empresa ?? "");
  const [nicho, setNicho] = useState(base.nicho ?? "");
  const [horario, setHorario] = useState(base.melhor_horario ?? "");
  const [dataPref, setDataPref] = useState(base.data_preferida ?? "");
  const [status, setStatus] = useState(base.status ?? "novo");
  const [necessidade, setNecessidade] = useState(base.necessidade ?? "");
  const [obs, setObs] = useState(base.obs ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const nome = leadNome.trim();
    if (!nome) {
      t.error("Informe o nome do indicado.");
      return;
    }
    const cliente = dados.clientes.find((c) => c.id === indicadorId);
    setSalvando(true);
    try {
      const campos = {
        indicador_id: indicadorId || null,
        referrer_name: referrerName.trim() || cliente?.nome || null,
        lead_nome: nome,
        lead_whatsapp: leadWhatsapp.trim() || null,
        lead_email: leadEmail.trim() || null,
        empresa: empresa.trim() || null,
        nicho: nicho.trim() || null,
        melhor_horario: horario || null,
        data_preferida: dataPref || null,
        status,
        necessidade: necessidade.trim() || null,
        obs: obs.trim() || null,
      };
      if (novo) {
        await inserir("gestao_indicacoes", { ...campos, origem: "manual", data_indicacao: ymd(hojeLocal()) });
      } else {
        await atualizar("gestao_indicacoes", indicacao.id, campos);
      }
      t.success(novo ? "Indicação cadastrada." : "Indicação atualizada.");
      onSalvo();
      onClose();
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar a indicação."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={novo ? "Nova indicação" : `Indicação de ${indicacao.lead_nome || ""}`}
      onClose={onClose}
      largura={560}
      rodape={
        <>
          {!novo && onExcluir && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: "var(--os-erro)" }}
                disabled={salvando}
                onClick={() => onExcluir(indicacao)}
              >
                Excluir
              </button>
              <div className="flex-1" />
            </>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <div className="muted small">
        {novo
          ? "Cadastre uma indicação que chegou por fora da página."
          : `Recebida em ${dataBR(indicacao.data_indicacao || indicacao.criado_em)}${indicacao.referrer_code ? ` · código ${indicacao.referrer_code}` : ""}`}
      </div>
      <Campo rotulo="Quem indicou (cliente)">
        <select className="input" value={indicadorId} onChange={(e) => setIndicadorId(e.target.value)}>
          <option value="">— não identificado —</option>
          {dados.clientes
            .slice()
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
        </select>
      </Campo>
      <Campo rotulo="Nome informado de quem indicou">
        <input className="input" value={referrerName} onChange={(e) => setReferrerName(e.target.value)} />
      </Campo>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Nome do indicado">
            <input className="input" value={leadNome} onChange={(e) => setLeadNome(e.target.value)} />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="WhatsApp">
            <input className="input" value={leadWhatsapp} onChange={(e) => setLeadWhatsapp(e.target.value)} />
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="E-mail">
            <input className="input" type="email" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Empresa">
            <input className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Nicho / segmento">
            <input className="input" value={nicho} onChange={(e) => setNicho(e.target.value)} />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Melhor horário">
            <select className="input" value={horario} onChange={(e) => setHorario(e.target.value)}>
              <option value="">—</option>
              {HORARIOS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Melhor dia">
            <input className="input" type="date" value={dataPref} onChange={(e) => setDataPref(e.target.value)} />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Status">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_INDICACAO.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>
      <Campo rotulo="O que busca resolver">
        <textarea className="input" rows={2} value={necessidade} onChange={(e) => setNecessidade(e.target.value)} />
      </Campo>
      <Campo rotulo="Anotações do time">
        <textarea
          className="input"
          rows={2}
          value={obs}
          placeholder="Ex.: liguei dia 12, pediu proposta até sexta."
          onChange={(e) => setObs(e.target.value)}
        />
      </Campo>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Iniciar atendimento — :1418-1445 (modalIniciarInd): responsável do time comercial, data e horário
// ---------------------------------------------------------------------------

function ModalIniciarIndicacao({
  indicacao,
  nomes,
  t,
  onClose,
  onIniciado,
}: {
  indicacao: Indicacao;
  /** nomesComercial() (:2199): vendedores internos ativos (ou todos os ativos, se não houver interno). */
  nomes: string[];
  t: ToastApi;
  onClose: () => void;
  onIniciado: (id: string) => void;
}) {
  const lista =
    indicacao.responsavel && !nomes.includes(indicacao.responsavel) ? [...nomes, indicacao.responsavel] : nomes;
  const [responsavel, setResponsavel] = useState(indicacao.responsavel ?? "");
  const [data, setData] = useState(hojeBR());
  const [hora, setHora] = useState(agoraHM());
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!responsavel) {
      t.error(lista.length ? "Escolha o responsável." : "Cadastre um vendedor antes de iniciar.");
      return;
    }
    const dt = dataDeBR(data);
    if (!dt) {
      t.error("Informe a data de início no formato dd/mm/aaaa.");
      return;
    }
    const hi = hora.trim();
    if (hi && !horaValida(hi)) {
      t.error("Use o horário no formato 24h, ex.: 14:30.");
      return;
    }
    setSalvando(true);
    try {
      await atualizar("gestao_indicacoes", indicacao.id, {
        responsavel,
        inicio: dt,
        inicio_hora: hi || null,
        iniciado_em: new Date().toISOString(),
        ...((indicacao.status ?? "novo") === "novo" ? { status: "contato" } : {}),
      });
      t.success("Atendimento iniciado.");
      onClose();
      onIniciado(indicacao.id);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui iniciar o atendimento."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Iniciar atendimento"
      onClose={onClose}
      largura={460}
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando…" : "Iniciar atendimento"}
          </button>
        </>
      }
    >
      <div className="muted small">
        {indicacao.lead_nome || "Indicado"} · indicação recebida em {dataHoraBR(indicacao.criado_em)}. Ao iniciar, o
        acompanhamento do atendimento é liberado.
      </div>
      <Campo rotulo="Responsável pelo atendimento">
        <select className="input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
          <option value="">— escolher —</option>
          {lista.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Campo>
      <div className="row gap-2">
        <div className="flex-1">
          <Campo rotulo="Data de início">
            <input
              className="input"
              inputMode="numeric"
              maxLength={10}
              placeholder="dd/mm/aaaa"
              value={data}
              onChange={(e) => setData(mascararData(e.target.value))}
            />
          </Campo>
        </div>
        <div className="flex-1">
          <Campo rotulo="Horário (24h)">
            <input
              className="input"
              inputMode="numeric"
              maxLength={5}
              placeholder="hh:mm"
              value={hora}
              onChange={(e) => setHora(mascararHora(e.target.value))}
            />
          </Campo>
        </div>
      </div>
      {lista.length === 0 && (
        <div className="muted small">Cadastre o time comercial em Vendas › + Novo vendedor para escolher o responsável.</div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detalhe: cabeçalho com as datas e os botões (:2326-2330, :2445-2457)
// ---------------------------------------------------------------------------

export function BotoesIndicacao({
  indicacao,
  acoes,
  rodape = false,
}: {
  indicacao: Indicacao;
  acoes: AcoesIndicacao;
  /** Rodapé do detalhe: só "Enviar para Vendas" (artefato :2453-2456). */
  rodape?: boolean;
}) {
  const i = indicacao;
  if (i.enviado_vendas_em) {
    if (rodape) return null;
    return (
      <>
        <button type="button" className="btn btn-sm" onClick={() => acoes.reabrir(i)}>
          Reabrir indicação
        </button>
        <button type="button" className="btn btn-sm" style={{ color: "var(--os-erro)" }} onClick={() => acoes.excluir(i)}>
          Excluir
        </button>
      </>
    );
  }
  return (
    <>
      {!i.iniciado_em && !rodape && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => acoes.iniciar(i)}>
          Iniciar atendimento
        </button>
      )}
      <button type="button" className="btn btn-sm" onClick={() => acoes.enviarParaVendas(i)}>
        Enviar para Vendas
      </button>
      {!rodape && (
        <button type="button" className="btn btn-sm" style={{ color: "var(--os-erro)" }} onClick={() => acoes.excluir(i)}>
          Excluir
        </button>
      )}
    </>
  );
}

/** Cabeçalho do detalhe da indicação: voltar, nome, datas (inclui "Enviada para Vendas em"), selo e botões. */
export function CabecalhoIndicacao({
  indicacao,
  acoes,
  pode,
  onVoltar,
}: {
  indicacao: Indicacao;
  acoes: AcoesIndicacao;
  pode: boolean;
  onVoltar: () => void;
}) {
  const i = indicacao;
  const selo = seloDaIndicacao(i);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onVoltar} style={{ marginBottom: 12 }}>
        ← Voltar para a lista
      </button>
      <div
        className="row gap-3"
        style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}
      >
        <div>
          <div className="h2">{i.lead_nome || "Indicado sem nome"}</div>
          <div className="muted small" style={{ marginTop: 4, lineHeight: 1.6 }}>
            Indicação recebida em <b className="mono">{dataHoraBR(i.criado_em)}</b>
            {i.iniciado_em && (
              <>
                <br />
                Atendimento iniciado em <b className="mono">{dataHoraBR(i.iniciado_em)}</b>
              </>
            )}
            {i.enviado_vendas_em && (
              <>
                <br />
                Enviada para Vendas em <b className="mono">{dataHoraBR(i.enviado_vendas_em)}</b>
              </>
            )}
          </div>
        </div>
        <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Selo tom={selo.tom}>{selo.rotulo}</Selo>
          {pode && <BotoesIndicacao indicacao={i} acoes={acoes} />}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Painel "Dados da indicação" — :2219-2247 (painelIndicado) + responsável e início (:2350-2358)
// ---------------------------------------------------------------------------

function CampoLeitura({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="col gap-1" style={{ minWidth: 180, flex: 1 }}>
      <span className="label">{rotulo}</span>
      <div className="small" style={{ padding: "6px 0" }}>
        {children}
      </div>
    </div>
  );
}

/** caixaTxt (:2248-2250) sem a borda lateral colorida (proibida na babel): título em destaque + texto. */
function CaixaTexto({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="os-vidro" style={{ padding: "10px 14px", borderRadius: 12, marginTop: 10 }}>
      <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
        {titulo}
      </div>
      <div className="small" style={{ whiteSpace: "pre-wrap", color: "var(--txt-2)" }}>
        {children}
      </div>
    </div>
  );
}

export function PainelDadosIndicacao({
  indicacao,
  dados,
  pode,
  acoes,
}: {
  indicacao: Indicacao;
  dados: Pick<Dados, "clientes" | "indicadores" | "vendas">;
  pode: boolean;
  acoes: AcoesIndicacao;
}) {
  const i = indicacao;
  const r = resolverIndicador(i, dados.clientes, dados.indicadores);
  const st = i.status || "novo";
  const venda = i.venda_id ? dados.vendas.find((v) => v.id === i.venda_id) : undefined;
  return (
    <div className="os-card" style={{ padding: 18, marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div className="h3">Dados da indicação</div>
        {pode && (
          <button type="button" className="btn btn-sm" onClick={() => acoes.editar(i)}>
            Editar dados
          </button>
        )}
      </div>
      <div className="row gap-3" style={{ flexWrap: "wrap" }}>
        <CampoLeitura rotulo="Quem indicou">
          {r.cliente ? r.cliente.nome : i.referrer_name || "não identificado"}
        </CampoLeitura>
        <CampoLeitura rotulo="Status da indicação">
          {i.enviado_vendas_em ? (
            <Selo tom="ok">Enviada para Vendas</Selo>
          ) : pode ? (
            <select
              className="input"
              style={{ width: 180 }}
              value={st}
              onChange={(e) => void acoes.mudarStatus(i, e.target.value)}
              aria-label="Status"
            >
              {STATUS_INDICACAO.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <Selo tom={TOM_STATUS_INDICACAO[st] ?? "neutro"}>{rotuloStatusIndicacao(st)}</Selo>
          )}
        </CampoLeitura>
        <CampoLeitura rotulo="WhatsApp">
          <ContatosIndicado whatsapp={i.lead_whatsapp} email={null} vazio="—" />
        </CampoLeitura>
        <CampoLeitura rotulo="E-mail">
          <ContatosIndicado whatsapp={null} email={i.lead_email} vazio="—" />
        </CampoLeitura>
      </div>
      <div className="row gap-3" style={{ flexWrap: "wrap" }}>
        <CampoLeitura rotulo="Empresa">{i.empresa || "—"}</CampoLeitura>
        <CampoLeitura rotulo="Nicho">{i.nicho || "—"}</CampoLeitura>
        <CampoLeitura rotulo="Melhor horário">{rotuloHorario(i.melhor_horario) || "—"}</CampoLeitura>
        <CampoLeitura rotulo="Melhor dia">{i.data_preferida ? dataBR(i.data_preferida) : "—"}</CampoLeitura>
      </div>
      {(i.necessidade || "").trim() && <CaixaTexto titulo="O que busca resolver">{i.necessidade}</CaixaTexto>}
      {(i.obs || "").trim() && <CaixaTexto titulo="Anotações do time">{i.obs}</CaixaTexto>}
      {i.enviado_vendas_em && (
        <CaixaTexto titulo={`Enviada para Vendas em ${dataHoraBR(i.enviado_vendas_em)}`}>
          {venda
            ? `Venda em ${STATUS_VENDA.find(([k]) => k === (venda.status || "pendente"))?.[1] ?? venda.status} na aba Vendas.`
            : "A venda criada não está mais na aba Vendas."}
        </CaixaTexto>
      )}
    </div>
  );
}

/**
 * Painel "Atendimento" da indicação (:2350-2358): responsável (time comercial) e data/hora de início,
 * editáveis e salvos ao sair do campo. Só leitura depois de enviada para Vendas (:2345).
 */
export function PainelAtendimentoIndicacao({
  indicacao,
  dados,
  pode,
  t,
  recarregar,
}: {
  indicacao: Indicacao;
  dados: Pick<Dados, "funcionarios" | "config" | "vendedores">;
  pode: boolean;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
}) {
  const i = indicacao;
  const ro = !pode || !!i.enviado_vendas_em;
  const nomes = nomesContexto("ind", dados);
  const lista = i.responsavel && !nomes.includes(i.responsavel) ? [...nomes, i.responsavel] : nomes;
  const [data, setData] = useState(isoParaBR(i.inicio));
  const [hora, setHora] = useState(i.inicio_hora ?? "");
  const [salvo, setSalvo] = useState("");

  async function gravar(campos: Record<string, unknown>) {
    try {
      await atualizar("gestao_indicacoes", i.id, campos);
      setSalvo(`Salvo às ${agoraHM()}.`);
      await recarregar(["indicacoes"]);
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui salvar o atendimento."));
    }
  }

  function sairData() {
    if (ro || data === isoParaBR(i.inicio)) return;
    const iso = dataDeBR(data);
    if (!iso) {
      t.error("Informe a data no formato dd/mm/aaaa.");
      setData(isoParaBR(i.inicio));
      return;
    }
    void gravar({ inicio: iso });
  }
  function sairHora() {
    if (ro || hora === (i.inicio_hora ?? "")) return;
    if (hora && !horaValida(hora)) {
      t.error("Use o horário no formato 24h, ex.: 14:30.");
      setHora(i.inicio_hora ?? "");
      return;
    }
    void gravar({ inicio_hora: hora || null });
  }

  return (
    <div className="os-card" style={{ padding: 18, marginBottom: 16 }}>
      <div className="h3" style={{ marginBottom: 8 }}>
        Atendimento
      </div>
      <div className="row gap-3" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <Campo rotulo="Responsável pelo atendimento">
            <select
              className="input"
              value={i.responsavel ?? ""}
              disabled={ro}
              onChange={(e) => void gravar({ responsavel: e.target.value || null })}
            >
              <option value="">— escolher —</option>
              {lista.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {i.iniciado_em ? (
          <>
            <div style={{ width: 170 }}>
              <Campo rotulo="Data que iniciou o atendimento">
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="dd/mm/aaaa"
                  value={data}
                  readOnly={ro}
                  onChange={(e) => setData(mascararData(e.target.value))}
                  onBlur={sairData}
                />
              </Campo>
            </div>
            <div style={{ width: 130 }}>
              <Campo rotulo="Horário (24h)">
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="hh:mm"
                  value={hora}
                  readOnly={ro}
                  onChange={(e) => setHora(mascararHora(e.target.value))}
                  onBlur={sairHora}
                />
              </Campo>
            </div>
          </>
        ) : (
          <span className="muted small" style={{ paddingBottom: 8 }}>
            Atendimento ainda não iniciado.
          </span>
        )}
      </div>
      {salvo && (
        <div className="muted tiny" style={{ marginTop: 6 }}>
          {salvo}
        </div>
      )}
    </div>
  );
}

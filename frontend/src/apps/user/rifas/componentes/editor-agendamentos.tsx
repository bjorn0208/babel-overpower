/**
 * Editor de agendamentos de disparo — lista + criar/editar horários,
 * escolher tipo de conteúdo (foto/texto/vídeo/foto+texto), mensagem,
 * tempo de descanso e quem recebe. Ativar um agendamento sempre passa
 * pelo modal de contatos primeiro (confirma quem vai receber).
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Paperclip, Plus, Trash2 } from "lucide-react";
import { Botao } from "./botao";
import { Selo } from "./basicos";
import { Campo, AreaTexto, Selecao } from "./campo";
import { Modal } from "./modal";
import { ModalConfirmar } from "./modal-confirmar";
import { ModalContatosDisparo } from "./modal-contatos-disparo";
import {
  atualizarAgendamento,
  criarAgendamento,
  excluirAgendamento,
  listarAgendamentos,
  lerConfigDisparo,
  listarContatosDisparo,
  subirMidiaDisparo,
  toggleAtivoAgendamento,
  type AgendamentoDisparo,
  type ConfigDisparoTenant,
  type TipoConteudoDisparo,
} from "../dados-disparos";
import { listarTemplates, type TemplateMensagem } from "../dados-templates";
import { EstagiosDisparo } from "./estagios-disparo";
import "../abas/aba-disparo.css";

const ROTULOS_TIPO: Record<TipoConteudoDisparo, string> = {
  foto: "📷 Só foto",
  texto: "💬 Só texto",
  video: "🎬 Vídeo",
  foto_texto: "📷+💬 Foto com legenda",
};

interface FormEstado {
  id: string | null;
  horario: string;
  tipoConteudo: TipoConteudoDisparo;
  mensagem: string;
  midiaUrl: string | null;
  descansoMinSegundos: number;
  descansoMaxSegundos: number;
  limiteDiario: number | null;
  janelaInicio: string;
  janelaFim: string;
  contatosIds: string[] | null;
}

const FORM_VAZIO: FormEstado = {
  id: null,
  horario: "09:00",
  tipoConteudo: "foto_texto",
  mensagem: "{{titulo}} — {{vendidos}} vendidos, restam {{restam}}. {{preco}} o número!",
  midiaUrl: null,
  descansoMinSegundos: 20,
  descansoMaxSegundos: 90,
  limiteDiario: null,
  janelaInicio: "",
  janelaFim: "",
  contatosIds: null,
};

export interface EditorAgendamentosProps {
  rifaId: string;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

export const EditorAgendamentos = ({ rifaId, aoNotificar }: EditorAgendamentosProps) => {
  const [agendamentos, setAgendamentos] = useState<AgendamentoDisparo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<FormEstado | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<AgendamentoDisparo | null>(null);
  const [config, setConfig] = useState<ConfigDisparoTenant | null>(null);
  const [totalNaEsteira, setTotalNaEsteira] = useState(0);
  const [pendenteAtivar, setPendenteAtivar] = useState<AgendamentoDisparo | null>(null);
  const [escolhendoContatos, setEscolhendoContatos] = useState(false);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [templates, setTemplates] = useState<TemplateMensagem[]>([]);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listarTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  // Config (pausa + telefone de teste) e tamanho da esteira: o par de botões
  // precisa dos dois pra dizer pra onde o teste vai e quantos vão receber.
  const carregarConfig = useCallback(() => {
    lerConfigDisparo().then(setConfig).catch(() => setConfig(null));
    listarContatosDisparo()
      .then((cs) => setTotalNaEsteira(cs.filter((c) => c.marcado).length))
      .catch(() => setTotalNaEsteira(0));
  }, []);
  useEffect(() => carregarConfig(), [carregarConfig]);

  const carregar = () => {
    setCarregando(true);
    listarAgendamentos(rifaId)
      .then(setAgendamentos)
      .catch((e) =>
        aoNotificar(
          `Falha ao carregar agendamentos: ${e instanceof Error ? e.message : String(e)}`,
          "error",
        ),
      )
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    carregar();
  }, [rifaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirNovo = () => setForm({ ...FORM_VAZIO });
  const abrirEditar = (ag: AgendamentoDisparo) =>
    setForm({
      id: ag.id,
      horario: ag.horario.slice(0, 5),
      tipoConteudo: ag.tipo_conteudo,
      mensagem: ag.mensagem ?? "",
      midiaUrl: ag.midia_url,
      descansoMinSegundos: ag.descanso_min_segundos,
      descansoMaxSegundos: ag.descanso_max_segundos,
      limiteDiario: ag.limite_diario,
      janelaInicio: ag.janela_inicio?.slice(0, 5) ?? "",
      janelaFim: ag.janela_fim?.slice(0, 5) ?? "",
      contatosIds: ag.contatos_ids,
    });

  const escolherArquivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file || !form) return;
    setEnviandoMidia(true);
    try {
      const url = await subirMidiaDisparo(file);
      setForm({ ...form, midiaUrl: url });
      aoNotificar("Mídia enviada.", "success");
    } catch (e2) {
      aoNotificar(`Falha ao subir mídia: ${e2 instanceof Error ? e2.message : String(e2)}`, "error");
    } finally {
      setEnviandoMidia(false);
    }
  };

  const salvar = async () => {
    if (!form) return;
    if (form.tipoConteudo === "video" && !form.midiaUrl) {
      aoNotificar("Anexe um vídeo — tipo \"Vídeo\" não usa mais a cartela automática.", "error");
      return;
    }
    if (form.descansoMaxSegundos < form.descansoMinSegundos) {
      aoNotificar("O descanso máximo não pode ser menor que o mínimo.", "error");
      return;
    }
    setSalvando(true);
    try {
      const carga = {
        rifaId,
        horario: `${form.horario}:00`,
        tipoConteudo: form.tipoConteudo,
        mensagem: form.mensagem,
        tempoDescansoSegundos: form.descansoMinSegundos,
        midiaUrl: form.midiaUrl,
        descansoMinSegundos: form.descansoMinSegundos,
        descansoMaxSegundos: form.descansoMaxSegundos,
        limiteDiario: form.limiteDiario,
        janelaInicio: form.janelaInicio ? `${form.janelaInicio}:00` : null,
        janelaFim: form.janelaFim ? `${form.janelaFim}:00` : null,
        contatosIds: form.contatosIds,
        ativo: false,
      };
      if (form.id) await atualizarAgendamento(form.id, carga);
      else await criarAgendamento(carga);
      aoNotificar("Agendamento salvo.", "success");
      setForm(null);
      carregar();
    } catch (e) {
      aoNotificar(`Falha ao salvar: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (ag: AgendamentoDisparo) => {
    if (!ag.ativo) {
      // Ligando: confirma quem recebe ANTES de ativar de verdade.
      setPendenteAtivar(ag);
      setEscolhendoContatos(true);
      return;
    }
    await toggleAtivoAgendamento(ag.id, false);
    carregar();
  };

  const confirmarContatosEAtivar = async (contatosIds: string[] | null) => {
    if (!pendenteAtivar) return;
    try {
      await atualizarAgendamento(pendenteAtivar.id, { contatosIds, ativo: true });
      aoNotificar("Agendamento ativado.", "success");
    } catch (e) {
      aoNotificar(`Falha ao ativar: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setEscolhendoContatos(false);
      setPendenteAtivar(null);
      carregar();
    }
  };

  const excluir = async () => {
    if (!excluindo) return;
    try {
      await excluirAgendamento(excluindo.id);
      aoNotificar("Agendamento excluído.", "success");
      carregar();
    } catch (e) {
      aoNotificar(`Falha ao excluir: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setExcluindo(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="ar-titulo-secao">Agendamentos de disparo</h3>
        <Botao tamanho="sm" onClick={abrirNovo}>
          <Plus size={16} aria-hidden />
          Novo horário
        </Botao>
      </div>

      {carregando ? (
        <p className="text-sm ar-txt-3">Carregando…</p>
      ) : agendamentos.length === 0 ? (
        <p className="text-sm ar-txt-3">Nenhum horário criado ainda.</p>
      ) : (
        <div className="ar-cartao">
          <div className="ar-lista">
            {agendamentos.map((ag) => (
              <div key={ag.id} className="ar-linha flex-wrap items-start">
                <span className="ar-num font-bold ar-txt-1 text-[length:var(--ar-t-md)] shrink-0">
                  {ag.horario.slice(0, 5)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm ar-txt-2">{ROTULOS_TIPO[ag.tipo_conteudo]}</p>
                  <p className="text-xs ar-txt-4 mt-0.5">
                    {ag.contatos_ids
                      ? `${ag.contatos_ids.length} contato(s) fixo(s)`
                      : "todos os marcados"}{" "}
                    · descanso {ag.descanso_min_segundos}-{ag.descanso_max_segundos}s
                    {ag.limite_diario ? ` · até ${ag.limite_diario}/dia` : ""}
                    {ag.janela_inicio && ag.janela_fim ? ` · ${ag.janela_inicio.slice(0, 5)}-${ag.janela_fim.slice(0, 5)}` : ""}
                    {ag.midia_url ? " · mídia própria" : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Selo variante={ag.ativo ? "sucesso" : "neutro"} ponto>
                    {ag.ativo ? "Ligado" : "Desligado"}
                  </Selo>
                  <button
                    type="button"
                    className="ard-switch-alvo"
                    onClick={() => void alternarAtivo(ag)}
                    aria-pressed={ag.ativo}
                    title={ag.ativo ? "Desligar" : "Ligar"}
                  >
                    <span className={`ard-switch ${ag.ativo ? "ard-switch--ligado" : ""}`}>
                      <span className="ard-switch__bolinha" />
                    </span>
                  </button>
                </div>

                <div className="w-full">
                  <EstagiosDisparo
                    agendamento={ag}
                    telefoneTeste={config?.telefoneTeste || config?.telefoneCanal || null}
                    totalNaEsteira={totalNaEsteira}
                    pausado={config?.pausados === true}
                    aoNotificar={aoNotificar}
                    aoMudar={() => {
                      carregar();
                      carregarConfig();
                    }}
                  />
                </div>

                <div className="w-full flex items-center gap-1">
                  <Botao tamanho="sm" variante="fantasma" onClick={() => abrirEditar(ag)}>
                    Editar
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    onClick={() => setExcluindo(ag)}
                    style={{ color: "var(--ar-erro)" }}
                    aria-label={`Excluir o horário ${ag.horario.slice(0, 5)}`}
                  >
                    <Trash2 size={15} aria-hidden />
                    Excluir
                  </Botao>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        aberto={!!form}
        aoFechar={() => setForm(null)}
        titulo={form?.id ? "Editar horário" : "Novo horário"}
        tamanho="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setForm(null)}>
              Cancelar
            </Botao>
            <Botao carregando={salvando} onClick={() => void salvar()}>
              Salvar
            </Botao>
          </div>
        }
      >
        {form && (
          <div className="space-y-4">
            <Campo
              rotulo="Horário"
              type="time"
              value={form.horario}
              onChange={(e) => setForm({ ...form, horario: e.target.value })}
            />
            <Selecao
              rotulo="O que mandar"
              opcoes={Object.entries(ROTULOS_TIPO).map(([valor, rotulo]) => ({ valor, rotulo }))}
              value={form.tipoConteudo}
              onChange={(e) =>
                setForm({ ...form, tipoConteudo: e.target.value as TipoConteudoDisparo })
              }
            />
            {templates.length > 0 && (
              <Selecao
                rotulo="📄 Usar template (atalho — só pré-preenche, você pode editar depois)"
                placeholder="Escolher um template salvo…"
                opcoes={templates.map((t) => ({ valor: t.id, rotulo: `${t.titulo}` }))}
                value=""
                onChange={(e) => {
                  const t = templates.find((tm) => tm.id === e.target.value);
                  if (t) setForm({ ...form, mensagem: t.mensagem, tipoConteudo: t.tipo_conteudo });
                }}
              />
            )}
            <AreaTexto
              rotulo="Mensagem"
              dica="Use {{titulo}} {{premio}} {{vendidos}} {{restam}} {{preco}} {{saudacao}} {{nome}}"
              value={form.mensagem}
              onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
              rows={4}
            />

            {form.tipoConteudo !== "texto" && (
              <div>
                <label className="ar-rotulo block mb-1.5">
                  Mídia {form.tipoConteudo === "video" ? "(obrigatória pra vídeo)" : "própria (opcional)"}
                </label>
                {form.midiaUrl ? (
                  <div className="flex items-center gap-3">
                    {form.midiaUrl.match(/\.(mp4|mov|webm)(\?|$)/i) ? (
                      <video src={form.midiaUrl} className="ar-capa" muted />
                    ) : (
                      <img src={form.midiaUrl} alt="Mídia do disparo" className="ar-capa" />
                    )}
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setForm({ ...form, midiaUrl: null })}>
                      Remover
                    </Botao>
                  </div>
                ) : (
                  <>
                    <input
                      ref={inputArquivoRef}
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => void escolherArquivo(e)}
                    />
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      carregando={enviandoMidia}
                      onClick={() => inputArquivoRef.current?.click()}
                    >
                      📎 Escolher arquivo
                    </Botao>
                    {(form.tipoConteudo === "foto" || form.tipoConteudo === "foto_texto") && (
                      <p className="ar-txt-4 text-xs mt-1">
                        Sem arquivo escolhido, usa a cartela 0-99 gerada automaticamente.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="ar-secao--fina">
              <p className="ar-txt-1 text-sm font-semibold mb-1">Anti-ban</p>
              <p className="ar-txt-4 text-xs mb-3">
                Intervalo aleatório entre cada envio (nunca fixo), limite diário e janela de horário —
                reduz o risco de o número ser marcado como spam.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Campo
                  rotulo="Descanso mínimo (segundos)"
                  type="number"
                  min={0}
                  value={form.descansoMinSegundos}
                  onChange={(e) =>
                    setForm({ ...form, descansoMinSegundos: Math.max(0, parseInt(e.target.value, 10) || 0) })
                  }
                />
                <Campo
                  rotulo="Descanso máximo (segundos)"
                  type="number"
                  min={0}
                  value={form.descansoMaxSegundos}
                  onChange={(e) =>
                    setForm({ ...form, descansoMaxSegundos: Math.max(0, parseInt(e.target.value, 10) || 0) })
                  }
                />
                <Campo
                  rotulo="Limite de envios por dia (opcional)"
                  type="number"
                  min={1}
                  value={form.limiteDiario ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, limiteDiario: e.target.value ? Math.max(1, parseInt(e.target.value, 10) || 1) : null })
                  }
                />
                <div />
                <Campo
                  rotulo="Só enviar a partir de (opcional)"
                  type="time"
                  value={form.janelaInicio}
                  onChange={(e) => setForm({ ...form, janelaInicio: e.target.value })}
                />
                <Campo
                  rotulo="Até (opcional)"
                  type="time"
                  value={form.janelaFim}
                  onChange={(e) => setForm({ ...form, janelaFim: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ModalConfirmar
        aberto={!!excluindo}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={excluir}
        titulo="Excluir agendamento?"
        mensagem={`O horário ${excluindo?.horario.slice(0, 5)} vai parar de disparar.`}
        variante="perigo"
        textoConfirmar="Excluir"
      />

      <ModalContatosDisparo
        aberto={escolhendoContatos}
        aoFechar={() => {
          setEscolhendoContatos(false);
          setPendenteAtivar(null);
        }}
        selecaoInicial={pendenteAtivar?.contatos_ids ?? null}
        aoConfirmar={confirmarContatosEAtivar}
      />
    </div>
  );
};

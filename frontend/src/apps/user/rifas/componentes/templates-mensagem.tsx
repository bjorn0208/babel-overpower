/**
 * Biblioteca de templates de mensagem reutilizáveis por categoria (Theus
 * 2026-09-02) — cria uma vez, usa em vários agendamentos/disparos manuais
 * sem reescrever. Categorias fixas: alerta / atualização / promoção.
 *
 * Arena: um `ar-cartao--compacto` por template, o corpo numa `AreaTexto` só
 * de leitura e as variáveis do texto como chips clicáveis (abrem o editor).
 */

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Botao } from "./botao";
import { Campo, AreaTexto, Selecao } from "./campo";
import { Modal } from "./modal";
import { ModalConfirmar } from "./modal-confirmar";
import {
  atualizarTemplate,
  criarTemplate,
  excluirTemplate,
  listarTemplates,
  type CategoriaTemplate,
  type TemplateMensagem,
  type TipoConteudoTemplate,
} from "../dados-templates";
import "../abas/aba-disparo.css";

const ROTULOS_CATEGORIA: Record<CategoriaTemplate, string> = {
  alerta: "🚨 Alerta",
  atualizacao: "🔄 Atualização",
  promocao: "🎉 Promoção",
};

const ROTULOS_TIPO: Record<TipoConteudoTemplate, string> = {
  foto: "📷 Só foto",
  texto: "💬 Só texto",
  video: "🎬 Vídeo",
  foto_texto: "📷+💬 Foto com legenda",
};

/** As variáveis que a esteira troca na hora do envio. */
const VARIAVEIS = ["titulo", "premio", "vendidos", "restam", "preco", "saudacao", "nome"];

/** Quais delas o texto realmente usa — vira chip no cartão. */
const variaveisDe = (texto: string) => {
  const achadas = new Set<string>();
  for (const m of texto.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) achadas.add(m[1].toLowerCase());
  return [...achadas];
};

interface FormEstado {
  id: string | null;
  categoria: CategoriaTemplate;
  titulo: string;
  mensagem: string;
  tipoConteudo: TipoConteudoTemplate;
}

const FORM_VAZIO: FormEstado = {
  id: null,
  categoria: "atualizacao",
  titulo: "",
  mensagem: "{{titulo}} — {{vendidos}} vendidos, restam {{restam}}. {{preco}} o número!",
  tipoConteudo: "texto",
};

export interface TemplatesMensagemProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

export const TemplatesMensagem = ({ aoNotificar }: TemplatesMensagemProps) => {
  const [templates, setTemplates] = useState<TemplateMensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<FormEstado | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<TemplateMensagem | null>(null);

  const carregar = () => {
    setCarregando(true);
    listarTemplates()
      .then(setTemplates)
      .catch((e) => aoNotificar(`Falha ao carregar templates: ${e instanceof Error ? e.message : String(e)}`, "error"))
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirNovo = () => setForm({ ...FORM_VAZIO });
  const abrirEditar = (t: TemplateMensagem) =>
    setForm({ id: t.id, categoria: t.categoria, titulo: t.titulo, mensagem: t.mensagem, tipoConteudo: t.tipo_conteudo });

  const salvar = async () => {
    if (!form) return;
    if (!form.titulo.trim()) {
      aoNotificar("Dá um título curto pro template — é o que aparece no seletor.", "error");
      return;
    }
    setSalvando(true);
    try {
      const carga = { categoria: form.categoria, titulo: form.titulo, mensagem: form.mensagem, midiaUrl: null, tipoConteudo: form.tipoConteudo };
      if (form.id) await atualizarTemplate(form.id, carga);
      else await criarTemplate(carga);
      aoNotificar("Template salvo.", "success");
      setForm(null);
      carregar();
    } catch (e) {
      aoNotificar(`Falha ao salvar: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!excluindo) return;
    try {
      await excluirTemplate(excluindo.id);
      aoNotificar("Template removido.", "success");
      carregar();
    } catch (e) {
      aoNotificar(`Falha ao remover: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setExcluindo(null);
    }
  };

  const porCategoria = (cat: CategoriaTemplate) => templates.filter((t) => t.categoria === cat);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="ar-titulo-secao">Templates de mensagem</h3>
        <Botao tamanho="sm" onClick={abrirNovo}>
          <Plus size={16} aria-hidden />
          Novo template
        </Botao>
      </div>

      {carregando ? (
        <p className="text-sm ar-txt-3">Carregando…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm ar-txt-3">Nenhum template ainda — crie um pra reaproveitar em disparos e no chat.</p>
      ) : (
        <div className="space-y-5">
          {(Object.keys(ROTULOS_CATEGORIA) as CategoriaTemplate[]).map((cat) =>
            porCategoria(cat).length === 0 ? null : (
              <div key={cat} className="space-y-2">
                <p className="ar-rotulo">{ROTULOS_CATEGORIA[cat]}</p>

                {porCategoria(cat).map((t) => (
                  <div key={t.id} className="ar-cartao ar-cartao--compacto space-y-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-medium ar-txt-1 truncate">{t.titulo}</p>
                        <p className="text-xs ar-txt-3 mt-0.5">{ROTULOS_TIPO[t.tipo_conteudo]}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Botao tamanho="sm" variante="fantasma" onClick={() => abrirEditar(t)}>
                          Editar
                        </Botao>
                        <Botao tamanho="sm" variante="fantasma" onClick={() => setExcluindo(t)}>
                          Excluir
                        </Botao>
                      </div>
                    </div>

                    <AreaTexto
                      value={t.mensagem}
                      readOnly
                      rows={3}
                      aria-label={`Texto do template ${t.titulo}`}
                      style={{ minHeight: 72, resize: "none", cursor: "pointer" }}
                      onClick={() => abrirEditar(t)}
                    />

                    {variaveisDe(t.mensagem).length > 0 && (
                      <div className="ar-scroll-x">
                        {variaveisDe(t.mensagem).map((v) => (
                          <button
                            key={v}
                            type="button"
                            className="ar-chip"
                            style={{ minHeight: 30, padding: "0 12px" }}
                            onClick={() => abrirEditar(t)}
                            title={`Este template usa {{${v}}} — clique pra editar`}
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ),
          )}
        </div>
      )}

      <Modal
        aberto={!!form}
        aoFechar={() => setForm(null)}
        titulo={form?.id ? "Editar template" : "Novo template"}
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
              rotulo="Título (só pra você identificar no seletor)"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ex: Sorteio em 24h"
            />
            <Selecao
              rotulo="Categoria"
              opcoes={(Object.entries(ROTULOS_CATEGORIA) as [CategoriaTemplate, string][]).map(([valor, rotulo]) => ({ valor, rotulo }))}
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaTemplate })}
            />
            <Selecao
              rotulo="Formato"
              opcoes={Object.entries(ROTULOS_TIPO).map(([valor, rotulo]) => ({ valor, rotulo }))}
              value={form.tipoConteudo}
              onChange={(e) => setForm({ ...form, tipoConteudo: e.target.value as TipoConteudoTemplate })}
            />
            <AreaTexto
              rotulo="Mensagem"
              value={form.mensagem}
              onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
              rows={5}
            />
            <div>
              <p className="ar-rotulo mb-1.5">Variáveis — toque pra inserir no texto</p>
              <div className="ar-scroll-x">
                {VARIAVEIS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="ar-chip"
                    onClick={() => setForm({ ...form, mensagem: `${form.mensagem}{{${v}}}` })}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ModalConfirmar
        aberto={!!excluindo}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={excluir}
        titulo="Remover template?"
        mensagem={`"${excluindo?.titulo}" some do seletor — histórico de quem já foi usado não muda.`}
        variante="perigo"
        textoConfirmar="Remover"
      />
    </div>
  );
};

/**
 * Extensão TipTap — SlashCommand
 *
 * Paleta "/" que lista tokens disponíveis para inserção no editor.
 * Usa a API Suggestion do TipTap v3 (@tiptap/suggestion, vem com @tiptap/extension-mention).
 *
 * Decisão de API (Context7 + inspeção node_modules):
 *   - TipTap v3 usa Extension.create() + addProseMirrorPlugins() com Suggestion({ editor, ... })
 *   - char: "/" dispara a paleta ao digitar barra no início de palavra
 *   - onStart/onUpdate/onKeyDown/onExit são callbacks de ciclo de vida da sugestão
 *   - A renderização do menu é feita pelo componente React SlashMenu (tijolo 2b)
 *     via ReactRenderer + tippy — aqui só o plugin/extensão é registrado
 *
 * Nota de acoplamento: a extensão expõe `SlashCommandPluginKey` pra que SlashMenu
 * possa fechar o popup via `editor.commands.closeSlashMenu()` (2b).
 */

import { Extension } from "@tiptap/core";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { CATALOGO_TOKENS, TokenInfo } from "../../tipos";

export const SlashCommandPluginKey = new PluginKey("slashCommand");

/** Item da paleta "/" retornado pelo suggestion. */
export interface SlashItem {
  info: TokenInfo;
  /** Handler chamado quando o item é selecionado. */
  command: (props: { editor: import("@tiptap/core").Editor; range: import("@tiptap/core").Range }) => void;
}

/** Filtra o catálogo pelo query digitado após a barra. */
function filtrarItens(query: string): SlashItem[] {
  const q = query.toLowerCase().trim();

  return CATALOGO_TOKENS.filter((t) => {
    if (!q) return true;
    return (
      t.rotulo.toLowerCase().includes(q) ||
      t.token.toLowerCase().includes(q) ||
      t.descricao.toLowerCase().includes(q) ||
      t.classe.toLowerCase().includes(q)
    );
  }).map((info) => ({
    info,
    command({ editor, range }) {
      // Remove o texto "/query" antes de inserir o token
      editor.chain().focus().deleteRange(range).run();

      if (info.tipo === "bloco") {
        editor.commands.inserirBlocoToken(info.token);
      } else {
        editor.commands.inserirToken(info.token);
      }
    },
  }));
}

/** Opções de Suggestion para a paleta "/". */
export type SlashSuggestionOptions = Omit<
  SuggestionOptions<SlashItem>,
  "editor"
>;

/** Configuração padrão — render deve ser sobrescrito pelo componente React (2b). */
const suggestionPadrao: SlashSuggestionOptions = {
  pluginKey: SlashCommandPluginKey,
  char: "/",
  allowSpaces: false,
  startOfLine: false,

  items({ query }) {
    return filtrarItens(query);
  },

  /**
   * render() é intencionalmente vazio aqui — será injetado pelo componente
   * React `SlashMenu` no tijolo 2b via `editor.extensionManager`.
   * Padrão: sem popup (extensão registrada, mas UI não montada ainda).
   */
  render() {
    return {
      onStart: () => {},
      onUpdate: () => {},
      onKeyDown: () => false,
      onExit: () => {},
    };
  },
};

export interface SlashCommandOptions {
  suggestion: SlashSuggestionOptions;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: suggestionPadrao,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

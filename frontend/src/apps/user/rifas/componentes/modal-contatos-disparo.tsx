/**
 * Modal de pré-visualização de contatos — antes de ativar um agendamento,
 * mostra quem vai receber (lista de disparo) e deixa marcar/desmarcar quem
 * quiser especificamente pra esse horário.
 */

import { useEffect, useMemo, useState } from "react";
import { Modal } from "./modal";
import { Botao } from "./botao";
import { Campo } from "./campo";
import { listarContatosDisparo, type ContatoDisparo } from "../dados-disparos";
import "../abas/aba-disparo.css";

export interface ModalContatosDisparoProps {
  aberto: boolean;
  aoFechar: () => void;
  /** null = "todos os marcados na lista de disparo" (dinâmico); array = seleção travada pra esse agendamento. */
  selecaoInicial: string[] | null;
  aoConfirmar: (contatosIds: string[] | null) => void;
}

export const ModalContatosDisparo = ({
  aberto,
  aoFechar,
  selecaoInicial,
  aoConfirmar,
}: ModalContatosDisparoProps) => {
  const [contatos, setContatos] = useState<ContatoDisparo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!aberto) return;
    setCarregando(true);
    listarContatosDisparo()
      .then((lista) => {
        setContatos(lista);
        if (selecaoInicial) {
          setSelecionados(new Set(selecaoInicial));
        } else {
          setSelecionados(new Set(lista.filter((c) => c.marcado).map((c) => c.id)));
        }
      })
      .finally(() => setCarregando(false));
  }, [aberto, selecaoInicial]);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return contatos;
    return contatos.filter((c) => (c.nome ?? "").toLowerCase().includes(b) || c.phone.includes(b));
  }, [contatos, busca]);

  const alternar = (id: string) => {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const confirmar = () => {
    // Se selecionou TODOS os marcados da lista original e nada mais, deixa
    // dinâmico (contatos_ids null) — assim quem entrar na lista depois entra
    // automaticamente no disparo. Qualquer ajuste manual trava a seleção.
    const todosMarcadosIds = new Set(contatos.filter((c) => c.marcado).map((c) => c.id));
    const igualAoPadrao =
      selecionados.size === todosMarcadosIds.size &&
      [...selecionados].every((id) => todosMarcadosIds.has(id));
    aoConfirmar(igualAoPadrao ? null : [...selecionados]);
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Quem vai receber"
      subtitulo={`${selecionados.size} de ${contatos.length} contato${contatos.length === 1 ? "" : "s"} selecionado${selecionados.size === 1 ? "" : "s"}`}
      tamanho="lg"
      rodape={
        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={confirmar}>
            Confirmar seleção
          </Botao>
        </div>
      }
    >
      <div className="space-y-3">
        <Campo
          placeholder="Buscar por nome ou telefone…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        {carregando ? (
          <p className="text-sm ar-txt-3 py-6 text-center">Carregando contatos…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm ar-txt-3 py-6 text-center">Nenhum contato encontrado.</p>
        ) : (
          <div className="ar-cartao ar-cartao--compacto">
            <div className="ar-lista ard-rolavel max-h-96">
              {filtrados.map((c) => (
                <label key={c.id} className="ar-linha cursor-pointer select-none">
                  <span className="ard-check-alvo">
                    <input
                      type="checkbox"
                      className="ard-check"
                      checked={selecionados.has(c.id)}
                      onChange={() => alternar(c.id)}
                    />
                  </span>
                  <span className="flex-1 min-w-0 truncate ar-txt-1">
                    {c.nome || <span className="ar-txt-4">(sem nome)</span>}
                  </span>
                  <span className="ar-num text-sm ar-txt-3 shrink-0">{c.phone}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

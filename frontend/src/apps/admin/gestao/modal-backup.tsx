/**
 * Backup (exportar e importar) — só admin. Mesmo fluxo do original (financeiro.html:4278-4345):
 * o texto JSON aparece numa caixa; para importar, cola-se um backup e confirma-se no 2º clique.
 * Importar respeita a ordem das chaves (decisão 14) e só diz "concluída" se NÃO houve erro (decisão 12).
 */

import { useEffect, useState } from "react";
import { exportarBackup, importarBackup, mensagemDeErro, type Backup } from "./dados";
import { Modal } from "./ui-gestao";
import type { ToastApi } from "./tipos";

const contar = (b: Backup): string =>
  Object.keys(b.colecoes)
    .map((k) => `${k}: ${(b.colecoes[k] ?? []).length}`)
    .join(" · ");

export function ModalBackup({
  t,
  onClose,
  aoImportar,
}: {
  t: ToastApi;
  onClose: () => void;
  aoImportar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [status, setStatus] = useState("Lendo os dados do banco…");
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    exportarBackup()
      .then((b) => {
        if (!vivo) return;
        setTexto(JSON.stringify(b));
        setStatus(
          `Exportar: copie o texto abaixo (${contar(b)}). Importar: apague o conteúdo, cole um backup e clique em Importar.`,
        );
      })
      .catch((e) => {
        if (vivo) setStatus(mensagemDeErro(e, "Não consegui ler os dados para o backup."));
      });
    return () => {
      vivo = false;
    };
  }, []);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      t.success("Backup copiado.");
    } catch {
      t.error("Não consegui copiar. Selecione o texto e use Ctrl+C.");
    }
  };

  const importar = async () => {
    let b: Backup;
    try {
      b = JSON.parse(texto) as Backup;
    } catch {
      t.error("O texto colado não é um backup válido.");
      return;
    }
    if (!b || typeof b.colecoes !== "object") {
      t.error("O texto colado não é um backup válido.");
      return;
    }
    const total = Object.values(b.colecoes).reduce(
      (s, l) => s + (Array.isArray(l) ? l.length : 0),
      0,
    );
    if (total === 0) {
      t.error("Nenhum registro encontrado no backup.");
      return;
    }
    if (confirmando !== total) {
      setConfirmando(total);
      setStatus(
        `Vai gravar ${contar(b)}. Registros com o mesmo id serão atualizados. Clique de novo para confirmar.`,
      );
      return;
    }
    setConfirmando(null);
    setOcupado(true);
    try {
      const r = await importarBackup(b, (f, n) => setStatus(`Importando… ${f} de ${n}`));
      setStatus(
        `Concluído: ${r.importados} importados${r.erros.length ? `, ${r.erros.length} com erro` : ""}.`,
      );
      if (r.erros.length)
        t.error(
          `Importação terminou com ${r.erros.length} erro${r.erros.length > 1 ? "s" : ""}. Confira a contagem na janela.`,
        );
      else t.success("Importação concluída.");
      aoImportar();
    } catch (e) {
      t.error(mensagemDeErro(e, "Não consegui importar o backup."));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo="Backup dos dados"
      largura={620}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="btn" disabled={ocupado} onClick={() => void importar()}>
            {confirmando ? `Confirmar: importar ${confirmando}` : "Importar"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocupado || !texto}
            onClick={() => void copiar()}
          >
            Copiar backup
          </button>
        </>
      }
    >
      <div className="muted small">{status}</div>
      <textarea
        className="input mono"
        spellCheck={false}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        style={{ height: 220, fontSize: 11 }}
        aria-label="Dados em JSON"
      />
    </Modal>
  );
}

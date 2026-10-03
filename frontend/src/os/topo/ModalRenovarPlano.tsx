/**
 * Modal de renovação do plano atual. Mesmo fluxo financeiro da Loja: o tenant
 * paga via PIX, anexa o comprovante e o pedido entra em `pedidos_compra` com
 * status `pendente` (tipo `plano`) pra o financeiro aprovar.
 *
 * Diferença pro `ModalComprar` da Loja: aqui o item já vem travado no plano que
 * o tenant tem hoje (renovação), sem escolha. Trocar de plano é na Loja.
 *
 * Reusa o bucket `comprovantes` e a tabela `pedidos_compra` — nada novo no banco.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ModalCentral } from "./ModalCentral";

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info?: (m: string) => void;
}

/** Canal de toast real exposto pelo Desktop (bundle.jsx) — funciona em callbacks. */
function pegarToast(): ToastApi {
  const w = window as unknown as { __ragenticToastCtx?: ToastApi };
  return w.__ragenticToastCtx ?? { success: () => {}, error: () => {} };
}

interface ModalRenovarPlanoProps {
  planoNome: string;
  planoId: string | null;
  preco: number;
  pix: string;
  onClose: () => void;
}

const IconeX = ({ size = 14 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconeUpload = ({ size = 20 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--txt-3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export function ModalRenovarPlano({ planoNome, planoId, preco, pix, onClose }: ModalRenovarPlanoProps) {
  const t = pegarToast();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function concluir() {
    if (!planoId) {
      setErro("Não encontrei o seu plano atual. Fale com o suporte da Babel para renovar.");
      return;
    }
    if (!arquivo) {
      setErro("Anexe o comprovante de pagamento antes de concluir.");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const uid = sessao?.session?.user?.id;
      if (!uid) throw new Error("Sessão inválida");

      const ext = arquivo.name.split(".").pop() || "dat";
      const caminho = `${uid}/${Date.now()}.${ext}`;

      const { error: errUpload } = await supabase.storage
        .from("comprovantes")
        .upload(caminho, arquivo, { upsert: false });
      if (errUpload) throw errUpload;

      const { error: errInsert } = await supabase.from("pedidos_compra").insert({
        user_id: uid,
        tipo: "plano",
        item_id: planoId,
        item_nome: planoNome,
        item_preco: preco,
        comprovante_url: caminho,
        status: "pendente",
      });
      if (errInsert) throw errInsert;

      t.success("Renovação enviada · aguardando aprovação do financeiro");
      onClose();
    } catch (e) {
      console.error("[ModalRenovarPlano] concluir:", e);
      t.error("Erro ao enviar a renovação. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const copiarPix = () => {
    if (!pix) return;
    navigator.clipboard?.writeText(pix);
    t.info?.("PIX copiado");
  };

  return (
    <ModalCentral onClose={onClose} width={460} ariaLabel={`Renovar plano ${planoNome}`}>
      <div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div className="muted small">Renovação de plano</div>
            <div className="h2">
              {planoNome}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar">
            <IconeX size={14} />
          </button>
        </div>

        <div className="os-vidro" style={{ padding: 16, marginBottom: 14, background: "rgba(255,255,255,0.03)" }}>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Chave PIX (copie e pague)
          </div>
          <div className="row gap-2">
            <input className="input mono" value={pix || "Chave PIX não configurada"} readOnly />
            {pix && (
              <button className="btn btn-sm" onClick={copiarPix}>
                Copiar
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="label">Comprovante de pagamento (obrigatório)</label>
          <label className="os-vidro center" style={{ height: 90, borderStyle: "dashed", cursor: "pointer", flexDirection: "column", display: "flex" }}>
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                setErro("");
              }}
            />
            <IconeUpload size={20} />
            <div className="muted small" style={{ marginTop: 4 }}>
              {arquivo ? arquivo.name : "Clique para selecionar PDF ou imagem"}
            </div>
          </label>
          {erro && (
            <div className="small" style={{ color: "oklch(0.82 0.20 25)", marginTop: 6 }}>
              {erro}
            </div>
          )}
        </div>

        <div className="row gap-2" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={concluir} disabled={enviando}>
            {enviando ? "Enviando…" : "Confirmar renovação"}
          </button>
        </div>
      </div>
    </ModalCentral>
  );
}

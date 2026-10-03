// @ts-nocheck
/* eslint-disable */
/**
 * Modal de comprovante de pagamento — exibe signed URL do bucket privado `comprovantes`.
 * PDF → iframe; imagem → img. Trata path nulo e URL antiga (extrai path após 'comprovantes/').
 */
import { useState, useEffect } from 'react';
import { Icon } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

/**
 * Extrai o path relativo dentro do bucket `comprovantes`.
 * Aceita path puro ("uid/123.png") ou URL antiga com "comprovantes/" embedded.
 */
function extrairPath(comprovanteUrl) {
  if (!comprovanteUrl) return null;
  if (comprovanteUrl.startsWith('http')) {
    const marcador = 'comprovantes/';
    const idx = comprovanteUrl.indexOf(marcador);
    if (idx === -1) return null;
    return comprovanteUrl.slice(idx + marcador.length);
  }
  return comprovanteUrl;
}

export function ModalComprovante({ pedido, onClose }) {
  const [url, setUrl] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const path = extrairPath(pedido?.comprovante_url);
    if (!path) {
      setErro('Sem comprovante anexado.');
      setCarregando(false);
      return;
    }

    supabase.storage
      .from('comprovantes')
      .createSignedUrl(path, 300)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) {
          setErro('Não foi possível carregar o comprovante.');
        } else {
          setUrl(data.signedUrl);
        }
        setCarregando(false);
      });
  }, [pedido?.comprovante_url]);

  const ehPdf = pedido?.comprovante_url?.toLowerCase().endsWith('.pdf') ||
    url?.toLowerCase().includes('.pdf');

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div className="muted small">Comprovante de pagamento</div>
            <div className="h2">{pedido.nome_tenant ?? pedido.user_id}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div
          className="os-vidro center"
          style={{ minHeight: 260, flexDirection: 'column', overflow: 'hidden' }}
        >
          {carregando && <div className="muted small">Carregando…</div>}

          {!carregando && erro && (
            <>
              <Icon name="file" size={36} stroke="var(--txt-3)" />
              <div className="muted small" style={{ marginTop: 8 }}>{erro}</div>
            </>
          )}

          {!carregando && url && ehPdf && (
            <iframe
              src={url}
              title="Comprovante PDF"
              style={{ width: '100%', height: 340, border: 'none', borderRadius: 8 }}
            />
          )}

          {!carregando && url && !ehPdf && (
            <img
              src={url}
              alt="Comprovante de pagamento"
              style={{ maxWidth: '100%', maxHeight: 340, borderRadius: 8, objectFit: 'contain' }}
            />
          )}
        </div>

        <div className="row gap-2" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </>
  );
}

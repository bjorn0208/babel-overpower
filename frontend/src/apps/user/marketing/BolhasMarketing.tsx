// @ts-nocheck
/**
 * BolhasMarketing — renderiza o histórico de mensagens da sessão de geração.
 *
 * Reutiliza GenUiResultado do mentor para o caso `imagem_post`,
 * mas substitui o botão Baixar para suportar composição de logo.
 */
import { Icon, useToast } from '@/bundle/bundle-shared';
import { GenUiResultado } from '@/apps/user/mentor/GenUiResultado';
import type { MensagemMarketing } from './use-motor-marketing';

type FormatoPost = 'feed_quadrado' | 'retrato' | 'story' | 'paisagem';

const ROTULO_FORMATO: Record<FormatoPost, string> = {
  feed_quadrado: 'Feed 1:1',
  retrato:       'Retrato 4:5',
  story:         'Story 9:16',
  paisagem:      'Paisagem 16:9',
};

type Props = {
  mensagens: MensagemMarketing[];
  gerando: boolean;
  formatoAtual: FormatoPost;
  comLogo: boolean;
  logoUrl: string | null;
  onBaixar: (url: string, formato: string) => void;
};

// Shimmer animado durante a geração (8-30s é esperado)
export function ShimmerGeracao({ formato }: { formato: FormatoPost }) {
  const ASPECT: Record<FormatoPost, string> = {
    feed_quadrado: '1 / 1',
    retrato:       '4 / 5',
    story:         '9 / 16',
    paisagem:      '16 / 9',
  };
  return (
    <div style={{ maxWidth: 320, margin: '0 auto', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{
        aspectRatio: ASPECT[formato] ?? '1 / 1',
        background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.09) 50%, rgba(255,255,255,.04) 75%)',
        backgroundSize: '200% 100%',
        animation: 'mkt-shimmer 1.6s ease-in-out infinite',
      }} />
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,.25)',
          animation: 'mkt-pulse 1s ease-in-out infinite',
        }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>
          Gerando imagem… pode levar até 30s
        </span>
      </div>
    </div>
  );
}

export function BolhasMarketing({ mensagens, gerando, formatoAtual, comLogo, logoUrl, onBaixar }: Props) {
  if (mensagens.length === 0 && !gerando) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        color: 'var(--text-3, #666)', textAlign: 'center', padding: '32px 0',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="sparkles" size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-2, #aaa)', marginBottom: 4 }}>
            Crie posts com IA
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            Descreva o post que quer criar.<br />
            O agente usa o conhecimento do seu negócio<br />
            pra gerar algo alinhado com sua marca.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {mensagens.map(msg => (
        <div key={msg.id}>
          {msg.origem === 'usuario' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                maxWidth: '75%', padding: '9px 14px',
                borderRadius: '14px 14px 4px 14px',
                background: 'rgba(98,196,142,.12)', border: '1px solid rgba(98,196,142,.2)',
                fontSize: 13, lineHeight: 1.5,
              }}>
                {msg.texto}
              </div>
            </div>
          )}

          {msg.origem === 'mentor' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {msg.texto && msg.texto !== '…' && (
                <div style={{
                  maxWidth: '80%', padding: '9px 14px',
                  borderRadius: '14px 14px 14px 4px',
                  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
                  fontSize: 13, lineHeight: 1.5,
                }}>
                  {msg.texto}
                </div>
              )}

              {msg.genUis?.map((g, i) => {
                if (g.tipo !== 'imagem_post') {
                  return <GenUiResultado key={i} tipo={g.tipo} dados={g.dados} mensagem={g.mensagem} />;
                }
                const url = g.dados?.url;
                const fmtVal = (g.dados?.formato as FormatoPost) ?? 'feed_quadrado';
                const aspect = String(g.dados?.aspect_ratio ?? '1:1').replace(':', ' / ');
                if (!url) return null;
                return (
                  <div key={i} style={{ maxWidth: 360 }}>
                    <div style={{
                      position: 'relative', borderRadius: 12, overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,.1)',
                      background: 'rgba(255,255,255,.03)', aspectRatio: aspect,
                    }}>
                      <img
                        src={url} alt="Imagem de post gerada" loading="lazy"
                        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', marginTop: 8, gap: 8,
                    }}>
                      <span style={{ fontSize: 11, color: '#9aa0aa', fontWeight: 600 }}>
                        {ROTULO_FORMATO[fmtVal] ?? 'Post'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onBaixar(url, fmtVal)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 8,
                          border: '1px solid rgba(255,255,255,.14)',
                          background: 'rgba(255,255,255,.06)', color: '#eaeaea',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        <Icon name="download" size={12} />
                        {comLogo && logoUrl ? 'Baixar com logo' : 'Baixar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {gerando && <ShimmerGeracao formato={formatoAtual} />}
    </>
  );
}

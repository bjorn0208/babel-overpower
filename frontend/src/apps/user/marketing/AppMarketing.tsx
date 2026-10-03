// @ts-nocheck
/**
 * AppMarketing — app dedicado para geração de imagens de post de redes sociais.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │  área de resultado / galeria  (flex-grow:1)  │
 *   ├─────────────────────────────────────────────┤
 *   │  seletor de formato  (4 botões)              │
 *   │  checkbox "incluir minha logo"               │
 *   │  campo de texto + botão enviar               │
 *   └─────────────────────────────────────────────┘
 *
 * Disparo: mesmo cano do CommandBar do Mentor (use-motor-marketing.ts).
 * Gen UI: BolhasMarketing reutiliza GenImagemPost de ../mentor/GenUiResultado.
 * Logo: composição client-side via OffscreenCanvas (dossier Bloco 3).
 * Galeria: bucket `marketing-posts` / prefixo do tenant (storage policy).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';
import { GaleriaMarketing } from './GaleriaMarketing';
import { BolhasMarketing } from './BolhasMarketing';
import { useMotorMarketing } from './use-motor-marketing';

type FormatoPost = 'feed_quadrado' | 'retrato' | 'story' | 'paisagem';

const FORMATOS: { valor: FormatoPost; rotulo: string }[] = [
  { valor: 'feed_quadrado', rotulo: 'Feed 1:1'      },
  { valor: 'retrato',       rotulo: 'Retrato 4:5'   },
  { valor: 'story',         rotulo: 'Story 9:16'    },
  { valor: 'paisagem',      rotulo: 'Paisagem 16:9' },
];

// ── Composição de logo via OffscreenCanvas ───────────────────────────────

async function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function comporLogoNaImagem(urlImagem: string, urlLogo: string): Promise<string> {
  const [img, logo] = await Promise.all([
    carregarImagem(urlImagem),
    carregarImagem(urlLogo),
  ]);
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const PADDING = 28;
  const logoW = Math.round(img.width * 0.14);
  const logoH = Math.round((logo.height / logo.width) * logoW);
  ctx.globalAlpha = 0.85;
  ctx.drawImage(logo, img.width - logoW - PADDING, img.height - logoH - PADDING, logoW, logoH);
  ctx.globalAlpha = 1;
  const blob = await canvas.convertToBlob({ type: 'image/png', quality: 1 });
  return URL.createObjectURL(blob);
}

// ── Componente raiz ──────────────────────────────────────────────────────

export function AppMarketing() {
  const toast = useToast();
  const { mensagens, gerando, enviar } = useMotorMarketing();

  const [formato, setFormato] = useState<FormatoPost>('feed_quadrado');
  const [comLogo, setComLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [abaAtiva, setAbaAtiva] = useState<'chat' | 'galeria'>('chat');
  const resultadoRef = useRef<HTMLDivElement>(null);

  // Carrega logo_url da empresa do tenant (filtra por user_id = auth.uid())
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from('empresas')
          .select('logo_url')
          .eq('user_id', uid)
          .maybeSingle();
        if (vivo && data?.logo_url) setLogoUrl(data.logo_url);
      } catch { /* logo é opcional — falha silenciosa */ }
    })();
    return () => { vivo = false; };
  }, []);

  // Rola para a última mensagem ao receber nova
  useEffect(() => {
    if (resultadoRef.current) {
      resultadoRef.current.scrollTop = resultadoRef.current.scrollHeight;
    }
  }, [mensagens, gerando]);

  const handleEnviar = useCallback(() => {
    const t = texto.trim();
    if (!t || gerando) return;
    // Injeta o formato no pedido — o porteiro identifica e passa pra tool
    enviar(`Gere um post no formato ${formato} para: ${t}`);
    setTexto('');
  }, [texto, formato, gerando, enviar]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar(); }
  };

  const handleBaixar = useCallback(async (urlOriginal: string, nomeFormato: string) => {
    if (comLogo && logoUrl) {
      try {
        const urlComposta = await comporLogoNaImagem(urlOriginal, logoUrl);
        const a = document.createElement('a');
        a.href = urlComposta;
        a.download = `post-${nomeFormato}-com-logo.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(urlComposta);
        toast.success('Download com logo iniciado');
      } catch {
        toast.error('Falha ao compor logo — baixando original');
        window.open(urlOriginal, '_blank');
      }
    } else {
      try {
        const resp = await fetch(urlOriginal);
        const blob = await resp.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = `post-${nomeFormato}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
      } catch { window.open(urlOriginal, '_blank'); }
    }
  }, [comLogo, logoUrl, toast]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-1, #0f0f11)', color: 'var(--text-1, #eaeaea)',
      fontFamily: 'var(--font-sans, inherit)',
    }}>
      <style>{`
        @keyframes mkt-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes mkt-pulse {
          0%, 100% { opacity: .4; }
          50%       { opacity: 1; }
        }
      `}</style>

      {/* Cabeçalho com abas */}
      <div style={{
        padding: '14px 20px 0', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="image" size={16} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Marketing</span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
            background: 'rgba(98,196,142,.14)', color: '#62c48e', letterSpacing: 0.3,
          }}>Posts com IA</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['chat', 'galeria'] as const).map(aba => (
            <button key={aba} type="button" onClick={() => setAbaAtiva(aba)} style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: '1px solid',
              borderColor: abaAtiva === aba ? 'rgba(98,196,142,.45)' : 'rgba(255,255,255,.08)',
              background: abaAtiva === aba ? 'rgba(98,196,142,.12)' : 'transparent',
              color: abaAtiva === aba ? '#62c48e' : 'var(--text-3, #888)',
              cursor: 'pointer', transition: 'all .15s',
            }}>
              {aba === 'chat' ? 'Criar' : 'Galeria'}
            </button>
          ))}
        </div>
      </div>

      {/* Área de conteúdo (scrollável) */}
      <div ref={resultadoRef} style={{
        flex: 1, overflowY: 'auto', padding: '16px 20px',
        display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0,
      }}>
        {abaAtiva === 'galeria'
          ? <GaleriaMarketing />
          : (
            <BolhasMarketing
              mensagens={mensagens}
              gerando={gerando}
              formatoAtual={formato}
              comLogo={comLogo}
              logoUrl={logoUrl}
              onBaixar={handleBaixar}
            />
          )
        }
      </div>

      {/* Painel inferior — só na aba Criar */}
      {abaAtiva === 'chat' && (
        <div style={{
          flexShrink: 0, borderTop: '1px solid rgba(255,255,255,.07)',
          padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Seletor de formato */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FORMATOS.map(f => (
              <button key={f.valor} type="button" onClick={() => setFormato(f.valor)} style={{
                padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                border: '1px solid',
                borderColor: formato === f.valor ? 'rgba(126,189,255,.5)' : 'rgba(255,255,255,.1)',
                background: formato === f.valor ? 'rgba(126,189,255,.12)' : 'rgba(255,255,255,.03)',
                color: formato === f.valor ? '#7ebdff' : 'var(--text-3, #888)',
                cursor: 'pointer', transition: 'all .13s', flexShrink: 0,
              }}>
                {f.rotulo}
              </button>
            ))}
          </div>

          {/* Checkbox logo — aparece só se tenant tiver logo cadastrada */}
          {logoUrl && (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', fontSize: 12, color: 'var(--text-2, #bbb)',
            }}>
              <input
                type="checkbox" checked={comLogo}
                onChange={e => setComLogo(e.target.checked)}
                style={{ accentColor: '#7ebdff', width: 14, height: 14 }}
              />
              Incluir minha logo no download
            </label>
          )}

          {/* Campo de texto + botão enviar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={gerando}
              placeholder="Descreva o post que quer criar… (Enter pra enviar)"
              rows={2}
              style={{
                flex: 1, resize: 'none', padding: '10px 12px', borderRadius: 10,
                fontSize: 13, lineHeight: 1.5,
                border: '1px solid rgba(255,255,255,.1)',
                background: 'rgba(255,255,255,.04)',
                color: 'var(--text-1, #eaeaea)', outline: 'none',
                transition: 'border-color .15s', fontFamily: 'inherit',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(126,189,255,.4)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; }}
            />
            <button
              type="button"
              onClick={handleEnviar}
              disabled={gerando || !texto.trim()}
              title="Enviar (Enter)"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                border: '1px solid',
                borderColor: gerando || !texto.trim() ? 'rgba(255,255,255,.08)' : 'rgba(126,189,255,.5)',
                background: gerando || !texto.trim() ? 'rgba(255,255,255,.04)' : 'rgba(126,189,255,.15)',
                color: gerando || !texto.trim() ? 'rgba(255,255,255,.25)' : '#7ebdff',
                cursor: gerando || !texto.trim() ? 'not-allowed' : 'pointer',
                transition: 'all .15s',
              }}
            >
              <Icon name="send" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

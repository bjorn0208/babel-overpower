// @ts-nocheck
/**
 * Post-it físico flutuante no Desktop.
 * Drag pelo header. Resize por lateral direita, lateral inferior e canto inferior-direito.
 * Salva posição/tamanho com debounce no Supabase.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Check = { id: string; texto: string; marcado: boolean };

export type PostitNota = {
  id: string;
  titulo: string;
  conteudo: string;
  checks: Check[];
  data_lembrete: string | null;
  posicao: { x: number; y: number; w: number; h: number } | null;
};

type Props = {
  nota: PostitNota;
  onMover: (id: string, posicao: { x: number; y: number; w: number; h: number }) => void;
  onAlternarCheck: (id: string, idCheck: string, marcado: boolean) => void;
  onConcluir: (id: string) => void;
  onArquivar: (id: string) => void;
  onAbrirApp: (notaId: string) => void;
};

const MIN_W = 180;
const MIN_H = 160;
const MAX_W = 480;
const MAX_H = 480;
const DEBOUNCE_MS = 500;

// Rotação estável por id (hash simples → -3°..+3°)
function rotacaoDoId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const norm = ((h % 1000) + 1000) % 1000; // 0..999
  return ((norm / 999) * 6 - 3); // -3..+3
}

function formatarLembrete(iso: string | null): { texto: string; atrasado: boolean } | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const atrasado = d.getTime() < Date.now();
    const texto = d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return { texto, atrasado };
  } catch {
    return null;
  }
}

export function Postit({ nota, onMover, onAlternarCheck, onConcluir, onArquivar, onAbrirApp }: Props) {
  const pos = nota.posicao || { x: 60, y: 80, w: 240, h: 220 };
  const [estado, setEstado] = useState(pos);
  const [arrastando, setArrastando] = useState(false);
  const rafRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza com props quando vier update externo
  useEffect(() => {
    setEstado(nota.posicao || { x: 60, y: 80, w: 240, h: 220 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota.posicao?.x, nota.posicao?.y, nota.posicao?.w, nota.posicao?.h]);

  const persistir = useCallback(
    (proximo: { x: number; y: number; w: number; h: number }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onMover(nota.id, proximo), DEBOUNCE_MS);
    },
    [nota.id, onMover],
  );

  const aplicarEstado = useCallback((proximo: { x: number; y: number; w: number; h: number }) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setEstado(proximo);
    });
  }, []);

  const iniciarDrag = useCallback(
    (eIni: any) => {
      // Ignorar clicks nos botões do header
      if ((eIni.target as HTMLElement).closest('.postit-acao')) return;
      eIni.preventDefault();
      const startMouseX = eIni.clientX;
      const startMouseY = eIni.clientY;
      const startX = estado.x;
      const startY = estado.y;
      let proximo = { ...estado };
      setArrastando(true);

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouseX;
        const dy = ev.clientY - startMouseY;
        proximo = {
          x: Math.max(0, startX + dx),
          y: Math.max(0, startY + dy),
          w: estado.w,
          h: estado.h,
        };
        aplicarEstado(proximo);
      };
      const onUp = () => {
        setArrastando(false);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        persistir(proximo);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [estado, aplicarEstado, persistir],
  );

  const iniciarResize = useCallback(
    (eIni: any, eixos: { largura: boolean; altura: boolean }) => {
      eIni.preventDefault();
      eIni.stopPropagation();
      const startMouseX = eIni.clientX;
      const startMouseY = eIni.clientY;
      const startW = estado.w;
      const startH = estado.h;
      let proximo = { ...estado };

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouseX;
        const dy = ev.clientY - startMouseY;
        proximo = {
          x: estado.x,
          y: estado.y,
          w: eixos.largura ? Math.min(MAX_W, Math.max(MIN_W, startW + dx)) : estado.w,
          h: eixos.altura ? Math.min(MAX_H, Math.max(MIN_H, startH + dy)) : estado.h,
        };
        aplicarEstado(proximo);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        persistir(proximo);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [estado, aplicarEstado, persistir],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const rot = useMemo(() => rotacaoDoId(nota.id), [nota.id]);
  const lembrete = formatarLembrete(nota.data_lembrete);

  return (
    <div
      className={`postit ${arrastando ? 'arrastando' : ''}`}
      style={{
        left: estado.x,
        top: estado.y,
        width: estado.w,
        height: estado.h,
        '--postit-rot': `${rot}deg`,
      } as any}
    >
      <div className="postit-alfinete" />

      <div className="postit-header" onMouseDown={iniciarDrag}>
        <span className="postit-titulo">{nota.titulo || 'Sem título'}</span>
        <button
          type="button"
          className="postit-acao abrir"
          onClick={() => onAbrirApp(nota.id)}
          title="Abrir no app Notas"
        >
          ↗
        </button>
        <button
          type="button"
          className="postit-acao concluir"
          onClick={() => onConcluir(nota.id)}
          title="Concluir"
        >
          ✓
        </button>
        <button
          type="button"
          className="postit-acao arquivar"
          onClick={() => onArquivar(nota.id)}
          title="Arquivar"
        >
          ×
        </button>
      </div>

      <div className="postit-corpo">
        {lembrete && (
          <span className={`postit-lembrete ${lembrete.atrasado ? 'atrasado' : ''}`}>
            ⏰ {lembrete.atrasado ? 'atrasada · ' : ''}{lembrete.texto}
          </span>
        )}
        {nota.conteudo && <div className="postit-texto">{nota.conteudo}</div>}
        {(nota.checks?.length || 0) > 0 && (
          <div className="postit-checks">
            {nota.checks.map((c) => (
              <label
                key={c.id}
                className={`postit-check ${c.marcado ? 'marcado' : ''}`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span
                  className={`postit-check-box ${c.marcado ? 'marcado' : ''}`}
                  onClick={() => onAlternarCheck(nota.id, c.id, !c.marcado)}
                />
                <span className="postit-check-texto">{c.texto || '—'}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="postit-resize lateral-direita" onMouseDown={(e) => iniciarResize(e, { largura: true, altura: false })} />
      <div className="postit-resize lateral-inferior" onMouseDown={(e) => iniciarResize(e, { largura: false, altura: true })} />
      <div className="postit-resize canto-inferior-direito" onMouseDown={(e) => iniciarResize(e, { largura: true, altura: true })} />
    </div>
  );
}

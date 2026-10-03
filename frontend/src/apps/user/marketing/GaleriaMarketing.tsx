// @ts-nocheck
/**
 * GaleriaMarketing — lista imagens geradas do tenant no bucket `marketing-posts`.
 *
 * A policy `marketing_posts_select_own` permite o user listar e acessar
 * somente os próprios objetos (prefixo `<user_id>/`).
 * Cada item mostra thumbnail + botão de download.
 */
import { useCallback, useEffect, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';

type ItemGaleria = {
  nome: string;
  url: string;
  criadoEm: string;
};

const BUCKET = 'marketing-posts';

const fmtData = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

async function baixarImagem(url: string, nome: string) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = nome || 'post.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, '_blank');
  }
}

export function GaleriaMarketing() {
  const [itens, setItens] = useState<ItemGaleria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const t = useToast();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) return;

      // Storage list NÃO é recursivo e o path real é {uid}/{yyyy_mm}/{uuid}.png.
      // Lista o nível do tenant; cada subpasta (id === null) é um mês → lista dentro dela.
      const { data: nivel1, error } = await supabase.storage
        .from(BUCKET)
        .list(uid, { limit: 100 });
      if (error) throw error;

      const arquivos: { path: string; nome: string; criadoEm: string }[] = [];
      for (const entrada of nivel1 ?? []) {
        if (entrada.id === null) {
          // subpasta de mês (ex: 2026_05) — lista os arquivos dentro
          const { data: sub } = await supabase.storage
            .from(BUCKET)
            .list(`${uid}/${entrada.name}`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
          for (const f of sub ?? []) {
            if (f.id !== null) {
              arquivos.push({ path: `${uid}/${entrada.name}/${f.name}`, nome: f.name, criadoEm: f.created_at ?? '' });
            }
          }
        } else {
          // arquivo solto direto no nível do tenant (defensivo)
          arquivos.push({ path: `${uid}/${entrada.name}`, nome: entrada.name, criadoEm: entrada.created_at ?? '' });
        }
      }
      arquivos.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));

      const resultado: ItemGaleria[] = arquivos.map(f => {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(f.path);
        return { nome: f.nome, url: data.publicUrl, criadoEm: f.criadoEm };
      });
      setItens(resultado);
    } catch (e) {
      t.error('Falha ao carregar galeria: ' + (e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  if (carregando) {
    return (
      <div style={{ padding: '16px 0', color: 'var(--text-3, #777)', fontSize: 13 }}>
        Carregando galeria…
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <div style={{
        padding: '24px 0', textAlign: 'center',
        color: 'var(--text-3, #666)', fontSize: 13,
      }}>
        <Icon name="image" size={28} />
        <div style={{ marginTop: 8 }}>Nenhuma imagem gerada ainda.</div>
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
          Use o campo abaixo pra criar seu primeiro post.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3, #888)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Galeria · {itens.length} {itens.length === 1 ? 'imagem' : 'imagens'}
        </span>
        <button
          type="button"
          onClick={carregar}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,.1)',
            background: 'transparent', color: 'var(--text-2, #aaa)', fontSize: 11,
            cursor: 'pointer',
          }}
        >
          <Icon name="refresh" size={11} /> Atualizar
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10,
      }}>
        {itens.map(item => (
          <div
            key={item.nome}
            style={{
              position: 'relative', borderRadius: 10, overflow: 'hidden',
              border: '1px solid rgba(255,255,255,.08)',
              background: 'rgba(255,255,255,.03)',
              aspectRatio: '1 / 1',
              cursor: 'pointer',
            }}
          >
            <img
              src={item.url}
              alt={item.nome}
              loading="lazy"
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Overlay com botão de download */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              flexDirection: 'column', justifyContent: 'flex-end',
              background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,.65) 100%)',
              opacity: 0,
              transition: 'opacity .18s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
            >
              <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.7)' }}>
                  {fmtData(item.criadoEm)}
                </span>
                <button
                  type="button"
                  onClick={() => baixarImagem(item.url, item.nome)}
                  title="Baixar imagem"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 8px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,.3)',
                    background: 'rgba(255,255,255,.15)', color: '#fff',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <Icon name="download" size={11} /> Baixar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

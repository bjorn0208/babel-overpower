/**
 * Seção de Mídias do produto (app Produtos).
 * Upload de imagem/arquivo pro bucket `produto-midias` + registro em `produto_midias`.
 * A descrição de cada mídia vira RAG do agente (lida por `sincronizar-blocos`) —
 * por isso, ao mexer aqui, dispara o sync pra regenerar o conhecimento do agente.
 *
 * Path no storage: {uid}/{produtoId}/{timestamp}.{ext} (RLS por 1ª pasta = uid do dono).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSincronizarBlocos } from "@/hooks/use-sincronizar-blocos";

const BUCKET = "produto-midias";

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info?: (m: string) => void;
}

function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

interface Midia {
  id: string;
  arquivo_url: string;
  arquivo_nome: string;
  arquivo_tipo: string;
  descricao: string;
  ordem: number;
}

/** Extrai o path interno do bucket a partir da URL pública (pra remover do storage). */
function pathDaUrl(url: string): string | null {
  const marca = `/${BUCKET}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? url.slice(i + marca.length) : null;
}

interface SecaoMidiasProps {
  produtoId: string;
}

export function SecaoMidias({ produtoId }: SecaoMidiasProps) {
  const t = pegarToast();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const { sync } = useSincronizarBlocos(ownerId);
  const [midias, setMidias] = useState<Midia[]>([]);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("produto_midias")
      .select("id, arquivo_url, arquivo_nome, arquivo_tipo, descricao, ordem")
      .eq("produto_id", produtoId)
      .order("ordem", { ascending: true });
    setMidias((data ?? []) as Midia[]);
  }, [produtoId]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setOwnerId(data?.user?.id ?? null));
    void carregar();
  }, [carregar]);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file || !ownerId) return;
    setEnviando(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${ownerId}/${produtoId}/${Date.now()}.${ext}`;
      const { error: errUp } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (errUp) throw errUp;
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const sb = supabase as SupabaseBruto;
      const { error: errIns } = await sb.from("produto_midias").insert({
        produto_id: produtoId,
        arquivo_url: url,
        arquivo_nome: file.name,
        arquivo_tipo: file.type || ext,
        descricao: file.name,
        ordem: midias.length,
      });
      if (errIns) throw errIns;
      t.success("Mídia adicionada.");
      await carregar();
      void sync();
    } catch (err) {
      t.error(`Falha no upload: ${(err as Error).message}`);
    } finally {
      setEnviando(false);
    }
  }

  async function salvarDescricao(id: string, descricao: string) {
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("produto_midias").update({ descricao }).eq("id", id);
    if (error) { t.error("Falha ao salvar descrição."); return; }
    void sync();
  }

  async function excluir(m: Midia) {
    if (!confirm(`Excluir a mídia "${m.arquivo_nome}"?`)) return;
    try {
      const path = pathDaUrl(m.arquivo_url);
      if (path) await supabase.storage.from(BUCKET).remove([path]);
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("produto_midias").delete().eq("id", m.id);
      if (error) throw error;
      setMidias((xs) => xs.filter((x) => x.id !== m.id));
      t.info?.("Mídia removida.");
      void sync();
    } catch (err) {
      t.error(`Falha ao excluir: ${(err as Error).message}`);
    }
  }

  return (
    <section
      style={{
        background: "linear-gradient(180deg, oklch(0.18 0.06 280 / 0.42), oklch(0.15 0.04 264 / 0.30))",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: "16px 18px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 22px rgba(0,0,0,0.22)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden="true"
          style={{ width: 5, height: 5, borderRadius: 999, background: "oklch(0.72 0.15 195)", boxShadow: "0 0 8px oklch(0.72 0.15 195 / 0.55)" }}
        />
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--txt-3)", flex: 1 }}>
          Mídias do produto
        </h3>
        <span className="mono" style={{ fontSize: 10, color: "var(--txt-4)", fontWeight: 600 }}>{midias.length}</span>
      </header>

      <p className="tiny" style={{ margin: 0, color: "var(--txt-4)", lineHeight: 1.5 }}>
        Imagens e arquivos do produto. A descrição de cada um entra no conhecimento do agente.
      </p>

      {midias.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {midias.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, background: "oklch(0.18 0.06 280 / 0.30)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {m.arquivo_tipo.startsWith("image/") ? (
                <img src={m.arquivo_url} alt={m.arquivo_nome} style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 8, background: "oklch(0.25 0.04 264)", display: "grid", placeItems: "center", fontSize: 9, color: "var(--txt-3)", flexShrink: 0, textTransform: "uppercase" }}>
                  {(m.arquivo_nome.split(".").pop() || "arq").slice(0, 4)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <a href={m.arquivo_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--txt-2)", textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.arquivo_nome}
                </a>
                <input
                  className="input"
                  defaultValue={m.descricao}
                  onBlur={(e) => { if (e.target.value !== m.descricao) void salvarDescricao(m.id, e.target.value); }}
                  placeholder="Descrição (vai pro agente)"
                  style={{ fontSize: 12, padding: "5px 8px" }}
                />
              </div>
              <button
                type="button"
                onClick={() => void excluir(m)}
                title="Excluir mídia"
                style={{ background: "none", border: "none", color: "oklch(0.65 0.22 25)", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0, padding: 4 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={(e) => void aoEscolher(e)} style={{ display: "none" }} />
      <button
        type="button"
        className="btn btn-sm"
        disabled={enviando}
        onClick={() => inputRef.current?.click()}
        style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 600 }}
      >
        {enviando ? "Enviando…" : "+ Adicionar mídia"}
      </button>
    </section>
  );
}

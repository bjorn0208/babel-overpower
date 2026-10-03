/**
 * Camada de dados da galeria de artes da rifa (tabela `rifa_imagens`, RLS
 * por tenant). O editor de arte saiu na extinção da aba Imagens (2026-08-28)
 * — sobrou só a leitura, consumida pela galeria dentro da aba Disparo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bruto = any;

async function sbCliente(): Promise<Bruto> {
  return (
    (window as { supabaseClient?: Bruto }).supabaseClient ||
    (await import("@/integrations/supabase/client")).supabase
  );
}

async function uidAtual(sb: Bruto): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data?.session?.user?.id ?? null;
}

export interface PremioPodio {
  posicao: number;
  premio: string;
}

export interface ArteRifa {
  id: string;
  rifa_id: string;
  /**
   * divulgacao = arte do editor extinto · cartela = grade gerada pelo cron (Status)
   * · ganhadores = pódio pós-sorteio gerado pela edge anunciar-resultado-rifa (2026-09-24, item 12).
   */
  tipo: "divulgacao" | "cartela" | "ganhadores";
  url: string;
  legenda: string | null;
  nome_rifeiro: string | null;
  hora_sorteio: string | null;
  premios: PremioPodio[];
  created_at: string;
}

export async function listarGaleria(rifaId?: string): Promise<ArteRifa[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) return [];
  let q = sb
    .from("rifa_imagens")
    .select("id, rifa_id, tipo, url, legenda, nome_rifeiro, hora_sorteio, premios, created_at")
    .eq("tenant_id", uid)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);
  if (rifaId) q = q.eq("rifa_id", rifaId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ArteRifa[];
}

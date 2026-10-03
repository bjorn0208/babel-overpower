/**
 * Camada de dados — biblioteca de templates de mensagem reutilizáveis
 * (tabela `rifa_templates_mensagem`, RLS por tenant). Categorias fixas:
 * alerta / atualização / promoção. Mesmo estilo de placeholder do resto do
 * disparo de rifas ({{titulo}} {{premio}} {{vendidos}} {{restam}} {{preco}}).
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

export type CategoriaTemplate = "alerta" | "atualizacao" | "promocao";
export type TipoConteudoTemplate = "foto" | "texto" | "video" | "foto_texto";

export interface TemplateMensagem {
  id: string;
  categoria: CategoriaTemplate;
  titulo: string;
  mensagem: string;
  midia_url: string | null;
  tipo_conteudo: TipoConteudoTemplate;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

const CAMPOS = "id, categoria, titulo, mensagem, midia_url, tipo_conteudo, ativo, created_at, updated_at";

export async function listarTemplates(): Promise<TemplateMensagem[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) return [];
  const { data, error } = await sb
    .from("rifa_templates_mensagem")
    .select(CAMPOS)
    .eq("tenant_id", uid)
    .eq("ativo", true)
    .order("categoria", { ascending: true })
    .order("titulo", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TemplateMensagem[];
}

export interface CargaTemplate {
  categoria: CategoriaTemplate;
  titulo: string;
  mensagem: string;
  midiaUrl: string | null;
  tipoConteudo: TipoConteudoTemplate;
}

export async function criarTemplate(c: CargaTemplate): Promise<TemplateMensagem> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) throw new Error("Sessão expirada — recarregue a página.");
  const { data, error } = await sb
    .from("rifa_templates_mensagem")
    .insert({
      tenant_id: uid,
      categoria: c.categoria,
      titulo: c.titulo.trim(),
      mensagem: c.mensagem,
      midia_url: c.midiaUrl,
      tipo_conteudo: c.tipoConteudo,
    })
    .select(CAMPOS)
    .single();
  if (error) throw error;
  return data as TemplateMensagem;
}

export async function atualizarTemplate(id: string, c: CargaTemplate): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb
    .from("rifa_templates_mensagem")
    .update({
      categoria: c.categoria,
      titulo: c.titulo.trim(),
      mensagem: c.mensagem,
      midia_url: c.midiaUrl,
      tipo_conteudo: c.tipoConteudo,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function excluirTemplate(id: string): Promise<void> {
  const sb = await sbCliente();
  // Soft: desativa em vez de apagar — mantém histórico se algum disparo antigo referenciar.
  const { error } = await sb.from("rifa_templates_mensagem").update({ ativo: false }).eq("id", id);
  if (error) throw error;
}

/** Renderiza os placeholders conhecidos — mesma lógica usada nas edges de disparo. */
export function renderizarTemplate(mensagem: string, vars: Record<string, string>): string {
  let texto = mensagem;
  for (const [chave, valor] of Object.entries(vars)) texto = texto.replaceAll(`{{${chave}}}`, valor);
  return texto;
}

const reais = (centavos: number) =>
  (Number(centavos || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function saudacaoAgora(): string {
  const h = new Date().getHours();
  if (h < 12) return "bom dia";
  if (h < 18) return "boa tarde";
  return "boa noite";
}

/**
 * Variáveis da rifa ativa pra preencher um template ANTES de mandar pro cliente.
 *
 * Existe porque o chat de atendimento chamava `renderizarTemplate(mensagem, {})` — dicionário
 * vazio — e o cliente recebia `{{titulo}}` escrito na mensagem (achado 2026-09-08). Mesmos
 * nomes e mesma semântica de `montarMensagem` na edge `processar-disparos-rifa`.
 *
 * Falha graciosa: sem rifa ativa, devolve só `saudacao` e `nome` — o dono vê o placeholder
 * cru e corrige na mão, que é melhor do que mandar errado.
 */
export async function variaveisDaRifaAtiva(nome?: string | null): Promise<Record<string, string>> {
  const base: Record<string, string> = { saudacao: saudacaoAgora(), nome: (nome ?? "").trim() };
  try {
    const sb = await sbCliente();
    const uid = await uidAtual(sb);
    if (!uid) return base;
    const { data: rifa } = await sb
      .from("rifas")
      .select("id, titulo, premio_principal, preco_numero_centavos, total_numeros, chave_publica")
      .eq("tenant_id", uid)
      .eq("status", "ativa")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!rifa) return base;

    const { count: pagos } = await sb
      .from("numeros_rifa")
      .select("numero", { count: "exact", head: true })
      .eq("rifa_id", rifa.id)
      .eq("status", "pago");
    const { count: reservados } = await sb
      .from("numeros_rifa")
      .select("numero", { count: "exact", head: true })
      .eq("rifa_id", rifa.id)
      .eq("status", "reservado");

    const vendidos = pagos ?? 0;
    const restam = Math.max(0, Number(rifa.total_numeros ?? 0) - vendidos - (reservados ?? 0));
    const { urlRifa } = await import("@/lib/url-app");

    return {
      ...base,
      titulo: rifa.titulo ?? "",
      premio: rifa.premio_principal ?? "",
      vendidos: String(vendidos),
      restam: String(restam),
      preco: reais(rifa.preco_numero_centavos ?? 0),
      link: urlRifa(rifa.chave_publica as string),
    };
  } catch {
    return base;
  }
}

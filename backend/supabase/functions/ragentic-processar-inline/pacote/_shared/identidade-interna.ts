// _shared/identidade-interna.ts
// Fusão C1 / Fase 3c.2 — detecção CONFIÁVEL de "request interna" (dono logado
// no commandbar) pra derivar canal=interno. Sinal confiável = JWT de dono
// VALIDADO server-side (assinatura verificada via auth.getUser()), nunca
// header/param cru. D1/D3 do plano + tese de segurança (privilégio é
// estrutural, não declarado pelo cliente — dossiê arquitetura-1-motor).
//
// IMPORTANTE (achado do raio-x): o Chat-Teste é o dono logado SIMULANDO
// cliente — manda JWT válido MAS é canal EXTERNO (`modo_teste:true`). Por isso
// quem decide o canal (no motor) faz `origemInternaConfiavel = !!dono &&
// !modo_teste`. Este helper só responde "há dono logado válido?"; o
// desempate com modo_teste é responsabilidade do chamador.
//
// Z-API/webhook não mandam Authorization → `null` imediato, ZERO custo de
// rede no caminho externo (só requests com header pagam o getUser()).
// Fail-safe: qualquer ausência/erro → null (trata como externo, corta cargo
// interno). DI + import lazy de `_shared/supabase.ts` (padrão recall-memoria:
// testável no tsx sem puxar libs Deno).

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export type DonoLogado = { userId: string };

export type IdentidadeDeps = {
  // Recebe o Request, devolve um client supabase (anon+JWT do header) ou null
  // se não há Authorization. Default = _shared/supabase.ts (import lazy).
  criarClienteUsuarioDoRequest: (req: Request) => AnyClient | null;
};

/**
 * Retorna `{ userId }` se a request traz um JWT de usuário VÁLIDO
 * (assinatura verificada server-side por `auth.getUser()`); caso contrário
 * `null` (sem header, header inválido, token expirado, erro de rede — tudo
 * fail-safe pra externo).
 */
export async function detectarDonoLogado(
  req: Request,
  deps?: IdentidadeDeps,
): Promise<DonoLogado | null> {
  try {
    const criar = deps?.criarClienteUsuarioDoRequest ??
      (await import("./supabase.ts")).criarClienteUsuarioDoRequest;
    const cliente = criar(req);
    if (!cliente) return null; // sem Authorization → externo (Z-API/webhook)
    const { data, error } = await cliente.auth.getUser();
    if (error || !data?.user?.id) return null; // token inválido/expirado → externo
    return { userId: String(data.user.id) };
  } catch (e) {
    console.warn("[fase3c2 detectarDonoLogado]", (e as Error).message);
    return null; // fail-safe: erro → externo (nunca eleva pra interno por falha)
  }
}

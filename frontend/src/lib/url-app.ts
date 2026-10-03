/**
 * Base canônica do app para montar URLs públicas (contrato, rifa, consulta, sala).
 *
 * Por que existe: esses links vão pro cliente final. Montar com
 * `window.location.origin` faz o link herdar a URL que o operador estava usando
 * — se ele acessa por um preview da Vercel (`*.vercel.app`), o link sai com
 * domínio errado (e com muro de login). Aqui forçamos o domínio canônico,
 * caindo no `origin` só em dev local.
 *
 * DOIS canônicos (cravado por Theus em 2026-09-03): **contrato mora na Babel**,
 * todo o resto (rifa, consulta, sala, agendar) mora na Plataforma Limpa. Os dois
 * domínios são alias do MESMO projeto Vercel, então a escolha é de marca, não de
 * roteamento — mas ela precisa ser estável, porque o link de contrato já foi
 * entregue a centenas de clientes e é por ele que eles voltam pra assinar.
 */

const CANONICO_APP = "https://www.plataformalimpa.com.br";
const CANONICO_CONTRATO = "https://www.babel-os.com";

const ENV_APP = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/+$/, "");
const ENV_CONTRATO = (import.meta.env.VITE_CONTRATO_URL as string | undefined)?.replace(/\/+$/, "");

/**
 * Monta uma URL pública absoluta a partir de um caminho.
 *
 * A escolha do domínio é pela ROTA, não por quem chama — assim um caminho
 * relativo vindo do backend (ex.: `url_publica: "/contrato/<uuid>"` das tools do
 * Mentor) cai no domínio certo sem o call site precisar saber disso.
 */
export function urlPublica(caminho: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ehLocal = /localhost|127\.0\.0\.1/.test(origin);
  const path = caminho.startsWith("/") ? caminho : `/${caminho}`;
  const ehContrato = path.startsWith("/contrato/");
  // Cai no origin só em dev local; a env correspondente sobrescreve se definida.
  const base = (ehContrato ? ENV_CONTRATO : ENV_APP) ||
    (ehLocal ? origin : (ehContrato ? CANONICO_CONTRATO : CANONICO_APP));
  return `${base}${path}`;
}

/** URL pública de assinatura de um contrato — domínio da Babel. */
export function urlContrato(chavePublica: string): string {
  return urlPublica(`/contrato/${chavePublica}`);
}

/** URL pública de uma rifa (o `?pedido=` é concatenado por quem chama). */
export function urlRifa(chavePublica: string): string {
  return urlPublica(`/rifa/${chavePublica}`);
}

/**
 * URL pública de uma sala de reunião — só pra COMPARTILHAR com o participante.
 * Pra navegar o próprio operador use caminho relativo (`/sala/${chave}`): trocar
 * de domínio no meio da sessão derruba o login (o token do Supabase é por origin).
 */
export function urlSala(chavePublica: string): string {
  return urlPublica(`/sala/${chavePublica}`);
}

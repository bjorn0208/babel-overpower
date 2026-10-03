// Parser de credenciais do Login Commandbar (Porteiro).
//
// Puro e sem dependência — separado do Login.tsx pra ser testável em Vitest
// sem arrastar supabase/framer-motion.

const STOP_WORDS = new Set([
  "meu", "minha", "meus", "minhas",
  "é", "e", "a", "o", "as", "os",
  "apelido", "apelidos", "nick", "nickname", "usuario", "usuário", "usuarios", "usuários",
  "login", "user", "username", "nome",
  "senha", "pass", "password", "minhasenha",
  "com", "sou", "aqui", "eu",
]);

export function extrairCredenciais(
  raw: string,
): { apelido: string | null; senha: string | null } {
  if (!raw.trim()) return { apelido: null, senha: null };
  const tokens = raw
    .split(/[\s,/=:;()\[\]{}|]+/)
    .filter((t) => t.length > 0)
    .filter((t) => !STOP_WORDS.has(t.toLowerCase()));
  if (tokens.length >= 2) return { apelido: tokens[0], senha: tokens[tokens.length - 1] };
  if (tokens.length === 1) return { apelido: tokens[0], senha: null };
  return { apelido: null, senha: null };
}

// Na fase "senha" o input aceita dois formatos sem avisar qual é qual —
// se o user reenviar "apelido senha" juntos (comportamento natural após
// o Porteiro dizer "tenta de novo"), a frase inteira NÃO pode virar a
// senha. Reconhece o reenvio comparando o apelido detectado com o já
// informado; qualquer outra coisa passa crua (senha pode ter espaço).
export function resolverSenhaFaseSenha(
  texto: string,
  apelidoAtual: string,
): string {
  const { apelido, senha } = extrairCredenciais(texto);
  const reenvioCompleto =
    !!apelido &&
    !!senha &&
    apelido.toLowerCase() === apelidoAtual.toLowerCase();
  return reenvioCompleto ? senha : texto;
}

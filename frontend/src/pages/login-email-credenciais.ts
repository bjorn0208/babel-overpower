// O e-mail pode vir sozinho ou seguido da senha. A senha mantém espaços e
// pontuação: tokenizar ou usar trim() nela muda a credencial enviada ao Auth.
export function extrairLoginEmail(texto: string): {
  email: string;
  senha: string | null;
} | null {
  const match = texto.match(/^\s*([^\s@]+@[^\s@]+\.[^\s@]+)(?:[ \t]+([\s\S]*))?$/);
  if (!match) return null;
  return { email: match[1].toLowerCase(), senha: match[2] || null };
}

export function mensagemErroLogin(erro: unknown): string {
  const { code = "", message = "" } = (erro ?? {}) as {
    code?: string;
    message?: string;
  };
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "O e-mail ou a senha não conferem. Pode tentar de novo ou trocar o e-mail.";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "Falta confirmar seu e-mail. Abra o link que chegou na sua caixa de entrada e tente de novo.";
  }
  if (code === "weak_password" || /password.*(short|least|weak)/i.test(message)) {
    return "Essa senha precisa ser mais forte. Use pelo menos 6 caracteres.";
  }
  if (code === "user_already_exists" || /already registered/i.test(message)) {
    return "Você já tem uma conta. Escolha “Já tenho conta” para entrar ou recuperar a senha.";
  }
  if (/rate_limit|too_many_requests/.test(code) || /rate limit|too many requests/i.test(message)) {
    return "Foram muitas tentativas seguidas. Espere um pouco e tente novamente.";
  }
  if (code === "signup_disabled") {
    return "O cadastro está fechado no momento. Se você já tem conta, pode entrar por aqui.";
  }
  return "Não consegui conectar agora. Confira sua conexão e tente de novo.";
}

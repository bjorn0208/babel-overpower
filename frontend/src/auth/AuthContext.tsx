import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import type { EmailOtpType, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Ctx = {
  session: Session | null;
  user: User | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<{ erro?: string }>;
  entrarComTokenImpersonacao: (tokenHash: string, tipo?: string) => Promise<{ erro?: string }>;
  sair: () => Promise<void>;
  enviarRecuperacao: (email: string) => Promise<{ erro?: string }>;
};

const AuthContext = createContext<Ctx | null>(null);

const verificacoesImpersonacao = new Map<string, Promise<{ erro?: string }>>();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    let eventoRecebido = false;
    // Listener PRIMEIRO (regra Supabase) — depois leitura inicial.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!ativo) return;
      eventoRecebido = true;
      setSession(s);
      setCarregando(false);
    });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        // Uma leitura inicial tardia não pode apagar a sessão recém-autenticada.
        if (!ativo || eventoRecebido) return;
        setSession(data.session);
        setCarregando(false);
      })
      .catch(() => {
        if (!ativo || eventoRecebido) return;
        setSession(null);
        setCarregando(false);
      });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const entrar: Ctx["entrar"] = useCallback(async (email, senha) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return error ? { erro: error.message } : {};
  }, []);

  const entrarComTokenImpersonacao: Ctx["entrarComTokenImpersonacao"] = useCallback(
    async (tokenHash, tipo = "magiclink") => {
      if (!tokenHash) return { erro: "token_impersonacao_ausente" };
      const chave = `${tipo}:${tokenHash}`;
      const emAndamento = verificacoesImpersonacao.get(chave);
      if (emAndamento) return emAndamento;
      try {
        window.sessionStorage.setItem("ragentic_impersonacao_isolada", "1");
      } catch {
        /* ignore */
      }
      const promessa = supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: tipo as EmailOtpType })
        .then(({ error }) => {
          if (error) {
            // NÃO cacheia resultado de erro: antes, um erro de rede ficava preso no
            // Map por `tipo:token` e todo retry devolvia o erro velho pra sempre.
            // Remove a entrada em falha pra a próxima tentativa reexecutar o verifyOtp.
            verificacoesImpersonacao.delete(chave);
            return { erro: error.message };
          }
          return {};
        })
        .catch((e) => {
          verificacoesImpersonacao.delete(chave);
          return { erro: (e as Error)?.message ?? "erro_verificacao_impersonacao" };
        });
      verificacoesImpersonacao.set(chave, promessa);
      return promessa;
    },
    [],
  );

  const sair: Ctx["sair"] = useCallback(async () => {
    // Limpa a flag "IA já aprendeu com o WhatsApp importado" — próxima sessão
    // desse tenant roda a fase 2 de novo (ver ImportarWhatsappPessoal.tsx).
    const {
      data: { session: sessaoAtual },
    } = await supabase.auth.getSession();
    const tenantId = sessaoAtual?.user?.id;
    if (tenantId) localStorage.removeItem(`whatsapp-aprendeu:${tenantId}`);
    await supabase.auth.signOut();
  }, []);

  const enviarRecuperacao: Ctx["enviarRecuperacao"] = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return error ? { erro: error.message } : {};
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        carregando,
        entrar,
        entrarComTokenImpersonacao,
        sair,
        enviarRecuperacao,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}

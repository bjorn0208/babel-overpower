import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function Impersonar() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { entrarComTokenImpersonacao } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const verificacaoIniciadaRef = useRef(false);

  useEffect(() => {
    if (verificacaoIniciadaRef.current) return;
    verificacaoIniciadaRef.current = true;
    let vivo = true;
    (async () => {
      const tokenHash = params.get("token_hash") || "";
      const tipo = params.get("type") || "magiclink";

      const sessaoInicial = await supabase.auth.getSession();
      if (!vivo) return;
      const tinhaSessaoAntes = !!sessaoInicial.data.session;

      // Sem token pra consumir: mantém o atalho — se já logado, vai pro Desktop.
      if (!tokenHash) {
        if (tinhaSessaoAntes) { nav("/?impersonacao=1", { replace: true }); return; }
        setErro("token_impersonacao_ausente");
        return;
      }

      // Consome o token SEMPRE, mesmo com sessão existente. Antes, qualquer sessão
      // ativa pulava o consumo e o admin logado que abrisse o link continuava ele
      // mesmo (impersonação nunca acontecia). verifyOtp troca a sessão atual pela
      // do alvo.
      const r = await Promise.race([
        entrarComTokenImpersonacao(tokenHash, tipo),
        new Promise<{ erro?: string }>((resolve) => setTimeout(() => resolve({ erro: "tempo_esgotado_impersonacao" }), 8000)),
      ]);
      if (!vivo) return;
      if (r.erro) {
        // "Erro, mas apareceu sessão nova" só conta como sucesso concorrente
        // (StrictMode/outra montagem) quando NÃO havia sessão antes — senão a
        // sessão do admin mascararia a falha real do token.
        if (!tinhaSessaoAntes) {
          const { data } = await supabase.auth.getSession();
          if (!vivo) return;
          if (data.session) { nav("/?impersonacao=1", { replace: true }); return; }
        }
        setErro(r.erro);
        return;
      }
      nav("/?impersonacao=1", { replace: true });
    })();
    return () => { vivo = false; };
  }, [entrarComTokenImpersonacao, nav, params]);

  // Sem spinner: a verificação acontece em background. Em sucesso, `nav()` vai pro
  // Desktop instantâneo. Só renderiza algo se DER ERRO (caso contrário, tela vazia
  // por milissegundos até navegar).
  if (!erro) return null;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--background)", color: "var(--foreground)", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "min(420px, calc(100vw - 32px))", padding: 24, border: "1px solid var(--border)", borderRadius: 16, background: "var(--card)" }}>
        <strong>Falha ao impersonar</strong>
        <p style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{erro}</p>
      </div>
    </main>
  );
}
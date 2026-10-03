import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Página /reset-password — Supabase abre esta rota com type=recovery no hash.
 * Usuário define a nova senha e é redirecionado para o desktop.
 */
export default function ResetPassword() {
  const nav = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === "PASSWORD_RECOVERY" || evt === "SIGNED_IN") setPronto(true);
    });
    // hash já processado pelo supabase-js → checa sessão
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) return setErro("Senha precisa de no mínimo 6 caracteres.");
    if (senha !== confirma) return setErro("As senhas não conferem.");
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return setErro(error.message);
    nav("/", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form onSubmit={salvar} className="col gap-3" style={{ width: 360 }}>
        <div className="h1">Redefinir senha</div>
        {!pronto && <div className="muted small">Validando link de recuperação…</div>}
        <label className="label">Nova senha</label>
        <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} disabled={!pronto} />
        <label className="label">Confirmar senha</label>
        <input className="input" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} disabled={!pronto} />
        {erro && <div className="small" style={{ color: "tomato" }}>{erro}</div>}
        <button className="btn btn-primary btn-lg" type="submit" disabled={!pronto || salvando}>
          {salvando ? "Salvando…" : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}
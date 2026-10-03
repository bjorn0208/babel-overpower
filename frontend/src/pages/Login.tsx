import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { extrairLoginEmail, mensagemErroLogin } from "./login-email-credenciais";
import "./login-conversacional.css";

type Fase =
  | "email"
  | "senha"
  | "nome"
  | "cad-email"
  | "cad-senha"
  | "recuperar"
  | "verificando"
  | "confirmacao"
  | "sucesso";
type Bolha = { quem: "ela" | "voce"; texto: string };

export default function Login() {
  const nav = useNavigate();
  const { session, carregando, enviarRecuperacao } = useAuth();
  const [calmo] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [pronta, setPronta] = useState(calmo);
  const [abertura, setAbertura] = useState(!calmo);
  const [saindo, setSaindo] = useState(false);
  const [fase, setFase] = useState<Fase>("email");
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [historico, setHistorico] = useState<Bolha[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fioRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const tentativaRef = useRef(false);
  const emAndamentoRef = useRef(false);
  const interagiuRef = useRef(false);
  const vivoRef = useRef(true);
  const timersRef = useRef<number[]>([]);

  const add = (quem: Bolha["quem"], mensagem: string) => {
    setHistorico((h) => [...h, { quem, texto: mensagem }].slice(-30));
  };
  const pedir = (proxima: Fase) => {
    setTexto("");
    setVerSenha(false);
    setFase(proxima);
  };

  useEffect(() => {
    document.title = "entrar · babel-os";
    vivoRef.current = true;
    const timersSaida = timersRef.current;
    const hora = new Date().getHours();
    const saudacao =
      hora < 5 ? "Boa madrugada" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    const timers = [
      window.setTimeout(() => setPronta(true), calmo ? 0 : 1500),
      window.setTimeout(() => setAbertura(false), calmo ? 0 : 2250),
      window.setTimeout(
        () => {
          if (!interagiuRef.current)
            setHistorico([{ quem: "ela", texto: `${saudacao}! Eu sou a Babel.` }]);
        },
        calmo ? 0 : 2300,
      ),
      window.setTimeout(
        () => {
          if (!interagiuRef.current)
            setHistorico((h) => [
              ...h,
              {
                quem: "ela",
                texto:
                  "Me diz o seu e-mail — pode mandar a senha junto que eu já abro o sistema para você.",
              },
            ]);
        },
        calmo ? 0 : 3400,
      ),
    ];
    return () => {
      vivoRef.current = false;
      [...timers, ...timersSaida].forEach(window.clearTimeout);
    };
  }, [calmo]);

  // SIGNED_IN é emitido antes da Promise de login terminar. A ref distingue
  // uma sessão anterior de uma tentativa desta tela, preservando a saudação.
  useEffect(() => {
    if (!carregando && session && !tentativaRef.current) nav("/", { replace: true });
  }, [carregando, session, nav]);

  useEffect(() => {
    if (pronta && fase !== "verificando" && fase !== "sucesso" && fase !== "confirmacao")
      inputRef.current?.focus({ preventScroll: true });
  }, [pronta, fase]);

  useEffect(() => {
    if (fioRef.current) fioRef.current.scrollTop = fioRef.current.scrollHeight;
  }, [historico, fase]);

  function concluirEntrada() {
    add("ela", "Pronto, você está dentro! Estou abrindo seu sistema.");
    pedir("sucesso");
    timersRef.current.push(window.setTimeout(() => setSaindo(true), calmo ? 0 : 1200));
    timersRef.current.push(
      window.setTimeout(() => nav("/", { replace: true }), calmo ? 150 : 2200),
    );
  }

  async function autenticar(emailUsar: string, senha: string, cadastro = false) {
    if (emAndamentoRef.current) return;
    emAndamentoRef.current = true;
    tentativaRef.current = true;
    pedir("verificando");
    try {
      const { data, error } = cadastro
        ? await supabase.auth.signUp({
            email: emailUsar,
            password: senha,
            options: {
              data: { nome, display_name: nome },
              emailRedirectTo: `${window.location.origin}/login`,
            },
          })
        : await supabase.auth.signInWithPassword({ email: emailUsar, password: senha });
      if (!vivoRef.current) return;
      if (error) throw error;
      if (data.session) {
        concluirEntrada();
      } else if (cadastro) {
        add("ela", "Confira seu e-mail para confirmar a conta. Depois volte aqui para entrar.");
        pedir("confirmacao");
      } else {
        throw new Error("Sessão de autenticação ausente");
      }
    } catch (erro) {
      if (!vivoRef.current) return;
      add("ela", mensagemErroLogin(erro));
      pedir(cadastro ? "cad-senha" : "senha");
    } finally {
      emAndamentoRef.current = false;
    }
  }

  async function submeter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!texto || emAndamentoRef.current || fase === "sucesso" || fase === "confirmacao") return;
    interagiuRef.current = true;
    if (fase === "nome") {
      if (!texto.trim()) return;
      setNome(texto.trim());
      add("voce", texto.trim());
      add("ela", "Que bom ter você aqui! Agora me diz seu e-mail.");
      pedir("cad-email");
      return;
    }
    if (fase === "email" || fase === "cad-email" || fase === "recuperar") {
      const credenciais = extrairLoginEmail(texto);
      if (!credenciais) {
        add("ela", "Esse e-mail parece incompleto. Pode conferir para mim?");
        setTexto("");
        return;
      }
      setEmail(credenciais.email);
      if (fase === "recuperar") {
        add("voce", credenciais.email);
        emAndamentoRef.current = true;
        pedir("verificando");
        try {
          const { erro } = await enviarRecuperacao(credenciais.email);
          if (!vivoRef.current) return;
          if (erro) throw new Error(erro);
          add(
            "ela",
            "Se esse e-mail tiver uma conta, você receberá um link para criar uma nova senha. Confira também o spam.",
          );
          pedir("confirmacao");
        } catch (erro) {
          if (!vivoRef.current) return;
          add("ela", mensagemErroLogin(erro));
          pedir("recuperar");
        } finally {
          emAndamentoRef.current = false;
        }
        return;
      }
      add("voce", credenciais.senha ? `${credenciais.email}  ••••••` : credenciais.email);
      if (credenciais.senha) {
        await autenticar(credenciais.email, credenciais.senha, fase === "cad-email");
      } else {
        add(
          "ela",
          fase === "cad-email"
            ? "Agora crie uma senha com pelo menos 6 caracteres."
            : "Agora sua senha — ela fica protegida e não aparece na conversa.",
        );
        pedir(fase === "cad-email" ? "cad-senha" : "senha");
      }
      return;
    }
    if (fase === "senha" || fase === "cad-senha") {
      const completo = extrairLoginEmail(texto);
      const emailUsar = completo?.senha ? completo.email : email;
      const senha = completo?.senha ?? texto;
      if (fase === "cad-senha" && senha.length < 6) {
        add("ela", "Essa senha ficou curta. Crie uma com pelo menos 6 caracteres.");
        setTexto("");
        return;
      }
      setEmail(emailUsar);
      add("voce", "••••••");
      await autenticar(emailUsar, senha, fase === "cad-senha");
    }
  }

  function voltar() {
    interagiuRef.current = true;
    tentativaRef.current = false;
    setEmail("");
    add("ela", "Me diz o e-mail da sua conta — pode mandar a senha junto.");
    pedir("email");
  }
  function primeiraVez() {
    interagiuRef.current = true;
    setNome("");
    setEmail("");
    add("voce", "É minha primeira vez aqui");
    add("ela", "Vou criar sua conta aqui mesmo. Como posso te chamar?");
    pedir("nome");
  }
  function recuperar() {
    interagiuRef.current = true;
    add("voce", "Esqueci minha senha");
    add("ela", "Me diz o seu e-mail que eu te mando um link para criar uma nova senha.");
    pedir("recuperar");
  }

  const ocupado = fase === "verificando" || fase === "sucesso" || !pronta || carregando;
  const cadastro = fase === "nome" || fase === "cad-email" || fase === "cad-senha";
  const entradaEmail = fase === "email" || fase === "cad-email" || fase === "recuperar";
  const segredo =
    fase === "senha" || fase === "cad-senha" || (entradaEmail && !!extrairLoginEmail(texto)?.senha);
  const placeholder =
    fase === "senha"
      ? "Digite sua senha…"
      : fase === "cad-senha"
        ? "Crie uma senha (6 ou mais caracteres)…"
        : fase === "nome"
          ? "Como posso te chamar?…"
          : fase === "cad-email" || fase === "recuperar"
            ? "Digite seu e-mail…"
            : fase === "confirmacao"
              ? "Confira sua caixa de entrada…"
              : fase === "sucesso"
                ? "Abrindo seu sistema…"
                : "Digite seu e-mail ou e-mail + senha…";

  return (
    <div
      ref={viewportRef}
      className={`login-viewport${pronta ? " pronta" : " encena"}`}
      onPointerMove={
        calmo
          ? undefined
          : (event) => {
              viewportRef.current?.style.setProperty(
                "--px",
                `${((event.clientX / window.innerWidth) * 2 - 1) * -18}px`,
              );
              viewportRef.current?.style.setProperty(
                "--py",
                `${((event.clientY / window.innerHeight) * 2 - 1) * -12}px`,
              );
            }
      }
    >
      <div className="login-fundo" aria-hidden="true" />
      <div className="login-veu" aria-hidden="true" />
      <div className="login-aurora" aria-hidden="true" />
      {abertura && (
        <div className={`login-abertura${pronta ? " some" : ""}`} aria-hidden="true">
          <div className="login-poeira">
            {Array.from({ length: 22 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${(i * 43) % 100}%`,
                  width: 3 + (i % 5),
                  height: 3 + (i % 5),
                  animationDelay: `${(i % 7) * 0.15}s`,
                  animationDuration: `${1.4 + (i % 6) * 0.2}s`,
                }}
              />
            ))}
          </div>
          <div className="login-semente">
            <span className="anel" />
            <span className="anel a2" />
            <span className="nucleo" />
          </div>
          <p className="login-abertura-fala">acordando a babel…</p>
        </div>
      )}
      <main className={`login-main${saindo ? " saindo" : ""}`}>
        <header className="login-marca">
          <img src="/logo.png" alt="" width="169" height="400" />
          <h1 aria-label="babel-os">
            {Array.from("babel-os", (letra, i) => (
              <span
                aria-hidden="true"
                key={i}
                style={{ animationDelay: `${0.15 + i * 0.045}s, 0s` }}
              >
                {letra}
              </span>
            ))}
          </h1>
          <p>o sistema operacional do seu atendimento</p>
        </header>
        <section
          className={`login-conversa${fase === "verificando" ? " pensando" : ""}`}
          aria-label="Entrar na babel-os conversando com a Babel"
        >
          <div className="login-topo">
            <div className="login-avatar" aria-hidden="true" />
            <div className="login-quem">
              <strong>Babel</strong>
              <span>
                {fase === "verificando"
                  ? "conferindo…"
                  : fase === "sucesso"
                    ? "abrindo seu sistema…"
                    : "online agora"}
              </span>
            </div>
            <span className="login-selo">acesso seguro</span>
          </div>
          <div
            ref={fioRef}
            className="login-fio"
            role="log"
            aria-live="polite"
            aria-label="Conversa com a Babel"
          >
            {historico.map((bolha, i) => (
              <div key={i} className={`login-msg ${bolha.quem}`}>
                {bolha.texto}
              </div>
            ))}
            {fase === "verificando" && (
              <div className="login-msg ela login-digitando" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            )}
          </div>
          <div className="login-atalhos">
            {(fase === "email" || fase === "senha") && (
              <>
                <button
                  type="button"
                  className="login-atalho"
                  disabled={ocupado}
                  onClick={recuperar}
                >
                  Esqueci minha senha
                </button>
                <button
                  type="button"
                  className="login-atalho"
                  disabled={ocupado}
                  onClick={fase === "senha" ? voltar : primeiraVez}
                >
                  {fase === "senha" ? "Trocar e-mail" : "Primeira vez aqui"}
                </button>
              </>
            )}
            {(cadastro || fase === "recuperar" || fase === "confirmacao") && (
              <button type="button" className="login-atalho" disabled={ocupado} onClick={voltar}>
                Já tenho conta
              </button>
            )}
          </div>
          <form className="login-caixa" onSubmit={submeter} noValidate>
            <label className="login-so-leitor" htmlFor="login-entrada">
              {segredo ? "Sua senha" : fase === "nome" ? "Seu nome" : "Seu e-mail"}
            </label>
            <input
              id="login-entrada"
              ref={inputRef}
              name={segredo ? "password" : fase === "nome" ? "name" : "username"}
              type={segredo && !verSenha ? "password" : "text"}
              inputMode={entradaEmail && !segredo ? "email" : "text"}
              autoComplete={
                segredo
                  ? fase === "cad-senha" || fase === "cad-email"
                    ? "new-password"
                    : "current-password"
                  : fase === "nome"
                    ? "name"
                    : "username"
              }
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              placeholder={placeholder}
              disabled={ocupado || fase === "confirmacao"}
            />
            {segredo && (
              <button
                type="button"
                className="login-olho"
                aria-label={verSenha ? "Esconder a senha" : "Mostrar a senha"}
                aria-pressed={verSenha}
                disabled={ocupado}
                onClick={() => {
                  setVerSenha((v) => !v);
                  inputRef.current?.focus();
                }}
              >
                {verSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            )}
            <button
              type="submit"
              className="login-enviar"
              aria-label="Enviar"
              disabled={ocupado || !texto || fase === "confirmacao"}
            >
              {fase === "verificando" ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <ArrowRight size={20} />
              )}
            </button>
          </form>
        </section>
        <p className="login-rodape">
          {cadastro ? "já tem conta? " : "primeira vez aqui? "}
          <button
            type="button"
            disabled={ocupado || fase === "confirmacao"}
            onClick={cadastro ? voltar : primeiraVez}
          >
            {cadastro ? "entre por aqui" : "crie sua conta aqui mesmo"}
          </button>
        </p>
      </main>
    </div>
  );
}

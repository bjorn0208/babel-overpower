/**
 * Página pública de auto-cadastro por indicação.
 * URL: /cadastro?ref=CODE
 *
 * Fluxo client-side (sem edge nova):
 *  1. Carrega config_plataforma + loja_implantacao + resolve ref → referrerId
 *  2. Form: nome, cpf, whatsapp, email, senha, comprovante (obrigatório), termos
 *  3. signUp → signInWithPassword → update profile own → upload comprovante
 *     → insert pedidos_compra → signOut → tela de sucesso
 *
 * Standalone: estilos inline, não depende do OS bundle.css nem de providers.
 */

import { useState, useEffect } from "react";
import { validarArquivoPublico } from "./upload-publico";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CadastroForm } from "./cadastro/CadastroForm";
import { CadastroSucesso } from "./cadastro/CadastroSucesso";
import { TermosModal } from "./cadastro/TermosModal";
import type { CamposForm, ImplantacaoItem } from "./cadastro/tipos";

const COR = "#6366f1";

const CAMPOS_VAZIOS: CamposForm = {
  nome: "",
  cpf: "",
  whatsapp: "",
  email: "",
  senha: "",
};

export default function Cadastro() {
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") ?? "";

  // Dados carregados
  const [pixKey, setPixKey] = useState("");
  const [termosUso, setTermosUso] = useState("");
  const [implantacao, setImplantacao] = useState<ImplantacaoItem | null>(null);
  const [referrerId, setReferrerId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Estado do form
  const [campos, setCamposState] = useState<CamposForm>(CAMPOS_VAZIOS);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [showTermos, setShowTermos] = useState(false);

  // Estado do submit
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  function setCampos(parcial: Partial<CamposForm>) {
    setCamposState((prev) => ({ ...prev, ...parcial }));
  }

  // Carrega dados iniciais
  useEffect(() => {
    async function carregar() {
      const [{ data: cfg }, { data: impl }] = await Promise.all([
        // Δ 2026-09-17: lê a VIEW pública (só as colunas de exibição). A tabela
        // inteira era legível por visitante anônimo, expondo CNPJ, regras de
        // saque, cotação e retenção junto.
        supabase
          .from("config_plataforma_publico")
          .select("pix_key, termos_uso, termos_uso_ativo")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("loja_implantacao")
          .select("id, nome, preco")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
      ]);

      if (cfg?.pix_key) setPixKey(cfg.pix_key);
      if (cfg?.termos_uso_ativo && cfg?.termos_uso) setTermosUso(cfg.termos_uso);
      if (impl) setImplantacao(impl as ImplantacaoItem);

      if (refCode) {
        const { data: uid } = await supabase.rpc("resolver_codigo_indicacao", {
          p_code: refCode,
        });
        if (uid) setReferrerId(uid as string);
      }

      setCarregando(false);
    }
    void carregar();
  }, [refCode]);

  // Revoga o objectURL do preview quando ele muda ou no unmount — senão o blob
  // fica retido em memória a cada troca de comprovante.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  function handleClearFile() {
    setFile(null);
    setPreviewUrl(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (!file) {
      setErro("Anexe o comprovante de pagamento.");
      return;
    }
    if (campos.senha.length < 6) {
      setErro("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (termosUso && !aceitouTermos) {
      setErro("Você precisa aceitar os Termos de Uso.");
      return;
    }

    setSubmitting(true);

    // a) Criar conta
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: campos.email,
      password: campos.senha,
    });

    if (signUpError) {
      const msg = traduzirErroAuth(signUpError.message);
      setErro(msg);
      setSubmitting(false);
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      setErro("Não foi possível criar a conta. Tente novamente.");
      setSubmitting(false);
      return;
    }

    // b) Fazer login para ter sessão authenticated (necessário para RLS own)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: campos.email,
      password: campos.senha,
    });

    if (signInError) {
      // Conta criada mas login falhou — mostra sucesso mesmo assim
      setSubmitting(false);
      setSucesso(true);
      return;
    }

    // c-d) Atualiza o profile own. O trigger handle_new_user pode demorar a
    // criar a linha — a espera fixa de 1s às vezes atingia 0 linhas e o update
    // sumia em silêncio. Em vez disso, tenta o update com `.select()` (pra saber
    // quantas linhas afetou) e, se vier vazio, espera com backoff e repete até o
    // profile existir, com teto de tentativas.
    const dadosProfile = {
      full_name: campos.nome,
      phone: campos.whatsapp,
      document: campos.cpf,
      is_active: false,
      account_status: "pendente",
      ...(referrerId ? { referred_by: referrerId } : {}),
      ...(termosUso
        ? { termos_aceitos: true, termos_aceitos_em: new Date().toISOString() }
        : {}),
    };
    let profileAtualizado = false;
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const { data: linhas, error: erroUpd } = await supabase
        .from("profiles")
        .update(dadosProfile)
        .eq("id", userId)
        .select("id");
      if (!erroUpd && linhas && linhas.length > 0) {
        profileAtualizado = true;
        break;
      }
      // Backoff crescente (0,5s, 1s, 1,5s…) aguardando o trigger criar a linha.
      await new Promise((r) => setTimeout(r, 500 * (tentativa + 1)));
    }
    if (!profileAtualizado) {
      setErro(
        "Conta criada, mas não foi possível finalizar o cadastro agora. Aguarde alguns instantes e tente entrar — ou fale com o suporte.",
      );
      setSubmitting(false);
      return;
    }

    // e) Upload do comprovante — falha aqui NÃO pode virar tela de sucesso.
    let ext: string;
    try {
      ext = validarArquivoPublico(file);
    } catch (e) {
      setErro((e as Error).message);
      setSubmitting(false);
      return;
    }
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error: erroUpload } = await supabase.storage
      .from("comprovantes")
      .upload(path, file);
    if (erroUpload) {
      setErro("Falha ao enviar o comprovante. Verifique o arquivo e tente novamente.");
      setSubmitting(false);
      return;
    }

    // f) Insere o pedido de implantação — falha aqui também bloqueia o sucesso.
    if (implantacao) {
      const { error: erroPedido } = await supabase.from("pedidos_compra").insert({
        user_id: userId,
        tipo: "implantacao",
        item_id: implantacao.id,
        item_nome: implantacao.nome,
        item_preco: implantacao.preco,
        comprovante_url: path,
        status: "pendente",
      });
      if (erroPedido) {
        setErro("Falha ao registrar o pedido. Tente novamente ou contate o suporte.");
        setSubmitting(false);
        return;
      }
    }

    // g) Encerra sessão (não deixa logado como tenant pendente)
    await supabase.auth.signOut();

    setSubmitting(false);
    setSucesso(true);
  }

  // Tela de carregamento
  if (carregando) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#fafafa",
        }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: COR }} />
      </div>
    );
  }

  // Tela de sucesso
  if (sucesso) {
    return <CadastroSucesso />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        fontFamily: "'Inter', system-ui, sans-serif",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <FundoEditorial />

      {/* Cabeçalho */}
      <header
        style={{
          position: "relative",
          zIndex: 1,
          padding: "28px 24px 0",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${COR}, #0ea5e9)`,
            marginBottom: 14,
            boxShadow: `0 8px 24px ${COR}35`,
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>P</span>
        </div>
        <h1
          style={{
            margin: "0 0 4px",
            fontSize: 22,
            fontWeight: 700,
            color: "#18181b",
          }}
        >
          Criar conta
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "#71717a" }}>
          {refCode ? "Você foi indicado — preencha os dados abaixo" : "Preencha os dados para se cadastrar"}
        </p>
      </header>

      {/* Cartão central */}
      <main
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 480,
          margin: "24px auto 60px",
          padding: "0 20px",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 22,
            border: "1px solid #e4e4e7",
            boxShadow: "0 12px 40px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)",
            padding: "28px 24px",
          }}
        >
          <CadastroForm
            campos={campos}
            setCampos={setCampos}
            implantacao={implantacao}
            pixKey={pixKey}
            termosUso={termosUso}
            aceitouTermos={aceitouTermos}
            onAceitouTermos={setAceitouTermos}
            onShowTermos={() => setShowTermos(true)}
            file={file}
            previewUrl={previewUrl}
            onFileChange={handleFileChange}
            onClearFile={handleClearFile}
            submitting={submitting}
            erro={erro}
            onSubmit={handleSubmit}
          />
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#a1a1aa",
            marginTop: 20,
          }}
        >
          Seus dados estão protegidos e serão usados apenas para ativação da conta.
        </p>
      </main>

      {/* Modal de termos */}
      {showTermos && termosUso && (
        <TermosModal
          texto={termosUso}
          onClose={() => setShowTermos(false)}
          onAceitar={() => {
            setAceitouTermos(true);
            setShowTermos(false);
          }}
        />
      )}
    </div>
  );
}

function traduzirErroAuth(msg: string): string {
  if (msg.includes("already registered") || msg.includes("User already registered"))
    return "Este email já está cadastrado. Use outro email ou entre em contato com o suporte.";
  if (msg.includes("Invalid email")) return "Email inválido. Verifique e tente novamente.";
  if (msg.includes("Password should be")) return "A senha deve ter no mínimo 6 caracteres.";
  return "Erro ao criar conta. Tente novamente.";
}

function FundoEditorial() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -200,
          right: -100,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COR}18, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -300,
          left: -150,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, #0ea5e910, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
    </div>
  );
}

/**
 * Aba Agente — config do tenant pro app Consulta.
 * Liga a venda pelo agente + branding + validação + CONHECIMENTO de venda (RAG).
 * Config em consultas_config_tenant; RAG em blocos_conhecimento (category='consulta').
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Trash2, Plus } from "lucide-react";
import { fadeSlideIn, tapPress } from "@/os/motion/presets";
import { supabase } from "@/integrations/supabase/client";
import { Campo, inputStyle } from "./re-exports";
import type { ToastApi, SupabaseBruto, TipoConsulta } from "./tipos";

type ModoValidacao = "auto" | "fila" | "manual";

interface CampoFormulario {
  slug: string;
  rotulo: string;
  tipo: "text" | "tel" | "email" | "numero";
  obrigatorio: boolean;
  ativo: boolean;
}

interface ConfigTenant {
  agente_pode_vender: boolean;
  produto_oferta_id: string | null;
  tipo_padrao_id: string | null;
  preco_venda_padrao: number | null;
  preco_venda_cpf: number | null;
  preco_venda_cnpj: number | null;
  chave_pix: string | null;
  selfie_ativo: boolean;
  doc_foto_ativo: boolean;
  aviso_final: string | null;
  campos_formulario: CampoFormulario[];
  validacao_comprovante: {
    modo?: ModoValidacao;
    limite_confianca?: number;
    criterios?: { nome?: boolean; data?: boolean; valor?: boolean; cnpj?: boolean };
    nome_esperado?: string;
    cnpj_esperado?: string;
    data_modo?: "dia" | "anterior_ok";
  };
}

interface BlocoRag {
  id: string;
  title: string;
  content: string;
  ativo: boolean;
}

const CONFIG_VAZIA: ConfigTenant = {
  agente_pode_vender: false,
  produto_oferta_id: null,
  tipo_padrao_id: null,
  preco_venda_padrao: null,
  preco_venda_cpf: null,
  preco_venda_cnpj: null,
  chave_pix: null,
  selfie_ativo: false,
  doc_foto_ativo: false,
  aviso_final: null,
  campos_formulario: [
    { slug: "nome_completo", rotulo: "Nome completo", tipo: "text", obrigatorio: true, ativo: true },
    { slug: "telefone", rotulo: "Telefone (com DDD)", tipo: "tel", obrigatorio: true, ativo: true },
  ],
  validacao_comprovante: { modo: "manual", limite_confianca: 70, criterios: {} },
};

const TAG_PRECO = "preco_consulta"; // marca o bloco de preço gerado automaticamente

function Toggle({ ativo, onClick, label, disabled = false }: { ativo: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", width: "100%",
        background: "oklch(0.18 0.06 280 / 0.3)", border: "1px solid oklch(0.98 0 0 / 0.08)",
        borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", textAlign: "left",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        width: 38, height: 22, borderRadius: 999, position: "relative", flexShrink: 0,
        background: ativo ? "oklch(0.72 0.18 145)" : "oklch(0.98 0 0 / 0.15)", transition: "background .2s",
      }}>
        <span style={{
          position: "absolute", top: 2, left: ativo ? 18 : 2, width: 18, height: 18, borderRadius: "50%",
          background: "oklch(0.98 0 0)", transition: "left .2s",
        }} />
      </span>
      <span style={{ fontSize: 13, color: "oklch(0.98 0 0)" }}>{label}</span>
    </button>
  );
}

const selectStyle = { ...inputStyle, appearance: "auto" as const };

export function AbaAgente({ tipos, t }: { tipos: TipoConsulta[]; t: ToastApi }) {
  const [cfg, setCfg] = useState<ConfigTenant>(CONFIG_VAZIA);
  const [produtos, setProdutos] = useState<Array<{ id: string; nome: string }>>([]);
  const [agenteId, setAgenteId] = useState<string | null>(null);
  const [blocos, setBlocos] = useState<BlocoRag[]>([]);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoConteudo, setNovoConteudo] = useState("");
  const [salvandoBloco, setSalvandoBloco] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [saldo, setSaldo] = useState<number | null>(null);

  // Catraca de instalação: o toggle de venda só liga se o app Consulta estiver instalado da Loja.
  // Lê os slugs instalados injetados pelo bundle em window.RAGENTIC_DATA (mesmo padrão do Dock/Loja).
  const slugsInstalados = (typeof window !== "undefined"
    ? (window as unknown as { RAGENTIC_DATA?: { APLICATIVOS_INSTALADOS_SLUGS?: string[] } }).RAGENTIC_DATA?.APLICATIVOS_INSTALADOS_SLUGS
    : undefined) || [];
  const appConsultaInstalado = Array.isArray(slugsInstalados) && slugsInstalados.includes("consulta");

  const carregarBlocos = useCallback(async (aid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("blocos_conhecimento")
      .select("id, title, content, ativo")
      .eq("agente_id", aid)
      .eq("category", "consulta")
      .eq("escopo", "tenant")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    setBlocos((data ?? []) as BlocoRag[]);
  }, []);

  useEffect(() => {
    (async () => {
      const sb = supabase as SupabaseBruto;
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { setCarregando(false); return; }
      const [c, p, ag, sld] = await Promise.all([
        sb.from("consultas_config_tenant").select("*").eq("tenant_id", uid).maybeSingle(),
        sb.from("produtos").select("id, nome").eq("user_id", uid).eq("ativo", true),
        sb.from("agentes_usuario").select("id").eq("user_id", uid).order("created_at", { ascending: true }).limit(1).maybeSingle(),
        sb.from("consultas_saldo").select("saldo").eq("tenant_id", uid).maybeSingle(),
      ]);
      if (c.data) {
        setCfg({
          ...CONFIG_VAZIA,
          ...c.data,
          validacao_comprovante: { ...CONFIG_VAZIA.validacao_comprovante, ...(c.data.validacao_comprovante ?? {}) },
          campos_formulario: Array.isArray(c.data.campos_formulario) && c.data.campos_formulario.length
            ? c.data.campos_formulario
            : CONFIG_VAZIA.campos_formulario,
        });
      }
      setProdutos((p.data ?? []) as Array<{ id: string; nome: string }>);
      setSaldo(sld.data?.saldo != null ? Number(sld.data.saldo) : 0);
      const aid = (ag.data?.id ?? null) as string | null;
      setAgenteId(aid);
      if (aid) await carregarBlocos(aid);
      setCarregando(false);
    })();
  }, [carregarBlocos]);

  function setV(patch: Partial<ConfigTenant>) { setCfg((prev) => ({ ...prev, ...patch })); }
  function setVal(patch: Partial<ConfigTenant["validacao_comprovante"]>) {
    setCfg((prev) => ({ ...prev, validacao_comprovante: { ...prev.validacao_comprovante, ...patch } }));
  }
  function setCriterio(k: "nome" | "data" | "valor" | "cnpj", v: boolean) {
    setVal({ criterios: { ...cfg.validacao_comprovante.criterios, [k]: v } });
  }
  function setCampoForm(i: number, patch: Partial<CampoFormulario>) {
    setCfg((prev) => ({ ...prev, campos_formulario: prev.campos_formulario.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  }
  function addCampoForm() {
    setCfg((prev) => ({
      ...prev,
      campos_formulario: [...prev.campos_formulario, { slug: `campo_${prev.campos_formulario.length + 1}`, rotulo: "Novo campo", tipo: "text", obrigatorio: false, ativo: true }],
    }));
  }
  function removerCampoForm(i: number) {
    setCfg((prev) => ({ ...prev, campos_formulario: prev.campos_formulario.filter((_, idx) => idx !== i) }));
  }

  async function adicionarBloco() {
    if (!agenteId) { t.error("Nenhum agente encontrado nesta conta."); return; }
    if (!novoTitulo.trim() || !novoConteudo.trim()) { t.error("Preencha título e conteúdo."); return; }
    setSalvandoBloco(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("blocos_conhecimento").insert({
        agente_id: agenteId,
        title: novoTitulo.trim(),
        content: novoConteudo.trim(),
        category: "consulta",
        escopo: "tenant",
        tipo: "resposta",
        embedding_status: "pendente",
        ativo: true,
      });
      if (error) throw error;
      t.success("Conhecimento adicionado.");
      setNovoTitulo(""); setNovoConteudo("");
      await carregarBlocos(agenteId);
    } catch {
      t.error("Falha ao adicionar conhecimento.");
    } finally {
      setSalvandoBloco(false);
    }
  }

  /**
   * Marca/desmarca o bloco. Nada é apagado: desmarcado, o agente simplesmente não considera.
   * `ativo` é o que vale — as RPCs `busca_hibrida_*` filtram por ele, nunca por `deleted_at`.
   */
  async function alternarConsiderar(id: string, considerar: boolean) {
    if (!agenteId) return;
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("blocos_conhecimento").update({ ativo: considerar }).eq("id", id);
      if (error) throw error;
      await carregarBlocos(agenteId);
    } catch {
      t.error("Falha ao alterar.");
    }
  }

  // Mantém um bloco de RAG com o preço, pra o agente saber responder "quanto custa".
  // Preço por tipo de documento: CPF e CNPJ podem ter valores diferentes.
  async function sincronizarBlocoPreco(sb: SupabaseBruto, aid: string, precoCpf: number | null, precoCnpj: number | null) {
    if (!aid) return;
    const { data: existente } = await sb
      .from("blocos_conhecimento")
      .select("id")
      .eq("agente_id", aid)
      .eq("tag", TAG_PRECO)
      .is("deleted_at", null)
      .maybeSingle();
    if (precoCpf == null && precoCnpj == null) {
      // `ativo: false` obrigatório junto — ver comentário em excluirBloco acima.
      if (existente?.id) await sb.from("blocos_conhecimento").update({ deleted_at: new Date().toISOString(), ativo: false }).eq("id", existente.id);
      return;
    }
    const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const linhas: string[] = [];
    if (precoCpf != null) linhas.push(`consulta de CPF (pessoa física): ${brl(precoCpf)}`);
    if (precoCnpj != null) linhas.push(`consulta de CNPJ (empresa): ${brl(precoCnpj)}`);
    const payload = {
      title: "Valor da consulta",
      content: `Valores da consulta (verificar se o nome está sujo, dívidas e negativações) — ${linhas.join(" · ")}. Informe o valor conforme o tipo de documento quando o lead perguntar quanto custa.`,
      category: "consulta",
      tag: TAG_PRECO,
      escopo: "tenant",
      tipo: "resposta",
      embedding_status: "pendente",
      ativo: true,
    };
    if (existente?.id) {
      await sb.from("blocos_conhecimento").update(payload).eq("id", existente.id);
    } else {
      await sb.from("blocos_conhecimento").insert({ agente_id: aid, ...payload });
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { t.error("Sessão expirada."); return; }
      const { error } = await sb.from("consultas_config_tenant").upsert(
        { tenant_id: uid, ...cfg, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id" },
      );
      if (error) throw error;
      if (agenteId) await sincronizarBlocoPreco(sb, agenteId, cfg.preco_venda_cpf, cfg.preco_venda_cnpj);
      t.success("Configuração do agente salva.");
    } catch {
      t.error("Falha ao salvar configuração.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div style={{ padding: 40, textAlign: "center", color: "oklch(0.98 0 0 / 0.4)", fontSize: 12 }}>Carregando…</div>;
  }

  const tiposAtivos = tipos.filter((tp) => tp.ativo);
  const crit = cfg.validacao_comprovante.criterios ?? {};

  return (
    <motion.div variants={fadeSlideIn} initial="hidden" animate="visible" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
      {/* Gate de venda */}
      <section className="os-vidro" style={{ padding: 18, borderRadius: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)" }}>Venda pelo agente</h3>
        <Toggle ativo={cfg.agente_pode_vender} onClick={() => setV({ agente_pode_vender: !cfg.agente_pode_vender })}
          label="Deixar o agente vender consultas no WhatsApp" disabled={!appConsultaInstalado} />
        {!appConsultaInstalado && (
          <p style={{ fontSize: 12, color: "oklch(0.8 0.13 70)", margin: 0 }}>
            Instale o app <strong>Consulta</strong> na Loja pra liberar a venda pelo agente.
          </p>
        )}
        {appConsultaInstalado && cfg.agente_pode_vender && saldo != null && saldo <= 0 && (
          <p style={{ fontSize: 12, color: "oklch(0.8 0.13 70)", margin: 0 }}>
            Sem saldo na carteira — o agente só vende com saldo. Adicione saldo no app Consulta.
          </p>
        )}
        <Campo label="Tipo de consulta padrão da venda">
          <select style={selectStyle} value={cfg.tipo_padrao_id ?? ""} onChange={(e) => setV({ tipo_padrao_id: e.target.value || null })}>
            <option value="">— escolher —</option>
            {tiposAtivos.map((tp) => <option key={tp.id} value={tp.id}>{tp.nome}</option>)}
          </select>
        </Campo>
        <div style={{ display: "flex", gap: 12 }}>
          <Campo label="Preço da consulta de CPF (R$)">
            <input style={inputStyle} type="number" min={0} step="0.01" value={cfg.preco_venda_cpf ?? ""}
              onChange={(e) => setV({ preco_venda_cpf: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="Ex: 29,90" />
          </Campo>
          <Campo label="Preço da consulta de CNPJ (R$)">
            <input style={inputStyle} type="number" min={0} step="0.01" value={cfg.preco_venda_cnpj ?? ""}
              onChange={(e) => setV({ preco_venda_cnpj: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="Ex: 39,90" />
          </Campo>
        </div>
        <p style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)", margin: "-4px 0 0" }}>
          O agente fala esses valores na conversa (cada um conforme o documento). O link de venda também cobra por aqui.
        </p>
        <Campo label="Produto oferecido após a consulta (oferta na sequência)">
          <select style={selectStyle} value={cfg.produto_oferta_id ?? ""} onChange={(e) => setV({ produto_oferta_id: e.target.value || null })}>
            <option value="">— nenhum —</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
      </section>

      {/* Conhecimento de venda (RAG do tenant) */}
      <section className="os-vidro" style={{ padding: 18, borderRadius: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)" }}>Como o agente vende a consulta</h3>
        <p style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", lineHeight: 1.5, margin: 0 }}>
          Escreva o que o agente deve saber pra OFERECER a consulta (argumentos, o que ela mostra, como abordar quando o lead tem dúvida sobre o nome). O agente puxa esse conhecimento na conversa. O link só é enviado depois que o lead aceitar.
        </p>

        {blocos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {blocos.map((b) => (
              <div key={b.id} style={{ padding: "10px 12px", background: "oklch(0.18 0.06 280 / 0.3)", border: "1px solid oklch(0.98 0 0 / 0.07)", borderRadius: 10, display: "flex", gap: 10, alignItems: "flex-start", opacity: b.ativo ? 1 : 0.55 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.98 0 0)" }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.6)", marginTop: 2, lineHeight: 1.4 }}>{b.content}</div>
                </div>
                <label
                  title={b.ativo
                    ? "Marcado: o agente considera este bloco. Desmarque pra ele ignorar."
                    : "Desmarcado: o agente ignora este bloco. Marque pra ele voltar a considerar."}
                  style={{ display: "grid", placeItems: "center", padding: 4, flexShrink: 0, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={b.ativo}
                    onChange={() => void alternarConsiderar(b.id, !b.ativo)}
                    aria-label={`Considerar o bloco ${b.title}`}
                    style={{ width: 14, height: 14, cursor: "pointer", accentColor: "oklch(0.72 0.19 150)" }}
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid oklch(0.98 0 0 / 0.07)", paddingTop: 12 }}>
          <input style={inputStyle} value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Título (ex: Por que vale a pena consultar)" />
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={novoConteudo} onChange={(e) => setNovoConteudo(e.target.value)} placeholder="O que o agente deve falar/saber…" />
          <motion.button type="button" whileTap={tapPress} onClick={() => void adicionarBloco()} disabled={salvandoBloco || !agenteId}
            style={{ alignSelf: "flex-start", padding: "8px 16px", fontSize: 12, fontWeight: 600, background: "oklch(0.7 0.18 220 / 0.2)", color: "oklch(0.85 0.12 220)", border: "1px solid oklch(0.7 0.18 220 / 0.35)", borderRadius: 10, cursor: salvandoBloco ? "not-allowed" : "pointer" }}>
            {salvandoBloco ? "Adicionando…" : "+ Adicionar conhecimento"}
          </motion.button>
        </div>
      </section>

      {/* Link público */}
      <section className="os-vidro" style={{ padding: 18, borderRadius: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)" }}>Link público</h3>
        <p style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", lineHeight: 1.5, margin: 0 }}>
          Logo, banner e nome no link vêm da sua <strong>Empresa</strong> — edite lá pra mudar aqui também.
        </p>
        <Campo label="Chave PIX (recebimento) — em branco usa o PIX do seu perfil">
          <input style={inputStyle} value={cfg.chave_pix ?? ""} onChange={(e) => setV({ chave_pix: e.target.value || null })} placeholder="sua-chave-pix" />
        </Campo>
        <Campo label="Aviso final (CTA no resultado)">
          <input style={inputStyle} value={cfg.aviso_final ?? ""} onChange={(e) => setV({ aviso_final: e.target.value || null })} placeholder="Volte ao WhatsApp: oportunidade única!" />
        </Campo>
        <Toggle ativo={cfg.selfie_ativo} onClick={() => setV({ selfie_ativo: !cfg.selfie_ativo })} label="Exigir selfie ao vivo" />
        <Toggle ativo={cfg.doc_foto_ativo} onClick={() => setV({ doc_foto_ativo: !cfg.doc_foto_ativo })} label="Exigir documento com foto" />
        <p style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)", lineHeight: 1.5, margin: "-4px 0 0" }}>
          Aqui é o único lugar que liga/desliga selfie e documento. Vale pra <strong>todos</strong> os links de venda na hora — inclusive os já gerados.
        </p>
      </section>

      {/* Campos do formulário do link */}
      <section className="os-vidro" style={{ padding: 18, borderRadius: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)" }}>Campos do formulário do link</h3>
          <p style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", lineHeight: 1.5, margin: "4px 0 0" }}>
            O que o contato preenche antes da consulta. O <strong>documento (CPF/CNPJ)</strong> é sempre pedido e destacado — não precisa adicionar.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cfg.campos_formulario.map((campo, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderRadius: 10, background: "oklch(0.18 0.06 280 / 0.4)", border: "1px solid oklch(0.98 0 0 / 0.07)" }}>
              <input
                style={{ ...inputStyle, flex: 2, minWidth: 140 }}
                value={campo.rotulo}
                onChange={(e) => setCampoForm(i, { rotulo: e.target.value })}
                placeholder="Rótulo do campo"
              />
              <select style={{ ...selectStyle, width: 110 }} value={campo.tipo} onChange={(e) => setCampoForm(i, { tipo: e.target.value as CampoFormulario["tipo"] })}>
                <option value="text">Texto</option>
                <option value="tel">Telefone</option>
                <option value="email">E-mail</option>
                <option value="numero">Número</option>
              </select>
              <Toggle ativo={campo.obrigatorio} onClick={() => setCampoForm(i, { obrigatorio: !campo.obrigatorio })} label="Obrigatório" />
              <Toggle ativo={campo.ativo} onClick={() => setCampoForm(i, { ativo: !campo.ativo })} label="Ativo" />
              <motion.button
                type="button"
                whileTap={tapPress}
                onClick={() => removerCampoForm(i)}
                title="Remover campo"
                style={{ marginLeft: "auto", display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, background: "transparent", border: "1px solid oklch(0.65 0.24 25 / 0.3)", color: "oklch(0.65 0.24 25)", cursor: "pointer" }}
              >
                <Trash2 size={14} />
              </motion.button>
            </div>
          ))}
        </div>

        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={addCampoForm}
          style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, background: "oklch(0.98 0 0 / 0.05)", color: "oklch(0.98 0 0 / 0.85)", border: "1px dashed oklch(0.98 0 0 / 0.2)", borderRadius: 10, cursor: "pointer" }}
        >
          <Plus size={14} /> Adicionar campo
        </motion.button>
      </section>

      {/* Validação do comprovante */}
      <section className="os-vidro" style={{ padding: 18, borderRadius: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.98 0 0)" }}>Validação do comprovante (visão)</h3>
        <Campo label="Modo">
          <select style={selectStyle} value={cfg.validacao_comprovante.modo ?? "manual"} onChange={(e) => setVal({ modo: e.target.value as ModoValidacao })}>
            <option value="manual">Manual — eu aprovo tudo</option>
            <option value="fila">Automático com fila — aprova confiança alta, resto pra mim</option>
            <option value="auto">Automático — aprova/recusa sozinho</option>
          </select>
        </Campo>
        <Campo label="Confiança mínima pra aprovar (0-100)">
          <input style={inputStyle} type="number" min={0} max={100} value={cfg.validacao_comprovante.limite_confianca ?? 70}
            onChange={(e) => setVal({ limite_confianca: Number(e.target.value) })} />
        </Campo>
        <div style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.98 0 0 / 0.55)", textTransform: "uppercase", letterSpacing: 0.4 }}>O que validar</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Toggle ativo={!!crit.nome} onClick={() => setCriterio("nome", !crit.nome)} label="Nome do pagador" />
          {crit.nome && <Campo label="Nome esperado (opcional — vazio usa o nome do cliente do formulário)"><input style={inputStyle} value={cfg.validacao_comprovante.nome_esperado ?? ""} onChange={(e) => setVal({ nome_esperado: e.target.value })} placeholder="Deixe vazio pra conferir com o nome do cliente" /></Campo>}
          <Toggle ativo={!!crit.valor} onClick={() => setCriterio("valor", !crit.valor)} label="Valor (bate com o preço)" />
          <Toggle ativo={!!crit.cnpj} onClick={() => setCriterio("cnpj", !crit.cnpj)} label="CNPJ/CPF do recebedor" />
          {crit.cnpj && <Campo label="CNPJ/CPF esperado (preencha pra valer — vazio não confere)"><input style={inputStyle} value={cfg.validacao_comprovante.cnpj_esperado ?? ""} onChange={(e) => setVal({ cnpj_esperado: e.target.value })} placeholder="Só dígitos da sua conta de recebimento" /></Campo>}
          <Toggle ativo={!!crit.data} onClick={() => setCriterio("data", !crit.data)} label="Data do pagamento" />
          {crit.data && (
            <Campo label="Aceitar data">
              <select style={selectStyle} value={cfg.validacao_comprovante.data_modo ?? "dia"} onChange={(e) => setVal({ data_modo: e.target.value as "dia" | "anterior_ok" })}>
                <option value="dia">Somente no dia de hoje</option>
                <option value="anterior_ok">Hoje ou anterior</option>
              </select>
            </Campo>
          )}
        </div>
      </section>

      <motion.button type="button" whileTap={tapPress} onClick={() => void salvar()} disabled={salvando}
        style={{
          padding: "12px 24px", fontSize: 13, fontWeight: 600, alignSelf: "flex-start",
          background: salvando ? "oklch(0.98 0 0 / 0.05)" : "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.5), oklch(0.65 0.22 280 / 0.4))",
          color: salvando ? "oklch(0.98 0 0 / 0.35)" : "oklch(0.98 0 0)",
          border: "1px solid oklch(0.7 0.18 220 / 0.3)", borderRadius: 10, cursor: salvando ? "not-allowed" : "pointer",
        }}>
        {salvando ? "Salvando…" : "Salvar configuração"}
      </motion.button>
    </motion.div>
  );
}

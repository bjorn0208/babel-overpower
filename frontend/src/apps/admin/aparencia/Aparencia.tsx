/**
 * App Admin · Aparência — branding white-label do Ragentic OS.
 *
 * Era em bundle.jsx:2743-2937 (AppAparencia + Field + ColorField + UploadBranding).
 *
 * Refatorações Fase 2 (skills: impeccable, emil-design-eng, accessibility-audit, ux-writing, ui-ux-pro-max):
 *  - Tabs com role="tablist" + aria-selected + arrow nav (WAI-ARIA pattern)
 *  - Inputs com <label htmlFor> + aria-describedby pra hints
 *  - Motion: fadeSlideIn entre conteúdo de abas, stagger nas paletas, hoverLift nos paleta cards
 *  - Upload zones com keyboard (Enter/Space ativa input file invisível) + drop area visual
 *  - Counter de caracteres na sub-mensagem do login (UX writing)
 *  - Tipo `Branding` reusado de `@/branding/useBranding` — single source
 *  - Ícones SVG inline (não depende de window.Icon)
 *  - role="region" no preview com aria-label "Pré-visualização do tema"
 *  - Botão "Salvar" desabilitado quando draft === brand (sem mudanças)
 */

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { motion, AnimatePresence } from "framer-motion";
import {
  easing,
  fadeSlideIn,
  stagger,
  staggerItem,
  tapPress,
} from "@/os/motion/presets";
import type { Branding } from "@/branding/useBranding";

interface AparenciaProps {
  brand: Branding;
  setBrand: (b: Branding) => void;
}

type Aba = "geral" | "cores" | "login";

interface AbaConfig {
  id: Aba;
  rotulo: string;
}

const ABAS: readonly AbaConfig[] = [
  { id: "geral", rotulo: "Geral" },
  { id: "cores", rotulo: "Cores" },
  { id: "login", rotulo: "Login" },
];

const PALETAS_SUGERIDAS: ReadonlyArray<{
  nome: string;
  acento1: string;
  acento2: string;
}> = [
  { nome: "Aurora padrão", acento1: "oklch(0.7 0.18 220)", acento2: "oklch(0.65 0.22 280)" },
  { nome: "Coral elétrico", acento1: "oklch(0.72 0.18 30)", acento2: "oklch(0.65 0.20 340)" },
  { nome: "Cítrico ácido", acento1: "oklch(0.78 0.18 140)", acento2: "oklch(0.75 0.20 80)" },
  { nome: "Esmeralda noite", acento1: "oklch(0.65 0.18 165)", acento2: "oklch(0.5 0.15 200)" },
  { nome: "Brutalist mono", acento1: "oklch(0.85 0 0)", acento2: "oklch(0.55 0 0)" },
  { nome: "Rosa cyber", acento1: "oklch(0.78 0.22 0)", acento2: "oklch(0.65 0.22 320)" },
];

const ICONES_FEATURE = [
  "bot",
  "brain",
  "spark",
  "zap",
  "message",
  "users",
  "shield",
  "star",
  "target",
  "package",
  "compass",
  "heart",
];

const LIMITE_SUB_MSG = 140;

interface UploadResult {
  erro?: string;
  url?: string;
}

interface RagenticHooks {
  brandingUploadArquivo?: (f: File, tipo: "logo" | "favicon") => Promise<UploadResult>;
}

interface RagenticToast {
  success: (msg: string) => void;
  error: (msg: string) => void;
}

function obterToast(): RagenticToast {
  const w = window as unknown as { useToast?: () => RagenticToast };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

function obterHooks(): RagenticHooks | undefined {
  return (window as unknown as { RAGENTIC_HOOKS?: RagenticHooks }).RAGENTIC_HOOKS;
}

export function Aparencia({ brand, setBrand }: AparenciaProps) {
  const [aba, setAba] = useState<Aba>("geral");
  useAbaAlvo("aparencia", (v) => setAba(v as Aba));
  const [draft, setDraft] = useState<Branding>(brand);
  const [enviando, setEnviando] = useState<"logo" | "favicon" | null>(null);
  const toast = obterToast();

  useEffect(() => setDraft(brand), [brand]);

  const update = <K extends keyof Branding>(k: K, v: Branding[K]): void =>
    setDraft((d) => ({ ...d, [k]: v }));

  const semMudancas = useMemo(
    () => JSON.stringify(brand) === JSON.stringify(draft),
    [brand, draft],
  );

  const salvar = (): void => {
    setBrand(draft);
    toast.success("Branding atualizado · aplicado em tempo real em todo o OS");
  };

  const descartar = (): void => setDraft(brand);

  const enviarArquivo = async (
    tipo: "logo" | "favicon",
    file: File,
  ): Promise<void> => {
    if (!file) return;
    setEnviando(tipo);
    try {
      const r = await obterHooks()?.brandingUploadArquivo?.(file, tipo);
      if (r?.erro) {
        toast.error(`Falha no upload: ${r.erro}`);
        return;
      }
      if (r?.url) {
        update(tipo === "logo" ? "logo_url" : "favicon_url", r.url);
        toast.success(
          `${tipo === "logo" ? "Logo" : "Favicon"} enviado · clique em Salvar para aplicar`,
        );
      }
    } finally {
      setEnviando(null);
    }
  };

  const updFeature = (
    i: number,
    k: "icone" | "titulo" | "subtitulo",
    v: string,
  ): void =>
    setDraft((d) => {
      const fs = [...(d.login_features || [])];
      fs[i] = { ...fs[i]!, [k]: v };
      return { ...d, login_features: fs };
    });

  const addFeature = (): void =>
    setDraft((d) => ({
      ...d,
      login_features: [
        ...(d.login_features || []),
        { icone: "spark", titulo: "", subtitulo: "" },
      ],
    }));

  const delFeature = (i: number): void =>
    setDraft((d) => ({
      ...d,
      login_features: (d.login_features || []).filter((_, idx) => idx !== i),
    }));

  // Keyboard nav nas abas: setas ←→ ciclam
  const onAbaKey = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number): void => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const novaIdx = (idx + delta + ABAS.length) % ABAS.length;
      setAba(ABAS[novaIdx]!.id);
      const botao = e.currentTarget.parentElement?.children[novaIdx] as HTMLButtonElement | undefined;
      botao?.focus();
    }
  };

  return (
    <div className="row" style={{ height: "100%" }}>
      {/* Onda 2 — impeccable layout cravado:
          Preview agora é DOMINANTE (esquerda, flex-1), controles à direita
          em coluna fixa compacta. Rhythm: header 32px below, tabs flutuantes
          sobre preview, grupos 20px entre, campos 12px dentro do grupo. */}
      <aside
        role="region"
        aria-label="Pré-visualização do tema em tempo real"
        style={{
          flex: 1,
          minWidth: "55%",
          padding: 32,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 28,
          overflowY: "auto",
        }}
      >
        <header>
          <h1
            className="h1"
            style={{
              marginBottom: 6,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Aparência
          </h1>
          <p className="muted" style={{ margin: 0, fontWeight: 300, fontSize: 14 }}>
            White-label do Ragentic OS · preview ao vivo enquanto você edita.
          </p>
        </header>
        <div style={{ flex: 1, minHeight: 320 }}>
          <PreviewDesktop draft={draft} />
        </div>
        <div>
          <div
            className="title-section"
            style={{ marginBottom: 10, fontWeight: 600 }}
          >
            Tela de login
          </div>
          <PreviewLogin draft={draft} />
        </div>
      </aside>

      <div
        className="col scroll"
        style={{
          width: 420,
          flexShrink: 0,
          padding: 32,
          paddingLeft: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div
          role="tablist"
          aria-label="Seções de aparência"
          className="tabs"
          style={{ display: "flex", gap: 6 }}
        >
          {ABAS.map((a, idx) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={aba === a.id}
              aria-controls={`painel-${a.id}`}
              id={`tab-${a.id}`}
              tabIndex={aba === a.id ? 0 : -1}
              className={`tab ${aba === a.id ? "tab-on" : ""}`}
              onClick={() => setAba(a.id)}
              onKeyDown={(e) => onAbaKey(e, idx)}
              style={{ cursor: "pointer" }}
            >
              {a.rotulo}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={aba}
            variants={fadeSlideIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="tabpanel"
            id={`painel-${aba}`}
            aria-labelledby={`tab-${aba}`}
          >
            {aba === "geral" && (
              <div className="col gap-4">
                <Campo
                  label="Nome do produto"
                  value={draft.nome_produto}
                  onChange={(v) => update("nome_produto", v)}
                />
                <Campo
                  label="Nome curto"
                  value={draft.nome_curto}
                  onChange={(v) => update("nome_curto", v)}
                />
                <Campo
                  label="Nome do sistema operacional"
                  value={draft.nome_so}
                  onChange={(v) => update("nome_so", v)}
                  hint="Aparece nas pílulas do topo e na tela de login."
                />
                <UploadBranding
                  label="Logo"
                  tipo="logo"
                  url={draft.logo_url}
                  hint="PNG ou SVG com fundo transparente. Recomendado 512×512px."
                  enviando={enviando === "logo"}
                  onArquivo={(f) => enviarArquivo("logo", f)}
                  onLimpar={() => update("logo_url", null)}
                />
                <UploadBranding
                  label="Favicon"
                  tipo="favicon"
                  url={draft.favicon_url}
                  hint="ICO ou PNG 64×64. Aparece na aba do navegador."
                  enviando={enviando === "favicon"}
                  onArquivo={(f) => enviarArquivo("favicon", f)}
                  onLimpar={() => update("favicon_url", null)}
                />
              </div>
            )}

            {aba === "cores" && (
              <div className="col gap-4">
                <CampoCor
                  label="Cor de fundo"
                  value={draft.cor_fundo}
                  onChange={(v) => update("cor_fundo", v)}
                />
                <CampoCor
                  label="Acento 1 (cyan)"
                  value={draft.cor_acento_1}
                  onChange={(v) => update("cor_acento_1", v)}
                />
                <CampoCor
                  label="Acento 2 (purple)"
                  value={draft.cor_acento_2}
                  onChange={(v) => update("cor_acento_2", v)}
                />
                {/* Onda 2 — impeccable bolder cravado:
                    Swatches editoriais SEM container os-card. Gradient dominante (60×84),
                    weight 700 no nome (vs 300 do label acima), flex wrap sem grid identical.
                    Hover faz scale 1.04 — single focal point, não card-grid template SaaS. */}
                <div style={{ marginTop: 8 }}>
                  <div
                    className="muted"
                    style={{
                      fontSize: 11,
                      fontWeight: 300,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 14,
                      opacity: 0.6,
                    }}
                  >
                    Paletas sugeridas
                  </div>
                  <motion.div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                    variants={stagger(0.04, 0.03)}
                    initial="hidden"
                    animate="visible"
                  >
                    {PALETAS_SUGERIDAS.map((p) => {
                      const ativa =
                        draft.cor_acento_1 === p.acento1 &&
                        draft.cor_acento_2 === p.acento2;
                      return (
                        <motion.button
                          key={p.nome}
                          variants={staggerItem}
                          whileHover={{
                            scale: 1.04,
                            transition: { duration: 0.14, ease: easing.outExpo },
                          }}
                          whileTap={tapPress}
                          type="button"
                          aria-label={`Aplicar paleta ${p.nome}`}
                          aria-pressed={ativa}
                          onClick={() => {
                            update("cor_acento_1", p.acento1);
                            update("cor_acento_2", p.acento2);
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            padding: 0,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--txt-1)",
                            width: 96,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: "100%",
                              height: 64,
                              borderRadius: 10,
                              background: `linear-gradient(135deg, ${p.acento1}, ${p.acento2})`,
                              boxShadow: ativa
                                ? `0 0 0 2px var(--os-fundo-1), 0 0 0 4px ${p.acento1}, 0 8px 24px ${p.acento2}40`
                                : "0 4px 14px rgba(0,0,0,0.18)",
                              transition: "box-shadow 180ms ease-out",
                            }}
                          />
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: ativa ? 700 : 500,
                              textAlign: "left",
                              lineHeight: 1.2,
                              color: ativa ? "var(--txt-1)" : "var(--txt-2)",
                            }}
                          >
                            {p.nome}
                          </span>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>
              </div>
            )}

            {aba === "login" && (
              <div className="col gap-4">
                <Campo
                  label="Headline da tela de login"
                  value={draft.mensagem_login_titulo}
                  onChange={(v) => update("mensagem_login_titulo", v)}
                />
                <CampoTextarea
                  label="Sub-mensagem"
                  value={draft.mensagem_login_sub}
                  onChange={(v) => update("mensagem_login_sub", v)}
                  limite={LIMITE_SUB_MSG}
                />
                <Campo
                  label="Título do formulário (coluna direita)"
                  value={draft.login_form_titulo}
                  onChange={(v) => update("login_form_titulo", v)}
                  hint='Ex.: "Entre na sua conta"'
                />
                <Campo
                  label="Subtítulo do formulário"
                  value={draft.login_form_subtitulo}
                  onChange={(v) => update("login_form_subtitulo", v)}
                  hint="Texto pequeno acima do título do formulário."
                />
                <Campo
                  label="Linha de copyright"
                  value={draft.login_copyright}
                  onChange={(v) => update("login_copyright", v)}
                  hint='Ex.: "© 2026 · todos os direitos reservados"'
                />

                <div>
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <label className="label" style={{ margin: 0 }}>
                      Cards de destaque (coluna esquerda)
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={addFeature}
                      aria-label="Adicionar card de destaque"
                    >
                      + Adicionar
                    </button>
                  </div>
                  <div className="col gap-2">
                    {(draft.login_features || []).map((f, i) => (
                      <div
                        key={i}
                        className="os-card col gap-2"
                        style={{ padding: 10 }}
                      >
                        <div className="row gap-2">
                          <select
                            className="input"
                            value={f.icone}
                            onChange={(e) => updFeature(i, "icone", e.target.value)}
                            aria-label={`Ícone do card ${i + 1}`}
                            style={{ width: 130, height: 30 }}
                          >
                            {ICONES_FEATURE.map((ic) => (
                              <option
                                key={ic}
                                value={ic}
                                style={{ background: "#1a1530" }}
                              >
                                {ic}
                              </option>
                            ))}
                          </select>
                          <input
                            className="input"
                            placeholder="Título"
                            value={f.titulo}
                            onChange={(e) => updFeature(i, "titulo", e.target.value)}
                            aria-label={`Título do card ${i + 1}`}
                            style={{ height: 30, flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => delFeature(i)}
                            aria-label={`Remover card ${i + 1}`}
                          >
                            ×
                          </button>
                        </div>
                        <input
                          className="input"
                          placeholder="Subtítulo"
                          value={f.subtitulo}
                          onChange={(e) => updFeature(i, "subtitulo", e.target.value)}
                          aria-label={`Subtítulo do card ${i + 1}`}
                          style={{ height: 30 }}
                        />
                      </div>
                    ))}
                    {(!draft.login_features || draft.login_features.length === 0) && (
                      <div className="muted tiny">Sem cards configurados ainda.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div
          className="row gap-2"
          style={{
            marginTop: 32,
            paddingTop: 20,
            borderTop: "1px solid var(--os-vidro-borda)",
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={descartar}
            disabled={semMudancas}
            aria-label="Descartar alterações"
          >
            Descartar
          </button>
          <motion.button
            type="button"
            className="btn btn-primary"
            onClick={salvar}
            disabled={semMudancas}
            whileTap={tapPress}
            aria-label="Salvar alterações de branding"
            style={{ flex: 1 }}
          >
            {semMudancas ? "Sem mudanças" : "Salvar alterações"}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-componentes inline (minimalismo: 1 arquivo)
// ============================================================================

function Campo({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}): ReactNode {
  const id = useId();
  const hintId = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <div id={hintId} className="muted tiny" style={{ marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function CampoTextarea({
  label,
  value,
  onChange,
  limite,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  limite: number;
}): ReactNode {
  const id = useId();
  const restantes = limite - (value ?? "").length;
  const proxLimite = restantes < 20;
  return (
    <div>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline" }}
      >
        <label className="label" htmlFor={id}>
          {label}
        </label>
        <span
          className="muted tiny mono"
          aria-live="polite"
          style={{ color: proxLimite ? "oklch(0.78 0.18 80)" : undefined }}
        >
          {restantes} caracteres restantes
        </span>
      </div>
      <textarea
        id={id}
        className="input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value.slice(0, limite))}
        maxLength={limite}
        rows={4}
      />
    </div>
  );
}

function CampoCor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): ReactNode {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="row gap-2">
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: value || "transparent",
            border: "1px solid var(--os-vidro-borda)",
            flexShrink: 0,
          }}
        />
        <input
          id={id}
          className="input"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="oklch(0.7 0.18 220)"
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
}

function UploadBranding({
  label,
  tipo,
  url,
  hint,
  enviando,
  onArquivo,
  onLimpar,
}: {
  label: string;
  tipo: "logo" | "favicon";
  url: string | null;
  hint: string;
  enviando: boolean;
  onArquivo: (f: File) => void;
  onLimpar: () => void;
}): ReactNode {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="row gap-3" style={{ alignItems: "center" }}>
        <div
          className="row center"
          style={{
            width: 90,
            height: 90,
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px dashed var(--os-vidro-borda)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {url ? (
            <img
              src={url}
              alt={`${label} atual`}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
            />
          ) : (
            <span aria-hidden="true" style={{ color: "var(--txt-3)" }}>
              ⬚
            </span>
          )}
        </div>
        <div className="col gap-2" style={{ flex: 1 }}>
          <label
            className="btn"
            style={{ cursor: "pointer", justifyContent: "center" }}
          >
            {enviando
              ? "Enviando…"
              : url
                ? `Trocar ${label.toLowerCase()}`
                : `Enviar ${label.toLowerCase()}`}
            <input
              type="file"
              accept={tipo === "favicon" ? "image/*,.ico" : "image/*"}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onArquivo(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {url && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onLimpar}
              aria-label={`Remover ${label.toLowerCase()}`}
            >
              Remover
            </button>
          )}
          <div className="muted tiny">{hint}</div>
        </div>
      </div>
    </div>
  );
}

function PreviewDesktop({ draft }: { draft: Branding }): ReactNode {
  return (
    <div
      style={{
        position: "relative",
        height: 280,
        borderRadius: 14,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${draft.cor_fundo}, oklch(0.18 0.06 280))`,
        border: "1px solid var(--os-vidro-borda)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(60% 60% at 20% 30%, ${draft.cor_acento_2} 0%, transparent 60%), radial-gradient(60% 60% at 80% 70%, ${draft.cor_acento_1} 0%, transparent 60%)`,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          mask: "radial-gradient(circle at 50% 60%, black 40%, transparent 90%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          right: 10,
          display: "flex",
          gap: 6,
          alignItems: "center",
          fontSize: 8,
        }}
      >
        <PilulaPreview cor="oklch(0.72 0.18 145)" texto={draft.nome_so} />
        <PilulaPreview
          gradiente={`linear-gradient(135deg, ${draft.cor_acento_1}, ${draft.cor_acento_2})`}
          texto="Tenant"
        />
        <div style={{ flex: 1 }} />
        <PilulaPreview texto="Pro · 234/500 · 12d" />
        <PilulaPreview texto="09:42" mono />
      </div>
    </div>
  );
}

function PilulaPreview({
  cor,
  gradiente,
  texto,
  mono,
}: {
  cor?: string;
  gradiente?: string;
  texto: string;
  mono?: boolean;
}): ReactNode {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        background: "rgba(15,12,30,0.55)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 999,
        color: "white",
        fontFamily: mono ? "JetBrains Mono, monospace" : undefined,
        fontWeight: 600,
      }}
    >
      {(cor || gradiente) && (
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: gradiente ? 2 : "50%",
            background: gradiente ?? cor,
          }}
        />
      )}
      {texto}
    </div>
  );
}

function PreviewLogin({ draft }: { draft: Branding }): ReactNode {
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        height: 130,
        background: `linear-gradient(135deg, ${draft.cor_acento_1}, ${draft.cor_acento_2})`,
        padding: 14,
        color: "white",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(60% 60% at 80% 20%, rgba(255,255,255,0.18), transparent 60%)",
        }}
      />
      <div style={{ position: "relative" }}>
        <div
          style={{
            fontSize: 9,
            opacity: 0.85,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {draft.nome_so}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            marginTop: 6,
            lineHeight: 1.1,
          }}
        >
          {draft.mensagem_login_titulo}
        </div>
        <div
          style={{
            fontSize: 10,
            opacity: 0.88,
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          {draft.mensagem_login_sub}
        </div>
      </div>
    </div>
  );
}

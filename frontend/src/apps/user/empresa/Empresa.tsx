/**
 * App Empresa — Onda 7.1 (2026-05-13).
 *
 * Lê/grava `public.empresas` (1 row por tenant via upsert por user_id).
 * Upload de logo/banner em Supabase Storage bucket `logos`.
 * Diego já tem row real preenchida ("Excellence Consultoria").
 *
 * Cards: Dados · Identidade Visual · Endereço · Presença Digital · Missão & Valores
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useSincronizarBlocos } from "@/hooks/use-sincronizar-blocos";
import { duration, easing, fadeSlideIn, springSnap, stagger, staggerItem } from "@/os/motion/presets";

type TipoPresenca = "fisica" | "digital" | "ambos";

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info?: (m: string) => void;
}

function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

interface EmpresaForm {
  id: string | null;
  nome: string;
  cnpj: string;
  descricao: string;
  missao: string;
  valores: string;
  endereco: string;
  bairro: string;
  cep: string;
  cidade: string;
  estado: string;
  tipo_presenca: TipoPresenca;
  site: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  youtube: string;
  whatsapp: string;
  logo_url: string;
  banner_url: string;
  data_inicio: string;
}

const VAZIO: EmpresaForm = {
  id: null,
  nome: "",
  cnpj: "",
  descricao: "",
  missao: "",
  valores: "",
  endereco: "",
  bairro: "",
  cep: "",
  cidade: "",
  estado: "",
  tipo_presenca: "digital",
  site: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  youtube: "",
  whatsapp: "",
  logo_url: "",
  banner_url: "",
  data_inicio: "",
};

const CAMPOS_SELECT = `id, nome, cnpj, descricao, missao, valores,
  endereco, bairro, cep, cidade, estado, tipo_presenca,
  site, instagram, facebook, tiktok, youtube, whatsapp,
  logo_url, banner_url, data_inicio`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

export function Empresa() {
  const t = pegarToast();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const { sync } = useSincronizarBlocos(ownerId);
  const [form, setForm] = useState<EmpresaForm>(VAZIO);
  const [nichos, setNichos] = useState<{ id: string; nome: string }[]>([]);
  const [nichoId, setNichoId] = useState<string>("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [enviandoBanner, setEnviandoBanner] = useState(false);
  const inputLogo = useRef<HTMLInputElement | null>(null);
  const inputBanner = useRef<HTMLInputElement | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { data: u } = await supabase.auth.getSession();
      const uid = u?.session?.user?.id;
      if (!uid) {
        setCarregando(false);
        return;
      }
      setOwnerId(uid);
      const sb = supabase as SupabaseBruto;
      const [{ data: nichosData }, { data: perfil }] = await Promise.all([
        sb.from("nichos").select("id, nome_exibicao").eq("ativo", true).order("nome_exibicao"),
        sb.from("profiles").select("nicho_id").eq("id", uid).maybeSingle(),
      ]);
      setNichos(
        ((nichosData ?? []) as Record<string, unknown>[]).map((n) => ({
          id: String(n.id),
          nome: String(n.nome_exibicao ?? ""),
        })),
      );
      setNichoId(perfil?.nicho_id ? String(perfil.nicho_id) : "");
      const { data, error } = await sb
        .from("empresas")
        .select(CAMPOS_SELECT)
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const d = data as Record<string, unknown>;
        setForm({
          id: String(d.id),
          nome: String(d.nome ?? ""),
          cnpj: String(d.cnpj ?? ""),
          descricao: String(d.descricao ?? ""),
          missao: String(d.missao ?? ""),
          valores: String(d.valores ?? ""),
          endereco: String(d.endereco ?? ""),
          bairro: String(d.bairro ?? ""),
          cep: String(d.cep ?? ""),
          cidade: String(d.cidade ?? ""),
          estado: String(d.estado ?? ""),
          tipo_presenca: (d.tipo_presenca as TipoPresenca) ?? "digital",
          site: String(d.site ?? ""),
          instagram: String(d.instagram ?? ""),
          facebook: String(d.facebook ?? ""),
          tiktok: String(d.tiktok ?? ""),
          youtube: String(d.youtube ?? ""),
          whatsapp: String(d.whatsapp ?? ""),
          logo_url: String(d.logo_url ?? ""),
          banner_url: String(d.banner_url ?? ""),
          data_inicio: String(d.data_inicio ?? ""),
        });
      }
    } catch (e) {
      console.error("[Empresa] carregar falhou:", e);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function setField<K extends keyof EmpresaForm>(key: K, value: EmpresaForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function uploadImagem(arquivo: File, prefixo: "logo" | "banner") {
    if (!ownerId || !arquivo.type.startsWith("image/")) {
      t.error("Selecione uma imagem válida.");
      return;
    }
    const setUploading = prefixo === "logo" ? setEnviandoLogo : setEnviandoBanner;
    const campo = prefixo === "logo" ? "logo_url" : "banner_url";
    setUploading(true);
    try {
      const ext = arquivo.name.split(".").pop() || "png";
      const path = `${ownerId}/${prefixo}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, arquivo, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
      setField(campo, urlData.publicUrl);
      t.success(`${prefixo === "logo" ? "Logo" : "Banner"} atualizado`);
    } catch (e) {
      console.error("[Empresa] upload falhou:", e);
      t.error(`Falha ao enviar ${prefixo}.`);
    } finally {
      setUploading(false);
    }
  }

  async function onSalvar() {
    if (!ownerId) {
      t.error("Sessão expirada.");
      return;
    }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const carga = {
        user_id: ownerId,
        nome: form.nome,
        cnpj: form.cnpj || null,
        descricao: form.descricao || null,
        missao: form.missao || null,
        valores: form.valores || null,
        endereco: form.endereco || null,
        bairro: form.bairro || null,
        cep: form.cep || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
        tipo_presenca: form.tipo_presenca,
        site: form.site || null,
        instagram: form.instagram || null,
        facebook: form.facebook || null,
        tiktok: form.tiktok || null,
        youtube: form.youtube || null,
        whatsapp: form.whatsapp || null,
        logo_url: form.logo_url || null,
        banner_url: form.banner_url || null,
        data_inicio: form.data_inicio || null,
      };
      const { data, error } = await sb
        .from("empresas")
        .upsert({ ...carga, ...(form.id ? { id: form.id } : {}) }, { onConflict: "user_id" })
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) setForm((p) => ({ ...p, id: String(data.id) }));
      // Persiste o nicho escolhido em profiles (dispara seed de produto_templates do nicho).
      const { error: errNicho } = await sb
        .from("profiles")
        .update({ nicho_id: nichoId || null })
        .eq("id", ownerId);
      if (errNicho) throw errNicho;
      t.success("Empresa salva");
      void sync(); // regenera o RAG do agente com a empresa atualizada (já com a camada de nicho)
    } catch (e) {
      console.error("[Empresa] salvar falhou:", e);
      t.error(`Falha ao salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <SkeletonEmpresa />;
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        color: "var(--txt-1)",
        minHeight: 0,
      }}
    >
      <Cabecalho
        nome={form.nome || "Empresa sem nome"}
        descricao={form.descricao}
        bannerUrl={form.banner_url}
        logoUrl={form.logo_url}
        salvando={salvando}
        onSalvar={() => void onSalvar()}
      />

      <motion.div
        className="scroll"
        variants={stagger(0.04, 0.06)}
        initial="hidden"
        animate="visible"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 22px 32px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18,
          minHeight: 0,
        }}
      >
        <Card titulo="Dados">
          <Campo rotulo="Nome">
            <input
              className="input"
              value={form.nome}
              onChange={(e) => setField("nome", e.target.value)}
              placeholder="Excellence Consultoria"
            />
          </Campo>
          <Campo rotulo="CNPJ">
            <input
              className="input"
              value={form.cnpj}
              onChange={(e) => setField("cnpj", e.target.value)}
              placeholder="00.000.000/0001-00"
            />
          </Campo>
          <Campo rotulo="Descrição curta">
            <textarea
              className="input"
              value={form.descricao}
              onChange={(e) => setField("descricao", e.target.value)}
              rows={2}
              placeholder="O que sua empresa faz em 1-2 frases."
            />
          </Campo>
          <Campo rotulo="Data de início">
            <input
              type="date"
              className="input"
              value={form.data_inicio}
              onChange={(e) => setField("data_inicio", e.target.value)}
            />
          </Campo>
          <Campo rotulo="Tipo de presença">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["fisica", "digital", "ambos"] as TipoPresenca[]).map((tp) => (
                <Pilula
                  key={tp}
                  ativo={form.tipo_presenca === tp}
                  onClick={() => setField("tipo_presenca", tp)}
                >
                  {tp === "fisica" ? "Física" : tp === "digital" ? "Digital" : "Ambos"}
                </Pilula>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Nicho (herda o conhecimento universal + do segmento)">
            <select
              className="input"
              value={nichoId}
              onChange={(e) => setNichoId(e.target.value)}
            >
              <option value="" style={{ background: "#1a1530" }}>
                Sem nicho ainda
              </option>
              {nichos.map((n) => (
                <option key={n.id} value={n.id} style={{ background: "#1a1530" }}>
                  {n.nome}
                </option>
              ))}
            </select>
          </Campo>
        </Card>

        <Card titulo="Identidade visual" span>
          <Campo rotulo="Logo">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                aria-hidden="true"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 12,
                  background: form.logo_url
                    ? `url(${form.logo_url}) center/contain no-repeat rgba(255,255,255,0.04)`
                    : "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  flexShrink: 0,
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <input
                  ref={inputLogo}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImagem(f, "logo");
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => inputLogo.current?.click()}
                  disabled={enviandoLogo}
                >
                  {enviandoLogo ? "Enviando…" : "Trocar logo"}
                </button>
                <span className="muted tiny">PNG ou JPG quadrado. Upload pra Storage logos.</span>
              </div>
            </div>
          </Campo>
          <Campo rotulo="Banner">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                aria-hidden="true"
                style={{
                  width: "100%",
                  height: 100,
                  borderRadius: 10,
                  background: form.banner_url
                    ? `url(${form.banner_url}) center/cover no-repeat rgba(255,255,255,0.04)`
                    : "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.18), oklch(0.65 0.22 280 / 0.18))",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              />
              <input
                ref={inputBanner}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImagem(f, "banner");
                }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => inputBanner.current?.click()}
                disabled={enviandoBanner}
              >
                {enviandoBanner ? "Enviando…" : "Trocar banner"}
              </button>
            </div>
          </Campo>
        </Card>

        <Card titulo="Endereço">
          <Campo rotulo="Endereço">
            <input
              className="input"
              value={form.endereco}
              onChange={(e) => setField("endereco", e.target.value)}
              placeholder="Rua, número"
            />
          </Campo>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Campo rotulo="Bairro">
              <input
                className="input"
                value={form.bairro}
                onChange={(e) => setField("bairro", e.target.value)}
              />
            </Campo>
            <Campo rotulo="CEP">
              <input
                className="input"
                value={form.cep}
                onChange={(e) => setField("cep", e.target.value)}
              />
            </Campo>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
            <Campo rotulo="Cidade">
              <input
                className="input"
                value={form.cidade}
                onChange={(e) => setField("cidade", e.target.value)}
              />
            </Campo>
            <Campo rotulo="UF">
              <input
                className="input"
                value={form.estado}
                maxLength={2}
                onChange={(e) => setField("estado", e.target.value.toUpperCase())}
              />
            </Campo>
          </div>
        </Card>

        <Card titulo="Presença digital">
          <Campo rotulo="WhatsApp">
            <input
              className="input"
              value={form.whatsapp}
              onChange={(e) => setField("whatsapp", e.target.value)}
              placeholder="5511..."
            />
          </Campo>
          <Campo rotulo="Site">
            <input
              className="input"
              value={form.site}
              onChange={(e) => setField("site", e.target.value)}
              placeholder="exemplo.com.br"
            />
          </Campo>
          <Campo rotulo="Instagram">
            <input
              className="input"
              value={form.instagram}
              onChange={(e) => setField("instagram", e.target.value)}
              placeholder="@arroba"
            />
          </Campo>
          <Campo rotulo="Facebook">
            <input
              className="input"
              value={form.facebook}
              onChange={(e) => setField("facebook", e.target.value)}
            />
          </Campo>
          <Campo rotulo="TikTok">
            <input
              className="input"
              value={form.tiktok}
              onChange={(e) => setField("tiktok", e.target.value)}
            />
          </Campo>
          <Campo rotulo="YouTube">
            <input
              className="input"
              value={form.youtube}
              onChange={(e) => setField("youtube", e.target.value)}
            />
          </Campo>
        </Card>

        <Card titulo="Missão & Valores">
          <Campo rotulo="Missão">
            <textarea
              className="input"
              value={form.missao}
              onChange={(e) => setField("missao", e.target.value)}
              rows={3}
              placeholder="Por que sua empresa existe?"
            />
          </Campo>
          <Campo rotulo="Valores">
            <textarea
              className="input"
              value={form.valores}
              onChange={(e) => setField("valores", e.target.value)}
              rows={3}
              placeholder="O que sua empresa defende?"
            />
          </Campo>
        </Card>
      </motion.div>
    </div>
  );
}

interface CabecalhoProps {
  nome: string;
  descricao: string;
  bannerUrl: string;
  logoUrl: string;
  salvando: boolean;
  onSalvar: () => void;
}

function Cabecalho({ nome, descricao, bannerUrl, logoUrl, salvando, onSalvar }: CabecalhoProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: easing.outExpo }}
      style={{
        position: "relative",
        height: 168,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: bannerUrl
          ? `url(${bannerUrl}) center/cover`
          : "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.22), oklch(0.65 0.22 280 / 0.22))",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(15,12,30,0.10) 0%, rgba(15,12,30,0.55) 60%, rgba(15,12,30,0.88) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 22,
          bottom: 16,
          right: 22,
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 68,
            height: 68,
            borderRadius: 16,
            background: logoUrl
              ? `url(${logoUrl}) center/contain no-repeat rgba(15,12,30,0.55)`
              : "linear-gradient(135deg, rgba(15,12,30,0.6), rgba(15,12,30,0.4))",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.10)",
            backdropFilter: "blur(12px)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(20px, 2vw, 24px)",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: -0.2,
              color: "var(--txt-1)",
            }}
          >
            {nome}
          </h1>
          {descricao ? (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--txt-2)",
                maxWidth: "60ch",
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
              }}
            >
              {descricao}
            </p>
          ) : (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "var(--txt-4)",
                fontStyle: "italic",
              }}
            >
              Sem descrição ainda.
            </p>
          )}
        </div>
        <motion.button
          type="button"
          className="btn btn-primary"
          onClick={onSalvar}
          disabled={salvando}
          whileHover={salvando ? undefined : { scale: 1.02 }}
          whileTap={salvando ? undefined : { scale: 0.97 }}
          transition={springSnap}
          style={{
            padding: "8px 18px",
            fontSize: 12,
            fontWeight: 600,
            boxShadow: salvando
              ? "none"
              : "0 4px 14px oklch(0.65 0.22 280 / 0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </motion.button>
      </div>
    </motion.header>
  );
}

interface CardProps {
  titulo: string;
  children: React.ReactNode;
  span?: boolean;
}

function Card({ titulo, children, span = false }: CardProps) {
  return (
    <motion.section
      variants={staggerItem}
      aria-label={titulo}
      style={{
        background: "linear-gradient(180deg, oklch(0.18 0.06 280 / 0.42), oklch(0.15 0.04 264 / 0.32))",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: "16px 18px 20px",
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.18)",
        gridColumn: span ? "span 2" : undefined,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 14px" }}>
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: "linear-gradient(135deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))",
            boxShadow: "0 0 8px oklch(0.65 0.22 280 / 0.55)",
          }}
        />
        <h3
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.7,
            color: "var(--txt-3)",
            margin: 0,
          }}
        >
          {titulo}
        </h3>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </motion.section>
  );
}

interface CampoProps {
  rotulo: string;
  children: React.ReactNode;
}

function Campo({ rotulo, children }: CampoProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        className="muted tiny"
        style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {rotulo}
      </span>
      {children}
    </label>
  );
}

interface PilulaProps {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Pilula({ ativo, onClick, children }: PilulaProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={springSnap}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        border: ativo
          ? "1px solid oklch(0.7 0.18 220 / 0.6)"
          : "1px solid rgba(255,255,255,0.08)",
        background: ativo
          ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.22), oklch(0.65 0.22 280 / 0.22))"
          : "rgba(255,255,255,0.025)",
        color: ativo ? "var(--txt-1)" : "var(--txt-3)",
        fontSize: 12,
        fontWeight: ativo ? 600 : 500,
        cursor: "pointer",
        boxShadow: ativo
          ? "0 4px 14px oklch(0.65 0.22 280 / 0.28), inset 0 1px 0 rgba(255,255,255,0.12)"
          : "none",
      }}
    >
      {children}
    </motion.button>
  );
}

function SkeletonEmpresa() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          height: 168,
          background:
            "linear-gradient(135deg, oklch(0.18 0.06 280 / 0.4), oklch(0.15 0.04 264 / 0.3))",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      />
      <div
        style={{
          flex: 1,
          padding: "20px 22px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12, ease: easing.glass }}
            style={{
              height: 180,
              borderRadius: 16,
              background: "oklch(0.18 0.06 280 / 0.35)",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
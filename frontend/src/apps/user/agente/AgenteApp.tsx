/**
 * App Agente — Ragentic Completo (2026-05-13).
 *
 * 6 abas reais lendo `public.agentes` + `public.cargos` + `public.blocos_*` + `public.empresas`:
 *  - Identidade (agentes: nome/persona/prompt_sistema/tom/modelos)
 *  - Cargos (cargos: 4 seções por cargo - Bússola | Prancheta | Regras livres | Diretrizes atalho)
 *  - Treinamento (blocos_procedurais + blocos_comportamento + blocos_humanizacao + blocos_meta + blocos_padrao por escopo)
 *  - Conhecimento (blocos_conhecimento por escopo)
 *  - WhatsApp (canais Z-API)
 *  - Perguntas (perguntas_sem_resposta — lacunas do agente + loop Mentor)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AvatarAgente, useFotoCanal } from "@/components/avatar-agente";
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { AbaConfiguracao } from "./AbaConfiguracao";
import { ChecklistPendencias, type AgenteChecklist } from "./ChecklistPendencias";
import { CampoPersonalidade, ResumoPrompt } from "./CampoPersonalidade";
import { AbaPerguntas } from "./AbaPerguntas";
import { HubConhecimento } from "./hub-conhecimento/HubConhecimento";

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info?: (m: string) => void;
}

function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

type AbaAgente = "identidade" | "cargos" | "conhecimento" | "whatsapp" | "configuracao" | "perguntas";

const ABAS: { id: AbaAgente; rotulo: string; icone: string }[] = [
  { id: "identidade", rotulo: "Identidade", icone: "🤖" },
  { id: "cargos", rotulo: "Cargos", icone: "🧭" },
  { id: "conhecimento", rotulo: "Conhecimento", icone: "📚" },
  { id: "whatsapp", rotulo: "WhatsApp", icone: "💬" },
  { id: "configuracao", rotulo: "Configuração", icone: "⚙️" },
  { id: "perguntas", rotulo: "Perguntas", icone: "❓" },
];

interface CampoRastreio {
  chave: string;
  descricao: string;
  obrigatorio: boolean;
}

interface Cargo {
  id: string;
  nome: string;
  tipologia: string;
  objetivo_principal: string;
  regras_livres: string;
  campos_rastreio: CampoRastreio[];
  ativo: boolean;
  ordem: number;
  canal_atuacao: string;
  escopo: string;
}

interface Tarefa {
  id: string;
  cargo_id: string;
  ordem: number;
  titulo: string;
  descricao: string;
  ativo: boolean;
}

interface Ferramenta {
  id: string;
  nome_tool: string;
  descricao: string;
  escopo: string;
  precisa_aprovacao: boolean;
}

interface AgenteRow {
  id: string;
  /** conta dona do agente — pode ser OUTRO tenant quando o agente foi delegado */
  user_id: string;
  /** true = agente de outra conta delegado a este usuário (identidade editável) */
  delegado: boolean;
  nome_agente: string;
  /** cargo/título — entra no prompt via identidade.cargo */
  cargo: string;
  /** personalidade (1-3 frases) — entra no prompt via identidade.personalidade */
  personalidade: string;
  /** tom de voz — coluna tom_agente lida pelo motor (prompt + mentor + recall) */
  tom_agente: string;
  /** JSONB identidade cru — preservado no merge ao salvar (não perder outras chaves) */
  identidadeRaw: Record<string, unknown>;
}

function normalizarCamposRastreio(raw: unknown): CampoRastreio[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") {
        return { chave: item, descricao: "", obrigatorio: false };
      }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        const chave = String(obj.chave ?? obj.nome ?? "");
        if (!chave) return null;
        return {
          chave,
          descricao: typeof obj.descricao === "string" ? obj.descricao : "",
          obrigatorio: obj.obrigatorio === true,
        };
      }
      return null;
    })
    .filter((x): x is CampoRastreio => x !== null);
}

export function AgenteApp() {
  const [aba, setAba] = useState<AbaAgente>("identidade");
  // Ramo do dock pode cair direto numa aba (ex: Agente → Conhecimento).
  useAbaAlvo("agente", (a) => setAba(a as AbaAgente));
  const [carregando, setCarregando] = useState(true);
  const [agentes, setAgentes] = useState<AgenteRow[]>([]);
  const [agente, setAgente] = useState<AgenteRow | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  // Foto de perfil do WhatsApp do canal Z-API ativo. Hook compartilhado
  // entre App Agente, Conversas e Chat-Teste (1 fetch por sessão).
  const fotoCanal = useFotoCanal();

  const carregarAgente = useCallback(async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) {
        setCarregando(false);
        return;
      }
      setTenantId(uid);
      const sb = supabase as SupabaseBruto;
      // NAO filtrar is_active aqui: pausa de IA (webhook ignora) nao pode
      // esconder a tela de edicao do agente. Tenant precisa abrir pra despausar/ajustar.
      // SEM filtro de user_id: o RLS devolve os agentes visíveis — os da própria
      // conta, o do titular (membro de equipe) e os DELEGADOS a este usuário
      // (agentes_delegados, 2026-08-25) — todos aparecem no seletor do cabeçalho.
      const { data, error } = await sb
        .from("agentes")
        .select("id, user_id, nome_agente, identidade, tom_agente")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const lista: AgenteRow[] = ((data ?? []) as Record<string, unknown>[]).map((d) => {
        const ident = (d.identidade as Record<string, unknown> | null) ?? {};
        return {
          id: String(d.id),
          user_id: String(d.user_id ?? ""),
          delegado: String(d.user_id ?? "") !== uid,
          nome_agente: String(d.nome_agente ?? ""),
          cargo: String(ident.cargo ?? ""),
          personalidade: String(ident.personalidade ?? ""),
          tom_agente: String(d.tom_agente ?? ""),
          identidadeRaw: ident,
        };
      });
      // agentes da própria conta vêm antes dos delegados
      lista.sort((a, b) => Number(a.delegado) - Number(b.delegado));
      setAgentes(lista);
      setAgente((atual) => lista.find((x) => x.id === atual?.id) ?? lista[0] ?? null);
    } catch (e) {
      console.error("[AgenteApp] carregar agente falhou:", e);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarAgente();
  }, [carregarAgente]);

  if (carregando) {
    return <EstadoCarregando texto="Carregando agente…" />;
  }

  if (!agente) {
    // Sem beco sem saída (Dominic 2026-08-25): a própria aba É a configuração —
    // conta sem agente cria um aqui mesmo e cai direto na edição.
    return <CriarAgenteForm onCriado={() => void carregarAgente()} />;
  }

  // Agente delegado (de outra conta): identidade editável; abas profundas
  // (cargos/conhecimento/whatsapp/config) seguem no tenant titular.
  const soIdentidade = agente.delegado;
  const abaEfetiva: AbaAgente = soIdentidade ? "identidade" : aba;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        color: "var(--txt-1)",
      }}
    >
      <CabecalhoAgente
        agente={agente}
        agentes={agentes}
        onTrocarAgente={(id) => {
          const alvo = agentes.find((x) => x.id === id);
          if (alvo) {
            setAgente(alvo);
            if (alvo.delegado) setAba("identidade");
          }
        }}
        aba={abaEfetiva}
        onTrocarAba={soIdentidade ? () => undefined : setAba}
        fotoCanal={fotoCanal}
      />
      {soIdentidade && (
        <div style={{ margin: "10px 22px 0", padding: "8px 12px", borderRadius: 10, fontSize: 12, color: "var(--txt-2)", background: "oklch(0.75 0.12 80 / 0.12)", border: "1px solid oklch(0.75 0.12 80 / 0.35)" }}>
          🤝 Agente delegado a você por outra conta — nome, cargo, personalidade e tom são editáveis aqui.
          Regras profundas (cargos, conhecimento, WhatsApp) seguem na conta titular.
        </div>
      )}
      <div className="scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {abaEfetiva === "identidade" && (
          <div style={{ padding: "18px 18px 0" }}>
            <ChecklistPendencias
              agente={agente}
              onAgenteAtualizado={(patch: Partial<AgenteChecklist>) => {
                const novo = { ...agente, ...patch };
                setAgente(novo);
                setAgentes((xs) => xs.map((x) => (x.id === novo.id ? novo : x)));
              }}
            />
          </div>
        )}
        {abaEfetiva === "identidade" && (
          <AbaIdentidade agente={agente} onAtualizado={(novo) => setAgente(novo)} />
        )}
        {!soIdentidade && abaEfetiva === "cargos" && tenantId && (
          <AbaCargos tenantId={tenantId} agenteId={agente.id} />
        )}
        {!soIdentidade && abaEfetiva === "conhecimento" && tenantId && (
          <HubConhecimento tenantId={tenantId} agenteId={agente.id} />
        )}
        {!soIdentidade && abaEfetiva === "whatsapp" && <AbaWhatsapp />}
        {!soIdentidade && abaEfetiva === "configuracao" && <AbaConfiguracao agenteId={agente.id} />}
        {!soIdentidade && abaEfetiva === "perguntas" && <AbaPerguntas agenteId={agente.id} />}
      </div>
    </div>
  );
}

/** Conta sem agente: formulário de criação inline — a aba Agente é também a
 *  aba de configuração (cria aqui e já cai na edição). */
function CriarAgenteForm({ onCriado }: { onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [tom, setTom] = useState("");
  const [personalidade, setPersonalidade] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const criar = async () => {
    if (!nome.trim()) {
      setErro("Dê um nome ao agente.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error("Sessão expirada — faça login de novo.");
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("agentes").insert({
        user_id: uid,
        owner_id: uid,
        nome_agente: nome.trim(),
        tom_agente: tom.trim() || null,
        identidade: { cargo: cargo.trim(), personalidade: personalidade.trim() },
        is_active: true,
      });
      if (error) throw error;
      onCriado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  const campo = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid oklch(0.98 0 0 / 0.12)",
    background: "oklch(0.16 0.04 280 / 0.5)",
    color: "var(--txt-1)",
    fontSize: 13,
  } as const;

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: "0 22px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--txt-1)" }}>🤖 Criar seu agente</h2>
        <p style={{ fontSize: 13, color: "var(--txt-3)", marginTop: 4 }}>
          Sua conta ainda não tem agente. Preencha e comece — dá pra ajustar tudo depois nesta mesma aba.
        </p>
      </div>
      <input style={campo} placeholder="Nome do agente (ex: Bel)" value={nome} onChange={(e) => setNome(e.target.value)} />
      <input style={campo} placeholder="Cargo/função (ex: consultora de vendas)" value={cargo} onChange={(e) => setCargo(e.target.value)} />
      <input style={campo} placeholder="Tom de voz (ex: caloroso e direto)" value={tom} onChange={(e) => setTom(e.target.value)} />
      <textarea style={{ ...campo, minHeight: 80, resize: "vertical" }} placeholder="Personalidade (1-3 frases)" value={personalidade} onChange={(e) => setPersonalidade(e.target.value)} />
      {erro && <p style={{ fontSize: 12, color: "oklch(0.7 0.19 25)" }}>{erro}</p>}
      <button
        type="button"
        disabled={salvando}
        onClick={() => void criar()}
        style={{
          padding: "11px 16px", borderRadius: 10, border: "none", cursor: "pointer",
          fontSize: 13, fontWeight: 700, color: "white",
          background: "linear-gradient(135deg, var(--os-acento-1), var(--os-acento-2))",
          opacity: salvando ? 0.6 : 1,
        }}
      >
        {salvando ? "Criando…" : "Criar agente"}
      </button>
    </div>
  );
}

function EstadoCarregando({ texto }: { texto: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--txt-3)",
        fontSize: 13,
      }}
    >
      {texto}
    </div>
  );
}

interface CabecalhoProps {
  agente: AgenteRow;
  agentes: AgenteRow[];
  onTrocarAgente: (id: string) => void;
  aba: AbaAgente;
  onTrocarAba: (a: AbaAgente) => void;
  fotoCanal: string | null;
}

function CabecalhoAgente({ agente, agentes, onTrocarAgente, aba, onTrocarAba, fotoCanal }: CabecalhoProps) {
  return (
    <header
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "22px 22px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <AvatarAgente fotoCanal={fotoCanal} tamanho={64} alt={`Foto do agente ${agente.nome_agente}`} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {agentes.length > 1 ? (
              // Mais de um agente visível (conta com vários / delegados): seletor
              <select
                value={agente.id}
                onChange={(e) => onTrocarAgente(e.target.value)}
                style={{
                  fontSize: 18, fontWeight: 700, color: "var(--txt-1)",
                  background: "oklch(0.16 0.04 280 / 0.6)",
                  border: "1px solid oklch(0.98 0 0 / 0.14)",
                  borderRadius: 8, padding: "4px 8px", cursor: "pointer",
                }}
              >
                {agentes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.nome_agente || "Agente") + (a.delegado ? " · delegado" : "")}
                  </option>
                ))}
              </select>
            ) : (
              agente.nome_agente || "Agente"
            )}
            {agente.delegado && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "oklch(0.75 0.12 80 / 0.18)", color: "oklch(0.8 0.1 80)" }}>
                🤝 delegado
              </span>
            )}
          </div>
          {agente.tom_agente && (
            <div
              className="muted small"
              style={{
                fontSize: 12,
                color: "var(--txt-3)",
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {agente.tom_agente}
            </div>
          )}
        </div>
      </div>
      <nav
        role="tablist"
        aria-label="Configurar agente"
        style={{ display: "flex", gap: 4, padding: "0 0 0 0" }}
      >
        {ABAS.map((a) => {
          const ativo = aba === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => onTrocarAba(a.id)}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "none",
                color: ativo ? "var(--txt-1)" : "var(--txt-3)",
                fontSize: 12,
                fontWeight: ativo ? 600 : 500,
                cursor: "pointer",
                position: "relative",
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                borderBottom: ativo ? "2px solid oklch(0.7 0.18 220)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              <span aria-hidden="true">{a.icone}</span>
              {a.rotulo}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

// ============================================================================
// ABA IDENTIDADE
// ============================================================================

interface AbaIdentidadeProps {
  agente: AgenteRow;
  onAtualizado: (a: AgenteRow) => void;
}

function AbaIdentidade({ agente, onAtualizado }: AbaIdentidadeProps) {
  const t = pegarToast();
  const [editando, setEditando] = useState<AgenteRow>(agente);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setEditando(agente), [agente]);

  function setField<K extends keyof AgenteRow>(k: K, v: AgenteRow[K]) {
    setEditando((p) => ({ ...p, [k]: v }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      // Relê o JSONB identidade imediatamente antes de escrever e faz o merge
      // sobre a versão fresca do servidor — o snapshot `identidadeRaw` do load
      // pode estar velho e apagaria chaves gravadas em paralelo (recall/motor).
      const { data: atual } = await sb
        .from("agentes")
        .select("identidade")
        .eq("id", editando.id)
        .maybeSingle();
      const baseIdentidade =
        (atual?.identidade as Record<string, unknown> | null) ?? editando.identidadeRaw;
      // Merge no JSONB identidade — preserva chaves existentes e grava o que o motor lê
      // no prompt (identidade.cargo + identidade.personalidade) e no recall
      // (identidade.persona, ragentic index.ts:1163). Nome e tom ficam nas colunas.
      const novaIdentidade: Record<string, unknown> = {
        ...baseIdentidade,
        cargo: editando.cargo.trim(),
        personalidade: editando.personalidade.trim(),
        persona: editando.personalidade.trim(),
      };
      // `.select()` + checagem de linhas: membro de equipe (não-dono) enxerga o
      // agente do titular via RLS de leitura, mas não tem policy de escrita —
      // o UPDATE afeta 0 linhas sem erro. Não fingir "salva".
      const { data, error } = await sb
        .from("agentes")
        .update({
          nome_agente: editando.nome_agente,
          tom_agente: editando.tom_agente || null,
          identidade: novaIdentidade,
        })
        .eq("id", editando.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        t.error("Não foi possível salvar: só a conta dona do agente pode editar a identidade.");
        return;
      }
      onAtualizado({ ...editando, identidadeRaw: novaIdentidade });
      t.success("Identidade salva");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  const sujo = JSON.stringify(editando) !== JSON.stringify(agente);

  return (
    <div style={{ padding: "18px 18px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <SecaoAgente titulo="Identidade básica" icone="🤖">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Campo rotulo="Nome do agente">
            <input
              className="input"
              value={editando.nome_agente}
              onChange={(e) => setField("nome_agente", e.target.value)}
            />
          </Campo>
          <Campo rotulo="Cargo / título">
            <input
              className="input"
              value={editando.cargo}
              onChange={(e) => setField("cargo", e.target.value)}
              placeholder="ex: consultora de crédito"
            />
          </Campo>
        </div>
        <Campo rotulo="Tom de voz">
          <input
            className="input"
            value={editando.tom_agente}
            onChange={(e) => setField("tom_agente", e.target.value)}
            placeholder="profissional, caloroso e direto — ou 'espelha o cliente'"
          />
        </Campo>
        <CampoPersonalidade
          valor={editando.personalidade}
          aoMudar={(texto) => setField("personalidade", texto)}
        />
        <ResumoPrompt
          nome={editando.nome_agente}
          cargo={editando.cargo}
          personalidade={editando.personalidade}
          tom={editando.tom_agente}
        />
      </SecaoAgente>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setEditando(agente)}
          disabled={!sujo}
        >
          Descartar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void salvar()}
          disabled={!sujo || salvando}
        >
          {salvando ? "Salvando…" : "Salvar identidade"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ABA CARGOS — coração do refactor
// ============================================================================

interface AbaCargosProps {
  tenantId: string;
  agenteId: string;
}

function AbaCargos({ tenantId, agenteId }: AbaCargosProps) {
  const t = pegarToast();
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [diretrizesPorCargo, setDiretrizesPorCargo] = useState<Record<string, { id: string; titulo: string; instrucao: string }[]>>({});
  const [editandoDiretrizId, setEditandoDiretrizId] = useState<string | null>(null);
  const [diretrizEdit, setDiretrizEdit] = useState<{ titulo: string; instrucao: string }>({ titulo: "", instrucao: "" });
  const [salvandoDiretriz, setSalvandoDiretriz] = useState(false);
  const [tarefasPorCargo, setTarefasPorCargo] = useState<Record<string, Tarefa[]>>({});
  const [ferramentasCatalogo, setFerramentasCatalogo] = useState<Ferramenta[]>([]);
  const [vinculadasPorCargo, setVinculadasPorCargo] = useState<Record<string, Set<string>>>({});

  const carregar = useCallback(async () => {
    try {
      const sb = supabase as SupabaseBruto;
      // Usa RPC que devolve cargos globais não substituidos + cargos do nicho + cargos do tenant.
      // Evita duplicação na UI quando o tenant tem clone personalizado de um cargo global.
      const { data, error } = await sb.rpc("cargos_visiveis_tenant");
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      const lista: Cargo[] = rows.map((d) => ({
        id: String(d.id),
        nome: String(d.nome ?? ""),
        tipologia: String(d.tipologia ?? "atendimento"),
        objetivo_principal: String(d.objetivo_principal ?? ""),
        regras_livres: String(d.regras_livres ?? ""),
        campos_rastreio: normalizarCamposRastreio(d.campos_rastreio),
        ativo: d.ativo !== false,
        ordem: Number(d.ordem ?? 0),
        canal_atuacao: String(d.canal_atuacao ?? "ambos"),
        escopo: String(d.escopo ?? "tenant"),
      }));
      setCargos(lista);
      if (lista.length > 0 && !selecionadoId) setSelecionadoId(lista[0].id);

      // Atalho pras diretrizes procedurais por cargo
      const ids = lista.map((c) => c.id);
      if (ids.length > 0) {
        const { data: dProc } = await sb
          .from("blocos_procedurais")
          .select("id, cargo_id, nome_procedimento, passos")
          .eq("tenant_id", tenantId)
          .eq("ativo", true)
          .in("cargo_id", ids);
        const map: Record<string, { id: string; titulo: string; instrucao: string }[]> = {};
        for (const p of (dProc ?? []) as Record<string, unknown>[]) {
          const cid = String(p.cargo_id);
          if (!map[cid]) map[cid] = [];
          const passos = p.passos as Record<string, unknown> | null;
          map[cid].push({
            id: String(p.id),
            titulo: String(p.nome_procedimento ?? ""),
            instrucao: typeof passos?.instrucao === "string" ? passos.instrucao : "",
          });
        }
        setDiretrizesPorCargo(map);

        // Tarefas por cargo
        const { data: dTar } = await sb
          .from("cargo_tarefas")
          .select("id, cargo_id, ordem, titulo, descricao, ativo")
          .eq("ativo", true)
          .in("cargo_id", ids)
          .order("ordem", { ascending: true });
        const mapTar: Record<string, Tarefa[]> = {};
        for (const tr of (dTar ?? []) as Record<string, unknown>[]) {
          const cid = String(tr.cargo_id);
          if (!mapTar[cid]) mapTar[cid] = [];
          mapTar[cid].push({
            id: String(tr.id),
            cargo_id: cid,
            ordem: Number(tr.ordem ?? 0),
            titulo: String(tr.titulo ?? ""),
            descricao: String(tr.descricao ?? ""),
            ativo: tr.ativo !== false,
          });
        }
        setTarefasPorCargo(mapTar);

        // Ferramentas vinculadas por cargo
        const { data: dVinc } = await sb
          .from("cargo_ferramentas")
          .select("cargo_id, ferramenta_id")
          .in("cargo_id", ids);
        const mapVinc: Record<string, Set<string>> = {};
        for (const v of (dVinc ?? []) as Record<string, unknown>[]) {
          const cid = String(v.cargo_id);
          if (!mapVinc[cid]) mapVinc[cid] = new Set();
          mapVinc[cid].add(String(v.ferramenta_id));
        }
        setVinculadasPorCargo(mapVinc);
      }

      // Catálogo de ferramentas dinâmicas (escopo plataforma + do tenant)
      const { data: dFerr } = await sb
        .from("ferramentas_dinamicas")
        .select("id, nome_tool, descricao, escopo, precisa_aprovacao, tenant_id")
        .eq("ativo", true)
        .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
        .order("nome_tool", { ascending: true });
      setFerramentasCatalogo(
        ((dFerr ?? []) as Record<string, unknown>[]).map((f) => ({
          id: String(f.id),
          nome_tool: String(f.nome_tool ?? ""),
          descricao: String(f.descricao ?? ""),
          escopo: String(f.escopo ?? "plataforma"),
          precisa_aprovacao: f.precisa_aprovacao === true,
        })),
      );
    } catch (e) {
      console.error("[AbaCargos] carregar falhou:", e);
    } finally {
      setCarregando(false);
    }
  }, [tenantId, selecionadoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const selecionado = cargos.find((c) => c.id === selecionadoId) ?? null;
  // Cargo global (padrão da plataforma) é só leitura aqui — RLS bloqueia escrita do tenant.
  const ehGlobal = selecionado?.escopo === "global";

  function atualizarCargoLocal(patch: Partial<Cargo>) {
    if (!selecionado) return;
    setCargos((xs) => xs.map((c) => (c.id === selecionado.id ? { ...c, ...patch } : c)));
  }

  function atualizarCampo(idx: number, patch: Partial<CampoRastreio>) {
    if (!selecionado) return;
    atualizarCargoLocal({
      campos_rastreio: selecionado.campos_rastreio.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    });
  }

  function adicionarCampo() {
    if (!selecionado) return;
    atualizarCargoLocal({
      campos_rastreio: [...selecionado.campos_rastreio, { chave: "novo_campo", descricao: "", obrigatorio: false }],
    });
  }

  function removerCampo(idx: number) {
    if (!selecionado) return;
    atualizarCargoLocal({
      campos_rastreio: selecionado.campos_rastreio.filter((_, i) => i !== idx),
    });
  }

  async function adicionarDiretriz(cargoId: string) {
    if (ehGlobal) {
      t.info?.('Cargo padrão (global) é só leitura.');
      return;
    }
    try {
      const sb = supabase as SupabaseBruto;
      const cargo = cargos.find((c) => c.id === cargoId);
      const { data, error } = await sb
        .from("blocos_procedurais")
        .insert({
          escopo: "tenant",
          tenant_id: tenantId,
          cargo_id: cargoId,
          nome_procedimento: `Nova diretriz · ${cargo?.nome ?? ""}`,
          passos: { instrucao: "Descreva aqui a diretriz que o agente deve seguir neste cargo." },
          imutavel: false,
          ativo: true,
        })
        .select("id, cargo_id, nome_procedimento, passos")
        .single();
      if (error) throw error;
      const d = data as Record<string, unknown>;
      const passos = d.passos as Record<string, unknown> | null;
      const novaDiretriz = {
        id: String(d.id),
        titulo: String(d.nome_procedimento ?? ""),
        instrucao: typeof passos?.instrucao === "string" ? passos.instrucao : "",
      };
      setDiretrizesPorCargo((prev) => ({
        ...prev,
        [cargoId]: [...(prev[cargoId] ?? []), novaDiretriz],
      }));
      t.success("Diretriz adicionada");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function removerDiretriz(diretrizId: string) {
    if (!confirm("Remover esta diretriz? Ela não vai mais entrar no system prompt do cargo.")) return;
    try {
      const sb = supabase as SupabaseBruto;
      // Soft delete, regra do projeto: `blocos_procedurais` tem `deleted_at`. `ativo: false`
      // vai junto porque as RPCs de recall filtram por `ativo`, nunca por `deleted_at`.
      const { error } = await sb
        .from("blocos_procedurais")
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq("id", diretrizId);
      if (error) throw error;
      setDiretrizesPorCargo((prev) => {
        const novo: typeof prev = {};
        for (const cid of Object.keys(prev)) {
          novo[cid] = prev[cid].filter((d) => d.id !== diretrizId);
        }
        return novo;
      });
      t.info?.("Diretriz removida");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  function iniciarEdicaoDiretriz(d: { id: string; titulo: string; instrucao: string }) {
    if (ehGlobal) {
      t.info?.('Cargo padrão (global) é só leitura.');
      return;
    }
    setEditandoDiretrizId(d.id);
    setDiretrizEdit({ titulo: d.titulo, instrucao: d.instrucao });
  }

  function cancelarEdicaoDiretriz() {
    setEditandoDiretrizId(null);
    setDiretrizEdit({ titulo: "", instrucao: "" });
  }

  async function salvarEdicaoDiretriz(diretrizId: string) {
    const titulo = diretrizEdit.titulo.trim();
    const instrucao = diretrizEdit.instrucao.trim();
    if (!titulo) {
      t.error("Título não pode ficar vazio.");
      return;
    }
    if (!instrucao) {
      t.error("Instrução não pode ficar vazia.");
      return;
    }
    setSalvandoDiretriz(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb
        .from("blocos_procedurais")
        .update({ nome_procedimento: titulo, passos: { instrucao } })
        .eq("id", diretrizId);
      if (error) throw error;
      setDiretrizesPorCargo((prev) => {
        const novo: typeof prev = {};
        for (const cid of Object.keys(prev)) {
          novo[cid] = prev[cid].map((d) => (d.id === diretrizId ? { ...d, titulo, instrucao } : d));
        }
        return novo;
      });
      setEditandoDiretrizId(null);
      setDiretrizEdit({ titulo: "", instrucao: "" });
      t.success("Diretriz atualizada");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    } finally {
      setSalvandoDiretriz(false);
    }
  }

  async function adicionarTarefa(cargoId: string) {
    if (ehGlobal) {
      t.info?.('Cargo padrão (global) é só leitura.');
      return;
    }
    try {
      const sb = supabase as SupabaseBruto;
      const existentes = tarefasPorCargo[cargoId] ?? [];
      const proxOrdem = existentes.length > 0 ? Math.max(...existentes.map((t) => t.ordem)) + 1 : 0;
      const { data, error } = await sb
        .from("cargo_tarefas")
        .insert({ cargo_id: cargoId, ordem: proxOrdem, titulo: "Nova tarefa", descricao: "" })
        .select("id, cargo_id, ordem, titulo, descricao, ativo")
        .single();
      if (error) throw error;
      const r = data as Record<string, unknown>;
      const nova: Tarefa = {
        id: String(r.id),
        cargo_id: cargoId,
        ordem: Number(r.ordem ?? 0),
        titulo: String(r.titulo ?? ""),
        descricao: String(r.descricao ?? ""),
        ativo: r.ativo !== false,
      };
      setTarefasPorCargo((prev) => ({ ...prev, [cargoId]: [...(prev[cargoId] ?? []), nova] }));
      t.success("Tarefa adicionada");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function salvarTarefa(tar: Tarefa) {
    try {
      const sb = supabase as SupabaseBruto;
      // `.select()` + checagem: membro de equipe sem policy de escrita afeta 0
      // linhas sem erro. Não fingir "salva".
      const { data, error } = await sb
        .from("cargo_tarefas")
        .update({ titulo: tar.titulo, descricao: tar.descricao || null })
        .eq("id", tar.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        t.error("Não foi possível salvar a tarefa: sem permissão de escrita.");
        return;
      }
      setTarefasPorCargo((prev) => ({
        ...prev,
        [tar.cargo_id]: (prev[tar.cargo_id] ?? []).map((x) => (x.id === tar.id ? tar : x)),
      }));
      t.success("Tarefa salva");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function removerTarefa(tar: Tarefa) {
    if (!confirm(`Remover tarefa "${tar.titulo}"?`)) return;
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("cargo_tarefas").delete().eq("id", tar.id);
      if (error) throw error;
      setTarefasPorCargo((prev) => ({
        ...prev,
        [tar.cargo_id]: (prev[tar.cargo_id] ?? []).filter((x) => x.id !== tar.id),
      }));
      t.info?.("Tarefa removida");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function toggleFerramentaCargo(cargoId: string, ferramentaId: string, marcar: boolean) {
    // Cargo global é só leitura pro tenant (RLS barra a escrita) — mesma guarda
    // dos demais handlers; sem ela o clique virava erro cru de RLS no toast
    // (caso do tenant fabricio, 2026-08-20).
    if (cargos.find((c) => c.id === cargoId)?.escopo === "global") {
      t.info?.('Cargo padrão (global) é só leitura. Clique em "+ Novo cargo" pra criar um cargo seu e escolher as ferramentas.');
      return;
    }
    try {
      const sb = supabase as SupabaseBruto;
      if (marcar) {
        const vinculadas = vinculadasPorCargo[cargoId] ?? new Set<string>();
        const proxOrdem = vinculadas.size;
        const { error } = await sb
          .from("cargo_ferramentas")
          .insert({ cargo_id: cargoId, ferramenta_id: ferramentaId, ordem: proxOrdem, obrigatoria: false });
        if (error) throw error;
        setVinculadasPorCargo((prev) => {
          const novo = new Set(prev[cargoId] ?? new Set<string>());
          novo.add(ferramentaId);
          return { ...prev, [cargoId]: novo };
        });
      } else {
        const { error } = await sb
          .from("cargo_ferramentas")
          .delete()
          .eq("cargo_id", cargoId)
          .eq("ferramenta_id", ferramentaId);
        if (error) throw error;
        setVinculadasPorCargo((prev) => {
          const novo = new Set(prev[cargoId] ?? new Set<string>());
          novo.delete(ferramentaId);
          return { ...prev, [cargoId]: novo };
        });
      }
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function salvarCargo() {
    if (!selecionado) return;
    if (ehGlobal) {
      t.info?.('Cargo padrão (global) é só leitura. Crie um cargo seu pra customizar.');
      return;
    }
    setSalvando(true);
    try {
      const sb = supabase as SupabaseBruto;
      // `.select()` + checagem: membro de equipe sem policy de escrita afeta 0
      // linhas sem erro. Não fingir "salvo".
      const { data, error } = await sb
        .from("cargos")
        .update({
          nome: selecionado.nome,
          objetivo_principal: selecionado.objetivo_principal,
          regras_livres: selecionado.regras_livres || null,
          campos_rastreio: selecionado.campos_rastreio,
          canal_atuacao: selecionado.canal_atuacao,
        })
        .eq("id", selecionado.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        t.error("Não foi possível salvar: sem permissão de escrita neste cargo.");
        return;
      }
      t.success(`Cargo "${selecionado.nome}" salvo`);
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  async function criarCargo() {
    try {
      const sb = supabase as SupabaseBruto;
      const proxOrdem = Math.max(0, ...cargos.map((c) => c.ordem)) + 1;
      const { data, error } = await sb
        .from("cargos")
        .insert({
          nome: "Novo cargo",
          tipologia: "atendimento",
          escopo: "tenant",
          tenant_id: tenantId,
          agente_id: agenteId,
          canal_atuacao: "ambos",
          ativo: true,
          ordem: proxOrdem,
          objetivo_principal: "",
          regras_livres: "",
          campos_rastreio: [],
        })
        .select("id, nome, tipologia, objetivo_principal, regras_livres, campos_rastreio, ativo, ordem, canal_atuacao, escopo")
        .single();
      if (error) throw error;
      const d = data as Record<string, unknown>;
      const novo: Cargo = {
        id: String(d.id),
        nome: String(d.nome ?? ""),
        tipologia: String(d.tipologia ?? "atendimento"),
        objetivo_principal: String(d.objetivo_principal ?? ""),
        regras_livres: String(d.regras_livres ?? ""),
        campos_rastreio: normalizarCamposRastreio(d.campos_rastreio),
        ativo: d.ativo !== false,
        ordem: Number(d.ordem ?? 0),
        canal_atuacao: String(d.canal_atuacao ?? "ambos"),
        escopo: String(d.escopo ?? "tenant"),
      };
      setCargos((xs) => [...xs, novo]);
      setSelecionadoId(novo.id);
      t.success("Cargo criado");
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  async function toggleAtivo(c: Cargo) {
    if (c.escopo === "global") {
      t.info?.('Cargo padrão (global) é só leitura.');
      return;
    }
    try {
      const sb = supabase as SupabaseBruto;
      const { data, error } = await sb
        .from("cargos")
        .update({ ativo: !c.ativo })
        .eq("id", c.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        t.error("Não foi possível alterar: sem permissão de escrita neste cargo.");
        return;
      }
      setCargos((xs) => xs.map((x) => (x.id === c.id ? { ...x, ativo: !c.ativo } : x)));
      t.success(c.ativo ? `Cargo "${c.nome}" desativado` : `Cargo "${c.nome}" reativado`);
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    }
  }

  if (carregando) return <EstadoCarregando texto="Carregando cargos…" />;

  return (
    <div style={{ padding: "18px 18px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Tabs de cargos */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {cargos.map((c) => {
          const ativo = c.id === selecionadoId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelecionadoId(c.id)}
              aria-pressed={ativo}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: ativo
                  ? "1px solid oklch(0.7 0.18 220 / 0.6)"
                  : "1px solid rgba(255,255,255,0.10)",
                background: ativo
                  ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.18), oklch(0.65 0.22 280 / 0.18))"
                  : "rgba(255,255,255,0.03)",
                color: ativo ? "var(--txt-1)" : "var(--txt-3)",
                fontSize: 12,
                fontWeight: ativo ? 600 : 500,
                cursor: "pointer",
                opacity: c.ativo ? 1 : 0.45,
              }}
            >
              {c.nome}{!c.ativo && " (off)"}
            </button>
          );
        })}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void criarCargo()}
        >
          + Novo cargo
        </button>
      </div>

      {selecionado && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {ehGlobal && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "oklch(0.7 0.18 220 / 0.10)",
                border: "1px solid oklch(0.7 0.18 220 / 0.30)",
                color: "var(--txt-2)",
                fontSize: 12,
              }}
            >
              🔒 Cargo padrão (global). Só leitura — clique em "+ Novo cargo" pra criar um cargo seu e customizar.
            </div>
          )}
          {/* Configuração do cargo */}
          <SecaoAgente titulo="Configuração do cargo" icone="⚙️">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="input"
                value={selecionado.nome}
                onChange={(e) => atualizarCargoLocal({ nome: e.target.value })}
                placeholder="Nome do cargo"
                style={{ flex: "1 1 180px", minWidth: 140 }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void toggleAtivo(selecionado)}
                style={{
                  padding: "4px 14px",
                  borderRadius: 999,
                  border: selecionado.ativo
                    ? "1px solid oklch(0.7 0.18 140 / 0.5)"
                    : "1px solid rgba(255,255,255,0.12)",
                  background: selecionado.ativo
                    ? "oklch(0.7 0.18 140 / 0.12)"
                    : "rgba(255,255,255,0.04)",
                  color: selecionado.ativo ? "oklch(0.82 0.18 140)" : "var(--txt-3)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {selecionado.ativo ? "Ativo" : "Inativo"}
              </button>
              <select
                className="input"
                value={selecionado.canal_atuacao}
                onChange={(e) => atualizarCargoLocal({ canal_atuacao: e.target.value })}
                style={{ flex: "1 1 200px", minWidth: 160 }}
              >
                <option value="interno">Interno (só dono/workbench)</option>
                <option value="externo">Externo (lead/cliente/WhatsApp)</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
          </SecaoAgente>

          {/* Bússola */}
          <SecaoAgente titulo="Bússola · objetivo principal deste cargo" icone="🧭">
            <textarea
              className="input"
              rows={4}
              value={selecionado.objetivo_principal}
              onChange={(e) => atualizarCargoLocal({ objetivo_principal: e.target.value })}
              placeholder="Por que esse cargo existe e o que ele entrega?"
            />
          </SecaoAgente>

          {/* Prancheta */}
          <SecaoAgente
            titulo={`Prancheta · campos a rastrear no lead (${selecionado.campos_rastreio.length})`}
            icone="📋"
            acao={
              <button type="button" className="btn btn-sm" onClick={adicionarCampo}>
                + campo
              </button>
            }
          >
            {selecionado.campos_rastreio.length === 0 && (
              <div className="muted small" style={{ padding: 12 }}>
                Nenhum campo. Use "+ campo" pra adicionar o primeiro.
              </div>
            )}
            {selecionado.campos_rastreio.map((cp, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr auto auto",
                  gap: 8,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <input
                  className="input mono"
                  value={cp.chave}
                  onChange={(e) => atualizarCampo(i, { chave: e.target.value })}
                  placeholder="chave_do_campo"
                  style={{ fontSize: 11 }}
                />
                <input
                  className="input"
                  value={cp.descricao}
                  onChange={(e) => atualizarCampo(i, { descricao: e.target.value })}
                  placeholder="O que é esse campo no contexto do lead"
                  style={{ fontSize: 12 }}
                />
                <button
                  type="button"
                  onClick={() => atualizarCampo(i, { obrigatorio: !cp.obrigatorio })}
                  aria-pressed={cp.obrigatorio}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600,
                    border: cp.obrigatorio
                      ? "1px solid oklch(0.78 0.18 80 / 0.45)"
                      : "1px solid rgba(255,255,255,0.10)",
                    background: cp.obrigatorio
                      ? "oklch(0.78 0.18 80 / 0.15)"
                      : "rgba(255,255,255,0.04)",
                    color: cp.obrigatorio ? "oklch(0.88 0.18 80)" : "var(--txt-3)",
                    cursor: "pointer",
                  }}
                >
                  {cp.obrigatorio ? "obrigatório" : "opcional"}
                </button>
                <button
                  type="button"
                  onClick={() => removerCampo(i)}
                  aria-label="Remover campo"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--txt-3)",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "2px 8px",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </SecaoAgente>

          {/* Regras livres */}
          <SecaoAgente
            titulo="Regras livres · texto que entra no system prompt do cargo"
            icone="📝"
          >
            <textarea
              className="input"
              rows={10}
              value={selecionado.regras_livres}
              onChange={(e) => atualizarCargoLocal({ regras_livres: e.target.value })}
              placeholder="FLUXO CRAVADO, proibições, gatilhos de interrupção, instruções operacionais."
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}
            />
          </SecaoAgente>

          {/* Diretrizes procedurais atalho */}
          <SecaoAgente
            titulo={`Diretrizes procedurais (${diretrizesPorCargo[selecionado.id]?.length ?? 0})`}
            icone="⚖️"
            acao={
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void adicionarDiretriz(selecionado.id)}
              >
                + nova diretriz
              </button>
            }
          >
            {!diretrizesPorCargo[selecionado.id] || diretrizesPorCargo[selecionado.id].length === 0 ? (
              <div className="muted small" style={{ padding: 12 }}>
                Sem diretrizes pra este cargo. Use "+ nova diretriz" pra criar.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {diretrizesPorCargo[selecionado.id].map((d) => {
                  const emEdicao = editandoDiretrizId === d.id;
                  return (
                    <div
                      key={d.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.025)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {emEdicao ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <input
                              type="text"
                              value={diretrizEdit.titulo}
                              onChange={(e) => setDiretrizEdit((s) => ({ ...s, titulo: e.target.value }))}
                              placeholder="Título da diretriz"
                              disabled={salvandoDiretriz}
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                padding: "6px 8px",
                                borderRadius: 6,
                                background: "rgba(0,0,0,0.25)",
                                border: "1px solid rgba(255,255,255,0.10)",
                                color: "var(--txt-1)",
                              }}
                            />
                            <textarea
                              value={diretrizEdit.instrucao}
                              onChange={(e) => setDiretrizEdit((s) => ({ ...s, instrucao: e.target.value }))}
                              placeholder="Instrução pro agente"
                              disabled={salvandoDiretriz}
                              rows={4}
                              style={{
                                fontSize: 11,
                                lineHeight: 1.5,
                                padding: "6px 8px",
                                borderRadius: 6,
                                background: "rgba(0,0,0,0.25)",
                                border: "1px solid rgba(255,255,255,0.10)",
                                color: "var(--txt-1)",
                                resize: "vertical",
                                fontFamily: "inherit",
                              }}
                            />
                            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                              <button
                                type="button"
                                onClick={() => void salvarEdicaoDiretriz(d.id)}
                                disabled={salvandoDiretriz}
                                style={{
                                  background: "var(--acc-1, #4caf50)",
                                  border: "none",
                                  color: "#fff",
                                  cursor: salvandoDiretriz ? "not-allowed" : "pointer",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: "4px 10px",
                                  borderRadius: 6,
                                  opacity: salvandoDiretriz ? 0.6 : 1,
                                }}
                              >
                                {salvandoDiretriz ? "Salvando…" : "Salvar"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelarEdicaoDiretriz}
                                disabled={salvandoDiretriz}
                                style={{
                                  background: "transparent",
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  color: "var(--txt-3)",
                                  cursor: salvandoDiretriz ? "not-allowed" : "pointer",
                                  fontSize: 11,
                                  padding: "4px 10px",
                                  borderRadius: 6,
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{d.titulo}</div>
                            <div
                              className="muted"
                              style={{
                                fontSize: 11,
                                lineHeight: 1.5,
                                color: "var(--txt-3)",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {d.instrucao}
                            </div>
                          </>
                        )}
                      </div>
                      {!emEdicao && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => iniciarEdicaoDiretriz(d)}
                            aria-label={`Editar ${d.titulo}`}
                            title="Editar"
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(255,255,255,0.10)",
                              color: "var(--txt-3)",
                              cursor: "pointer",
                              fontSize: 11,
                              padding: "4px 8px",
                              borderRadius: 6,
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => void removerDiretriz(d.id)}
                            aria-label={`Remover ${d.titulo}`}
                            title="Remover"
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(255,255,255,0.10)",
                              color: "var(--txt-3)",
                              cursor: "pointer",
                              fontSize: 11,
                              padding: "4px 8px",
                              borderRadius: 6,
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div
              className="muted tiny"
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px dashed rgba(255,255,255,0.06)",
                fontStyle: "italic",
              }}
            >
              Diretrizes vivem na aba <b>Treinamento</b> com tipo <span className="mono">diretriz_procedural</span>. Aqui é só um atalho.
            </div>
          </SecaoAgente>

          {/* Tarefas operacionais do cargo */}
          <SecaoAgente
            titulo={`Tarefas operacionais (${tarefasPorCargo[selecionado.id]?.length ?? 0})`}
            icone="✅"
            descricao="Checklist do que o cargo precisa cumprir num atendimento. Entra no system prompt como lembrete operacional."
            acao={
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void adicionarTarefa(selecionado.id)}
              >
                + tarefa
              </button>
            }
          >
            {!tarefasPorCargo[selecionado.id] || tarefasPorCargo[selecionado.id].length === 0 ? (
              <div className="muted small" style={{ padding: 12 }}>
                Sem tarefas. Use "+ tarefa" pra criar a primeira.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tarefasPorCargo[selecionado.id].map((tar) => (
                  <LinhaTarefa
                    key={tar.id}
                    tarefa={tar}
                    onSalvar={salvarTarefa}
                    onRemover={removerTarefa}
                  />
                ))}
              </div>
            )}
          </SecaoAgente>

          {/* Ferramentas dinâmicas do cargo */}
          <SecaoAgente
            titulo={`Ferramentas dinâmicas (${vinculadasPorCargo[selecionado.id]?.size ?? 0}/${ferramentasCatalogo.length})`}
            icone="🛠"
            descricao={
              ehGlobal
                ? 'Cargo padrão (global) é só leitura — clique em "+ Novo cargo" pra criar um cargo seu e escolher as ferramentas.'
                : "Tools HTTPS que este cargo pode chamar durante a síntese. Marca pra vincular, desmarca pra desfazer."
            }
          >
            {ferramentasCatalogo.length === 0 ? (
              <div className="muted small" style={{ padding: 12 }}>
                Nenhuma ferramenta cadastrada na plataforma ainda.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ferramentasCatalogo.map((f) => {
                  const vinc = vinculadasPorCargo[selecionado.id]?.has(f.id) ?? false;
                  return (
                    <label
                      key={f.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: vinc ? "oklch(0.7 0.18 220 / 0.08)" : "rgba(255,255,255,0.02)",
                        border: vinc
                          ? "1px solid oklch(0.7 0.18 220 / 0.30)"
                          : "1px solid rgba(255,255,255,0.05)",
                        cursor: ehGlobal ? "default" : "pointer",
                        opacity: ehGlobal ? 0.75 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={vinc}
                        disabled={ehGlobal}
                        onChange={(e) => void toggleFerramentaCargo(selecionado.id, f.id, e.target.checked)}
                        style={{ marginTop: 2 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{f.nome_tool}</span>
                          <span
                            className="tiny"
                            style={{
                              padding: "1px 6px",
                              borderRadius: 999,
                              background: "rgba(255,255,255,0.05)",
                              color: "var(--txt-3)",
                              fontSize: 9,
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                            }}
                          >
                            {f.escopo}
                          </span>
                          {f.precisa_aprovacao && (
                            <span
                              className="tiny"
                              style={{
                                padding: "1px 6px",
                                borderRadius: 999,
                                background: "oklch(0.78 0.18 80 / 0.15)",
                                color: "oklch(0.88 0.18 80)",
                                fontSize: 9,
                                textTransform: "uppercase",
                              }}
                            >
                              aprovação
                            </span>
                          )}
                        </div>
                        <div className="muted" style={{ fontSize: 11, lineHeight: 1.4 }}>
                          {f.descricao}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </SecaoAgente>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void salvarCargo()}
              disabled={salvando || ehGlobal}
            >
              {salvando ? "Salvando…" : `Salvar cargo "${selecionado.nome}"`}
            </button>
          </div>
        </div>
      )}
      {/* agenteId reservado pra Onda C2: vincular cargo↔agente via agente_cargo */}
      <span style={{ display: "none" }} aria-hidden="true">{agenteId}</span>
    </div>
  );
}

interface LinhaTarefaProps {
  tarefa: Tarefa;
  onSalvar: (t: Tarefa) => void;
  onRemover: (t: Tarefa) => void;
}

function LinhaTarefa({ tarefa, onSalvar, onRemover }: LinhaTarefaProps) {
  const [editando, setEditando] = useState(tarefa);
  useEffect(() => setEditando(tarefa), [tarefa]);
  const sujo = editando.titulo !== tarefa.titulo || editando.descricao !== tarefa.descricao;

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <input
        className="input"
        value={editando.titulo}
        onChange={(e) => setEditando((p) => ({ ...p, titulo: e.target.value }))}
        placeholder="Título da tarefa"
        style={{ fontSize: 12, fontWeight: 600 }}
      />
      <textarea
        className="input"
        value={editando.descricao}
        onChange={(e) => setEditando((p) => ({ ...p, descricao: e.target.value }))}
        rows={2}
        placeholder="O que fazer / quando aplicar (opcional)"
        style={{ fontSize: 11, lineHeight: 1.5 }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onRemover(tarefa)}
          style={{ color: "oklch(0.78 0.20 25)" }}
        >
          Remover
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!sujo}
          onClick={() => onSalvar(editando)}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ABA TREINAMENTO (placeholder informativo + contagem real)
// ============================================================================

// AbaTreinamento extraída pra ./AbaTreinamento.tsx (real, por escopo). Importada no topo.

// ============================================================================
// ABA CONHECIMENTO (count + placeholder editor)
// ============================================================================

interface AbaConhecimentoProps {
  tenantId: string;
  agenteId: string;
}

function AbaConhecimento({ tenantId, agenteId }: AbaConhecimentoProps) {
  const [count, setCount] = useState<{ tenant: number; nicho: number; global: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabase as SupabaseBruto;
        const tenantQ = await sb
          .from("blocos_conhecimento")
          .select("id", { count: "exact", head: true })
          .eq("agente_id", agenteId)
          .eq("ativo", true);
        const nichoQ = await sb
          .from("blocos_conhecimento")
          .select("id", { count: "exact", head: true })
          .eq("escopo", "nicho")
          .eq("ativo", true);
        const globalQ = await sb
          .from("blocos_conhecimento")
          .select("id", { count: "exact", head: true })
          .eq("escopo", "global")
          .eq("ativo", true);
        setCount({
          tenant: tenantQ.count ?? 0,
          nicho: nichoQ.count ?? 0,
          global: globalQ.count ?? 0,
        });
      } catch (e) {
        console.error("[AbaConhecimento] count falhou:", e);
      }
    })();
  }, [tenantId, agenteId]);

  return (
    <div style={{ padding: "18px 18px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <SecaoAgente titulo="Base de conhecimento RAG · 3 escopos" icone="📚">
        {!count ? (
          <div className="muted small" style={{ padding: 12 }}>
            Contando…
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            <CardEscopo titulo="Universal" valor={count.global} cor="oklch(0.7 0.18 220)" />
            <CardEscopo titulo="Nicho" valor={count.nicho} cor="oklch(0.65 0.22 280)" />
            <CardEscopo titulo="Usuario" valor={count.tenant} cor="oklch(0.72 0.20 145)" />
          </div>
        )}
      </SecaoAgente>
      <SecaoAgente titulo="Editor de blocos · em construção" icone="🔧">
        <div className="muted small">
          Listagem editável dos blocos de conhecimento com vínculo a produto/cargo entra na próxima onda.
          A base RAG hoje já funciona — o motor consulta os 3 escopos em cada turno e rerank Cohere v3.5 pondera relevância.
        </div>
      </SecaoAgente>
    </div>
  );
}

function CardEscopo({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: `${cor}/0.08`,
        border: `1px solid ${cor}/30`,
      }}
    >
      <div
        className="tiny"
        style={{
          color: cor,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {titulo}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--txt-1)" }}>{valor}</div>
      <div className="muted tiny">blocos RAG ativos</div>
    </div>
  );
}

// ============================================================================
// ABA WHATSAPP (placeholder)
// ============================================================================

function AbaWhatsapp() {
  return (
    <div style={{ padding: "18px 18px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <SecaoAgente titulo="Conexão Z-API" icone="💬">
        <div className="muted small">
          Gestão de instâncias Z-API (token, instance ID, status, QR code) entra na próxima onda.
          A conexão real é configurada em Configurações → WhatsApp.
        </div>
      </SecaoAgente>
    </div>
  );
}

// ============================================================================
// Componentes auxiliares
// ============================================================================

interface SecaoProps {
  titulo: string;
  icone?: string;
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}

function SecaoAgente({ titulo, icone, descricao, acao, children }: SecaoProps) {
  return (
    <section
      aria-label={titulo}
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: "14px 16px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: descricao ? 4 : 12,
        }}
      >
        {icone && <span aria-hidden="true">{icone}</span>}
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--txt-2)",
            flex: 1,
          }}
        >
          {titulo}
        </h3>
        {acao}
      </div>
      {descricao && (
        <div className="muted tiny" style={{ marginBottom: 10 }}>
          {descricao}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
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

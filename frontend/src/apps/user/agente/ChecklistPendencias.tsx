/**
 * Checklist de pendências da configuração (2026-09-18).
 *
 * Lista o que ainda falta preencher na empresa (`public.empresas` + nicho em
 * `profiles`) e na identidade do agente (`agentes.nome_agente`, `tom_agente`,
 * `identidade.cargo/personalidade`). Cada item tem o próprio campo: ao salvar,
 * grava no lugar de origem — o mesmo que o app Empresa e a aba Identidade usam —
 * e some da lista. Com tudo preenchido o card desaparece.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSincronizarBlocos } from "@/hooks/use-sincronizar-blocos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info?: (m: string) => void;
}

function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

/** Recorte do AgenteRow do AgenteApp que o checklist lê e grava. */
export interface AgenteChecklist {
  id: string;
  delegado: boolean;
  nome_agente: string;
  cargo: string;
  personalidade: string;
  tom_agente: string;
  identidadeRaw: Record<string, unknown>;
}

type CampoEmpresa =
  | "nome"
  | "descricao"
  | "cidade"
  | "estado"
  | "whatsapp"
  | "site"
  | "endereco"
  | "missao"
  | "valores";
type CampoAgente = "nome_agente" | "cargo" | "tom_agente" | "personalidade";

type Item =
  | { tipo: "empresa"; campo: CampoEmpresa; rotulo: string; placeholder: string; longo?: boolean }
  | { tipo: "nicho"; rotulo: string }
  | { tipo: "agente"; campo: CampoAgente; rotulo: string; placeholder: string; longo?: boolean };

type EmpresaDados = Record<CampoEmpresa | "instagram" | "tipo_presenca", string>;

const ITENS_AGENTE: Extract<Item, { tipo: "agente" }>[] = [
  { tipo: "agente", campo: "nome_agente", rotulo: "Nome do agente", placeholder: "ex: Bel" },
  {
    tipo: "agente",
    campo: "cargo",
    rotulo: "Cargo / título do agente",
    placeholder: "ex: consultora de crédito",
  },
  {
    tipo: "agente",
    campo: "tom_agente",
    rotulo: "Tom de voz",
    placeholder: "profissional, caloroso e direto",
  },
  {
    tipo: "agente",
    campo: "personalidade",
    rotulo: "Personalidade do agente",
    placeholder: "1-3 frases sobre o jeito dele",
    longo: true,
  },
];

/** Monta a lista do que falta, na ordem em que vale a pena preencher. */
function montarPendencias(
  empresa: EmpresaDados | null,
  nichoId: string,
  agente: AgenteChecklist,
): Item[] {
  const vazio = (v: string | undefined) => !v || !v.trim();
  const itens: Item[] = [];

  // Agente delegado: a empresa é de outra conta — só a identidade entra.
  if (!agente.delegado) {
    const e = empresa;
    const falta = (c: CampoEmpresa) => vazio(e?.[c]);
    if (falta("nome"))
      itens.push({
        tipo: "empresa",
        campo: "nome",
        rotulo: "Nome da empresa",
        placeholder: "ex: Excellence Consultoria",
      });
    if (falta("descricao"))
      itens.push({
        tipo: "empresa",
        campo: "descricao",
        rotulo: "O que a empresa faz",
        placeholder: "Descreva em 1-2 frases.",
        longo: true,
      });
    if (!nichoId) itens.push({ tipo: "nicho", rotulo: "Nicho de atuação" });
    if (falta("whatsapp"))
      itens.push({
        tipo: "empresa",
        campo: "whatsapp",
        rotulo: "WhatsApp da empresa",
        placeholder: "(11) 99999-9999",
      });
    if (falta("cidade"))
      itens.push({
        tipo: "empresa",
        campo: "cidade",
        rotulo: "Cidade",
        placeholder: "ex: São Paulo",
      });
    if (falta("estado"))
      itens.push({ tipo: "empresa", campo: "estado", rotulo: "Estado (UF)", placeholder: "SP" });
    // Endereço só pede quando a empresa atende presencialmente.
    if ((e?.tipo_presenca ?? "digital") !== "digital" && falta("endereco")) {
      itens.push({
        tipo: "empresa",
        campo: "endereco",
        rotulo: "Endereço",
        placeholder: "Rua, número",
      });
    }
    // Presença online: basta um dos dois (site ou Instagram).
    if (falta("site") && vazio(e?.instagram)) {
      itens.push({
        tipo: "empresa",
        campo: "site",
        rotulo: "Site da empresa",
        placeholder: "https://… (ou preencha o Instagram no app Empresa)",
      });
    }
    if (falta("missao"))
      itens.push({
        tipo: "empresa",
        campo: "missao",
        rotulo: "Missão",
        placeholder: "Por que a empresa existe?",
        longo: true,
      });
    if (falta("valores"))
      itens.push({
        tipo: "empresa",
        campo: "valores",
        rotulo: "Valores",
        placeholder: "ex: transparência, agilidade…",
        longo: true,
      });
  }

  for (const it of ITENS_AGENTE) {
    if (vazio(agente[it.campo])) itens.push(it);
  }
  return itens;
}

function chaveItem(it: Item): string {
  return it.tipo === "nicho" ? "nicho" : `${it.tipo}:${it.campo}`;
}

interface Props {
  agente: AgenteChecklist;
  /** Devolve o agente com o campo gravado — o AgenteApp atualiza cabeçalho e aba Identidade. */
  onAgenteAtualizado: (patch: Partial<AgenteChecklist>) => void;
}

export function ChecklistPendencias({ agente, onAgenteAtualizado }: Props) {
  const t = pegarToast();
  const [uid, setUid] = useState<string | null>(null);
  const { sync } = useSincronizarBlocos(uid);
  const [carregando, setCarregando] = useState(true);
  const [empresa, setEmpresa] = useState<EmpresaDados | null>(null);
  const [nichoId, setNichoId] = useState("");
  const [nichos, setNichos] = useState<{ id: string; nome: string }[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvandoChave, setSalvandoChave] = useState<string | null>(null);
  const [aberto, setAberto] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const { data: u } = await supabase.auth.getSession();
      const id = u?.session?.user?.id;
      if (!id) return;
      setUid(id);
      const sb = supabase as SupabaseBruto;
      const [{ data: emp }, { data: perfil }, { data: listaNichos }] = await Promise.all([
        sb
          .from("empresas")
          .select(
            "nome, descricao, cidade, estado, whatsapp, site, instagram, endereco, missao, valores, tipo_presenca",
          )
          .eq("user_id", id)
          .maybeSingle(),
        sb.from("profiles").select("nicho_id").eq("id", id).maybeSingle(),
        sb.from("nichos").select("id, nome_exibicao").eq("ativo", true).order("nome_exibicao"),
      ]);
      if (emp) {
        const d = emp as Record<string, unknown>;
        const s = (k: string) => (d[k] == null ? "" : String(d[k]));
        setEmpresa({
          nome: s("nome"),
          descricao: s("descricao"),
          cidade: s("cidade"),
          estado: s("estado"),
          whatsapp: s("whatsapp"),
          site: s("site"),
          instagram: s("instagram"),
          endereco: s("endereco"),
          missao: s("missao"),
          valores: s("valores"),
          tipo_presenca: s("tipo_presenca") || "digital",
        });
      }
      setNichoId(perfil?.nicho_id ? String(perfil.nicho_id) : "");
      setNichos(
        ((listaNichos ?? []) as Record<string, unknown>[]).map((n) => ({
          id: String(n.id),
          nome: String(n.nome_exibicao ?? ""),
        })),
      );
    } catch (e) {
      console.error("[ChecklistPendencias] carregar falhou:", e);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvarEmpresa(campo: CampoEmpresa, valor: string) {
    const sb = supabase as SupabaseBruto;
    // Upsert parcial por user_id: grava só este campo; se a empresa ainda não
    // existe, a linha nasce com os defaults da tabela (nome '' etc.).
    const { error } = await sb
      .from("empresas")
      .upsert({ user_id: uid, [campo]: valor }, { onConflict: "user_id" });
    if (error) throw error;
    setEmpresa((p) => ({
      ...(p ?? {
        nome: "",
        descricao: "",
        cidade: "",
        estado: "",
        whatsapp: "",
        site: "",
        instagram: "",
        endereco: "",
        missao: "",
        valores: "",
        tipo_presenca: "digital",
      }),
      [campo]: valor,
    }));
    void sync(); // regenera o RAG do agente com a empresa atualizada
  }

  async function salvarNicho(valor: string) {
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.from("profiles").update({ nicho_id: valor }).eq("id", uid);
    if (error) throw error;
    setNichoId(valor);
    void sync();
  }

  async function salvarAgente(campo: CampoAgente, valor: string) {
    const sb = supabase as SupabaseBruto;
    let patch: Record<string, unknown>;
    let novaIdentidade = agente.identidadeRaw;
    if (campo === "cargo" || campo === "personalidade") {
      // Mesmo merge da aba Identidade: relê o JSONB fresco antes de escrever
      // pra não apagar chaves gravadas em paralelo (recall/motor).
      const { data: atual } = await sb
        .from("agentes")
        .select("identidade")
        .eq("id", agente.id)
        .maybeSingle();
      const base = (atual?.identidade as Record<string, unknown> | null) ?? agente.identidadeRaw;
      novaIdentidade = {
        ...base,
        [campo]: valor,
        ...(campo === "personalidade" ? { persona: valor } : {}),
      };
      patch = { identidade: novaIdentidade };
    } else {
      patch = { [campo]: valor };
    }
    const { data, error } = await sb.from("agentes").update(patch).eq("id", agente.id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("só a conta dona do agente pode editar a identidade");
    }
    onAgenteAtualizado({ [campo]: valor, identidadeRaw: novaIdentidade });
  }

  async function salvar(it: Item) {
    const chave = chaveItem(it);
    let valor = (valores[chave] ?? "").trim();
    if (it.tipo === "empresa" && it.campo === "estado") valor = valor.toUpperCase();
    if (!valor) {
      t.error("Preencha antes de salvar.");
      return;
    }
    setSalvandoChave(chave);
    try {
      if (it.tipo === "empresa") await salvarEmpresa(it.campo, valor);
      else if (it.tipo === "nicho") await salvarNicho(valor);
      else await salvarAgente(it.campo, valor);
      setValores((p) => {
        const { [chave]: _, ...resto } = p;
        return resto;
      });
      t.success(`${it.rotulo} salvo`);
    } catch (e) {
      t.error(`Falha: ${(e as Error).message}`);
    } finally {
      setSalvandoChave(null);
    }
  }

  if (carregando) return null;

  const pendencias = montarPendencias(empresa, nichoId, agente);
  if (pendencias.length === 0) return null;

  const total = pendencias.length + contarPreenchidos(empresa, nichoId, agente);
  const feitos = total - pendencias.length;
  const pct = Math.round((feitos / total) * 100);

  return (
    <section
      aria-label="Falta completar"
      style={{
        background: "oklch(0.75 0.12 80 / 0.06)",
        border: "1px solid oklch(0.75 0.12 80 / 0.30)",
        borderRadius: 12,
        padding: "12px 16px",
      }}
    >
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--txt-1)",
          textAlign: "left",
        }}
      >
        <span aria-hidden="true">📝</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "var(--txt-2)" }}>
          Falta completar · {pendencias.length} {pendencias.length === 1 ? "item" : "itens"}
        </span>
        <span className="muted tiny" style={{ fontSize: 11, color: "var(--txt-3)" }}>
          {pct}% configurado
        </span>
        <span aria-hidden="true" style={{ fontSize: 10, color: "var(--txt-3)" }}>
          {aberto ? "▲" : "▼"}
        </span>
      </button>
      <div
        style={{
          height: 4,
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          marginTop: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, oklch(0.75 0.12 80), oklch(0.7 0.18 140))",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {aberto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {pendencias.map((it) => {
            const chave = chaveItem(it);
            const salvandoEste = salvandoChave === chave;
            const valor = valores[chave] ?? "";
            const mudar = (v: string) => setValores((p) => ({ ...p, [chave]: v }));
            const grupo = it.tipo === "agente" ? "Agente" : "Empresa";
            return (
              <div
                key={chave}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(150px, 190px) 1fr auto",
                  gap: 8,
                  alignItems: "start",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{it.rotulo}</span>
                  <span
                    className="muted tiny"
                    style={{
                      fontSize: 10,
                      color: "var(--txt-3)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {grupo}
                  </span>
                </div>
                {it.tipo === "nicho" ? (
                  <select
                    className="input"
                    value={valor}
                    onChange={(e) => mudar(e.target.value)}
                    disabled={salvandoEste}
                  >
                    <option value="">Escolha o nicho…</option>
                    {nichos.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.nome}
                      </option>
                    ))}
                  </select>
                ) : it.longo ? (
                  <textarea
                    className="input"
                    rows={2}
                    value={valor}
                    onChange={(e) => mudar(e.target.value)}
                    placeholder={it.placeholder}
                    disabled={salvandoEste}
                  />
                ) : (
                  <input
                    className="input"
                    value={valor}
                    onChange={(e) => mudar(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void salvar(it);
                    }}
                    placeholder={it.placeholder}
                    maxLength={it.tipo === "empresa" && it.campo === "estado" ? 2 : undefined}
                    disabled={salvandoEste}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void salvar(it)}
                  disabled={salvandoEste || !valor.trim()}
                >
                  {salvandoEste ? "Salvando…" : "Salvar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Quantos itens do checklist já estão preenchidos — pra barra de progresso. */
function contarPreenchidos(
  empresa: EmpresaDados | null,
  nichoId: string,
  agente: AgenteChecklist,
): number {
  // Conta montando a lista com tudo vazio e subtraindo o que ainda falta.
  const vazia: EmpresaDados = {
    nome: "",
    descricao: "",
    cidade: "",
    estado: "",
    whatsapp: "",
    site: "",
    instagram: "",
    endereco: "",
    missao: "",
    valores: "",
    tipo_presenca: empresa?.tipo_presenca ?? "digital",
  };
  const agenteVazio: AgenteChecklist = {
    ...agente,
    nome_agente: "",
    cargo: "",
    personalidade: "",
    tom_agente: "",
  };
  return (
    montarPendencias(vazia, "", agenteVazio).length -
    montarPendencias(empresa, nichoId, agente).length
  );
}

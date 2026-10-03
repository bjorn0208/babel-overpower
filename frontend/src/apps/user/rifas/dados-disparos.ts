/**
 * Camada de dados — agendamentos de disparo + envios ao vivo.
 * Tabelas `rifa_agendamentos_disparo` e `rifa_disparo_envios` (RLS por tenant).
 * A edge `processar-disparos-rifa` (pg_cron a cada 5 min) executa os
 * agendamentos ativos; `reenviar-disparo-rifa` reenvia 1 tentativa falhada.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bruto = any;

async function sbCliente(): Promise<Bruto> {
  return (
    (window as { supabaseClient?: Bruto }).supabaseClient ||
    (await import("@/integrations/supabase/client")).supabase
  );
}

async function uidAtual(sb: Bruto): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data?.session?.user?.id ?? null;
}

export type TipoConteudoDisparo = "foto" | "texto" | "video" | "foto_texto";

export interface AgendamentoDisparo {
  id: string;
  rifa_id: string;
  horario: string; // "HH:MM:SS"
  tipo_conteudo: TipoConteudoDisparo;
  mensagem: string | null;
  ativo: boolean;
  tempo_descanso_segundos: number;
  /** Mídia escolhida pelo dono (foto/vídeo de verdade) — vazio = usa a
   * cartela auto-gerada como fallback (só pra foto/foto_texto; vídeo exige). */
  midia_url: string | null;
  /** Jitter anti-ban: espera aleatória entre min/max segundos a cada envio. */
  descanso_min_segundos: number;
  descanso_max_segundos: number;
  /** Corta o disparo ao atingir esse total no dia — null = sem limite. */
  limite_diario: number | null;
  /** Só dispara dentro dessa janela (BRT) — null = sem restrição de horário. */
  janela_inicio: string | null;
  janela_fim: string | null;
  contatos_ids: string[] | null;
  ultima_execucao_dia: string | null;
  criado_em: string;
  /** Última edição de conteúdo. É contra ela que o teste é validado. */
  atualizado_em: string | null;
  /** Quando o disparo foi testado com sucesso no número do dono. */
  teste_em: string | null;
  /** Número que recebeu o teste. */
  teste_phone: string | null;
}

const CAMPOS_AGENDAMENTO =
  "id, rifa_id, horario, tipo_conteudo, mensagem, ativo, tempo_descanso_segundos, midia_url, " +
  "descanso_min_segundos, descanso_max_segundos, limite_diario, janela_inicio, janela_fim, " +
  "contatos_ids, ultima_execucao_dia, criado_em, atualizado_em, teste_em, teste_phone";

/**
 * Estágio em que o disparo está.
 *  - `sem_teste`  → nunca testou. Só o botão de teste aparece.
 *  - `vencido`    → testou, mas editou depois. Volta pro estágio 1.
 *  - `liberado`   → teste válido. O botão de disparo real aparece.
 */
export type EstagioDisparo = "sem_teste" | "vencido" | "liberado";

export function estagioDoAgendamento(a: AgendamentoDisparo): EstagioDisparo {
  if (!a.teste_em) return "sem_teste";
  if (!a.atualizado_em) return "liberado";
  return new Date(a.teste_em).getTime() >= new Date(a.atualizado_em).getTime()
    ? "liberado"
    : "vencido";
}

export interface EnvioDisparo {
  id: string;
  agendamento_id: string | null;
  lista_disparo_id: string | null;
  phone: string;
  status: "sucesso" | "erro";
  mensagem_enviada: string | null;
  erro_detalhe: string | null;
  criado_em: string;
}

export interface ContatoDisparo {
  id: string;
  nome: string | null;
  phone: string;
  marcado: boolean;
}

export async function listarAgendamentos(rifaId: string): Promise<AgendamentoDisparo[]> {
  const sb = await sbCliente();
  const { data, error } = await sb
    .from("rifa_agendamentos_disparo")
    .select(CAMPOS_AGENDAMENTO)
    .eq("rifa_id", rifaId)
    .order("horario", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AgendamentoDisparo[];
}

export interface CargaAgendamento {
  rifaId: string;
  horario: string;
  tipoConteudo: TipoConteudoDisparo;
  mensagem: string;
  tempoDescansoSegundos: number;
  midiaUrl: string | null;
  descansoMinSegundos: number;
  descansoMaxSegundos: number;
  limiteDiario: number | null;
  janelaInicio: string | null;
  janelaFim: string | null;
  contatosIds: string[] | null;
  ativo: boolean;
}

export async function criarAgendamento(c: CargaAgendamento): Promise<AgendamentoDisparo> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) throw new Error("Sessão expirada — recarregue a página.");
  const { data, error } = await sb
    .from("rifa_agendamentos_disparo")
    .insert({
      tenant_id: uid,
      rifa_id: c.rifaId,
      horario: c.horario,
      tipo_conteudo: c.tipoConteudo,
      mensagem: c.mensagem.trim() || null,
      tempo_descanso_segundos: c.tempoDescansoSegundos,
      midia_url: c.midiaUrl,
      descanso_min_segundos: c.descansoMinSegundos,
      descanso_max_segundos: c.descansoMaxSegundos,
      limite_diario: c.limiteDiario,
      janela_inicio: c.janelaInicio,
      janela_fim: c.janelaFim,
      contatos_ids: c.contatosIds,
      ativo: c.ativo,
    })
    .select(CAMPOS_AGENDAMENTO)
    .single();
  if (error) throw error;
  return data as AgendamentoDisparo;
}

export async function atualizarAgendamento(
  id: string,
  patch: Partial<CargaAgendamento>,
): Promise<void> {
  const sb = await sbCliente();
  const corpo: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (patch.horario !== undefined) corpo.horario = patch.horario;
  if (patch.tipoConteudo !== undefined) corpo.tipo_conteudo = patch.tipoConteudo;
  if (patch.mensagem !== undefined) corpo.mensagem = patch.mensagem.trim() || null;
  if (patch.tempoDescansoSegundos !== undefined)
    corpo.tempo_descanso_segundos = patch.tempoDescansoSegundos;
  if (patch.midiaUrl !== undefined) corpo.midia_url = patch.midiaUrl;
  if (patch.descansoMinSegundos !== undefined) corpo.descanso_min_segundos = patch.descansoMinSegundos;
  if (patch.descansoMaxSegundos !== undefined) corpo.descanso_max_segundos = patch.descansoMaxSegundos;
  if (patch.limiteDiario !== undefined) corpo.limite_diario = patch.limiteDiario;
  if (patch.janelaInicio !== undefined) corpo.janela_inicio = patch.janelaInicio;
  if (patch.janelaFim !== undefined) corpo.janela_fim = patch.janelaFim;
  if (patch.contatosIds !== undefined) corpo.contatos_ids = patch.contatosIds;
  if (patch.ativo !== undefined) corpo.ativo = patch.ativo;
  const { error } = await sb.from("rifa_agendamentos_disparo").update(corpo).eq("id", id);
  if (error) throw error;
}

/** Upload de mídia (imagem/vídeo) pro disparo — mesmo bucket já usado pelo
 * Mentor de Disparo (`disparos_lead`), RLS por pasta `tenant_id`. */
export async function subirMidiaDisparo(file: File): Promise<string> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) throw new Error("Sessão expirada — recarregue a página.");
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${uid}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from("disparo-lead-midias").upload(path, file, { upsert: false });
  if (error) throw error;
  return sb.storage.from("disparo-lead-midias").getPublicUrl(path).data.publicUrl as string;
}

export async function toggleAtivoAgendamento(id: string, ativo: boolean): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb
    .from("rifa_agendamentos_disparo")
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function excluirAgendamento(id: string): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb.from("rifa_agendamentos_disparo").delete().eq("id", id);
  if (error) throw error;
}

/** Contatos da lista de disparo pro modal de pré-visualização (marcar/desmarcar). */
export async function listarContatosDisparo(): Promise<ContatoDisparo[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) return [];
  const { data, error } = await sb
    .from("rifa_lista_disparo")
    .select("id, nome, phone, marcado")
    .eq("tenant_id", uid)
    .order("nome", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as ContatoDisparo[];
}

/**
 * Puxa os contatos que já estão na Base (tabela `leads`) pra dentro da esteira.
 * Antes disso a esteira só nascia de upload de CSV — quem já tinha os contatos
 * no sistema precisava exportar e reimportar.
 *
 * `marcado` entra como `false` de propósito: chegar na esteira e já estar
 * marcado pra receber seria o oposto de "eu seleciono e mando pra esteira".
 * Telefone repetido é ignorado — a esteira é por número, não por pessoa.
 */
export async function importarContatosDaBase(
  filtro?: { tag?: string },
): Promise<{ inseridos: number; jaExistiam: number }> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) throw new Error("Sessão expirada — recarregue a página.");

  let q = sb
    .from("leads")
    .select("name, nome_exibicao, phone")
    .eq("tenant_id", uid)
    .is("deleted_at", null)
    .not("phone", "is", null);
  if (filtro?.tag) q = q.contains("tags", [filtro.tag]);
  const { data: leads, error } = await q;
  if (error) throw error;

  const { data: jaNaLista } = await sb
    .from("rifa_lista_disparo")
    .select("phone")
    .eq("tenant_id", uid);
  const existentes = new Set(
    ((jaNaLista ?? []) as Array<{ phone: string }>).map((l) => String(l.phone ?? "").replace(/\D/g, "")),
  );

  const novos: Array<{ tenant_id: string; nome: string | null; phone: string; origem: string; marcado: boolean }> = [];
  let jaExistiam = 0;
  for (const l of (leads ?? []) as Array<{ name?: string; nome_exibicao?: string; phone?: string }>) {
    const fone = String(l.phone ?? "").replace(/\D/g, "");
    // Lead de chat-teste tem "phone" que não é telefone — fora.
    if (fone.length < 10 || fone.length > 13) continue;
    if (existentes.has(fone)) {
      jaExistiam++;
      continue;
    }
    existentes.add(fone);
    novos.push({
      tenant_id: uid,
      nome: (l.nome_exibicao || l.name || "").trim() || null,
      phone: fone,
      origem: "base",
      marcado: false,
    });
  }

  if (novos.length > 0) {
    const { error: erroInsert } = await sb.from("rifa_lista_disparo").insert(novos);
    if (erroInsert) throw erroInsert;
  }
  return { inseridos: novos.length, jaExistiam };
}

/** Marca ou desmarca vários contatos de uma vez — "mandar pra esteira". */
export async function marcarContatos(ids: string[], marcado: boolean): Promise<void> {
  if (ids.length === 0) return;
  const sb = await sbCliente();
  const { error } = await sb.from("rifa_lista_disparo").update({ marcado }).in("id", ids);
  if (error) throw error;
}

/** Última cartela gerada pelo cron-status-rifa (atualizada de hora em hora). */
export async function obterImagemAtual(rifaId: string): Promise<string | null> {
  const sb = await sbCliente();
  const { data, error } = await sb
    .from("rifa_imagens")
    .select("url")
    .eq("rifa_id", rifaId)
    .eq("tipo", "cartela")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.url ?? null;
}

export async function listarEnviosAoVivo(rifaId: string, limite = 100): Promise<EnvioDisparo[]> {
  const sb = await sbCliente();
  const { data, error } = await sb
    .from("rifa_disparo_envios")
    .select(
      "id, agendamento_id, lista_disparo_id, phone, status, mensagem_enviada, erro_detalhe, criado_em",
    )
    .eq("rifa_id", rifaId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as EnvioDisparo[];
}

export interface PendenteFila {
  id: string;
  nome: string | null;
  phone: string;
}

/**
 * Quem está marcado na esteira e ainda NÃO recebeu nada desta rifa hoje.
 * É a "fila" que a página mostra durante o disparo — sem isso o dono só vê
 * quem já recebeu e não faz ideia de quanto falta.
 */
export async function listarFilaPendente(rifaId: string): Promise<PendenteFila[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) return [];

  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  const [marcados, enviosHoje] = await Promise.all([
    sb
      .from("rifa_lista_disparo")
      .select("id, nome, phone")
      .eq("tenant_id", uid)
      .eq("marcado", true)
      .order("nome", { ascending: true, nullsFirst: false }),
    sb
      .from("rifa_disparo_envios")
      .select("phone")
      .eq("rifa_id", rifaId)
      .gte("criado_em", inicioDoDia.toISOString()),
  ]);

  const jaReceberam = new Set(
    ((enviosHoje.data ?? []) as Array<{ phone: string }>).map((e) =>
      String(e.phone ?? "").replace(/\D/g, ""),
    ),
  );
  return ((marcados.data ?? []) as PendenteFila[]).filter(
    (c) => !jaReceberam.has(String(c.phone ?? "").replace(/\D/g, "")),
  );
}

export async function reenviarEnvio(envioId: string): Promise<{ ok: boolean; erro?: string }> {
  const sb = await sbCliente();
  const { data: ses } = await sb.auth.getSession();
  const token = ses?.session?.access_token;
  if (!token) return { ok: false, erro: "Sessão expirada." };
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reenviar-disparo-rifa`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ envio_id: envioId }),
      },
    );
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok || !corpo?.ok) return { ok: false, erro: corpo?.erro ?? `status ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export interface ResultadoDisparo {
  ok: boolean;
  erro?: string;
  enviados?: number;
  falharam?: number;
  pausado?: boolean;
}

/**
 * Invoca a edge de disparo agora.
 *  - `modo: "teste"` → estágio 1: manda pro número do dono e só.
 *  - `modo: "real"`  → estágio 2: manda pra esteira. A edge devolve 409
 *    `teste_pendente` se não houver teste válido.
 */
async function invocarDisparo(
  agendamentoId: string,
  modo: "teste" | "real",
): Promise<ResultadoDisparo> {
  const sb = await sbCliente();
  const { data: ses } = await sb.auth.getSession();
  const token = ses?.session?.access_token;
  if (!token) return { ok: false, erro: "Sessão expirada." };
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/processar-disparos-rifa`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agendamento_id: agendamentoId, modo }),
      },
    );
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok || !corpo?.ok) {
      // A edge manda `detalhe` em linguagem de gente pros casos previstos
      // (teste pendente, sem telefone de teste). Prefere ele ao código seco.
      return { ok: false, erro: corpo?.detalhe ?? corpo?.erro ?? `status ${res.status}` };
    }
    return {
      ok: true,
      enviados: corpo.enviados,
      falharam: corpo.falharam,
      pausado: corpo.pausado === true,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Estágio 1 — dispara só no número do dono, pra ele conferir o material. */
export function testarAgendamentoAgora(agendamentoId: string): Promise<ResultadoDisparo> {
  return invocarDisparo(agendamentoId, "teste");
}

/** Estágio 2 — dispara pra esteira. Só passa com teste válido. */
export function dispararAgora(agendamentoId: string): Promise<ResultadoDisparo> {
  return invocarDisparo(agendamentoId, "real");
}

export interface ConfigDisparoTenant {
  pausados: boolean;
  pausadosEm: string | null;
  telefoneTeste: string | null;
  /** WhatsApp conectado do tenant — é o alvo do teste quando não há override. */
  telefoneCanal: string | null;
}

/** Config de disparo do tenant + o número do canal, pra UI dizer pra ONDE o
 *  teste vai antes da pessoa apertar. */
export async function lerConfigDisparo(): Promise<ConfigDisparoTenant> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const vazio: ConfigDisparoTenant = {
    pausados: false,
    pausadosEm: null,
    telefoneTeste: null,
    telefoneCanal: null,
  };
  if (!uid) return vazio;

  const [cfg, canal] = await Promise.all([
    sb
      .from("rifas_config_tenant")
      .select("disparos_pausados, disparos_pausados_em, disparos_telefone_teste")
      .eq("tenant_id", uid)
      .maybeSingle(),
    sb
      .from("canais")
      .select("whatsapp_phone")
      .eq("user_id", uid)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    pausados: cfg.data?.disparos_pausados === true,
    pausadosEm: cfg.data?.disparos_pausados_em ?? null,
    telefoneTeste: cfg.data?.disparos_telefone_teste ?? null,
    telefoneCanal: canal.data?.whatsapp_phone ?? null,
  };
}

/** Freio de mão. `upsert` porque tenant sem linha de config ainda precisa
 *  conseguir pausar — é justamente quem nunca configurou nada. */
export async function definirPausaDisparos(pausados: boolean): Promise<void> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) throw new Error("Sessão expirada — recarregue a página.");
  const { error } = await sb.from("rifas_config_tenant").upsert(
    {
      tenant_id: uid,
      disparos_pausados: pausados,
      disparos_pausados_em: pausados ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw error;
}

/** Número que vai receber os testes. Vazio volta pro WhatsApp do canal. */
export async function definirTelefoneTeste(telefone: string): Promise<void> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) throw new Error("Sessão expirada — recarregue a página.");
  const limpo = telefone.replace(/\D/g, "");
  const { error } = await sb.from("rifas_config_tenant").upsert(
    {
      tenant_id: uid,
      disparos_telefone_teste: limpo.length >= 10 ? limpo : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw error;
}

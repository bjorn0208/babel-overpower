import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SignJWT } from "npm:jose@5";
import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

// sala-reuniao — porteiro do app Reunião (motor LiveKit na VPS PABX).
//
// Deployada com --no-verify-jwt: convidado entra pelo link /sala/<chave> sem
// login, então o JWT (quando vem) é validado aqui dentro, na mão.
//
// Ações (POST { acao }):
//  - "token" (default): valida a sala pela chave_publica e emite o token de
//    acesso ao LiveKit. Sala do BABEL OS vira "os-<sala_id>" no servidor —
//    não mistura com as salas do PABX (mesma VPS, músculo único).
//  - "ocupacao": números ao vivo do servidor inteiro (todas as salas, PABX
//    incluso) + config de capacidade. Só platform_admin.

type SalaLiveKit = { name?: string; num_participants?: number; numParticipants?: number };

function urlHttpLiveKit(): string {
  // LIVEKIT_URL chega wss:// (uso do navegador); a API administrativa é https://.
  return (Deno.env.get("LIVEKIT_URL") ?? "")
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:");
}

async function assinarTokenLiveKit(
  grants: Record<string, unknown>,
  opts: { sub: string; nome?: string; validade: string },
): Promise<string> {
  const chaveApi = Deno.env.get("LIVEKIT_API_KEY");
  const segredoBruto = Deno.env.get("LIVEKIT_API_SECRET");
  if (!chaveApi || !segredoBruto) throw new Error("segredos do LiveKit ausentes no env");
  const segredo = new TextEncoder().encode(segredoBruto);
  const jwt = new SignJWT({ video: grants, ...(opts.nome ? { name: opts.nome } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(chaveApi)
    .setSubject(opts.sub)
    .setIssuedAt()
    .setNotBefore("0s")
    .setExpirationTime(opts.validade);
  return await jwt.sign(segredo);
}

/** Salas vivas no servidor LiveKit inteiro (BABEL OS + PABX). */
async function listarSalasLiveKit(): Promise<Array<{ nome: string; participantes: number }>> {
  const jwt = await assinarTokenLiveKit({ roomList: true }, { sub: "edge-sala-reuniao", validade: "2m" });
  const resp = await fetch(`${urlHttpLiveKit()}/twirp/livekit.RoomService/ListRooms`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!resp.ok) throw new Error(`ListRooms respondeu ${resp.status}`);
  const dados = await resp.json();
  const salas: SalaLiveKit[] = dados?.rooms ?? [];
  return salas.map((s) => ({
    nome: s.name ?? "?",
    // twirp pode serializar snake_case ou camelCase conforme a versão — aceita os dois.
    participantes: Number(s.num_participants ?? s.numParticipants ?? 0),
  }));
}

async function acaoOcupacao(req: Request): Promise<Response> {
  const supabase = criarClienteAdmin();
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonRes({ erro: "não autenticado" }, 401);
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return jsonRes({ erro: "não autenticado" }, 401);

  const { data: perfil } = await supabase
    .from("profiles").select("system_role").eq("id", user.id).single();
  if (perfil?.system_role !== "platform_admin") return jsonRes({ erro: "sem permissão" }, 403);

  const [salas, { data: config }] = await Promise.all([
    listarSalasLiveKit(),
    supabase
      .from("config_plataforma")
      .select("reuniao_limite_participantes, reuniao_aviso_ativo, reuniao_aviso_limiar")
      .limit(1).single(),
  ]);
  const total = salas.reduce((soma, s) => soma + s.participantes, 0);
  return jsonRes({
    total,
    salas,
    teto_por_sala: config?.reuniao_limite_participantes ?? 10,
    aviso_ativo: config?.reuniao_aviso_ativo ?? false,
    aviso_limiar: config?.reuniao_aviso_limiar ?? 40,
  });
}

async function acaoToken(req: Request, corpo: Record<string, unknown>): Promise<Response> {
  const chave = String(corpo.chave ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) {
    return jsonRes({ erro: "sala inválida" }, 400);
  }

  const supabase = criarClienteAdmin();
  const { data: sala } = await supabase
    .from("salas_reuniao")
    .select("id, titulo, status, max_participantes, tenant_id")
    .eq("chave_publica", chave)
    .is("deleted_at", null)
    .maybeSingle();
  if (!sala) return jsonRes({ erro: "sala não encontrada" }, 404);
  if (sala.status === "encerrada" || sala.status === "cancelada") {
    return jsonRes({ erro: "sala encerrada" }, 410);
  }

  // Logado usa o nome do perfil; sem login é convidado (precisa mandar nome).
  // Anfitrião = dono da sala (ou equipe do dono), resolvido SERVER-SIDE — nunca
  // do presence auto-declarado (auditoria 2026-08-31). Só ele recebe roomAdmin
  // no LiveKit (poder real de silenciar/encerrar) e o flag is_host confiável.
  let identidadeNome = "";
  let ehAnfitriao = false;
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (jwt) {
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (user) {
      const { data: perfil } = await supabase
        .from("profiles").select("full_name, is_active, parent_user_id").eq("id", user.id).maybeSingle();
      if (perfil?.is_active) identidadeNome = perfil.full_name ?? "Membro";
      ehAnfitriao = user.id === sala.tenant_id ||
        (perfil?.parent_user_id != null && perfil.parent_user_id === sala.tenant_id);
    }
  }
  if (!identidadeNome) {
    const nomeLimpo = String(corpo.nome ?? "").trim().slice(0, 40);
    if (nomeLimpo.length < 2) return jsonRes({ erro: "informe seu nome" }, 400);
    identidadeNome = `${nomeLimpo} (convidado)`;
  }

  // peerId do app vira a identidade no LiveKit — casa 1:1 com o presence do Realtime.
  const peerId = String(corpo.peerId ?? "").trim().slice(0, 60) ||
    crypto.randomUUID();

  // Aviso de lotação: soma de participantes do servidor inteiro ≥ limiar.
  // Consulta falhou = segue sem aviso (aviso nunca pode derrubar a entrada).
  let aviso: { total: number; limiar: number } | null = null;
  const { data: config } = await supabase
    .from("config_plataforma")
    .select("reuniao_aviso_ativo, reuniao_aviso_limiar")
    .limit(1).single();
  if (config?.reuniao_aviso_ativo) {
    try {
      const salas = await listarSalasLiveKit();
      const total = salas.reduce((soma, s) => soma + s.participantes, 0);
      const limiar = config.reuniao_aviso_limiar ?? 40;
      if (total >= limiar) aviso = { total, limiar };
    } catch (err) {
      console.warn(`[sala-reuniao] ocupação indisponível pro aviso: ${err}`);
    }
  }

  const token = await assinarTokenLiveKit(
    {
      room: `os-${sala.id}`,
      roomJoin: true,
      roomCreate: true,
      canPublish: true,
      canSubscribe: true,
      // Só o anfitrião real ganha poder de admin da sala no LiveKit.
      roomAdmin: ehAnfitriao,
    },
    { sub: peerId, nome: identidadeNome, validade: "6h" },
  );

  return jsonRes({
    token,
    url: Deno.env.get("LIVEKIT_URL"),
    sala: { id: sala.id, titulo: sala.titulo, max: sala.max_participantes },
    is_host: ehAnfitriao,
    aviso,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();
  try {
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (corpo.acao === "ocupacao") return await acaoOcupacao(req);
    return await acaoToken(req, corpo);
  } catch (err) {
    console.error(`[sala-reuniao] erro: ${err}`);
    return jsonRes({ erro: "erro interno" }, 500);
  }
});

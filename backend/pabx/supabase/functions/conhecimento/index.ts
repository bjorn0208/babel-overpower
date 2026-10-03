// Edge Function: base de conhecimento vetorizada da IA Ligadora.
// Um "item" = tipo + assunto + resposta + N variações (gatilhos vetorizados).
// Embeddings pelo modelo embutido do Supabase (gte-small, 384 dims), sem chave externa.
//   salvar/listar/excluir  → admin (JWT)
//   buscar                 → motor da IA (body.token == MOTOR_SECRET)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
const sessao = new (globalThis as any).Supabase.ai.Session("gte-small");
async function embutir(texto: string): Promise<number[]> {
  return await sessao.run(texto, { mean_pool: true, normalize: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const body = await req.json();
  const acao = body.acao ?? "buscar";
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";

  // BUSCA — motor da IA durante a ligação
  if (acao === "buscar") {
    if (body.token !== Deno.env.get("MOTOR_SECRET")) return json({ erro: "não autorizado" }, 401);
    const { campanha_id, texto, limite } = body;
    if (!texto) return json({ resultados: [] });
    const emb = await embutir(String(texto));
    const { data, error } = await admin.rpc("buscar_conhecimento", {
      _campanha: campanha_id ?? null, _emb: JSON.stringify(emb), _limite: limite ?? 3,
    });
    if (error) return json({ erro: error.message }, 500);
    const bons = (data ?? []).filter((r: { similaridade: number }) => r.similaridade > 0.55);
    return json({ resultados: bons });
  }

  // Demais ações exigem admin
  const { data: quem } = await admin.auth.getUser(auth);
  if (!quem?.user) return json({ erro: "não autenticado" }, 401);
  const { data: perfil } = await admin
    .from("profiles").select("papel, ativo").eq("user_id", quem.user.id).single();
  if (perfil?.papel !== "admin" || !perfil?.ativo) {
    return json({ erro: "apenas o administrador" }, 403);
  }

  // SALVAR — cria ou edita um item inteiro (tipo + assunto + resposta + variações)
  if (acao === "salvar") {
    const { item_id, tipo, campanha_id, assunto, resposta } = body;
    const gatilhos: string[] = (body.gatilhos ?? [])
      .map((g: string) => String(g).trim()).filter(Boolean);
    if (!gatilhos.length || !resposta?.trim()) {
      return json({ erro: "informe ao menos uma variação e a resposta" }, 400);
    }
    const id = item_id ?? crypto.randomUUID();
    // edição: apaga as variações antigas do item e reinsere (re-vetoriza)
    if (item_id) await admin.from("conhecimento_ia").delete().eq("item_id", item_id);
    const linhas = [];
    for (const g of gatilhos) {
      linhas.push({
        item_id: id, tipo: tipo ?? "conhecimento",
        campanha_id: campanha_id ?? null, assunto: assunto ?? null,
        gatilho: g, resposta: resposta.trim(), embedding: JSON.stringify(await embutir(g)),
      });
    }
    const { error } = await admin.from("conhecimento_ia").insert(linhas);
    if (error) return json({ erro: error.message }, 400);
    return json({ ok: true, item_id: id });
  }

  // LISTAR — agrupado por item
  if (acao === "listar") {
    const { data } = await admin.from("conhecimento_ia")
      .select("id, item_id, tipo, campanha_id, assunto, gatilho, resposta, criado_em")
      .order("criado_em");
    const mapa: Record<string, {
      item_id: string; tipo: string; campanha_id: string | null;
      assunto: string | null; resposta: string; gatilhos: string[];
    }> = {};
    for (const r of data ?? []) {
      const k = r.item_id ?? r.id;
      if (!mapa[k]) {
        mapa[k] = {
          item_id: k, tipo: r.tipo, campanha_id: r.campanha_id,
          assunto: r.assunto, resposta: r.resposta, gatilhos: [],
        };
      }
      mapa[k].gatilhos.push(r.gatilho);
    }
    return json({ itens: Object.values(mapa) });
  }

  if (acao === "excluir") {
    await admin.from("conhecimento_ia").delete().eq("item_id", body.item_id);
    return json({ ok: true });
  }

  return json({ erro: "ação desconhecida" }, 400);
});

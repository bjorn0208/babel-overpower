/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { corsHeaders } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

// ---------------------------------------------------------------------------
// cron-sync-feriados
//
// Sincroniza feriados nacionais via BrasilAPI (gratuita, sem chave).
// Roda 1x/ano via pg_cron (1 de janeiro às 06h UTC) e popula a tabela
// public.feriados_brasil com os feriados do ano corrente + 2 anos seguintes.
//
// Idempotente: usa upsert por (data, nome, escopo='nacional') · marca fonte='brasilapi'.
//
// Pode ser invocada manualmente pelo admin via UI de Calendário & Feriados
// (botão "Atualizar agora").
//
// verify_jwt: false (chamada por pg_cron com service_role bearer).
// ---------------------------------------------------------------------------

interface FeriadoBrasilApi {
  date: string;   // "2026-01-01"
  name: string;   // "Confraternização mundial"
  type: string;   // "national"
}

async function buscarFeriadosAno(ano: number): Promise<FeriadoBrasilApi[]> {
  const url = `https://brasilapi.com.br/api/feriados/v1/${ano}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`BrasilAPI ${res.status} ano=${ano}`);
  }
  return await res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = criarClienteAdmin();

    // Ler ano(s) do body — default: ano atual + 2 seguintes.
    const body = await req.json().catch(() => ({}));
    const anos: number[] = Array.isArray(body?.anos)
      ? body.anos.map((a: unknown) => Number(a)).filter((a: number) => Number.isInteger(a) && a >= 2020 && a <= 2050)
      : [];

    if (anos.length === 0) {
      const anoAtual = new Date().getFullYear();
      anos.push(anoAtual, anoAtual + 1, anoAtual + 2);
    }

    const resumo = {
      anos_processados: [] as number[],
      total_inseridos: 0,
      total_atualizados: 0,
      erros: [] as Array<{ ano: number; erro: string }>,
    };

    for (const ano of anos) {
      try {
        const feriados = await buscarFeriadosAno(ano);

        for (const f of feriados) {
          // Upsert por (data, nome, escopo) — UNIQUE constraint na tabela.
          const { error } = await supabase
            .from("feriados_brasil")
            .upsert(
              {
                data: f.date,
                nome: f.name,
                escopo: "nacional",
                fonte: "brasilapi",
                ativo: true,
              },
              { onConflict: "data,nome,escopo" },
            );

          if (error) {
            console.warn(`[sync-feriados] falha upsert ${ano} ${f.date}:`, error.message);
            resumo.erros.push({ ano, erro: `${f.date} ${f.name}: ${error.message}` });
          } else {
            resumo.total_inseridos += 1;
          }
        }

        resumo.anos_processados.push(ano);
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`[sync-feriados] falha ano=${ano}:`, msg);
        resumo.erros.push({ ano, erro: msg });
      }
    }

    return new Response(JSON.stringify({ ok: true, ...resumo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[sync-feriados] falha fatal:", (err as Error).message);
    return new Response(
      JSON.stringify({ ok: false, erro: (err as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});

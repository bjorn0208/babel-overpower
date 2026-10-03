import { strict as assert } from "node:assert";
import {
  selecionarDiretrizBolha,
} from "../functions/_shared/diretriz-bolha.ts";

// ── Fakes ────────────────────────────────────────────────────────────────────

// Fake supabase: suporta .rpc() e .from().select().eq().is().or().limit()
// (para o fallback tag_sempre_ativo).
function fakeRpc(respostas: Record<string, { data: unknown; error?: unknown }>) {
  const chamadas: Array<{ fn: string; args: unknown }> = [];
  // builder chainable para `.from(...).select(...).eq(...).or(...).limit(...)`
  function buildFallback(data: unknown) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "or", "limit", "order"]) {
      b[m] = () => b;
    }
    // deno-lint-ignore no-explicit-any
    (b as any).then = (res: (v: unknown) => void) => res({ data });
    return b;
  }
  return {
    chamadas,
    // deno-lint-ignore no-explicit-any
    rpc(fn: string, args: any) {
      chamadas.push({ fn, args });
      return Promise.resolve(respostas[fn] ?? { data: null });
    },
    // deno-lint-ignore no-explicit-any
    _fallbackData: null as any,
    from(_tabela: string) {
      // deno-lint-ignore no-explicit-any
      return buildFallback((this as any)._fallbackData);
    },
  };
}

const depsEmb = (v: number[] | null) => ({
  gerarEmbedding: () => Promise.resolve(v),
});

// ── Casos ────────────────────────────────────────────────────────────────────

async function main() {
  // (a) RPC retorna 1 diretriz → mapeia campos corretamente
  {
    const sb = fakeRpc({
      busca_hibrida_diretriz_bolha: {
        data: [{
          quantidade_sugerida: "1-2",
          chars_medio_sugerido: 110,
          motivo: "lead em fechamento — resposta curta",
          contexto: "fechamento",
          escopo: "tenant",
        }],
      },
    });
    const r = await selecionarDiretrizBolha(
      sb,
      { tenantId: "T1", nichoId: null, queryText: "quero fechar agora" },
      depsEmb([0.1, 0.2]),
    );
    assert.ok(r !== null, "esperava diretriz não-null");
    assert.equal(r!.quantidade_sugerida, "1-2");
    assert.equal(r!.chars_medio_sugerido, 110);
    assert.equal(r!.motivo, "lead em fechamento — resposta curta");
    assert.equal(r!.contexto, "fechamento");
    assert.equal(r!.escopo, "tenant");
    // confirmação: chamou a RPC com os params certos
    const c = sb.chamadas.find((x) => x.fn === "busca_hibrida_diretriz_bolha")!;
    assert.ok(c, "rpc busca_hibrida_diretriz_bolha deve ter sido chamada");
    // deno-lint-ignore no-explicit-any
    const a = c.args as any;
    assert.equal(a.p_tenant_id, "T1");
    assert.equal(a.p_nicho_id, null);
    assert.equal(a.p_top_k, 3);
  }

  // (b) RPC vazia → cai no fallback tag_sempre_ativo; escolhe tenant sobre global
  {
    const sb = fakeRpc({
      busca_hibrida_diretriz_bolha: { data: [] },
    });
    // fallback retorna: tenant + global (tenant deve vencer)
    sb._fallbackData = [
      { quantidade_sugerida: "2-3", chars_medio_sugerido: 90, motivo: "default tenant", contexto: "default", escopo: "tenant" },
      { quantidade_sugerida: "1-3", chars_medio_sugerido: 180, motivo: "default global", contexto: "default", escopo: "global" },
    ];
    const r = await selecionarDiretrizBolha(
      sb,
      { tenantId: "T1", nichoId: null, queryText: "oi tudo bem" },
      depsEmb([0.1]),
    );
    assert.ok(r !== null, "fallback deve retornar diretriz");
    assert.equal(r!.escopo, "tenant", "tenant deve ter precedência sobre global no fallback");
    assert.equal(r!.quantidade_sugerida, "2-3");
  }

  // (c) embedding null → fallback (não chama RPC)
  {
    const sb = fakeRpc({});
    sb._fallbackData = [
      { quantidade_sugerida: "1-3", chars_medio_sugerido: 180, motivo: "global default", contexto: "default", escopo: "global" },
    ];
    const r = await selecionarDiretrizBolha(
      sb,
      { tenantId: "T1", nichoId: null, queryText: "algum texto" },
      depsEmb(null),
    );
    // embedding null → não chamou RPC
    assert.equal(sb.chamadas.length, 0, "sem embedding, não deve chamar RPC");
    // mas fallback pode retornar global
    assert.ok(r !== null, "fallback deve retornar global quando embedding nulo");
    assert.equal(r!.escopo, "global");
  }

  // (d) RPC lança erro → null (fail-safe)
  {
    const sbQuebrado = {
      chamadas: [] as unknown[],
      rpc() { throw new Error("db down"); },
      from(_: string) {
        throw new Error("db down");
      },
    };
    const r = await selecionarDiretrizBolha(
      sbQuebrado,
      { tenantId: "T1", nichoId: null, queryText: "oi" },
      depsEmb([0.1]),
    );
    assert.equal(r, null, "exceção deve retornar null (fail-safe)");
  }

  // (e) queryText vazio → vai direto ao fallback sem chamar embedding
  {
    let embeddingChamado = false;
    const sb = fakeRpc({});
    sb._fallbackData = [
      { quantidade_sugerida: "1-3", chars_medio_sugerido: 180, motivo: "global", contexto: "default", escopo: "global" },
    ];
    const r = await selecionarDiretrizBolha(
      sb,
      { tenantId: "T1", nichoId: null, queryText: "" },
      {
        gerarEmbedding: () => {
          embeddingChamado = true;
          return Promise.resolve([0.1]);
        },
      },
    );
    assert.equal(embeddingChamado, false, "queryText vazio não deve chamar embedding");
    assert.equal(sb.chamadas.length, 0, "queryText vazio não deve chamar RPC");
    // fallback retorna global
    assert.ok(r !== null, "fallback deve retornar diretriz mesmo com queryText vazio");
  }

  console.log("diretriz-bolha.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

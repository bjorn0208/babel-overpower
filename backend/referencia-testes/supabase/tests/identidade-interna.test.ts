import { strict as assert } from "node:assert";
import { detectarDonoLogado } from "../functions/_shared/identidade-interna.ts";

// Fake do criarClienteUsuarioDoRequest: configura o retorno do auth.getUser().
function deps(getUserResp: unknown | null, opts?: { semHeader?: boolean; throwCriar?: boolean }) {
  return {
    criarClienteUsuarioDoRequest: (_req: Request) => {
      if (opts?.throwCriar) throw new Error("env ausente");
      if (opts?.semHeader) return null;
      return {
        auth: { getUser: () => Promise.resolve(getUserResp) },
      };
    },
  };
}
const reqFake = new Request("http://x", { method: "POST" });

async function main() {
  // 1. sem Authorization header → null (externo: Z-API/webhook)
  {
    const r = await detectarDonoLogado(reqFake, deps(null, { semHeader: true }));
    assert.equal(r, null);
  }
  // 2. getUser retorna error → null (token inválido/expirado)
  {
    const r = await detectarDonoLogado(reqFake, deps({ data: { user: null }, error: { message: "invalid jwt" } }));
    assert.equal(r, null);
  }
  // 3. getUser sem user → null
  {
    const r = await detectarDonoLogado(reqFake, deps({ data: { user: null }, error: null }));
    assert.equal(r, null);
  }
  // 4. getUser com user válido → { userId }
  {
    const r = await detectarDonoLogado(reqFake, deps({ data: { user: { id: "U-123" } }, error: null }));
    assert.deepEqual(r, { userId: "U-123" });
  }
  // 5. criarCliente lança → null (fail-safe: erro nunca eleva pra interno)
  {
    const r = await detectarDonoLogado(reqFake, deps(null, { throwCriar: true }));
    assert.equal(r, null);
  }
  // 6. getUser lança → null (fail-safe)
  {
    const d = {
      criarClienteUsuarioDoRequest: (_req: Request) => ({
        auth: { getUser: () => Promise.reject(new Error("network down")) },
      }),
    };
    const r = await detectarDonoLogado(reqFake, d);
    assert.equal(r, null);
  }

  console.log("identidade-interna.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

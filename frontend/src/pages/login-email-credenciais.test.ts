import { test } from "node:test";
import assert from "node:assert/strict";
import { extrairLoginEmail, mensagemErroLogin } from "./login-email-credenciais.ts";

test("e-mail sozinho normaliza caixa e ignora espaços fora da credencial", () => {
  assert.deepEqual(extrairLoginEmail("  Dono@Example.com  "), {
    email: "dono@example.com",
    senha: null,
  });
});
test("e-mail e senha juntos preservam símbolos e espaços da senha", () => {
  assert.deepEqual(extrairLoginEmail("dono@example.com A,b/=:[! secret  "), {
    email: "dono@example.com",
    senha: "A,b/=:[! secret  ",
  });
});
test("e-mail incompleto e duas arrobas não viram credenciais", () => {
  for (const texto of ["", "dono", "dono@example", "dono@@example.com", "senha sem email"])
    assert.equal(extrairLoginEmail(texto), null);
});
test("erro de credencial não revela se a conta existe", () => {
  assert.match(mensagemErroLogin({ code: "invalid_credentials" }), /e-mail ou a senha/);
});
test("erro de rede e confirmação têm orientação acionável em português", () => {
  assert.match(mensagemErroLogin(new TypeError("Failed to fetch")), /conexão/);
  assert.match(mensagemErroLogin({ code: "email_not_confirmed" }), /confirmar seu e-mail/);
});

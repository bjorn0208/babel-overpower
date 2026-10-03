/**
 * Teste do ramo de imagem do anexo do commandbar (2026-08-02).
 *
 * Exercita exatamente o miolo novo da edge `extrair-contrato-de-arquivo`:
 * URL assinada do bucket privado → `interpretarMidia` (modelo multimodal) →
 * texto em PT-BR com a transcrição do que está na imagem.
 *
 * Rodar: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… deno run -A \
 *   supabase/functions/tests/leitura-imagem-anexo.test.ts <caminho-no-bucket>
 */
import { interpretarMidia } from "../_shared/midia-gemini.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const caminho = Deno.args[0];
if (!caminho) {
  console.error("informe o caminho do arquivo dentro do bucket mestre-anexos");
  Deno.exit(1);
}

const rAssinado = await fetch(`${url}/storage/v1/object/sign/mestre-anexos/${caminho}`, {
  method: "POST",
  headers: { apikey: chaveServico, Authorization: `Bearer ${chaveServico}`, "Content-Type": "application/json" },
  body: JSON.stringify({ expiresIn: 300 }),
});
const assinado = await rAssinado.json();
if (!assinado?.signedURL && !assinado?.signedUrl) {
  console.error("falha ao assinar:", assinado);
  Deno.exit(1);
}
const urlAssinada = `${url}/storage/v1${assinado.signedURL ?? assinado.signedUrl}`;

const rProv = await fetch(
  `${url}/rest/v1/provedores_llm?slug=eq.openrouter&is_active=is.true&select=api_key,base_url&limit=1`,
  { headers: { apikey: chaveServico, Authorization: `Bearer ${chaveServico}` } },
);
const [provedor] = await rProv.json();
if (!provedor?.api_key) {
  console.error("credencial do provedor não encontrada");
  Deno.exit(1);
}

const texto = await interpretarMidia({
  mediaUrl: urlAssinada,
  mediaType: "image/png",
  apiKey: provedor.api_key,
  baseUrl: provedor.base_url ?? "https://openrouter.ai/api/v1",
  modelo: "google/gemini-3.1-flash-lite",
  modeloFallback: "google/gemini-3.1-pro-preview-customtools",
  maxTokens: 2500,
  instrucao:
    "Leia esta imagem para um assistente de negócios. Transcreva TODO texto visível " +
    "(tabelas, valores, prazos, nomes, datas) preservando a estrutura, e descreva em 1 linha " +
    "o que é a imagem. Português brasileiro, sem comentários extras.",
});

console.log("--- texto lido da imagem ---");
console.log(texto || "(vazio)");

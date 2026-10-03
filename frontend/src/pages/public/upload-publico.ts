/**
 * Validação de arquivo nas páginas PÚBLICAS (contrato, consulta, rifa, cadastro).
 *
 * Δ 2026-09-17 (varredura): os uploads públicos tiravam a extensão do nome do
 * arquivo e subiam direto em bucket público, sem whitelist e sem limite de
 * tamanho — só o `accept=` do input restringia, e isso se burla em um clique.
 * Espelha a regra que `apps/user/conversas/midia-upload.ts` já aplicava.
 *
 * É a 1ª linha de defesa (client). O enforcement final é a policy do bucket.
 */

const EXTS_PERMITIDAS = new Set([
  "jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "pdf",
]);

const MIMES_PERMITIDOS = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "image/gif", "application/pdf",
];

export const TAMANHO_MAX_UPLOAD_PUBLICO = 15 * 1024 * 1024; // 15 MB

/** Devolve a extensão segura, ou lança Error com mensagem pro usuário. */
export function validarArquivoPublico(file: File): string {
  if (!file || file.size === 0) throw new Error("Arquivo vazio ou inválido.");
  if (file.size > TAMANHO_MAX_UPLOAD_PUBLICO) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new Error(`Arquivo muito grande (${mb} MB). Limite: 15 MB.`);
  }
  const ext = (file.name.includes(".") ? file.name.split(".").pop() || "" : "").toLowerCase();
  const extOk = EXTS_PERMITIDAS.has(ext);
  const mimeOk = MIMES_PERMITIDOS.includes((file.type || "").toLowerCase());
  if (!extOk && !mimeOk) {
    throw new Error("Tipo de arquivo não permitido. Envie imagem (JPG, PNG, WEBP) ou PDF.");
  }
  if (!extOk) return (file.type || "").includes("pdf") ? "pdf" : "jpg";
  return ext;
}

import { supabase } from "@/integrations/supabase/client";

/**
 * Sobe um arquivo de mídia (imagem/áudio/vídeo/documento) enviado pelo painel
 * para o bucket público `anexos-chat` e devolve a URL pública + metadados.
 *
 * Path: `{uidLogado}/{conversaId}/{timestamp}.{ext}`. A 1ª pasta = uid do
 * usuário logado, pra casar a policy `anexos_chat_tenant_insert`
 * (`(storage.foldername(name))[1] = (select auth.uid())::text`). Vale tanto
 * pro dono quanto pra membro da equipe (cada um na pasta do próprio uid).
 *
 * Paridade com o atendimento antigo (`chat-area-helpers.ts` → `uploadAndSendFile`).
 */
export type MidiaUpload = {
  url: string;
  nome: string;
  tipo: string;
  tamanho: number;
};

/** Teto de tamanho por arquivo (25 MB) — barra upload gigante antes de gastar rede. */
const TAMANHO_MAX_BYTES = 25 * 1024 * 1024;

/** Extensões aceitas — imagem, áudio, vídeo e documentos comuns. Barra executável/script. */
const EXTS_PERMITIDAS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif",
  "mp3", "m4a", "aac", "ogg", "oga", "opus", "wav", "webm", "amr",
  "mp4", "mov", "3gp", "mkv", "avi",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
]);

function mimeAceito(mime: string): boolean {
  const m = mime.toLowerCase();
  return (
    /^(image|audio|video)\//.test(m) ||
    m === "application/pdf" ||
    m === "application/msword" ||
    m.startsWith("application/vnd.") ||
    m === "text/plain" ||
    m === "text/csv"
  );
}

/**
 * Valida tipo (extensão/mime) e tamanho ANTES do upload. Lança Error com mensagem
 * clara pro chamador exibir em toast. Isto é a 1ª linha de defesa no client — o
 * enforcement final de tipo/tamanho deve existir também no servidor/policy do bucket.
 */
function validarArquivo(arquivo: File): string {
  if (!arquivo || arquivo.size === 0) throw new Error("Arquivo vazio ou inválido.");
  if (arquivo.size > TAMANHO_MAX_BYTES) {
    const mb = Math.round(arquivo.size / (1024 * 1024));
    throw new Error(`Arquivo muito grande (${mb} MB). Limite: 25 MB.`);
  }
  const ext = (arquivo.name.includes(".") ? arquivo.name.split(".").pop() || "" : "").toLowerCase();
  const extOk = EXTS_PERMITIDAS.has(ext);
  if (!extOk && !mimeAceito(arquivo.type || "")) {
    throw new Error("Tipo de arquivo não permitido.");
  }
  return extOk ? ext : "bin";
}

export async function subirMidiaConversa(
  arquivo: File,
  uidLogado: string,
  conversaId: string,
): Promise<MidiaUpload> {
  const ext = validarArquivo(arquivo);
  const path = `${uidLogado}/${conversaId}/${Date.now()}.${ext}`;
  const tipo = arquivo.type || "application/octet-stream";
  const { error } = await supabase.storage.from("anexos-chat").upload(path, arquivo, {
    contentType: tipo,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("anexos-chat").getPublicUrl(path);
  return { url: data.publicUrl, nome: arquivo.name, tipo, tamanho: arquivo.size };
}

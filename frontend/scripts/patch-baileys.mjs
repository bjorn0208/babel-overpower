/**
 * Patch no @whiskeysockets/baileys instalado — roda no `postinstall` e no `build`.
 *
 * Por quê (2026-09-12): o WhatsApp aposentou as sub-plataformas WIN32 e DARWIN.
 * Um socket que se identifica como "Mac OS/Desktop" (o que `whatsapp-importar.ts`
 * fazia) ou "Windows/Desktop" sem este patch é derrubado com 428 "Connection
 * Terminated" em ~1s, ANTES de emitir o QR — 100% das vezes. Era esse o
 * "428 intermitente" que fez desligarem o botão em 03/09 e que foi religado em
 * 11/09 sem teste real.
 *
 * O Baileys corrigiu no master em 04/08/2026 (PR #2741: Windows → WIN_HYBRID),
 * mas o rc14 publicado no npm (29/07) ainda tem o mapeamento velho. Este script
 * aplica a mesma troca de uma linha. É idempotente: quando subirmos pra uma
 * versão que já tenha WIN_HYBRID, ele só avisa que não há o que fazer.
 *
 * Roda no `build` também porque o `postinstall` não executa quando o Vercel
 * restaura node_modules do cache e o npm decide que está "up to date" — e aí o
 * bundle da function sairia sem o patch.
 *
 * Mesmo script do Chupa-Cabra (`~/apps/chupa-cabra/scripts/patch-baileys.mjs`),
 * onde a correção foi medida: Windows/Desktop com patch gera QR 3/3.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const alvo = path.join(raiz, "node_modules/@whiskeysockets/baileys/lib/Utils/validate-connection.js");

if (!existsSync(alvo)) {
  console.warn("[patch-baileys] arquivo não encontrado, nada a fazer:", alvo);
  process.exit(0);
}

const antes = readFileSync(alvo, "utf8");
const de = "Windows: proto.ClientPayload.WebInfo.WebSubPlatform.WIN32";
const para = "Windows: proto.ClientPayload.WebInfo.WebSubPlatform.WIN_HYBRID";

if (antes.includes(para)) {
  console.log("[patch-baileys] já está com WIN_HYBRID — ok.");
} else if (antes.includes(de)) {
  writeFileSync(alvo, antes.replace(de, para));
  console.log("[patch-baileys] WIN32 → WIN_HYBRID aplicado em validate-connection.js");
} else {
  console.error("[patch-baileys] trecho esperado não encontrado — a lib mudou; revise o script antes de deployar.");
  process.exit(1);
}

/**
 * Patch no @whiskeysockets/baileys instalado — roda no `postinstall`.
 *
 * Por quê (2026-09-11): o WhatsApp aposentou as sub-plataformas WIN32 e
 * DARWIN. Qualquer socket que se identifique como "Windows/Desktop" ou
 * "Mac OS/Desktop" com `syncFullHistory` é derrubado com 428 em ~1s, antes
 * do QR. O Baileys corrigiu no master em 04/08/2026 (PR #2741: Windows →
 * WIN_HYBRID), mas o rc14 do npm (29/07) ainda tem o mapeamento velho.
 * Este script aplica a mesma troca de uma linha. Idempotente. Quando subir
 * pra uma versão que já tenha WIN_HYBRID, ele só avisa que não há o que fazer.
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

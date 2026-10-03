// Quebra a resposta da Síntese em bolhas (mensagens separadas no WhatsApp).
//
// Regra de negócio (decisão Theus 2026-05-18): a fragmentação é 100% SEMÂNTICA.
// O modelo decide onde quebrar inserindo UMA LINHA EM BRANCO entre os trechos;
// aqui apenas respeitamos essa decisão. NÃO existe cap hardcoded — quantas
// bolhas/quantos chars é instrução do prompt, nunca número cravado no código.
// Anti-flood real vive noutro lugar (500ms entre bolha + rate-limit/hora no
// processar-acompanhamentos).
//
// `[silencio]` / `[no-reply]` (resposta inteira) = agente decide não responder
// verbalmente (ex: lead disse "valeu/tchau/ok"). Devolve bolhas: [].

export type ResultadoBolhas = {
  silenciar: boolean;
  bolhas: string[];
};

const RE_SILENCIO = /^\s*\[\s*sil[êe]ncio\s*\]\s*$/i;
const RE_NO_REPLY = /^\s*\[\s*no[-_]?reply\s*\]\s*$/i;

export function quebrarEmBolhas(respostaFinal: string): ResultadoBolhas {
  const texto = respostaFinal ?? "";
  const silenciar = RE_SILENCIO.test(texto) || RE_NO_REPLY.test(texto);
  if (silenciar) return { silenciar: true, bolhas: [] };

  const bolhas = texto
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    silenciar: false,
    bolhas: bolhas.length ? bolhas : [texto.trim()],
  };
}

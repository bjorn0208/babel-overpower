/**
 * Lê uma resposta `text/event-stream` bloco a bloco e chama `aoEvento` pra
 * cada `event:`/`data:` (extraído do ImportarWhatsappPessoal.tsx da Babel).
 */
export async function lerSse(
  resp: Response,
  aoEvento: (evento: string, dados: Record<string, unknown>) => void | Promise<void>,
) {
  if (!resp.body) return;
  const leitor = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let indice: number;
    while ((indice = buffer.indexOf("\n\n")) !== -1) {
      const bloco = buffer.slice(0, indice);
      buffer = buffer.slice(indice + 2);
      const linhaEvento = bloco.split("\n").find((l) => l.startsWith("event:"));
      const linhaDados = bloco.split("\n").find((l) => l.startsWith("data:"));
      if (!linhaEvento || !linhaDados) continue;
      const evento = linhaEvento.slice("event:".length).trim();
      let dados: Record<string, unknown> = {};
      try { dados = JSON.parse(linhaDados.slice("data:".length).trim()); } catch { /* linha malformada */ }
      await aoEvento(evento, dados);
    }
  }
}

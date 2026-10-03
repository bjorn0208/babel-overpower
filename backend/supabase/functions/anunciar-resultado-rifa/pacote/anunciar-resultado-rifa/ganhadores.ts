// Desenho do PÓDIO DE GANHADORES pós-sorteio (SVG → PNG no index.ts via resvg).
// Modelo visual segue a cartela (cron-status-rifa/cartela.ts): fundo escuro,
// título serifado dourado, painel com bordas claras. Sem imports — dá pra
// renderizar fora do edge pra conferir o visual.
//
// LGPD (item 12): este desenho NUNCA recebe nome completo. Quem chama passa o
// PRIMEIRO NOME já anonimizado (o index.ts faz a anonimização). Sem emoji no
// SVG: DejaVu não tem os glifos (mesma restrição da cartela).

export interface ItemGanhador {
  ordem: number;
  premio: string;
  /** rótulo do número já formatado (zero à esquerda no padrão da rifa) */
  numero: string;
  /** PRIMEIRO NOME apenas (LGPD) */
  nome: string;
  semGanhador: boolean;
}

export interface DadosGanhadores {
  titulo: string;
  itens: ItemGanhador[];
  rodape?: string;
}

const C = {
  fundoTopo: "#262f41",
  fundoBase: "#141a26",
  painelBorda: "#8f9bb3",
  texto: "#e8ebf1",
  textoSuave: "#cfd5e0",
  ouroTexto: "#e9c46a",
  prata: "#9aa3b2",
  bronze: "#c98e5a",
};

const escaparXml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cortar = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

/** Cor do lugar no pódio: 1º ouro, 2º prata, 3º bronze, resto suave. */
function corLugar(ordem: number): string {
  if (ordem === 1) return C.ouroTexto;
  if (ordem === 2) return C.prata;
  if (ordem === 3) return C.bronze;
  return C.textoSuave;
}

export function svgGanhadores(d: DadosGanhadores): string {
  const W = 1080, H = 1350;
  const MAX_ITENS = 6;
  const itens = d.itens.slice(0, MAX_ITENS);
  const sobram = d.itens.length - itens.length;

  // Título "GANHADORES" encolhe pra caber em ~960px (serifada bold ≈ 0,68 da altura por caractere).
  const palavraTitulo = "GANHADORES";
  const tamTitulo = Math.max(40, Math.min(112, Math.floor(960 / Math.max(1, palavraTitulo.length * 0.68))));

  // Painel do pódio cresce com o nº de linhas (até 6); +1 linha quando sobra prêmio na ata.
  const yPanelTop = 300;
  const altoLinha = 112;
  const temSobras = sobram > 0;
  const yPanelBottom = yPanelTop + 96 + itens.length * altoLinha + (temSobras ? altoLinha : 0) + 24;
  const yRodape = Math.min(H - 60, yPanelBottom + 90);

  // Linhas do pódio: medalha com a ordem + prêmio + "Nº {numero} · {primeiro nome}".
  const linhasFinal: string[] = [];
  itens.forEach((it, idx) => {
    const yc = yPanelTop + 96 + idx * altoLinha + altoLinha / 2;
    const cor = corLugar(it.ordem);
    const r = 44;
    const cx = 176;
    const preenchimento = it.ordem === 1 ? "url(#ouro)" : it.ordem === 2 ? "url(#prata)" : "url(#base)";
    const preScuro = it.ordem <= 2 ? "#2a1c06" : "#0c0e12";
    const tx = 248;
    // Serif bold 38 ⇒ ~26px/caractere; largura útil ~770px → 28 chars é seguro.
    const premioTxt = it.premio ? cortar(it.premio, 28) : "Prêmio principal";
    const segundaLinha = it.semGanhador
      ? "Número não vendido"
      : `Nº ${escaparXml(it.numero)} · ${escaparXml(it.nome)}`;
    linhasFinal.push(
      `<circle cx="${cx}" cy="${yc}" r="${r}" fill="${preenchimento}" stroke="${cor}" stroke-width="3"/>` +
      `<text x="${cx}" y="${yc + 15}" font-family="DejaVu Serif" font-size="34" font-weight="bold" fill="${preScuro}" text-anchor="middle">${it.ordem}º</text>` +
      `<text x="${tx}" y="${yc - 26}" font-family="DejaVu Serif" font-size="38" font-weight="bold" fill="${cor}">${escaparXml(premioTxt)}</text>` +
      `<text x="${tx}" y="${yc + 32}" font-family="DejaVu Sans" font-size="30" fill="${it.semGanhador ? C.textoSuave : C.texto}">${escaparXml(segundaLinha)}</text>`,
    );
  });
  if (sobram > 0) {
    const yc = yPanelTop + 96 + itens.length * altoLinha + altoLinha / 2;
    linhasFinal.push(
      `<text x="${W / 2}" y="${yc}" font-family="DejaVu Serif" font-size="32" font-weight="bold" fill="${C.textoSuave}" text-anchor="middle">+ ${sobram} prêmio(s) na ata</text>`,
    );
  }

  const facetas = [
    `M 0 0 L 420 0 L 120 380 Z`, `M 1080 0 L 700 0 L 1080 520 Z`, `M 0 1350 L 0 900 L 380 1350 Z`,
    `M 1080 1350 L 1080 980 L 640 1350 Z`, `M 300 0 L 760 0 L 540 300 Z`,
  ].map((p) => `<path d="${p}" fill="#ffffff" fill-opacity="0.025"/>`).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="DejaVu Sans">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.fundoTopo}"/><stop offset="1" stop-color="${C.fundoBase}"/>
    </linearGradient>
    <linearGradient id="ouro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbe7a1"/><stop offset="0.45" stop-color="#e8bd5a"/><stop offset="1" stop-color="#b8862c"/>
    </linearGradient>
    <linearGradient id="prata" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eef1f6"/><stop offset="0.5" stop-color="#c6ccd6"/><stop offset="1" stop-color="#8d95a3"/>
    </linearGradient>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3d434c"/><stop offset="1" stop-color="#1b1f27"/>
    </linearGradient>
    <linearGradient id="tituloOuro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff4d0"/><stop offset="0.55" stop-color="#ecc877"/><stop offset="1" stop-color="#b98a33"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#fundo)"/>
  ${facetas}
  <text x="${W / 2}" y="150" font-family="DejaVu Serif" font-size="${tamTitulo}" font-weight="bold" fill="#070a10" fill-opacity="0.7" text-anchor="middle">${escaparXml(palavraTitulo)}</text>
  <text x="${W / 2}" y="146" font-family="DejaVu Serif" font-size="${tamTitulo}" font-weight="bold" fill="url(#tituloOuro)" stroke="#5a4214" stroke-width="1.5" text-anchor="middle">${escaparXml(palavraTitulo)}</text>
  <text x="${W / 2}" y="236" font-family="DejaVu Sans" font-size="42" fill="${C.texto}" text-anchor="middle">${escaparXml(cortar(d.titulo, 40))}</text>
  <rect x="60" y="${yPanelTop}" width="${W - 120}" height="${yPanelBottom - yPanelTop}" rx="16" fill="#1c2432" fill-opacity="0.85" stroke="${C.painelBorda}" stroke-width="2"/>
  <text x="${W / 2}" y="${yPanelTop + 64}" font-family="DejaVu Serif" font-size="34" font-weight="bold" fill="${C.ouroTexto}" text-anchor="middle">PÓDIO DO SORTEIO</text>
  ${linhasFinal.join("\n  ")}
  <text x="${W / 2}" y="${yRodape}" font-family="DejaVu Sans" font-size="34" fill="${C.textoSuave}" text-anchor="middle">${escaparXml(d.rodape ?? "Parabéns aos ganhadores!")}</text>
</svg>`;
}
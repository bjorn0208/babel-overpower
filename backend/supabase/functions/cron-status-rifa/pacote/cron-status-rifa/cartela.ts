// Desenho da CARTELA da rifa (SVG → PNG no index.ts via resvg). Sem imports: dá pra renderizar
// fora do edge pra conferir o visual.
//
// Modelo fiel ao RIFA-CARTELA.html (853x1280) — renderizado em 1080x1350 no cron.
// Cores: VERDE = Pago, AMARELO = Reservado, PRETO = Disponível
// Cabeçalho: coroa, título dourado, nome cursivo, risco dourado, chamadas
// Rodapé: bilhete, premiação, divisória, cédula, preço/sorteio

export interface DadosCartela {
  titulo: string;
  total: number;
  /** rifa "desde zero": numeração 0..total-1 (00–99 numa rifa de 100) */
  desdeZero: boolean;
  vendidos: Set<number>;
  reservados: Set<number>;
  /** nome do comprador por número (pago ou reservado) — pedidos_rifa.nome via numeros_rifa.pedido_id */
  nomes?: Map<number, string>;
  precoCentavos: number;
  /** [prêmio principal, extras...] na ordem do pódio */
  premios: string[];
  metodo: string;
  /** YYYY-MM-DD ou null */
  dataSorteio: string | null;
  /** HH:MM já resolvida (rifa → arte → padrão do método) ou null */
  horaSorteio: string | null;
}

/** Espelho de PADRAO_METODO em _shared/tools-rifas.ts e de public.rifa_hora_padrao_metodo — mudou lá, muda aqui. */
const PADRAO_METODO: Record<string, Record<number, string>> = {
  loteria_federal: { 0: "11:00", 3: "20:00" },
  ppt: { 1: "09:20", 2: "09:20", 3: "09:20", 4: "09:20", 5: "09:20", 6: "09:20" },
  ptm: { 1: "11:20", 2: "11:20", 3: "11:20", 4: "11:20", 5: "11:20", 6: "11:20" },
  pt_rio: { 1: "14:20", 2: "14:20", 3: "14:20", 4: "14:20", 5: "14:20", 6: "14:20" },
  ptv: { 1: "16:20", 2: "16:20", 3: "16:20", 4: "16:20", 5: "16:20", 6: "16:20" },
  ptn: { 1: "18:20", 2: "18:20", 3: "18:20", 4: "18:20", 5: "18:20", 6: "18:20" },
  corujinha: { 1: "21:20", 2: "21:20", 3: "21:20", 4: "21:20", 5: "21:20", 6: "21:20" },
};

const SORTEIO_PELO: Record<string, string> = {
  loteria_federal: "pela Loteria Federal",
  ppt: "pela PPT",
  ptm: "pela PTM",
  pt_rio: "pela PT Rio",
  ptv: "pela PTV",
  ptn: "pela PTN",
  corujinha: "pela Corujinha",
  plataforma: "pelo sorteador da plataforma",
};

const DIAS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "19h" · "19:30" · "19h30" · "7" · "11:00:00" → "HH:MM". Espelho de normalizarHora (tools-rifas.ts). */
export function normalizarHora(txt: string | null | undefined): string | null {
  if (!txt) return null;
  const m = String(txt).trim().match(/^(\d{1,2})\s*[:hH]?\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Hora do sorteio na ordem que a agente usa (resolverSorteio): rifa → arte → padrão do método. */
export function horaDoSorteio(
  horaRifa: string | null | undefined,
  horaArte: string | null | undefined,
  metodo: string,
  data: string | null,
): string | null {
  const direta = normalizarHora(horaRifa) ?? normalizarHora(horaArte);
  if (direta || !data) return direta;
  const dia = new Date(`${data}T12:00:00-03:00`).getDay();
  return PADRAO_METODO[metodo]?.[dia] ?? null;
}

const escaparXml = (t: string) =>
  t.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");

const fmtBRL = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "1000" · "1.000" · "R$ 1.000,00" → "R$ 1.000"; prêmio em texto ("Moto 0km") fica como está. */
export function fmtPremio(bruto: unknown): string {
  const s = String(bruto ?? "").trim();
  const num = s.replace(/^R\$\s*/i, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(num)) {
    const v = Number(num.replace(/\./g, "").replace(",", "."));
    return v.toLocaleString("pt-BR", {
      style: "currency", currency: "BRL",
      minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2,
    });
  }
  return s;
}

const cortar = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}\u2026` : t);

/** Linha do sorteio no painel: ["- Sorteio pela Loteria Federal", "às 11:00 · domingo, 13/09"]. */
export function linhasSorteio(metodo: string, data: string | null, hora: string | null): [string, string] {
  const pelo = SORTEIO_PELO[metodo] ?? `pelo ${metodo}`;
  let quando = "";
  if (data) {
    const dia = DIAS_PT[new Date(`${data}T12:00:00-03:00`).getDay()];
    const [, m, d] = data.split("-");
    quando = hora ? `às ${hora} · ${dia}, ${d}/${m}` : `${dia}, ${d}/${m} · hora a confirmar`;
  } else if (hora) {
    quando = `às ${hora} · data a confirmar`;
  } else {
    quando = "data a confirmar";
  }
  return [`- Sorteio ${pelo}`, quando];
}

// ============================================================
// PALETA DO MODELO (cores conforme solicitado)
// ============================================================
const C = {
  // Paleta final fornecida para o fundo, células, textos e dourados
  fundoTopo: "#084420",
  fundoMeio: "#042110",
  fundoBase: "#040D06",
  pagoFillTop: "#0A6834",
  pagoFillMid: "#084420",
  pagoFillBot: "#042110",
  pagoBorda: "#E9CD71",
  pagoTexto: "#F8F8F4",
  reservadoFillTop: "#2C312A",
  reservadoFillMid: "#2C312A",
  reservadoFillBot: "#040D06",
  reservadoBorda: "#7A8A75",
  reservadoTexto: "#F8F8F4",
  reservadoIcone: "#F8F8F4",
  disponivelFillTop: "#F8F8F4",
  disponivelFillMid: "#F8F8F4",
  disponivelFillBot: "#DCE4CC",
  disponivelBorda: "#B48C39",
  disponivelTexto: "#2C312A",
  painelBorda: "#7A8A75",
  painelFundo: "#2C312A",
  texto: "#F8F8F4",
  textoSuave: "#DCE4CC",
  ouroTexto: "#E9CD71",
  douradoLinha: "#B48C39",
  verdeClaro: "#DCE4CC",
};


export function svgCartela(d: DadosCartela): string {
  const W = 1080, H = 1350;
  const colunas = 10;
  const linhas = Math.ceil(d.total / colunas);

  // Título principal (fonte serifada, dourado, com sombra)
  const tamTitulo = Math.max(40, Math.min(120, Math.floor(960 / Math.max(1, d.titulo.length * 0.68))));
  const yTitulo = 72 + tamTitulo * 0.78;

  // Grade entre legenda e painel - desceu 50px
  const topoGrade = 260;
  const baseGrade = 1050;
  const gap = 8;
  const cel = Math.min(
    Math.floor((W - 120 - gap * (colunas - 1)) / colunas),
    Math.floor((baseGrade - topoGrade - gap * (linhas - 1)) / linhas),
  );
  const gradeW = colunas * cel + (colunas - 1) * gap;
  const gradeH = linhas * cel + (linhas - 1) * gap;
  const x0 = Math.round((W - gradeW) / 2);
  const y0 = topoGrade + Math.round((baseGrade - topoGrade - gradeH) / 2);
  const fonteNum = Math.round(cel * 0.42);
  const rx = Math.round(cel * 0.14);
  const fonteNome = Math.max(9, Math.round(cel * 0.15));
  const maxCharsNome = Math.max(4, Math.floor((cel - 8) / (fonteNome * 0.56)));

  const numMin = d.desdeZero ? 0 : 1;
  const largura = String(numMin + d.total - 1).length;
  const celulas: string[] = [];

  for (let n = numMin; n <= numMin + d.total - 1; n++) {
    const i = n - numMin;
    const cx = x0 + (i % colunas) * (cel + gap);
    const cy = y0 + Math.floor(i / colunas) * (cel + gap);
    const pago = d.vendidos.has(n);
    const reservado = !pago && d.reservados.has(n);
    const rotulo = String(n).padStart(largura, "0");
    const tx = cx + cel / 2;
    const tyOcupado = cy + cel * 0.46;
    const tyLivre = cy + cel / 2 + fonteNum * 0.36;
    const tyNome = cy + cel * 0.82;
    const nome = (pago || reservado) ? d.nomes?.get(n) : undefined;
    const nomeTxt = nome ? escaparXml(cortar(nome.trim().split(/\s+/)[0], maxCharsNome)) : "";

    if (pago) {
      celulas.push(
        `<rect x="${cx}" y="${cy}" width="${cel}" height="${cel}" rx="${rx}" fill="url(#pago)" stroke="${C.pagoBorda}" stroke-width="2.5"/>` +
        `<text x="${tx}" y="${tyOcupado}" font-family="DejaVu Serif" font-size="${fonteNum}" font-weight="bold" fill="${C.pagoTexto}" text-anchor="middle">${rotulo}</text>` +
        (nomeTxt ? `<text x="${tx}" y="${tyNome}" font-family="DejaVu Sans" font-size="${fonteNome}" fill="${C.pagoTexto}" text-anchor="middle">${nomeTxt}</text>` : ""),
      );
    } else if (reservado) {
      // RESERVADO = Cinza escuro
      celulas.push(
        `<rect x="${cx}" y="${cy}" width="${cel}" height="${cel}" rx="${rx}" fill="url(#reservado)" stroke="${C.reservadoBorda}" stroke-width="2.5"/>` +
        `<text x="${tx}" y="${tyOcupado}" font-family="DejaVu Serif" font-size="${fonteNum}" font-weight="bold" fill="${C.reservadoTexto}" text-anchor="middle">${rotulo}</text>` +
        (nomeTxt ? `<text x="${tx}" y="${tyNome}" font-family="DejaVu Sans" font-size="${fonteNome}" fill="${C.reservadoTexto}" text-anchor="middle">${nomeTxt}</text>` : ""),
      );
    } else {
      // DISPONÍVEL = Preto/Cinza escuro
      celulas.push(
        `<rect x="${cx}" y="${cy}" width="${cel}" height="${cel}" rx="${rx}" fill="url(#disponivel)" stroke="${C.disponivelBorda}" stroke-width="2.5"/>` +
        `<text x="${tx}" y="${tyLivre}" font-family="DejaVu Serif" font-size="${fonteNum}" font-weight="bold" fill="${C.disponivelTexto}" text-anchor="middle">${rotulo}</text>`,
      );
    }
  }

  // ============================================================
  // CABEÇALHO (coroa, título, nome, risco, chamadas)
  // ============================================================
  const cabecalho = `
    <!-- Raios de luz dourados - só no topo, discretos -->
    <path d="M -40 56 L 190 56 L -40 186 Z" fill="none" stroke="url(#ouroRayo)" stroke-width="2.5" opacity="0.35" transform="rotate(-38 -40 56)"/>
    <path d="M 690 40 L 920 40 L 690 200 Z" fill="none" stroke="url(#ouroRayo)" stroke-width="2.5" opacity="0.35" transform="rotate(36 920 40)"/>
    <circle cx="726" cy="167" r="2.5" fill="#fff6d0" opacity="0.9"/>
    <circle cx="606" cy="20" r="1.8" fill="#fff6d0" opacity="0.9"/>

    <!-- Coroa dourada (topo centro) -->
    <g transform="translate(490, 22) scale(0.92)">
      <path d="M8 32 L4 10 L26 22 L50 3 L74 22 L96 10 L92 32 Z" fill="url(#coroaGrad)" stroke="#6b4510" stroke-width="1"/>
      <rect x="8" y="32" width="84" height="6" rx="2" fill="url(#coroaGrad)" stroke="#6b4510" stroke-width="1"/>
      <circle cx="4" cy="9" r="3.2" fill="url(#coroaGrad)"/><circle cx="50" cy="3" r="3.4" fill="url(#coroaGrad)"/><circle cx="96" cy="9" r="3.2" fill="url(#coroaGrad)"/>
      <circle cx="50" cy="22" r="3" fill="#fff5cc"/><circle cx="28" cy="27" r="2" fill="#fff5cc"/><circle cx="72" cy="27" r="2" fill="#fff5cc"/>
    </g>

    <!-- Título "RIFA" - dourado com gradiente e sombra -->
    <text x="${W / 2}" y="${yTitulo + 4}" font-family="DejaVu Serif" font-size="${tamTitulo}" font-weight="bold" fill="#070a10" fill-opacity="0.7" text-anchor="middle">${escaparXml(d.titulo)}</text>
    <text x="${W / 2}" y="${yTitulo}" font-family="DejaVu Serif" font-size="${tamTitulo}" font-weight="bold" fill="url(#tituloOuro)" stroke="#5a4214" stroke-width="1.5" text-anchor="middle">${escaparXml(d.titulo)}</text>

    <!-- Risco dourado decorativo -->
    <path d="M200 202 C 280 197, 800 197, 880 202 C 800 207, 280 207, 200 202 Z" fill="url(#riscoGrad)"/>

    <!-- Chamadas esquerda -->
    <text x="70" y="135" font-family="DejaVu Sans" font-size="22" font-weight="500" fill="#ffffff" text-anchor="start" letter-spacing="1.5">Sua chance</text>
    <text x="70" y="162" font-family="DejaVu Sans" font-size="22" font-weight="500" fill="#ffffff" text-anchor="start" letter-spacing="1.5">de ganhar</text>
    <text x="70" y="189" font-family="DejaVu Sans" font-size="22" font-weight="800" fill="${C.verdeClaro}" text-anchor="start" letter-spacing="1.5">Está aqui!</text>
    <line x1="68" y1="205" x2="210" y2="205" stroke="url(#chamadaTracoEsq)" stroke-width="2"/>

    <!-- Chamadas direita -->
    <text x="${W - 70}" y="138" font-family="DejaVu Sans" font-size="22" font-weight="600" fill="#f0c75e" text-anchor="end" letter-spacing="2">Concorra</text>
    <text x="${W - 70}" y="165" font-family="DejaVu Sans" font-size="22" font-weight="500" fill="#ffffff" text-anchor="end" letter-spacing="2">e boa sorte!</text>
    <line x1="${W - 210}" y1="182" x2="${W - 68}" y2="182" stroke="url(#chamadaTracoDir)" stroke-width="2"/>
    <circle cx="${W - 139}" cy="182" r="2.5" fill="#fff6d0" filter="url(#brilhoGlow)"/>
  `;

  // ============================================================
  // RODAPÉ (bilhete, premiação, divisória, cédula, preço/sorteio)
  // ============================================================
  const py = 1160, px = 60, pw = W - 120, ph = 168;
  const divX = px + Math.round(pw * 0.52);
  const premios = d.premios.map(fmtPremio).filter(Boolean);
  const curtos = premios.every((p) => p.length <= 14);
  const itens: string[] = [];
  const cabeCol = 3;
  const colunasPremio = curtos && premios.length > cabeCol ? 2 : 1;
  const cabem = colunasPremio * cabeCol;
  const mostrados = premios.length > cabem ? premios.slice(0, cabem - 1) : premios;
  const sobram = premios.length - mostrados.length;
  const larguraCol = (divX - px - 60) / colunasPremio;
  const centroPremioX = px + (divX - px) / 2;
  mostrados.forEach((p, idx) => {
    const col = Math.floor(idx / cabeCol);
    const lin = idx % cabeCol;
    // Centralizado abaixo de PREMIAÇÃO
    const x = colunasPremio === 1 ? centroPremioX : px + 28 + col * larguraCol + larguraCol/2;
    const y = py + 78 + lin * 38;
    const cor = idx === 0 ? C.ouroTexto : C.textoSuave;
    const pLimpo = p.replace(/^\s*\d+\s*[º°]\s*/u, "").trim() || p;
    const texto = `${idx + 1}º ${cortar(pLimpo, colunasPremio === 2 ? 14 : 23)}`;
    const sz = idx === 0 ? 28 : 20;
    const anchor = colunasPremio === 1 ? "middle" : "middle";
    itens.push(`<text x="${x}" y="${y}" font-family="DejaVu Serif" font-size="${sz}" font-weight="bold" fill="${cor}" text-anchor="${anchor}">${escaparXml(texto)}</text>`);
  });
  if (sobram > 0) {
    const idx = mostrados.length;
    const col = Math.floor(idx / cabeCol);
    const lin = idx % cabeCol;
    itens.push(`<text x="${centroPremioX}" y="${py + 78 + lin * 38}" font-family="DejaVu Serif" font-size="20" font-weight="bold" fill="${C.textoSuave}" text-anchor="middle">+ ${sobram} prêmio(s)</text>`);
  }

  const [sorteio1, sorteio2] = linhasSorteio(d.metodo, d.dataSorteio, d.horaSorteio);
  const centroDir = divX + (px + pw - divX) / 2;
  const textoPreco = `${fmtBRL(d.precoCentavos)} cada número`;
  const tamPreco = Math.min(32, Math.floor((px + pw - divX - 50) / (textoPreco.length * 0.68)));

  const rodape = `
    <!-- Painel esquerdo: ícone bilhete horizontal ao lado de PREMIAÇÃO -->
    <g transform="translate(${px + 10}, ${py + 8}) scale(0.78)">
      <g transform="translate(0,0)">
        <path d="M8 12 H64 V21 A5 5 0 0 0 64 31 V41 H8 V31 A5 5 0 0 0 8 21 Z" fill="none" stroke="url(#ticketGrad)" stroke-width="3.2" stroke-linejoin="round"/>
        <line x1="46" y1="15" x2="46" y2="38" stroke="url(#ticketGrad)" stroke-width="2" stroke-dasharray="2.5 2.5"/>
        <path d="M26 18 l2.6 5.2 5.8 0.8 -4.2 4.1 1 5.7 -5.2 -2.7 -5.2 2.7 1 -5.7 -4.2 -4.1 5.8 -0.8 z" fill="url(#ticketGrad)"/>
      </g>
    </g>
    <text x="${px + (divX - px)/2}" y="${py + 38}" font-family="DejaVu Serif" font-size="${Math.min(26, tamPreco)}" font-weight="bold" fill="#e9bf57" text-anchor="middle" letter-spacing="1.2">PREMIAÇÃO</text>
    ${itens.join("\n  ")}

    <!-- Divisória vertical dourada - centro do painel -->
    <line x1="${divX}" y1="${py + 18}" x2="${divX}" y2="${py + ph - 18}" stroke="${C.douradoLinha}" stroke-width="1.8" opacity="0.9"/>

    <!-- Painel direito: ícone cédula + preço/sorteio lado a lado -->
    <g transform="translate(${divX + 22}, ${py + 22}) scale(0.82)">
      <rect x="3" y="5" width="54" height="32" rx="4" fill="none" stroke="url(#cedulaGrad)" stroke-width="3"/>
      <rect x="8" y="10" width="44" height="22" rx="2.5" fill="none" stroke="url(#cedulaGrad)" stroke-width="1.4"/>
      <circle cx="30" cy="21" r="8.2" fill="url(#cedulaGrad)"/>
      <text x="30" y="26" text-anchor="middle" font-family="DejaVu Sans" font-weight="900" font-size="13" fill="#1b2a1d">$</text>
      <circle cx="14" cy="21" r="1.7" fill="url(#cedulaGrad)"/><circle cx="46" cy="21" r="1.7" fill="url(#cedulaGrad)"/>
    </g>
    <text x="${divX + 88}" y="${py + 42}" font-family="DejaVu Serif" font-size="${Math.min(26, tamPreco)}" font-weight="bold" fill="${C.texto}" text-anchor="start">${escaparXml(textoPreco)}</text>
    <text x="${divX + 88}" y="${py + 72}" font-family="DejaVu Sans" font-size="18" font-weight="bold" fill="${C.texto}" text-anchor="start">${escaparXml(sorteio1)}</text>
    <text x="${divX + 88}" y="${py + 98}" font-family="DejaVu Sans" font-size="18" font-weight="bold" fill="${C.texto}" text-anchor="start">${escaparXml(sorteio2)}</text>


  `;

  // ============================================================
  // LEGENDA (Pago · Reservado · Disponível)
  // ============================================================
  const yLeg = 1100;
  const legenda = [
    { rotulo: "Disponível", desc1: "Número livre para", desc2: "compra", fill: "url(#disponivel)", stroke: "#c9a24a" },
    { rotulo: "Reservado", desc1: "Já foi escolhido,", desc2: "aguardando pagamento", fill: "url(#reservado)", stroke: "#8a8d93" },
    { rotulo: "Pago", desc1: "Número confirmado", desc2: "no sorteio", fill: "url(#pago)", stroke: "#c9a24a" },
  ];
  const larguras = legenda.map((l) => 62 + Math.max(l.rotulo.length * 11, ((l as any).desc1.length+2) * 7) + 10);
  const traco = 32;
  const totalLeg = larguras.reduce((a, b) => a + b, 0) + traco * (legenda.length - 1);
  let lx = Math.round((W - totalLeg) / 2);
  const partesLeg: string[] = [];
  // yLeg already set near top (268) but we move legend to below grid: yLeg = py - 45
  legenda.forEach((l, i) => {
    const bx = lx;
    const by = yLeg - 32;
    // square like image: 48x48 with gold border
    partesLeg.push(`<rect x="${bx}" y="${by}" width="48" height="48" rx="8" fill="${l.fill}" stroke="${l.stroke}" stroke-width="2.2"/>`);
    partesLeg.push(`<text x="${bx + 62}" y="${yLeg - 12}" font-family="DejaVu Sans" font-size="19" font-weight="800" fill="${C.texto}">${l.rotulo}</text>`);
    partesLeg.push(`<text x="${bx + 62}" y="${yLeg + 8}" font-family="DejaVu Sans" font-size="13" fill="${C.textoSuave}">${(l as any).desc1}</text>`);
    partesLeg.push(`<text x="${bx + 62}" y="${yLeg + 24}" font-family="DejaVu Sans" font-size="13" fill="${C.textoSuave}">${(l as any).desc2}</text>`);
    lx += larguras[i];
    if (i < legenda.length - 1) {
      // vertical gold separator like image
      partesLeg.push(`<line x1="${lx + 6}" y1="${by + 4}" x2="${lx + 6}" y2="${by + 44}" stroke="#c9a24a" stroke-width="1.6"/>`);
      lx += traco;
    }
  });

  const fumos = `
    <g>
      <ellipse cx="90" cy="270" rx="500" ry="410" fill="url(#fumoEscuro)" opacity="0.68"/>
      <ellipse cx="950" cy="610" rx="560" ry="470" fill="url(#fumoEsmeralda)" opacity="0.48"/>
      <ellipse cx="250" cy="1120" rx="500" ry="390" fill="url(#fumoEscuro)" opacity="0.54"/>
      <ellipse cx="700" cy="270" rx="430" ry="310" fill="url(#fumoClaro)" opacity="0.40"/>
      <ellipse cx="850" cy="1060" rx="380" ry="280" fill="url(#fumoClaro)" opacity="0.24"/>
    </g>`;
  const fios = `
    <g fill="none" stroke="url(#ouroRayo)" stroke-linecap="round">
      <path d="M -100 210 C 170 20 420 290 700 105 S 1050 -20 1170 70" stroke-width="1.15" opacity="0.28"/>
      <path d="M -90 330 C 190 150 440 400 730 220 S 1050 95 1160 180" stroke-width="0.65" opacity="0.22"/>
      <path d="M -80 510 C 230 310 470 590 760 390 S 1050 270 1160 350" stroke-width="1" opacity="0.19"/>
      <path d="M -70 690 C 250 500 520 760 810 570 S 1060 440 1160 520" stroke-width="0.7" opacity="0.18"/>
      <path d="M -50 900 C 290 670 570 980 850 760 S 1070 650 1150 720" stroke-width="1.05" opacity="0.17"/>
      <path d="M 20 1120 C 330 930 620 1230 900 1020 S 1080 930 1140 980" stroke-width="0.7" opacity="0.16"/>
    </g>
    <g fill="none" stroke="#B48C39" stroke-width="0.55" opacity="0.13">
      <path d="M -100 270 C 190 70 420 350 710 150 S 1050 40 1170 120"/>
      <path d="M -80 570 C 240 350 490 640 780 430 S 1060 310 1160 390"/>
      <path d="M -40 1010 C 300 770 580 1080 870 840 S 1080 730 1150 800"/>
    </g>`;

  // ============================================================
  // SVG FINAL
  // ============================================================
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="DejaVu Sans">
  <defs>
    <!-- Fundo degradê verde escuro -->
    <linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.fundoTopo}"/><stop offset="0.48" stop-color="${C.fundoMeio}"/><stop offset="1" stop-color="${C.fundoBase}"/>
    </linearGradient>
    <radialGradient id="vinheta" cx="50%" cy="42%" r="76%">
      <stop offset="0.42" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.32"/>
    </radialGradient>
    <radialGradient id="fumoClaro" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#DCE4CC" stop-opacity="0.18"/>
      <stop offset="0.55" stop-color="#0A6834" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#0A6834" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="fumoEscuro" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#2C312A" stop-opacity="0.34"/>
      <stop offset="0.58" stop-color="#040D06" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#040D06" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="fumoEsmeralda" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#0A6834" stop-opacity="0.28"/>
      <stop offset="0.55" stop-color="#084420" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#084420" stop-opacity="0"/>
    </radialGradient>
    <filter id="desfoqueFumaca" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="38"/>
    </filter>

    <!-- Gradientes das células -->
    <linearGradient id="pago" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.pagoFillTop}"/><stop offset="0.5" stop-color="${C.pagoFillMid}"/><stop offset="1" stop-color="${C.pagoFillBot}"/>
    </linearGradient>
    <linearGradient id="reservado" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.reservadoFillTop}"/><stop offset="0.45" stop-color="${C.reservadoFillMid}"/><stop offset="1" stop-color="${C.reservadoFillBot}"/>
    </linearGradient>
    <linearGradient id="disponivel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.disponivelFillTop}"/><stop offset="0.55" stop-color="${C.disponivelFillMid}"/><stop offset="1" stop-color="${C.disponivelFillBot}"/>
    </linearGradient>

    <!-- Check do pago -->
    <linearGradient id="ouroSelo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F8F8F4"/><stop offset="0.35" stop-color="#E9CD71"/><stop offset="1" stop-color="#B48C39"/>
    </linearGradient>

    <!-- Título dourado -->
    <linearGradient id="tituloOuro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F8F8F4"/><stop offset="0.5" stop-color="#E9CD71"/><stop offset="1" stop-color="#B48C39"/>
    </linearGradient>

    <!-- Risco dourado -->
    <linearGradient id="riscoGrad" x1="0" x2="1">
      <stop offset="0" stop-color="#B48C39" stop-opacity="0"/><stop offset=".25" stop-color="#E9CD71"/><stop offset=".7" stop-color="#F8F8F4"/><stop offset="1" stop-color="#B48C39" stop-opacity="0"/>
    </linearGradient>

    <!-- Traços das chamadas -->
    <linearGradient id="chamadaTracoEsq" x1="0" x2="1">
      <stop offset="0" stop-color="#E9CD71"/><stop offset="0.5" stop-color="#F8F8F4"/><stop offset="1" stop-color="#B48C39" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="chamadaTracoDir" x1="0" x2="1">
      <stop offset="0" stop-color="#B48C39" stop-opacity="0"/><stop offset="0.3" stop-color="#E9CD71"/><stop offset="0.5" stop-color="#F8F8F4"/><stop offset="0.7" stop-color="#E9CD71"/><stop offset="1" stop-color="#B48C39" stop-opacity="0"/>
    </linearGradient>

    <!-- Raios dourados -->
    <linearGradient id="ouroRayo" x1="0" x2="1">
      <stop offset="0" stop-color="#B48C39" stop-opacity="0"/><stop offset="0.45" stop-color="#E9CD71"/><stop offset="0.55" stop-color="#F8F8F4"/><stop offset="1" stop-color="#B48C39" stop-opacity="0"/>
    </linearGradient>

    <!-- Linhas rodapé -->
    <linearGradient id="rodapeTracoEsq" x1="0" x2="1">
      <stop offset="0" stop-color="#B48C39" stop-opacity="0"/><stop offset="1" stop-color="#E9CD71"/>
    </linearGradient>
    <linearGradient id="rodapeTracoDir" x1="0" x2="1">
      <stop offset="0" stop-color="#E9CD71"/><stop offset="1" stop-color="#B48C39" stop-opacity="0"/>
    </linearGradient>

    <!-- Brilho glow -->
    <filter id="brilhoGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="coroaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F8F8F4"/><stop offset=".45" stop-color="#E9CD71"/><stop offset="1" stop-color="#B48C39"/>
    </linearGradient>
    <linearGradient id="ticketGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F8F8F4"/><stop offset=".5" stop-color="#E9CD71"/><stop offset="1" stop-color="#B48C39"/>
    </linearGradient>
    <linearGradient id="cedulaGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F8F8F4"/><stop offset=".5" stop-color="#E9CD71"/><stop offset="1" stop-color="#B48C39"/>
    </linearGradient>
  </defs>

  <!-- Fundo -->
  <rect width="${W}" height="${H}" fill="url(#fundo)"/>
  ${fumos}
  ${fios}
  <rect width="${W}" height="${H}" fill="url(#vinheta)"/>

  <!-- Cabeçalho -->
  ${cabecalho}

  <!-- Grade -->
  ${celulas.join("\n  ")}

  <!-- Painel inferior -->
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="16" fill="${C.painelFundo}" fill-opacity="0.85" stroke="${C.painelBorda}" stroke-width="2"/>
  ${rodape}

  <!-- Legenda -->
  ${partesLeg.join("\n  ")}
</svg>`;
}

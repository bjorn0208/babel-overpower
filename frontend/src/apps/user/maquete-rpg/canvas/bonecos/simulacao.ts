/**
 * Simulação de bonecos (Fase 3) — orientada por conversas reais.
 *
 * Modelo:
 *   - Cada conversa ativa = 1 boneco-lead (id = `lead-${convId}`)
 *   - Cada cargo com conversas ativas = 1 boneco-funcionário fixo no posto
 *     (id = `func-${cargoTipologia}`)
 *   - Lead entra pela porta, anda até uma estação do `cargoTipologia` da
 *     conversa e fica lá enquanto a conversa estiver viva.
 *   - Cargo da conversa muda → lead re-paths pra outra estação.
 *   - Conversa some → lead anda até a porta e faz fade-out.
 *   - Mensagem nova na conversa → balão de 4s acima do boneco
 *     correspondente (lead se papel='lead', funcionário se 'agente').
 *
 * APIs:
 *   - sincronizarConversas(bonecos, conversas): garante presença/ausência
 *   - aplicarBalao(bonecos, evento): seta balão temporário
 *   - tickSimulacao(bonecos, dt): avança movimento (chamado a 60fps)
 */

import {
  COLUNAS,
  ESTACOES,
  LINHAS,
  PORTA,
  TAMANHO_TILE,
} from "../MapaEmpresa";
import { caminho, construirGrid, type Grid, type Tile } from "./pathfinding";
import type {
  CargoTipologia,
  ConversaMaquete,
  EventoMensagem,
} from "../../dados/useConversasMaquete";
import {
  getConfigRuntime,
  tempoEmboraMs,
  tempoEsperaMs,
} from "../../config/configMaquete";

export type TipoBoneco = "funcionario" | "lead";
export type EstadoBoneco =
  | "andando"
  | "trabalhando"
  | "saindo"
  | "removido";

export type SpriteKey =
  | "char0"
  | "char1"
  | "char2"
  | "char3"
  | "char4"
  | "char5"
  | "lead0"
  | "lead1"
  | "lead2"
  | "lead3"
  | "lead4"
  | "lead5"
  | "lead6"
  | "lead7"
  | "lead8"
  | "lead9"
  | "lead10"
  | "lead11"
  | "lead12"
  | "lead13";

export type Direcao = "cima" | "baixo" | "esquerda" | "direita";

export interface Boneco {
  id: string;
  tipo: TipoBoneco;
  rotulo: string;
  sprite: SpriteKey;
  /** tipologia do cargo (funcionário) ou cargo-alvo (lead) */
  cargoTipologia: CargoTipologia;
  /** conversa associada (só lead) */
  conversaId: string | null;
  px: number;
  py: number;
  estado: EstadoBoneco;
  caminho: Tile[];
  estacaoAtualId: string | null;
  /** pilha de balões visíveis. Somem todos juntos quando expiraAteMs vence. */
  baloes?: Array<{ texto: string; criadoEm: number }>;
  /** epoch ms em que TODOS os balões desta pilha vão sumir. */
  baloesExpiraMs?: number;
  /** mensagens aguardando lead chegar na estação pra exibir balão. */
  balaoPendente?: Array<{ texto: string }>;
  /** controle de wander dos funcionários (próxima decisão / âncora cadeira). */
  wanderProximoMs?: number;
  ancoraX?: number;
  ancoraY?: number;
  alpha: number;
  /** direção que o boneco está olhando (deriva do movimento). */
  direcao: Direcao;
  /** epoch ms da última atividade (msg enviada/recebida). Só lead. */
  ultimaAtividade?: number;
  /** lead está na sala de espera aguardando atendimento. */
  naEspera?: boolean;
}

/** Tempo sem mensagens até o lead ir pra sala de espera (lido da config). */
function getEsperaMs() {
  return tempoEsperaMs();
}
/** Tempo sem mensagens até o lead ir embora (sai pela porta). */
function getEmboraMs() {
  return tempoEmboraMs();
}

/**
 * Tiles em frente ao sofá da área de espera central (sofá em x=14..19, y=12).
 * Leads ficam de frente pra câmera (direção "baixo") simulando estar sentados.
 */
// Espalhados em xadrez (gap de 1 tile) pra não ficarem grudados na espera —
// combinado com a reserva de destino em tileEsperaLivre. Tiles bloqueados
// (mesa de centro etc) são descartados em runtime.
const TILES_ESPERA: Tile[] = [
  { x: 13, y: 13 }, { x: 15, y: 13 }, { x: 17, y: 13 }, { x: 19, y: 13 },
  { x: 14, y: 14 }, { x: 16, y: 14 }, { x: 18, y: 14 }, { x: 20, y: 14 },
];

const ROTULO_CARGO: Record<CargoTipologia, string> = {
  atendimento: "Atendimento",
  vendedor: "Vendedor",
  financeiro: "Financeiro",
  suporte: "Suporte",
  mentor: "Mentor",
};

const SPRITE_CARGO: Record<CargoTipologia, SpriteKey> = {
  atendimento: "char0",
  vendedor: "char1",
  financeiro: "char2",
  suporte: "char3",
  mentor: "char4",
};

/** Sprites exclusivos de leads (variações coloridas — não colidem com os funcionários). */
const SPRITES_LEAD: SpriteKey[] = [
  "lead0", "lead1", "lead2", "lead3", "lead4", "lead5", "lead6",
  "lead7", "lead8", "lead9", "lead10", "lead11", "lead12", "lead13",
];

/** Hash determinístico simples → escolhe sprite estável pelo id da conversa. */
function spriteParaLead(convId: string): SpriteKey {
  let h = 0;
  for (let i = 0; i < convId.length; i++) h = (h * 31 + convId.charCodeAt(i)) >>> 0;
  return SPRITES_LEAD[h % SPRITES_LEAD.length];
}

function obstaculosBase(): Tile[] {
  const obs: Tile[] = [];
  for (let x = 0; x < COLUNAS; x++) {
    obs.push({ x, y: 0 });
    obs.push({ x, y: LINHAS - 1 });
  }
  for (let y = 0; y < LINHAS; y++) {
    if (y !== PORTA.y && y !== PORTA.y + 1) obs.push({ x: 0, y });
    obs.push({ x: COLUNAS - 1, y });
  }
  // Cabine de call center: bancada 3×1 (linha e.y) + divisórias laterais que
  // descem até a linha da cadeira (e.y-1). Fundo (norte) aberto = entrada do
  // atendente; frente (sul) tem a divisória baixa onde o lead encosta.
  for (const e of ESTACOES) {
    for (let dx = 0; dx < 3; dx++) obs.push({ x: e.x + dx, y: e.y });
    obs.push({ x: e.x, y: e.y - 1 });
    obs.push({ x: e.x + 2, y: e.y - 1 });
  }
  return obs;
}
const GRID: Grid = construirGrid(obstaculosBase());

/**
 * Tile na frente da mesa onde o lead fica. Recebe um `slot` (0,1,2,...)
 * para espalhar múltiplos leads na mesma estação horizontalmente.
 */
function tileEmFrente(estId: string, slot = 0): Tile | null {
  const est = ESTACOES.find((e) => e.id === estId);
  if (!est) return null;
  const ordem = [0, 1, -1, 2, -2];
  const dx = ordem[slot % ordem.length] ?? 0;
  return {
    x: Math.max(1, Math.min(COLUNAS - 2, est.x + 1 + dx)),
    y: est.y + 1,
  };
}

/** Tile da cadeira (atrás da mesa) — usado pra posicionar o funcionário. */
/** Tile da CADEIRA do funcionário (livre, atrás da mesa — fora dos tiles bloqueados).
 *  Bancada ocupa (est.x..est.x+2, est.y). Cadeira fica em (est.x+1, est.y-1), dentro da cabine. */
function tileCadeira(estId: string): Tile | null {
  const est = ESTACOES.find((e) => e.id === estId);
  if (!est) return null;
  return { x: est.x + 1, y: est.y - 1 };
}

/** Todas as estações de um cargo (primária primeiro, na ordem do ESTACOES). */
function estacoesDoCargo(cargo: CargoTipologia): string[] {
  const cfg = getConfigRuntime().cargos[cargo];
  const todas = ESTACOES.filter((e) => e.cargo === cargo).map((e) => e.id);
  if (cfg?.estacaoId && todas.includes(cfg.estacaoId)) {
    // garante que a estação configurada vem primeiro
    return [cfg.estacaoId, ...todas.filter((id) => id !== cfg.estacaoId)];
  }
  // estação configurada fora do cargo original (admin moveu) — usa só ela
  if (cfg?.estacaoId && ESTACOES.find((e) => e.id === cfg.estacaoId)) {
    return [cfg.estacaoId, ...todas];
  }
  return todas;
}

/** ID da estação primária do cargo (lê config). */
function estacaoPrimaria(cargo: CargoTipologia): string | null {
  return estacoesDoCargo(cargo)[0] ?? null;
}

/** Capacidade máxima de leads por estação antes de abrir outra mesa. */
const LEADS_POR_ESTACAO = 2;

/**
 * Escolhe a melhor estação do cargo para um novo lead:
 * preenche cada mesa até LEADS_POR_ESTACAO antes de abrir a próxima.
 * Se todas estiverem cheias, volta a distribuir na menos carregada.
 */
function escolherEstacaoParaLead(
  cargo: CargoTipologia,
  convId: string,
  bonecos: Boneco[],
): string | null {
  const ests = estacoesDoCargo(cargo);
  if (ests.length === 0) return null;
  // já alocado?
  const jaAlocado = bonecos.find(
    (b) => b.tipo === "lead" && b.conversaId === convId && b.estacaoAtualId,
  );
  if (jaAlocado?.estacaoAtualId && ests.includes(jaAlocado.estacaoAtualId)) {
    return jaAlocado.estacaoAtualId;
  }
  // contagem por estação
  const contagem = new Map<string, number>();
  for (const id of ests) contagem.set(id, 0);
  for (const b of bonecos) {
    if (b.tipo !== "lead" || !b.estacaoAtualId) continue;
    if (b.estado === "saindo" || b.estado === "removido") continue;
    if (!contagem.has(b.estacaoAtualId)) continue;
    if (b.cargoTipologia !== cargo) continue;
    contagem.set(b.estacaoAtualId, (contagem.get(b.estacaoAtualId) ?? 0) + 1);
  }
  // 1ª passada: primeira estação com vaga (< LEADS_POR_ESTACAO), respeitando ordem
  for (const id of ests) {
    if ((contagem.get(id) ?? 0) < LEADS_POR_ESTACAO) return id;
  }
  // 2ª passada: menos carregada
  let melhor = ests[0];
  let menor = contagem.get(melhor) ?? 0;
  for (const id of ests) {
    const n = contagem.get(id) ?? 0;
    if (n < menor) {
      menor = n;
      melhor = id;
    }
  }
  return melhor;
}

/** Slot do lead = índice ordenado por convId entre leads da MESMA estação. */
function slotLead(estacaoId: string, convId: string, bonecos: Boneco[]): number {
  const irmaos = bonecos
    .filter(
      (b) =>
        b.tipo === "lead" &&
        b.estacaoAtualId === estacaoId &&
        b.conversaId &&
        b.estado !== "saindo" &&
        b.estado !== "removido",
    )
    .map((b) => b.conversaId as string);
  if (!irmaos.includes(convId)) irmaos.push(convId);
  irmaos.sort();
  return irmaos.indexOf(convId);
}

const VELOCIDADE = 90;

export function criarEstadoInicial(): Boneco[] {
  return [];
}

/**
 * Sincroniza bonecos com a lista de conversas vivas:
 *  - adiciona leads novos (entram pela porta)
 *  - re-paths leads cujo cargo mudou
 *  - marca leads obsoletos pra sair (estado "saindo")
 *  - garante funcionário fixo de cada cargo presente
 */
export function sincronizarConversas(
  bonecos: Boneco[],
  conversas: ConversaMaquete[],
): Boneco[] {
  const ativos = new Map(conversas.map((c) => [c.id, c]));
  const novos: Boneco[] = [];
  const idsExistentes = new Set<string>();

  const cfgAtual = getConfigRuntime();
  const humanosIdsAtivos = new Set(
    cfgAtual.humanos.filter((h) => h.visivel).map((h) => `humano-${h.id}`),
  );
  // mantém / atualiza existentes (leads primeiro; funcionários reconstruídos depois)
  for (const b of bonecos) {
    idsExistentes.add(b.id);
    if (b.tipo === "funcionario") {
      // humanos preservados só se ainda estão na config
      if (b.id.startsWith("humano-")) {
        if (humanosIdsAtivos.has(b.id)) novos.push(b);
        continue;
      }
      // funcionários automáticos: preservados só se cargo está visível
      // e a estação ainda é a primária configurada.
      if (!cfgAtual.cargos[b.cargoTipologia]?.visivel) continue;
      const ests = estacoesDoCargo(b.cargoTipologia);
      if (b.estacaoAtualId && b.estacaoAtualId === ests[0]) {
        novos.push(b);
      }
      continue;
    }
    // lead
    if (b.estado === "saindo" || b.estado === "removido") {
      novos.push(b);
      continue;
    }
    const conv = b.conversaId ? ativos.get(b.conversaId) : null;
    if (!conv) {
      novos.push(redirecionarParaPorta(b));
      continue;
    }
    // cargo mudou → escolhe nova estação
    if (conv.cargoTipologia !== b.cargoTipologia) {
      b.cargoTipologia = conv.cargoTipologia;
      b.estacaoAtualId = null;
    }
    // garante que tem estação alocada (cargo novo ou perdeu)
    if (!b.estacaoAtualId || !estacoesDoCargo(b.cargoTipologia).includes(b.estacaoAtualId)) {
      const novaEst = escolherEstacaoParaLead(b.cargoTipologia, conv.id, novos);
      if (novaEst) {
        b.estacaoAtualId = novaEst;
        const slot = slotLead(novaEst, conv.id, novos);
        const alvo = tileEmFrente(novaEst, slot);
        if (alvo) {
          const cam = caminho(GRID, pxParaTile(b), alvo);
          if (cam) {
            b.caminho = cam;
            b.estado = "andando";
          }
        }
      }
    }
    b.rotulo = conv.leadNome;
    novos.push(b);
  }

  // adiciona leads de conversas novas
  const agoraMs = Date.now();
  // Primeira sincronização (sem bonecos prévios) = app acabou de abrir.
  // Spawna cada lead JÁ na posição final (espera ou mesa), sem caminhar
  // desde a porta — evita "abriu o app e o lead entra correndo".
  const primeiraSync = bonecos.length === 0;
  for (const c of conversas) {
    const leadId = `lead-${c.id}`;
    if (idsExistentes.has(leadId)) continue;
    const estId = escolherEstacaoParaLead(c.cargoTipologia, c.id, novos);
    const ocioso = agoraMs - c.ultimaMensagemMs >= getEsperaMs();
    const slot = estId ? slotLead(estId, c.id, novos) : 0;
    const alvo = ocioso ? tileEsperaLivre(novos) : estId ? tileEmFrente(estId, slot) : null;
    const spawnTile = primeiraSync && alvo ? alvo : { x: PORTA.x + 1, y: PORTA.y };
    const lead: Boneco = {
      id: leadId,
      tipo: "lead",
      rotulo: c.leadNome,
      sprite: spriteParaLead(c.id),
      cargoTipologia: c.cargoTipologia,
      conversaId: c.id,
      px: spawnTile.x * TAMANHO_TILE + TAMANHO_TILE / 2,
      py: spawnTile.y * TAMANHO_TILE + TAMANHO_TILE / 2,
      estado: primeiraSync && alvo ? "trabalhando" : "andando",
      caminho: [],
      estacaoAtualId: estId,
      alpha: 1,
      direcao: primeiraSync && alvo ? (ocioso ? "baixo" : "cima") : "direita",
      ultimaAtividade: c.ultimaMensagemMs || agoraMs,
      naEspera: ocioso,
    };
    if (!primeiraSync && alvo) {
      const cam = caminho(GRID, pxParaTile(lead), alvo);
      if (cam) lead.caminho = cam;
    }
    novos.push(lead);
  }

  // garante funcionário em cada estação ocupada + primária de cada cargo VISÍVEL.
  const cfg = getConfigRuntime();
  const todosCargos: CargoTipologia[] = ["atendimento", "vendedor", "financeiro", "suporte", "mentor"];
  const estacoesNecessarias = new Map<string, CargoTipologia>(); // estId -> cargo
  for (const cargo of todosCargos) {
    if (!cfg.cargos[cargo]?.visivel) continue;
    const prim = estacaoPrimaria(cargo);
    if (prim) estacoesNecessarias.set(prim, cargo);
  }
  for (const b of novos) {
    if (b.tipo === "lead" && b.estacaoAtualId && !b.naEspera) {
      const est = ESTACOES.find((e) => e.id === b.estacaoAtualId);
      if (est) estacoesNecessarias.set(b.estacaoAtualId, est.cargo);
    }
  }
  const funcsExistentes = new Map(
    novos.filter((b) => b.tipo === "funcionario").map((b) => [b.estacaoAtualId, b]),
  );
  for (const [estId, cargo] of estacoesNecessarias) {
    if (funcsExistentes.has(estId)) continue;
    const est = ESTACOES.find((e) => e.id === estId);
    if (!est) continue;
    const t = tileCadeira(estId);
    if (!t) continue;
    const sprite = (cfg.cargos[cargo]?.sprite ?? SPRITE_CARGO[cargo]) as SpriteKey;
    novos.push({
      id: `func-${estId}`,
      tipo: "funcionario",
      rotulo: ROTULO_CARGO[cargo],
      sprite,
      cargoTipologia: cargo,
      conversaId: null,
      px: t.x * TAMANHO_TILE + TAMANHO_TILE / 2,
      py: t.y * TAMANHO_TILE + TAMANHO_TILE / 2,
      estado: "trabalhando",
      caminho: [],
      estacaoAtualId: estId,
      alpha: 1,
      direcao: "baixo",
    });
  }

  // Humanos (membros do app Equipe) — cada um vira um funcionário fixo
  // na estação configurada, com sprite e rótulo escolhidos.
  const humanosVisiveis = cfg.humanos.filter((h) => h.visivel && h.estacaoId);
  for (const h of humanosVisiveis) {
    const idBoneco = `humano-${h.id}`;
    if (novos.find((b) => b.id === idBoneco)) continue;
    const t = tileCadeira(h.estacaoId);
    if (!t) continue;
    // tira o funcionário automático da MESMA estação se houver (humano assume o posto)
    const idxAuto = novos.findIndex(
      (b) => b.tipo === "funcionario" && b.estacaoAtualId === h.estacaoId && b.id !== idBoneco,
    );
    if (idxAuto >= 0) novos.splice(idxAuto, 1);
    novos.push({
      id: idBoneco,
      tipo: "funcionario",
      rotulo: h.nome,
      sprite: h.sprite as SpriteKey,
      cargoTipologia: h.cargo,
      conversaId: null,
      px: t.x * TAMANHO_TILE + TAMANHO_TILE / 2,
      py: t.y * TAMANHO_TILE + TAMANHO_TILE / 2,
      estado: "trabalhando",
      caminho: [],
      estacaoAtualId: h.estacaoId,
      alpha: 1,
      direcao: "baixo",
    });
  }

  return novos;
}

function pxParaTile(b: Boneco): Tile {
  // px é o CENTRO do tile (tile*16 + 8). Para reverter, floor(px/16).
  // Math.round daria off-by-one em px=8.0 (round(0.5)=1 mas o tile é 0).
  return {
    x: Math.max(1, Math.min(COLUNAS - 2, Math.floor(b.px / TAMANHO_TILE))),
    y: Math.max(1, Math.min(LINHAS - 2, Math.floor(b.py / TAMANHO_TILE))),
  };
}

function redirecionarParaPorta(b: Boneco): Boneco {
  const alvo: Tile = { x: PORTA.x + 1, y: PORTA.y };
  const cam = caminho(GRID, pxParaTile(b), alvo);
  return {
    ...b,
    caminho: cam ?? [],
    estado: "saindo",
  };
}

/** Lead apto a falar: existe no mapa e não está indo embora.
 *  (Relaxado: aparece bolha mesmo se ele ainda estiver chegando ou na espera —
 *  o importante é que esteja visível na cena.) */
function leadEmPosicao(b: Boneco): boolean {
  return (
    b.tipo === "lead" &&
    b.estado !== "saindo" &&
    b.estado !== "removido" &&
    !!b.estacaoAtualId
  );
}

/** Funcionário apto a falar: existe e não está saindo. */
function funcionarioEmPosto(b: Boneco): boolean {
  if (b.tipo !== "funcionario") return false;
  return b.estado !== "saindo" && b.estado !== "removido";
}

/** Encontra o funcionário "dono" da estação do lead. */
function funcionarioDaEstacao(bonecos: Boneco[], estacaoId: string | null): Boneco | null {
  if (!estacaoId) return null;
  return (
    bonecos.find(
      (b) => b.tipo === "funcionario" && b.estacaoAtualId === estacaoId,
    ) ?? null
  );
}

/** Há lead aguardando atendimento na estação deste funcionário? */
function estacaoTemLeadAtivo(bonecos: Boneco[], estacaoId: string | null): boolean {
  if (!estacaoId) return false;
  return bonecos.some(
    (b) =>
      b.tipo === "lead" &&
      b.estacaoAtualId === estacaoId &&
      !b.naEspera &&
      b.estado !== "saindo" &&
      b.estado !== "removido",
  );
}

/** Tempo (ms) de vida da pilha de balões antes de TODOS sumirem juntos. */
const BALAO_VIDA_MS = 15000;

/** Adiciona um texto à pilha de balões e estende o tempo de vida da pilha. */
function empilharBalao(b: Boneco, texto: string, agora: number): Boneco {
  const baloes = [...(b.baloes ?? []), { texto, criadoEm: agora }];
  // mantém até 10 balões empilhados (mensagens em rajada).
  const recortados = baloes.slice(-10);
  return {
    ...b,
    baloes: recortados,
    baloesExpiraMs: agora + BALAO_VIDA_MS,
  };
}

/** Aplica balão temporário ao boneco correspondente.
 *  Só mostra balão quando o lead está frente a frente com o funcionário.
 *  Caso contrário, fica como `balaoPendente` e é promovido quando ele chega. */
export function aplicarBalao(bonecos: Boneco[], ev: EventoMensagem): Boneco[] {
  const agora = Date.now();
  const leadId = `lead-${ev.conversaId}`;
  const lead = bonecos.find((x) => x.id === leadId);
  const leadProntoPraFalar = !!lead && leadEmPosicao(lead);
  return bonecos.map((b) => {
    if (b.id === leadId) {
      let next: Boneco = { ...b, ultimaAtividade: agora };
      if (b.naEspera && b.estacaoAtualId) {
        const slot = slotLead(b.estacaoAtualId, b.conversaId ?? "", bonecos);
        const alvo = tileEmFrente(b.estacaoAtualId, slot);
        if (alvo) {
          const cam = caminho(GRID, pxParaTile(b), alvo);
          if (cam) {
            next.caminho = cam;
            next.estado = "andando";
            next.naEspera = false;
          }
        }
      }
      if (ev.papel === "lead") {
        if (leadProntoPraFalar) next = empilharBalao(next, ev.texto, agora);
        else next.balaoPendente = [...(next.balaoPendente ?? []), { texto: ev.texto }];
      }
      return next;
    }
    if (ev.papel === "agente" && lead) {
      // match preferencial: funcionário NA MESMA estação do lead.
      // fallback: qualquer funcionário do MESMO cargo (humano pode estar em outra mesa).
      const mesmaEstacao =
        b.tipo === "funcionario" &&
        b.estacaoAtualId &&
        b.estacaoAtualId === lead.estacaoAtualId;
      const mesmoCargoSemEstacao =
        b.tipo === "funcionario" &&
        b.cargoTipologia === lead.cargoTipologia &&
        !bonecos.some(
          (x) => x.tipo === "funcionario" && x.estacaoAtualId === lead.estacaoAtualId,
        );
      if (mesmaEstacao || mesmoCargoSemEstacao) {
        if (leadProntoPraFalar) return empilharBalao(b, ev.texto, agora);
        return { ...b, balaoPendente: [...(b.balaoPendente ?? []), { texto: ev.texto }] };
      }
    }
    return b;
  });
}

/** Próximo tile de espera livre (não ocupado por outro lead). */
function tileEsperaLivre(bonecos: Boneco[]): Tile | null {
  const destinoDe = (b: Boneco): Tile | null =>
    b.caminho && b.caminho.length > 0 ? b.caminho[b.caminho.length - 1] : null;
  for (const t of TILES_ESPERA) {
    // descarta tiles que viraram obstáculo (mesa movida etc) — GRID[x][y]=true se livre.
    if (GRID[t.x]?.[t.y] !== true) continue;
    const ocupado = bonecos.some((b) => {
      if (b.tipo !== "lead" || !b.naEspera) return false;
      // já está nesse tile…
      if (
        Math.round(b.px / TAMANHO_TILE) === t.x &&
        Math.round(b.py / TAMANHO_TILE) === t.y
      ) {
        return true;
      }
      // …ou está a caminho dele (reserva o destino pra dois não mirarem o mesmo).
      const d = destinoDe(b);
      return d != null && d.x === t.x && d.y === t.y;
    });
    if (!ocupado) return t;
  }
  // Todos ocupados → não força sobreposição; o lead aguarda onde está.
  return null;
}

/** Avança simulação em dt segundos. Movimento + fade + balão + ócio. */
export function tickSimulacao(bonecos: Boneco[], dt: number): Boneco[] {
  const agora = Date.now();
  const esperaMs = getEsperaMs();
  const emboraMs = getEmboraMs();
  // marca leads ociosos pra ir pra sala de espera ou ir embora
  for (const b of bonecos) {
    if (b.tipo !== "lead") continue;
    if (b.estado === "saindo" || b.estado === "removido") continue;
    if (!b.ultimaAtividade) continue;
    const ocio = agora - b.ultimaAtividade;
    // 1) ir embora — prioritário
    if (ocio >= emboraMs) {
      const alvo: Tile = { x: PORTA.x + 1, y: PORTA.y };
      const cam = caminho(GRID, pxParaTile(b), alvo);
      b.caminho = cam ?? [];
      b.estado = "saindo";
      continue;
    }
    // 2) ir pra espera
    if (b.naEspera) continue;
    if (b.estado !== "trabalhando") continue;
    if (ocio < esperaMs) continue;
    const alvo = tileEsperaLivre(bonecos);
    if (!alvo) continue;
    const cam = caminho(GRID, pxParaTile(b), alvo);
    if (cam) {
      b.caminho = cam;
      b.estado = "andando";
      b.naEspera = true;
    }
  }
  // funcionários: prioridade total ao atendimento — se tem lead na estação,
  // volta pra cadeira (âncora) e fica olhando pra baixo (encarando o lead).
  // Sem lead → wander leve perto da cadeira pra dar vida.
  for (const b of bonecos) {
    if (b.tipo !== "funcionario") continue;
    // ancora = tile da cadeira (bloqueado no grid, mas válido como ponto de
    // referência visual). Usamos pxParaTile (já com Math.floor) pra ficar consistente.
    if (b.ancoraX === undefined || b.ancoraY === undefined) {
      const t0 = pxParaTile(b);
      b.ancoraX = t0.x;
      b.ancoraY = t0.y;
    }
    const temLead = estacaoTemLeadAtivo(bonecos, b.estacaoAtualId);
    const proximo = pxParaTile(b);
    const naCadeira = proximo.x === b.ancoraX && proximo.y === b.ancoraY;
    if (temLead) {
      if (!naCadeira && b.caminho.length === 0) {
        const cam = caminho(GRID, proximo, { x: b.ancoraX, y: b.ancoraY });
        if (cam && cam.length > 0) {
          b.caminho = cam;
          b.estado = "andando";
        }
      }
      if (naCadeira && b.caminho.length === 0) {
        b.direcao = "baixo";
        b.estado = "trabalhando";
      }
      continue;
    }
    // Sem cliente — wander leve (atrás da mesa, em tiles livres).
    if (b.estado !== "trabalhando") continue;
    if (b.caminho.length > 0) continue;
    if (b.wanderProximoMs === undefined) {
      b.wanderProximoMs = agora + 3000 + Math.random() * 6000;
      continue;
    }
    if (agora < b.wanderProximoMs) continue;
    // candidatos = tiles livres logo atrás da mesa (norte da cadeira) e a volta pra cadeira
    const candidatos: Tile[] = [
      { x: b.ancoraX - 1, y: b.ancoraY - 1 },
      { x: b.ancoraX, y: b.ancoraY - 1 },
      { x: b.ancoraX + 1, y: b.ancoraY - 1 },
      { x: b.ancoraX, y: b.ancoraY }, // volta pra cadeira
    ].filter(
      (t) =>
        t.x >= 0 &&
        t.x < COLUNAS &&
        t.y >= 0 &&
        t.y < LINHAS &&
        // permite destino bloqueado SE for a cadeira (ancora)
        (GRID[t.x][t.y] || (t.x === b.ancoraX && t.y === b.ancoraY)),
    );
    const distintos = candidatos.filter(
      (t) => !(t.x === proximo.x && t.y === proximo.y),
    );
    const alvo =
      distintos[Math.floor(Math.random() * distintos.length)] ?? candidatos[0];
    if (alvo) {
      const cam = caminho(GRID, proximo, alvo);
      if (cam && cam.length > 0) {
        b.caminho = cam;
        b.estado = "andando";
      }
    }
    b.wanderProximoMs = agora + 5000 + Math.random() * 8000;
  }

  return bonecos
    .map((b) => avancar({ ...b }, dt, agora))
    .map((b, _i, arr) => {
      // Lead: fala assim que chega na frente da mesa (independe do funcionário).
      if (b.tipo === "lead" && b.balaoPendente && b.balaoPendente.length) {
        if (!leadEmPosicao(b)) return b;
        let next = b;
        for (const p of b.balaoPendente) next = empilharBalao(next, p.texto, agora);
        return { ...next, balaoPendente: undefined };
      }
      // Funcionário: fala assim que está sentado, basta existir um lead na estação dele.
      if (b.tipo === "funcionario" && b.balaoPendente && b.balaoPendente.length && b.estacaoAtualId) {
        if (!funcionarioEmPosto(b)) return b;
        const leadDaEstacao = arr.find(
          (x) => x.tipo === "lead" && x.estacaoAtualId === b.estacaoAtualId && x.estado !== "saindo",
        );
        if (!leadDaEstacao) return b;
        let next = b;
        for (const p of b.balaoPendente) next = empilharBalao(next, p.texto, agora);
        return { ...next, balaoPendente: undefined };
      }
      return b;
    })
    .filter((b) => b.estado !== "removido");
}

function avancar(b: Boneco, dt: number, agora: number): Boneco {
  // expira pilha inteira quando tempo de vida vence
  if (b.baloes && b.baloesExpiraMs && agora >= b.baloesExpiraMs) {
    b.baloes = undefined;
    b.baloesExpiraMs = undefined;
  }

  if (b.estado === "saindo" && b.caminho.length === 0 && b.tipo === "lead") {
    b.direcao = "esquerda";
    b.alpha -= dt * 1.5;
    if (b.alpha <= 0) {
      b.estado = "removido";
      b.alpha = 0;
    }
    return b;
  }

  // funcionários SEM caminho ficam parados (mas podem ter caminho via wander)
  if (b.tipo === "funcionario" && b.caminho.length === 0) {
    b.estado = "trabalhando";
    b.direcao = "baixo";
    return b;
  }

  if (b.estado === "trabalhando" && b.tipo === "lead") return b;

  // andando / saindo com caminho
  if (b.caminho.length === 0) {
    if (b.estado === "andando") {
      b.estado = "trabalhando";
      if (b.tipo === "lead") {
        // na espera: encara o sofá (frente pra câmera); na mesa: encara o funcionário (cima)
        b.direcao = b.naEspera ? "baixo" : "cima";
      }
    }
    return b;
  }
  const prox = b.caminho[0];
  const alvoPx = prox.x * TAMANHO_TILE + TAMANHO_TILE / 2;
  const alvoPy = prox.y * TAMANHO_TILE + TAMANHO_TILE / 2;
  const dx = alvoPx - b.px;
  const dy = alvoPy - b.py;
  const dist = Math.hypot(dx, dy);
  const passo = VELOCIDADE * dt;
  if (Math.abs(dx) > Math.abs(dy)) {
    b.direcao = dx > 0 ? "direita" : "esquerda";
  } else if (dy !== 0) {
    b.direcao = dy > 0 ? "baixo" : "cima";
  }
  if (passo >= dist) {
    b.px = alvoPx;
    b.py = alvoPy;
    b.caminho = b.caminho.slice(1);
  } else {
    b.px += (dx / dist) * passo;
    b.py += (dy / dist) * passo;
  }
  return b;
}

/**
 * CamadaBonecos — renderiza os bonecos animados na cena Pixi.
 *
 * - Mantém estado de simulação em ref (evita re-render do React a cada
 *   frame do Pixi); chama `setVersao` só pra forçar redraw.
 * - Game loop com `requestAnimationFrame` (Pixi v8 + @pixi/react v8 não
 *   expõe `useTick` direto pra componentes filhos sem prop ticker).
 * - Cada boneco = sprite 16×16 (escolhido do char_N) + balão de fala
 *   opcional com fundo branco e texto pequeno.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Rectangle, Texture, TextStyle } from "pixi.js";
import type { CatalogoTexturas } from "../../assets/texturas";
import {
  aplicarBalao,
  criarEstadoInicial,
  sincronizarConversas,
  tickSimulacao,
  type Boneco,
} from "./simulacao";
import { useConversasMaquete } from "../../dados/useConversasMaquete";
import { useConfigMaquete } from "../../config/useConfigMaquete";
import { logicoParaIso, profundidade } from "../isometria";
import { TAMANHO_TILE_LOGICO } from "../gridConstantes";

export interface CamadaBonecosProps {
  texturas: CatalogoTexturas;
  onAbrirConversa?: (conversaId: string) => void;
}

const FRAME_W = 16;
const FRAME_H = 32;
/**
 * Spritesheet 112×96 = 7 col × 3 lin.
 *  - linha 0: olhando pra direita (frente p/ funcionário, que senta na cadeira)
 *  - linha 1: olhando pra cima/de costas (usado pelo lead, que encara o funcionário)
 *  - linha 2: olhando pra esquerda
 */
function recortarFrame(tex: Texture, linha: 0 | 1 | 2): Texture {
  return new Texture({
    source: tex.source,
    frame: new Rectangle(0, linha * FRAME_H, FRAME_W, FRAME_H),
  });
}

export function CamadaBonecos({ texturas, onAbrirConversa }: CamadaBonecosProps) {
  const { conversas, carregando, aoNovaMensagem } = useConversasMaquete();
  const { config } = useConfigMaquete();
  const bonecosRef = useRef<Boneco[]>(criarEstadoInicial());
  const [, setVersao] = useState(0);
  const ultimoTRef = useRef<number | null>(null);

  useEffect(() => {
    if (carregando) return;
    bonecosRef.current = sincronizarConversas(bonecosRef.current, conversas);
    setVersao((v) => (v + 1) % 1000000);
  }, [conversas, config, carregando]);

  useEffect(() => {
    aoNovaMensagem((ev) => {
      bonecosRef.current = aplicarBalao(bonecosRef.current, ev);
    });
  }, [aoNovaMensagem]);

  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      const ult = ultimoTRef.current ?? t;
      const dt = Math.min(0.1, (t - ult) / 1000);
      ultimoTRef.current = t;
      bonecosRef.current = tickSimulacao(bonecosRef.current, dt);
      setVersao((v) => (v + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 3 mapas de sprite por direção: frente (linha 0), costas (linha 1), lado (linha 2).
  // "direita" reutiliza o sprite de lado com flip horizontal.
  const SPRITE_KEYS: Boneco["sprite"][] = [
    "char0", "char1", "char2", "char3", "char4", "char5",
    "lead0", "lead1", "lead2", "lead3", "lead4", "lead5", "lead6",
    "lead7", "lead8", "lead9", "lead10", "lead11", "lead12", "lead13",
  ];
  const texFrente = useMemo(
    () => Object.fromEntries(SPRITE_KEYS.map((k) => [k, recortarFrame(texturas[k], 0)])) as Record<Boneco["sprite"], Texture>,
    [texturas],
  );
  const texCostas = useMemo(
    () => Object.fromEntries(SPRITE_KEYS.map((k) => [k, recortarFrame(texturas[k], 1)])) as Record<Boneco["sprite"], Texture>,
    [texturas],
  );
  const texLado = useMemo(
    () => Object.fromEntries(SPRITE_KEYS.map((k) => [k, recortarFrame(texturas[k], 2)])) as Record<Boneco["sprite"], Texture>,
    [texturas],
  );

  function escolherTextura(b: Boneco): { tex: Texture; flip: boolean } {
    switch (b.direcao) {
      case "cima":
        return { tex: texCostas[b.sprite], flip: false };
      case "baixo":
        return { tex: texFrente[b.sprite], flip: false };
      // linha 2 do spritesheet já está virada pra direita;
      // pra esquerda usamos flip horizontal.
      case "direita":
        return { tex: texLado[b.sprite], flip: false };
      case "esquerda":
        return { tex: texLado[b.sprite], flip: true };
    }
  }

  const estiloBalao = new TextStyle({
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontSize: 11,
    fontWeight: "500",
    fill: 0x1a1a1a,
    lineHeight: 13,
  });
  const estiloRotuloFunc = new TextStyle({
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontSize: 10,
    fontWeight: "700",
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 3 },
  });
  const estiloRotuloLead = new TextStyle({
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontSize: 10,
    fontWeight: "700",
    fill: 0xffe680,
    stroke: { color: 0x000000, width: 3 },
  });

  // Wrap text em ~36 chars por linha — sem limite de linhas (texto completo).
  const formatarBalao = (txt: string): string => {
    const max = 36;
    const palavras = txt.split(/\s+/);
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras) {
      if ((atual + " " + p).trim().length > max) {
        if (atual) linhas.push(atual);
        if (p.length > max) {
          let resto = p;
          while (resto.length > max) {
            linhas.push(resto.slice(0, max));
            resto = resto.slice(max);
          }
          atual = resto;
        } else {
          atual = p;
        }
      } else {
        atual = (atual ? atual + " " : "") + p;
      }
    }
    if (atual) linhas.push(atual);
    return linhas.join("\n");
  };

  const handleClick = (b: Boneco) => {
    if (!onAbrirConversa) return;
    if (b.tipo === "lead" && b.conversaId) {
      onAbrirConversa(b.conversaId);
      return;
    }
    // funcionário → abre a conversa mais recente do cargo (primeiro lead vivo)
    const leadDoCargo = bonecosRef.current.find(
      (x) => x.tipo === "lead" && x.cargoTipologia === b.cargoTipologia && x.conversaId,
    );
    if (leadDoCargo?.conversaId) onAbrirConversa(leadDoCargo.conversaId);
  };

  // Depth sort: bonecos mais ao sul/leste renderizam por cima
  const bonecosOrdenados = [...bonecosRef.current].sort((a, b) => {
    const za = profundidade(a.px / TAMANHO_TILE_LOGICO, a.py / TAMANHO_TILE_LOGICO);
    const zb = profundidade(b.px / TAMANHO_TILE_LOGICO, b.py / TAMANHO_TILE_LOGICO);
    return za - zb;
  });

  return (
    <pixiContainer>
      {bonecosOrdenados.map((b) => {
        const { tex, flip } = escolherTextura(b);
        const estiloRot = b.tipo === "funcionario" ? estiloRotuloFunc : estiloRotuloLead;
        const podeClicar = onAbrirConversa && (b.tipo === "lead" ? !!b.conversaId : true);
        const iso = logicoParaIso(b.px, b.py);
        return (
          <pixiContainer
            key={b.id}
            x={iso.x}
            y={iso.y}
            alpha={b.alpha ?? 1}
            eventMode={podeClicar ? "static" : "auto"}
            cursor={podeClicar ? "pointer" : "default"}
            onPointerTap={podeClicar ? () => handleClick(b) : undefined}
          >
            <pixiGraphics
              draw={(g) => {
                g.clear();
                g.ellipse(0, 4, 7, 2.4).fill({ color: 0x000000, alpha: 0.10 });
                g.ellipse(0, 4, 5, 1.8).fill({ color: 0x000000, alpha: 0.22 });
              }}
            />
            {(() => {
              const parado = !b.caminho || b.caminho.length === 0;
              const t = Date.now() / 1000;
              let h = 0;
              for (let i = 0; i < b.id.length; i++) h = (h * 31 + b.id.charCodeAt(i)) >>> 0;
              const fase = (h % 100) / 100;
              const breath = parado ? 1 + 0.018 * Math.sin(t * 1.6 + fase * Math.PI * 2) : 1;
              // bounce vertical sutil enquanto caminha (passada)
              const bounce = parado ? 0 : -Math.abs(Math.sin(t * 9 + fase * Math.PI * 2)) * 1.2;
              return (
                <pixiContainer y={4 + bounce}>
                  <pixiSprite
                    texture={tex}
                    anchor={{ x: 0.5, y: 1 }}
                    scale={{ x: flip ? -1 : 1, y: breath }}
                  />
                  {/* Headset de call center (só atendentes) */}
                  {b.tipo === "funcionario" && (
                    <pixiGraphics
                      draw={(g) => {
                        g.clear();
                        const cy = -26 * breath;
                        // arco da tiara como polilinha explícita (arc/curve sem
                        // moveTo no Pixi v8 puxava linhas pela cena inteira)
                        const tiara: number[] = [];
                        for (let k = 0; k <= 8; k++) {
                          const a = Math.PI * (1.08 + (0.84 * k) / 8);
                          tiara.push(Math.cos(a) * 6.2, cy + Math.sin(a) * 6.2);
                        }
                        g.poly(tiara, false).stroke({ width: 1.3, color: 0x1b1c20 });
                        if (b.direcao !== "cima") {
                          const lado = b.direcao === "direita" ? 1 : b.direcao === "esquerda" ? -1 : 0;
                          if (lado === 0) {
                            g.rect(-7.4, cy - 1, 2.6, 4).fill(0x1b1c20);
                            g.rect(4.8, cy - 1, 2.6, 4).fill(0x1b1c20);
                            g.poly([-6, cy + 3, -5.4, cy + 6.5, -2, cy + 7.5], false).stroke({ width: 0.9, color: 0x1b1c20 });
                            g.circle(-1.4, cy + 7.5, 1.1).fill(0x3a3d44);
                          } else {
                            g.rect(-1.3, cy - 1, 2.8, 4).fill(0x1b1c20);
                            g.poly([0, cy + 3, 0.6 * lado, cy + 6.5, 4 * lado, cy + 7.2], false).stroke({ width: 0.9, color: 0x1b1c20 });
                            g.circle(4.2 * lado, cy + 7.2, 1.1).fill(0x3a3d44);
                          }
                        }
                      }}
                    />
                  )}
                </pixiContainer>
              );
            })()}
            <pixiText
              text={b.rotulo}
              style={estiloRot}
              anchor={0.5}
              y={-32}
              resolution={3}
            />
            {/* Indicador de status ao lado do rótulo */}
            {(() => {
              const t = Date.now() / 1000;
              const falando = b.baloes && b.baloes.length > 0;
              let cor = 0x6bbf6b; // verde idle
              let pulse = 1;
              if (falando) {
                cor = 0x4ab8ff;
                pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 4));
              } else if (b.tipo === "lead" && !b.caminho?.length) {
                cor = 0xffb347; // âmbar = esperando
                pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.5));
              } else if (b.caminho && b.caminho.length > 0) {
                cor = 0xffffff;
              }
              const raio = b.rotulo.length * 3.2 + 8;
              return (
                <pixiGraphics
                  x={raio}
                  y={-30}
                  draw={(g) => {
                    g.clear();
                    g.circle(0, 0, 2.6).fill({ color: cor, alpha: pulse });
                    g.circle(0, 0, 1.3).fill({ color: 0xffffff, alpha: 0.9 * pulse });
                  }}
                />
              );
            })()}
            {b.baloes && b.baloes.length > 0 && (() => {
              const agoraMs = Date.now();
              const expira = b.baloesExpiraMs ?? agoraMs + 5000;
              const restanteMs = Math.max(0, expira - agoraMs);
              const idadeMs = agoraMs - (b.baloes[0]?.criadoEm ?? agoraMs);
              // fade-in nos 250ms iniciais, fade-out nos 400ms finais
              const fadeIn = Math.min(1, idadeMs / 250);
              const fadeOut = Math.min(1, restanteMs / 400);
              const alphaPilha = Math.min(fadeIn, fadeOut);
              // calcula geometria de cada balão (do mais novo no topo → mais antigo embaixo)
              const charW = 7.2;
              const itens = b.baloes
                .map((bl, idx) => {
                  const txt = formatarBalao(bl.texto);
                  const linhas = txt.split("\n");
                  const maior = linhas.reduce((m, l) => Math.max(m, l.length), 0);
                  const w = Math.max(32, maior * charW + 14);
                  const h = linhas.length * 14 + 12;
                  return { txt, w, h, idx };
                })
                .reverse();
              return (
                <pixiContainer y={-38} alpha={alphaPilha}>
                  {itens.map((it, i) => {
                    // empilha verticalmente: cada balão acima do anterior (gap 3px)
                    const offsetY = itens
                      .slice(0, i)
                      .reduce((acc, prev) => acc - prev.h - 3, 0);
                    const ehBase = i === 0; // mais recente, mais perto da cabeça
                    return (
                      <pixiContainer key={`bl-${it.idx}`} y={offsetY}>
                        <pixiGraphics
                          draw={(g) => {
                            g.clear();
                            const { w, h } = it;
                            g.roundRect(-w / 2 + 0.5, -h + 1.5, w, h, 4).fill({ color: 0x000000, alpha: 0.25 });
                            g.roundRect(-w / 2, -h, w, h, 4)
                              .fill(0xfdfdfb)
                              .stroke({ width: 1, color: 0x2a2a2a, alpha: 0.85 });
                            g.roundRect(-w / 2 + 1, -h + 1, w - 2, 2, 2).fill({ color: 0xffffff, alpha: 0.6 });
                            if (ehBase) {
                              g.moveTo(-3, 0).lineTo(0, 4).lineTo(3, 0).fill(0xfdfdfb).stroke({ width: 1, color: 0x2a2a2a, alpha: 0.85 });
                            }
                          }}
                        />
                        <pixiText
                          text={it.txt}
                          style={estiloBalao}
                          anchor={{ x: 0.5, y: 1 }}
                          y={-5}
                          resolution={3}
                        />
                      </pixiContainer>
                    );
                  })}
                </pixiContainer>
              );
            })()}
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
}

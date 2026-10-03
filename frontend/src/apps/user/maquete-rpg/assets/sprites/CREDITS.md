# Créditos dos sprites

Esta pasta contém sprites pixel-art vendorados de projetos open-source.
Tudo é mantido aqui exatamente como veio do upstream para preservar
direitos autorais e licenças.

## Origem

Todos os PNGs (e o arquivo `LICENSE-pixel-agents.txt`) vêm de:

- **pablodelucca/pixel-agents** — https://github.com/pablodelucca/pixel-agents
- Licença: MIT (veja `LICENSE-pixel-agents.txt`)
- Copyright (c) 2026 Pablo De Lucca

### Sub-créditos (characters)

Os sprites em `characters/char_*.png` são baseados no pack:

- **JIK-A-4 — Metro City Free Top-down Character Pack**
- https://jik-a-4.itch.io/metrocity-free-topdown-character-pack
- Crédito mantido conforme README do upstream.

### Móveis, chão e paredes

Criados pelo Pablo De Lucca em `pixel-agents` e liberados sob MIT.

## O que NÃO veio do upstream

Apenas os PNGs e a LICENSE foram copiados. Todo o **código** da maquete
(rendering, pathfinding, state machine, integração com Supabase) é
implementação própria deste projeto — não é uma cópia da engine do
pixel-agents.

## Estrutura

```
sprites/
  characters/    # 6 personagens (112×96 cada, sprite-sheet 7×6 de 16px)
  floors/        # 9 tiles de chão 16×16
  walls/         # tileset de parede (wall_0.png 64×128)
  furniture/     # móveis com manifest.json e PNGs por orientação
```

Tile base: **16×16 px**.

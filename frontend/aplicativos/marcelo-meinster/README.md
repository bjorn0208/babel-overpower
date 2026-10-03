# 🧠 M Master

Seu construtor de mapas mentais com IA, estilo MindMeister — 100% local.

Digite um tema na barra do topo e a IA monta o mapa mental. Depois é só editar como no MindMeister: duplo clique edita, Tab cria filho, Enter cria irmão, arrastar reorganiza.

## Como rodar

**Jeito fácil (macOS):** duplo clique em **`Abrir M Master.command`** — ele instala as dependências na primeira vez e abre o navegador sozinho. Se o macOS bloquear na primeira abertura ("desenvolvedor não identificado"), clique com o botão direito no arquivo → **Abrir** → **Abrir** (só precisa uma vez).

**Pelo terminal:**

```bash
npm install    # só na primeira vez
npm run dev
```

Abra http://localhost:5173

## Levar para outro Mac

1. O outro Mac precisa do **Node.js** (versão LTS): https://nodejs.org
2. Copie a pasta inteira (pode apagar `node_modules/` antes de zipar — o instalador refaz sozinho e o zip fica leve)
3. Atenção: sua chave da OpenRouter viaja junto dentro do `.env` — envie só para Macs seus
4. Lá, duplo clique em `Abrir M Master.command` (primeira vez: botão direito → Abrir)

## Ativar a IA (OpenRouter)

1. Pegue sua chave em https://openrouter.ai/keys
2. Abra o arquivo `.env` e substitua:
   ```
   OPENROUTER_API_KEY=sk-or-v1-sua-chave-real
   ```
3. Reinicie o `npm run dev`

Sem chave, o app funciona em modo demonstração (gera um mapa de exemplo explicando como ativar).

O modelo é configurável no `.env` (`OPENROUTER_MODEL`) — qualquer modelo da OpenRouter serve. A chave nunca vai ao navegador: a chamada passa pelo endpoint `/api/generate` do servidor Vite.

## Atalhos do editor

| Ação | Como |
|---|---|
| Editar nó | Duplo clique |
| Criar filho | Tab |
| Criar irmão | Enter |
| Apagar nó | Delete |
| Desfazer | Cmd+Z |
| Mover nó | Arrastar |
| Menu do nó | Clique direito |
| Zoom | Scroll / botões |

## Recursos

- ✨ Geração de mapa por IA (qualquer tema ou texto colado)
- 💾 Salvamento automático no navegador (localStorage)
- 🖼 Exportar PNG (se o Chrome bloquear na primeira vez, permita "downloads automáticos" no ícone da barra de endereço)
- 📄 Exportar/backup em JSON
- 🌙 Tema escuro

## Stack

- [mind-elixir](https://github.com/SSShooter/mind-elixir-core) — núcleo do mapa mental (MIT)
- [Vite](https://vitejs.dev) — dev server + endpoint de IA embutido
- [OpenRouter](https://openrouter.ai) — gateway de modelos de IA
- [@zumer/snapdom](https://github.com/zumerlab/snapdom) — captura do mapa em PNG

## Testes

```bash
npm test
```

Testa o parser que converte a resposta da IA em dados do mapa (`src/ai-parser.js`).

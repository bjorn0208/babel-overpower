# mentor-antecipacao — o que sobrou

O motor Anticipatory (portado do Dominic Aknator em 2026-08-24) antecipava a
pergunta do commandbar: enquanto o dono digitava, pré-buscava no banco e
pré-gerava a resposta; no Enter, se o léxico fechava a frase, respondia LOCAL —
sem passar pelo Mentor e sem virar histórico.

**Removido em 2026-09-04 a pedido do Theus**: toda pergunta vai pro Mentor.
Apagados `fiacao-mentor.jsx`, `antecipacao.js`, `executor.js` e
`tags-historico.js` (recuperáveis no git — commit anterior a esta linha).

Ficaram de pé porque o autocorretor da caixa de digitar depende deles:

- `normalizar.js` — `normalizarTexto()`, corrige o que se digita. É o único
  ponto usado pelo `bundle.jsx` hoje.
- `lexico.js` e `motor.js` — dependências de `normalizar.js` (`LEXICO` e
  `normalize`). O resto de `motor.js` (o planejador sintático `plan()`) não é
  mais chamado por ninguém.

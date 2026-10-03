// Service worker do app Rifas standalone (/app/rifas). Escopo restrito —
// não controla o resto da plataforma. Só existe pra satisfazer o critério
// de instalabilidade (PWA instalável); não cacheia nada de propósito —
// o app muda várias vezes por dia (deploy direto), cache velho geraria
// tela quebrada. Sempre busca da rede.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

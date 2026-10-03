// Cérebro Babel — servidor local (respostas sobre os mocks + memória + voz e ditado).
// Escuta apenas em 127.0.0.1. Sem dependências: só node ≥ 18.
// Uso: node cerebro/server.js   (porta BABEL_CEREBRO_PORT, padrão 3078)
// Rotas:
//   GET  /api/info        estado + contagens
//   GET  /api/dados?lista=luzes|conversas|clientes|financeiro|agenda|loja|equipe|cobrancas|contratos|regras
//   GET|POST /api/perguntar     {fala, abrir?} · o Mentor lê o banco com o login de quem pergunta (Authorization + apikey);
//                               com GROQ_API_KEY usa IA com ferramentas; sem chave, respostas prontas sobre os dados reais
//   POST /api/ouvir       áudio → {texto} (Groq Whisper com chave; sem chave, whisper.cpp local na porta 3079)
//   GET  /api/voz?texto=...     mp3 Jarvis (via servidor Edge :3100)
'use strict';

const http = require('node:http');
const assistente = require('./assistente');
const { HttpError } = assistente;

const HOST = '127.0.0.1';
const PORT = Number(process.env.BABEL_CEREBRO_PORT || 3078);
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let n = 0;
    req.on('data', (b) => { n += b.length; if (n > max) { reject(new HttpError(413, 'áudio grande demais')); req.destroy(); } else parts.push(b); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  if (!ALLOWED_HOSTS.has(req.headers.host || '')) return send(res, 421, 'host não permitido');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = url.searchParams;
  const p = url.pathname;
  // login de quem pergunta: o Mentor lê o banco com o token dele (o RLS decide o que ele vê)
  const auth = { token: String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(), apikey: String(req.headers.apikey || '').trim() };

  // o app roda em outra porta (same-site): só barra site de fora (cross-site)
  const fetchedSite = req.headers['sec-fetch-site'];
  const deFora = fetchedSite && fetchedSite !== 'same-origin' && fetchedSite !== 'same-site';
  if (p === '/api/ouvir') {
    if (req.method !== 'POST') throw new HttpError(405, 'use POST');
    if (deFora) throw new HttpError(403, 'origem não permitida');
    return send(res, 200, await assistente.ouvir(await readBody(req, 8 * 1024 * 1024), String(req.headers['content-type'] || '')));
  }
  if (p === '/api/perguntar') {
    if (deFora) throw new HttpError(403, 'origem não permitida');
    let pergunta = q.get('q') || '';
    if (req.method === 'POST') { try { pergunta = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')).q || pergunta; } catch { throw new HttpError(400, 'corpo inválido'); } }
    else if (req.method !== 'GET') throw new HttpError(405, 'use GET ou POST');
    return send(res, 200, await assistente.perguntar(pergunta, auth));
  }
  if (p.startsWith('/api/') && req.method !== 'GET') throw new HttpError(405, 'só leitura');
  if (p === '/api/dados') {
    const d = assistente.listaDados(q.get('lista') || '');
    if (!d) throw new HttpError(404, 'lista desconhecida (luzes, conversas, clientes, financeiro, agenda, loja, equipe, cobrancas, contratos, regras)');
    return send(res, 200, d);
  }
  if (p === '/api/voz') {
    const buf = await assistente.voz(q.get('texto') || '', { voice: q.get('voz') || undefined, rate: q.get('rate') || undefined, pitch: q.get('pitch') || undefined });
    return send(res, 200, buf, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' });
  }
  if (p === '/api/info') return send(res, 200, await assistente.infoCompleta(auth));
  if (p === '/' || p.startsWith('/?')) {
    return send(res, 200, '<!doctype html><meta charset=utf-8><title>Cérebro Babel</title><h1>Cérebro Babel · ok</h1><p>GET /api/info · /api/dados?lista=clientes · /api/perguntar?q=oi · /api/voz?texto=oi</p>', { 'Content-Type': 'text/html; charset=utf-8' });
  }
  if (p.startsWith('/api/')) throw new HttpError(404, 'rota desconhecida');
  throw new HttpError(404, 'não encontrado');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const code = err instanceof HttpError ? err.code : 500;
    if (code >= 500) console.error(err.message || err);
    if (!res.headersSent) send(res, code, { error: err.message || 'erro' });
    else res.destroy();
  });
});

server.listen(PORT, HOST, () => {
  const i = assistente.info();
  console.log(`Cérebro Babel em http://${HOST}:${PORT}  (fonte: ${i.fonte} · groq: ${i.groq ? 'com chave' : 'resposta local'})`);
});

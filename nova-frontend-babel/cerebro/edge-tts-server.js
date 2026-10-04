// Edge TTS wrapper — porta 3100
// POST /tts  { text, voice, rate, pitch } → audio/mpeg
'use strict';
const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.EDGE_TTS_PORT || 3100);
const EDGE_BIN = process.env.EDGE_TTS_BIN || '/Users/administrador/Library/Python/3.9/bin/edge-tts';

const server = http.createServer((req, res) => {
  // CORS para dev local
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method !== 'POST' || !req.url.startsWith('/tts')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Use POST /tts' }));
  }

  let body = '';
  req.on('data', c => { if (body.length < 1e6) body += c; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body); } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'JSON inválido' }));
    }

    const text = String(payload.text || '').slice(0, 4000);
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'texto vazio' }));
    }

    const voice = payload.voice || 'pt-BR-AntonioNeural';
    const args = ['--voice', voice, '--text', text];
    if (payload.rate) args.push('--rate=' + payload.rate);
    if (payload.pitch) args.push('--pitch=' + payload.pitch);
    args.push('--write-media', '/dev/stdout');

    const chunks = [];
    const child = spawn(EDGE_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', c => chunks.push(c));
    child.stderr.on('data', () => {}); // ignora warnings do edge-tts
    child.on('error', err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'spawn fail: ' + err.message }));
    });
    child.on('close', code => {
      if (code !== 0) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'edge-tts exit ' + code }));
      }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.end(Buffer.concat(chunks));
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Edge TTS wrapper em http://127.0.0.1:${PORT}  (bin: ${EDGE_BIN})`);
});
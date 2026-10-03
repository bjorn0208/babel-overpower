// Cérebro Babel — leitura do Supabase com o login de quem pergunta (o RLS decide o que cada um vê).
// O app manda o token da sessão (Authorization) e a chave pública (apikey); nada fica guardado em disco.
'use strict';

const BASE = (process.env.BABEL_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/+$/, '');

// no máximo 6 leituras ao mesmo tempo (o Mac é modesto e divide a CPU com o Docker)
let emVoo = 0;
const fila = [];
const vez = () => new Promise((ok) => { if (emVoo < 6) { emVoo++; ok(); } else fila.push(ok); });
const libera = () => { const p = fila.shift(); if (p) p(); else emVoo--; };
const EU = new Map(); // token → { em, u }

function cliente(token, apikey) {
  if (!token || !apikey) return null;
  const cab = (extra) => ({ apikey, Authorization: `Bearer ${token}`, Accept: 'application/json', ...extra });
  const estado = { falhas: 0 };

  // GET /rest/v1/<tabela>?<qs> → linhas (falha vira lista vazia: um pedaço fora do ar não derruba a resposta)
  async function ler(tabela, qs, { contar = false } = {}) {
    await vez();
    try {
      const r = await fetch(`${BASE}/rest/v1/${tabela}?${qs}`, { headers: cab(contar ? { Prefer: 'count=exact' } : {}), signal: AbortSignal.timeout(20000) });
      if (!r.ok) { if (r.status >= 500 || r.status === 401) estado.falhas++; return contar ? { linhas: [], total: 0 } : []; }
      const linhas = await r.json();
      if (!contar) return Array.isArray(linhas) ? linhas : [];
      const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
      return { linhas: Array.isArray(linhas) ? linhas : [], total: m ? Number(m[1]) : (Array.isArray(linhas) ? linhas.length : 0) };
    } catch { estado.falhas++; return contar ? { linhas: [], total: 0 } : []; }
    finally { libera(); }
  }

  async function rpc(fn, args) {
    try {
      const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify(args || {}), signal: AbortSignal.timeout(8000) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  async function inserir(tabela, linha) {
    try {
      const r = await fetch(`${BASE}/rest/v1/${tabela}`, { method: 'POST', headers: cab({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify(linha), signal: AbortSignal.timeout(8000) });
      return r.ok;
    } catch { return false; }
  }

  // quem é o dono do token (valida a sessão no Auth)
  // o próprio token já diz quem é (sub/email); a assinatura é conferida pelo banco a cada leitura (RLS),
  // então não precisa ir ao Auth — que neste Mac pode demorar sob carga
  function doToken() {
    try {
      const p = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (!p.sub || (p.exp && p.exp * 1000 < Date.now())) return null;
      return { id: p.sub, email: p.email || '' };
    } catch { return null; }
  }
  async function eu() {
    const t = doToken();
    if (t) return t;
    const c = EU.get(token);
    if (c && Date.now() - c.em < 5 * 60 * 1000) return c.u;
    for (let t = 0; t < 2; t++) {
      try {
        const r = await fetch(`${BASE}/auth/v1/user`, { headers: cab({}), signal: AbortSignal.timeout(15000) });
        if (r.status === 401 || r.status === 403) return null; // sessão vencida: não adianta insistir
        if (!r.ok) continue;
        const u = await r.json();
        if (u && u.id) { const v = { id: u.id, email: u.email || '' }; EU.set(token, { em: Date.now(), u: v }); if (EU.size > 100) EU.delete(EU.keys().next().value); return v; }
      } catch { /* tenta de novo */ }
    }
    return null;
  }

  return { ler, rpc, inserir, eu, estado };
}

module.exports = { cliente, BASE };

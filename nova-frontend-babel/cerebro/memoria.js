// Cérebro Babel — memória local (fatos sobre o dono + últimas conversas).
// Fica em cerebro/memoria.json, só nesta máquina. Nunca derruba o assistente.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ARQ = path.join(__dirname, 'memoria.json');
const MAX_FATOS = 60;
const MAX_TURNOS = 8;

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
    return { fatos: Array.isArray(d.fatos) ? d.fatos : [], turnos: Array.isArray(d.turnos) ? d.turnos : [], seq: d.seq || 1 };
  } catch { return { fatos: [], turnos: [], seq: 1 }; }
}

function save(d) {
  try { fs.writeFileSync(ARQ, JSON.stringify(d, null, 1)); }
  catch (e) { console.error('memoria:', e.message); }
}

async function contexto() {
  try {
    const d = load();
    const partes = [];
    if (d.fatos.length) partes.push('O que você sabe do usuário (id: fato):\n' + d.fatos.map((f) => `${f.id}: ${f.fato}`).join('\n'));
    if (d.turnos.length) {
      partes.push('Últimas conversas (mais antiga primeiro):\n' + d.turnos
        .map((t) => `[${t.quando}] Usuário: ${t.pergunta}${t.fala ? `\nBabel: ${t.fala}` : ''}`).join('\n'));
    }
    return partes.join('\n\n');
  } catch { return ''; }
}

async function lembrar(fato) {
  fato = String(fato || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!fato) return false;
  try {
    const d = load();
    const ix = d.fatos.findIndex((f) => f.fato.toLowerCase() === fato.toLowerCase());
    if (ix >= 0) d.fatos[ix] = { id: d.fatos[ix].id, fato };
    else { d.fatos.unshift({ id: d.seq++, fato }); d.fatos = d.fatos.slice(0, MAX_FATOS); }
    save(d);
    return true;
  } catch { return false; }
}

async function esquecer(ids) {
  const lista = [].concat(ids).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!lista.length) return 0;
  try {
    const d = load();
    const antes = d.fatos.length;
    d.fatos = d.fatos.filter((f) => !lista.includes(f.id));
    save(d);
    return antes - d.fatos.length;
  } catch { return 0; }
}

async function esquecerTexto(trecho) {
  trecho = String(trecho || '').toLowerCase().trim();
  if (!trecho) return 0;
  try {
    const d = load();
    const antes = d.fatos.length;
    d.fatos = d.fatos.filter((f) => !f.fato.toLowerCase().includes(trecho));
    save(d);
    return antes - d.fatos.length;
  } catch { return 0; }
}

async function fatos() {
  try { return load().fatos; } catch { return []; }
}

async function registrar({ pergunta, fala }) {
  try {
    const d = load();
    d.turnos.push({ quando: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), pergunta: String(pergunta).slice(0, 500), fala: fala ? String(fala).slice(0, 500) : '' });
    d.turnos = d.turnos.slice(-MAX_TURNOS);
    save(d);
  } catch { /* memória nunca derruba */ }
}

module.exports = { contexto, lembrar, esquecer, esquecerTexto, fatos, registrar };

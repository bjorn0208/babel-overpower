// B-mail API — a ponte entre o PABX e a caixa comercial@babel-os.com na
// HOSTINGER (desde 18/08/2026).
//
// Por que Hostinger e não o Stalwart próprio: o HostGator filtra a entrada da
// porta 25 antes da VPS — o servidor próprio nunca pôde receber do mundo. O
// MX do domínio foi para a Hostinger e esta ponte passou a falar IMAP (ler,
// marcar, mover) e SMTP (enviar, responder) com ela. O contrato HTTP com o
// app NÃO mudou: as mesmas rotas e os mesmos campos de quando era JMAP.
//
// O navegador NUNCA fala IMAP direto: é aqui que ficam o escopo de conta, o
// porteiro (login do PABX) e a credencial única da caixa compartilhada.
import http from 'node:http'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { fetch as undiciFetch } from 'undici'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer/index.js'

const IMAP_HOST = process.env.BMAIL_IMAP_HOST || 'imap.hostinger.com'
const IMAP_PORTA = Number(process.env.BMAIL_IMAP_PORTA || 993)
const SMTP_HOST = process.env.BMAIL_SMTP_HOST || 'smtp.hostinger.com'
const SMTP_PORTA = Number(process.env.BMAIL_SMTP_PORTA || 465)
const CAIXA = process.env.BMAIL_CAIXA || 'comercial@babel-os.com'
const SENHA = process.env.BMAIL_SENHA || ''
const NOME = process.env.BMAIL_NOME || 'Grupo Babel'
const PORTA = Number(process.env.BMAIL_PORTA || 3311)

// ─────────────────── quem está do outro lado ───────────────────
// A ponte guarda UMA credencial da caixa compartilhada. Sem porteiro, quem
// alcançasse esta porta leria e enviaria e-mail como a Babel — por isso ela
// exige o mesmo login do PABX antes de responder qualquer coisa.
const SUPABASE = process.env.BMAIL_SUPABASE || 'https://fimfdajfjorevsfcsywh.supabase.co'
const SUPABASE_ANON = process.env.BMAIL_SUPABASE_ANON || ''
const EXIGIR_LOGIN = process.env.BMAIL_ABERTO !== 'sim'

const cacheQuem = new Map()   // token → { quem, ate }

async function quemEstaFalando(req) {
  if (!EXIGIR_LOGIN) return { nome: 'dev', email: 'dev@local', id: 'dev', etiqueta: 'dev' }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const guardado = cacheQuem.get(token)
  if (guardado && guardado.ate > Date.now()) return guardado.quem

  try {
    const r = await undiciFetch(`${SUPABASE}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
    })
    if (!r.ok) return null
    const u = await r.json()
    if (!u?.id) return null

    const p = await undiciFetch(
      `${SUPABASE}/rest/v1/profiles?user_id=eq.${u.id}&select=nome,ativo,ramal`,
      { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON } },
    )
    const perfil = (await p.json().catch(() => []))[0]
    if (!perfil?.ativo) return null

    const quem = {
      id: u.id,
      email: u.email,
      nome: perfil.nome || u.email,
      ramal: perfil.ramal || null,
      // etiqueta curta, sem espaço nem acento — vira marca IMAP na mensagem
      etiqueta: String(perfil.nome || u.email).normalize('NFD')
        .replace(/[̀-ͯ]/g, '').split(/\s+/)[0].toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'equipe',
    }
    cacheQuem.set(token, { quem, ate: Date.now() + 300_000 })
    return quem
  } catch {
    return null
  }
}

// ─────────────────────────── IMAP ───────────────────────────
// UMA conexão viva, comandos em fila. O IMAP é conversacional: duas rotas
// disputando a mesma conexão trocariam as respostas de lugar — o `fila`
// serializa tudo. Se a conexão cair (a Hostinger derruba ociosos), a próxima
// chamada reconecta sozinha.
let imap = null
let fila = Promise.resolve()

async function conectado() {
  if (imap?.usable) return imap
  if (!SENHA) throw new Error('sem a senha da caixa — defina BMAIL_SENHA no serviço')
  imap = new ImapFlow({
    host: IMAP_HOST, port: IMAP_PORTA, secure: true,
    auth: { user: CAIXA, pass: SENHA },
    logger: false,
  })
  imap.on('error', () => { try { imap.close() } catch { /* já foi */ } })
  await imap.connect()
  return imap
}

function comImap(fn) {
  const passo = fila.then(async () => fn(await conectado()))
  // a fila nunca trava: o erro sai para quem chamou, o próximo segue limpo
  fila = passo.catch(() => {})
  return passo
}

// id opaco para o app: caixa + uid, estáveis enquanto a pasta não é recriada
const idDe = (caixa, uid) => Buffer.from(JSON.stringify([caixa, uid])).toString('base64url')
const deId = (id) => {
  try {
    const [caixa, uid] = JSON.parse(Buffer.from(String(id), 'base64url').toString())
    if (typeof caixa === 'string' && Number.isInteger(uid)) return { caixa, uid }
  } catch { /* cai no erro abaixo */ }
  throw new Error('id de mensagem inválido')
}

// papel (role) de cada pasta, pelo atributo special-use que a Hostinger anuncia
const PAPEL = {
  '\\Sent': 'sent', '\\Drafts': 'drafts', '\\Junk': 'junk',
  '\\Trash': 'trash', '\\Archive': 'archive', '\\Flagged': null, '\\All': null,
}
let caixasCache = { ate: 0, lista: [] }

async function listarCaixas() {
  if (caixasCache.ate > Date.now()) return caixasCache.lista
  const lista = await comImap(async (c) => {
    const pastas = await c.list({ statusQuery: { messages: true, unseen: true } })
    return pastas
      .filter((p) => !p.flags?.has?.('\\Noselect'))
      .map((p, i) => ({
        id: p.path,
        name: p.path === 'INBOX' ? 'Entrada' : p.name,
        role: p.path === 'INBOX' ? 'inbox' : PAPEL[p.specialUse] ?? null,
        totalEmails: p.status?.messages ?? 0,
        unreadEmails: p.status?.unseen ?? 0,
        sortOrder: p.path === 'INBOX' ? 0
          : { sent: 3, drafts: 2, archive: 4, junk: 5, trash: 6 }[PAPEL[p.specialUse]] ?? 10 + i,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  })
  caixasCache = { ate: Date.now() + 20_000, lista }
  return lista
}

async function caixaComPapel(papel) {
  const caixas = await listarCaixas()
  return caixas.find((c) => c.role === papel) || null
}

// ───────────────── janela de mensagens + conversas ─────────────────
// O IMAP não tem "thread" pronto como o JMAP tinha. A conversa nasce aqui:
// mensagens que se referenciam (Message-ID ↔ References) caem no mesmo
// grupo, e o assunto sem os "Re:/Enc:" cobre os clientes que não preenchem
// os cabeçalhos direito.
const JANELA = 300          // quantas mensagens recentes por pasta entram na roda
const cacheJanela = new Map()   // caixa → { ate, itens }
const cachePrevia = new Map()   // id → primeiro pedaço do texto (imutável por uid)
const PREFIXO_DONO = 'dono-'

const chaveAssunto = (s) => String(s || '')
  .replace(/^(\s*(re|res|fw|fwd|enc|rv)\s*:)+/i, '').trim().toLowerCase() || null

function donoDe(flags) {
  for (const f of flags || []) {
    if (String(f).toLowerCase().startsWith(PREFIXO_DONO)) return String(f).slice(PREFIXO_DONO.length)
  }
  return null
}

const comSinais = (v) => {
  const s = String(v || '').trim()
  return s ? (s.startsWith('<') ? s : `<${s}>`) : null
}

async function janela(caixa, { fresca = false } = {}) {
  const guardada = cacheJanela.get(caixa)
  if (!fresca && guardada && guardada.ate > Date.now()) return guardada.itens

  const itens = await comImap(async (c) => {
    const trava = await c.getMailboxLock(caixa)
    try {
      const total = c.mailbox?.exists ?? 0
      if (!total) return []
      const desde = Math.max(1, total - JANELA + 1)
      const saida = []
      for await (const m of c.fetch(`${desde}:*`, {
        uid: true, envelope: true, flags: true, size: true, internalDate: true,
        headers: ['references', 'in-reply-to'],
      })) {
        const cab = m.headers ? m.headers.toString() : ''
        const refs = [...cab.matchAll(/<[^<>\s]+>/g)].map((x) => x[0])
        const env = m.envelope || {}
        saida.push({
          caixa, uid: m.uid,
          id: idDe(caixa, m.uid),
          assunto: env.subject || '',
          de: env.from?.[0] ? { name: env.from[0].name || '', email: env.from[0].address || '' } : null,
          para: (env.to || []).map((t) => ({ name: t.name || '', email: t.address || '' })),
          quando: (m.internalDate || env.date || new Date()).toISOString?.()
            || new Date(m.internalDate || env.date || Date.now()).toISOString(),
          tamanho: m.size ?? 0,
          flags: [...(m.flags || [])],
          messageId: comSinais(env.messageId),
          refs,
          temAnexo: false,   // o IMAP só conta o anexo abrindo a estrutura; a lista vive sem isso
        })
      }
      saida.sort((a, b) => b.uid - a.uid)
      return saida
    } finally {
      trava.release()
    }
  })
  cacheJanela.set(caixa, { ate: Date.now() + 25_000, itens })
  return itens
}

// prévia da lista: o comecinho do texto, baixado UMA vez por mensagem
async function previa(item) {
  if (cachePrevia.has(item.id)) return cachePrevia.get(item.id)
  let texto = ''
  try {
    const bruto = await comImap(async (c) => {
      const trava = await c.getMailboxLock(item.caixa)
      try {
        const { content } = await c.download(item.uid, undefined, { uid: true, maxBytes: 16_384 })
        const pedacos = []
        for await (const p of content) pedacos.push(p)
        return Buffer.concat(pedacos)
      } finally {
        trava.release()
      }
    })
    const mensagem = await simpleParser(bruto)
    texto = (mensagem.text || mensagem.html?.replace(/<[^>]+>/g, ' ') || '')
      .replace(/\s+/g, ' ').trim().slice(0, 140)
  } catch { /* sem prévia não é sem e-mail */ }
  cachePrevia.set(item.id, texto)
  if (cachePrevia.size > 2000) cachePrevia.delete(cachePrevia.keys().next().value)
  return texto
}

// agrupa uma lista de mensagens em conversas (união por referência e assunto)
function agrupar(itens) {
  const pai = new Map()
  const acha = (x) => {
    while (pai.get(x) !== x) { pai.set(x, pai.get(pai.get(x))); x = pai.get(x) }
    return x
  }
  const une = (a, b) => { const ra = acha(a); const rb = acha(b); if (ra !== rb) pai.set(ra, rb) }

  itens.forEach((_, i) => pai.set(i, i))
  const porMarca = new Map()   // message-id ou assunto-chave → índice
  itens.forEach((m, i) => {
    const marcas = [m.messageId, ...m.refs, chaveAssunto(m.assunto) && `s:${chaveAssunto(m.assunto)}`]
    for (const marca of marcas) {
      if (!marca) continue
      if (porMarca.has(marca)) une(i, porMarca.get(marca))
      else porMarca.set(marca, i)
    }
  })

  const grupos = new Map()
  itens.forEach((m, i) => {
    const raiz = acha(i)
    if (!grupos.has(raiz)) grupos.set(raiz, [])
    grupos.get(raiz).push(m)
  })
  return [...grupos.values()].map((g) => g.sort((a, b) => new Date(a.quando) - new Date(b.quando)))
}

const resumoDaConversa = (grupo) => {
  const ultima = grupo[grupo.length - 1]
  return {
    id: ultima.id,
    threadId: ultima.id,
    subject: ultima.assunto || '(sem assunto)',
    from: ultima.de,
    snippet: ultima.previa || '',
    receivedAt: ultima.quando,
    hasAttachment: grupo.some((m) => m.temAnexo),
    unread: grupo.some((m) => !m.flags.includes('\\Seen')),
    flagged: grupo.some((m) => m.flags.includes('\\Flagged')),
    dono: donoDe(ultima.flags) || grupo.map((m) => donoDe(m.flags)).find(Boolean) || null,
    size: ultima.tamanho,
  }
}

function esquecer(caixa) {
  cacheJanela.delete(caixa)
  caixasCache.ate = 0
}

// ─────────────────────────── SMTP ───────────────────────────
const smtp = () => nodemailer.createTransport({
  host: SMTP_HOST, port: SMTP_PORTA, secure: true,
  auth: { user: CAIXA, pass: SENHA },
})

// Cabeçalho é terreno de injeção: uma quebra de linha num valor vira um
// cabeçalho NOVO, escrito pelo cliente. Tudo que sobe para cabeçalho passa
// por aqui — e cabeçalho extra, só os da lista fechada (o descadastro que a
// função de propostas manda). Corpo (texto/html) não precisa disso: ele é
// codificado como conteúdo, não como cabeçalho.
const LINHA_UNICA = /[\r\n\u0000-\u001f\u007f]+/g
const umaLinha = (v) => String(v || '').replace(LINHA_UNICA, ' ').trim()
const CABECALHOS_PERMITIDOS = new Set(['list-unsubscribe', 'list-unsubscribe-post'])
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Monta a mensagem UMA vez: o mesmo bruto vai para o destinatário (SMTP) e
// para a pasta Enviados (IMAP APPEND) — o que se lê depois é exatamente o
// que saiu, byte a byte.
async function enviarPelaHostinger({ para, assunto, texto, html, respostaPara, fio, cabecalhos }) {
  if (!SENHA) throw new Error('sem a senha da caixa — defina BMAIL_SENHA no serviço')
  const extras = {}
  for (const [nome, valor] of Object.entries(cabecalhos || {})) {
    if (CABECALHOS_PERMITIDOS.has(String(nome).toLowerCase())) extras[umaLinha(nome)] = umaLinha(valor)
  }
  const resposta = umaLinha(respostaPara)
  const mensagem = {
    from: { name: NOME, address: CAIXA },
    to: String(para).trim(),
    subject: umaLinha(assunto) || '(sem assunto)',
    ...(texto ? { text: texto } : {}),
    ...(html ? { html } : {}),
    ...(resposta && EMAIL_VALIDO.test(resposta) ? { replyTo: resposta } : {}),
    ...(fio?.inReplyTo ? { inReplyTo: umaLinha(fio.inReplyTo) } : {}),
    ...(fio?.references ? { references: umaLinha(fio.references) } : {}),
    ...(Object.keys(extras).length ? { headers: extras } : {}),
  }
  const bruto = await new MailComposer(mensagem).compile().build()
  const info = await smtp().sendMail({
    envelope: { from: CAIXA, to: [String(para).trim()] },
    raw: bruto,
  })
  try {
    const enviados = await caixaComPapel('sent')
    if (enviados) {
      await comImap((c) => c.append(enviados.id, bruto, ['\\Seen']))
      esquecer(enviados.id)
    }
  } catch { /* a mensagem saiu; falhar o arquivo não desfaz o envio */ }
  return info.messageId || null
}

// ───────────────────────────── rotas ─────────────────────────────

const rotas = {
  // GET /api/mail/mailboxes
  async mailboxes() {
    return listarCaixas()
  },

  // GET /api/mail/threads?mailboxId=&limit=&position=
  async threads(q) {
    const limit = Math.min(Number(q.get('limit') || 50), 100)
    const position = Number(q.get('position') || 0)
    const caixa = q.get('mailboxId') || 'INBOX'
    const itens = await janela(caixa)
    const grupos = agrupar(itens)
      .sort((a, b) => new Date(b[b.length - 1].quando) - new Date(a[a.length - 1].quando))
    const pagina = grupos.slice(position, position + limit)
    // prévia só de quem está na tela — e cada uma é baixada uma vez na vida
    for (const g of pagina) {
      const ultima = g[g.length - 1]
      ultima.previa = await previa(ultima)
    }
    return {
      total: grupos.length,
      position,
      queryState: null,
      threads: pagina.map(resumoDaConversa),
    }
  },

  // GET /api/mail/thread?id=  — a conversa inteira, corpo incluído.
  // A âncora diz de que grupo estamos falando; Entrada e Enviados entram na
  // roda para o fio mostrar os dois lados da conversa.
  async thread(q) {
    const { caixa, uid } = deId(q.get('id'))
    const enviados = await caixaComPapel('sent')
    const caixas = [...new Set([caixa, 'INBOX', enviados?.id].filter(Boolean))]
    const tudo = (await Promise.all(caixas.map((cx) => janela(cx)))).flat()
    const grupo = agrupar(tudo).find((g) => g.some((m) => m.caixa === caixa && m.uid === uid))
    if (!grupo) throw new Error('conversa não encontrada — ela pode ter sido movida')

    // as 15 mais recentes já contam a história; um fio maior só pesa a tela
    const membros = grupo.slice(-15)
    const emails = []
    for (const m of membros) {
      const bruto = await comImap(async (c) => {
        const trava = await c.getMailboxLock(m.caixa)
        try {
          const { content } = await c.download(m.uid, undefined, { uid: true })
          const pedacos = []
          for await (const p of content) pedacos.push(p)
          return Buffer.concat(pedacos)
        } finally {
          trava.release()
        }
      })
      const msg = await simpleParser(bruto)
      emails.push({
        id: m.id,
        subject: m.assunto,
        from: m.de,
        to: m.para,
        cc: (msg.cc?.value || []).map((t) => ({ name: t.name || '', email: t.address || '' })),
        receivedAt: m.quando,
        messageId: comSinais(msg.messageId) || m.messageId,
        references: [...m.refs].join(' ') || null,
        unread: !m.flags.includes('\\Seen'),
        html: msg.html || null,
        texto: msg.text || null,
        anexos: (msg.attachments || []).map((a, i) => ({
          blobId: `${m.id}:${i}`, nome: a.filename || `anexo-${i + 1}`,
          tipo: a.contentType || 'application/octet-stream', tamanho: a.size || 0,
        })),
      })
    }
    return { id: q.get('id'), emails }
  },

  // PATCH /api/mail/marcar  { ids, set: { seen, flagged } }
  async marcar(_q, corpo) {
    const { ids = [], set = {} } = corpo || {}
    if (!ids.length) return { ok: true, alterados: 0 }
    const porCaixa = new Map()
    for (const id of ids) {
      const { caixa, uid } = deId(id)
      if (!porCaixa.has(caixa)) porCaixa.set(caixa, [])
      porCaixa.get(caixa).push(uid)
    }
    let alterados = 0
    for (const [caixa, uids] of porCaixa) {
      await comImap(async (c) => {
        const trava = await c.getMailboxLock(caixa)
        try {
          if (set.seen !== undefined) {
            await c[set.seen ? 'messageFlagsAdd' : 'messageFlagsRemove'](uids, ['\\Seen'], { uid: true })
          }
          if (set.flagged !== undefined) {
            await c[set.flagged ? 'messageFlagsAdd' : 'messageFlagsRemove'](uids, ['\\Flagged'], { uid: true })
          }
        } finally {
          trava.release()
        }
      })
      alterados += uids.length
      esquecer(caixa)
    }
    return { ok: true, alterados, erros: null }
  },

  // PATCH /api/mail/mover — { ids, para: 'trash'|'junk'|'archive'|'inbox' }
  // Nada é apagado de verdade: tudo vira mudança de pasta, e da Lixeira dá
  // para voltar.
  async mover(_q, corpo) {
    const { ids = [], para } = corpo || {}
    if (!ids.length) return { ok: true, movidos: 0 }
    if (!para) throw new Error('falta a pasta de destino')

    let destino = para === 'inbox' ? 'INBOX' : (await caixaComPapel(para))?.id
    if (!destino && para === 'archive') {
      destino = 'INBOX.Archive'   // a Hostinger pendura tudo debaixo de INBOX
      await comImap((c) => c.mailboxCreate(destino).catch(() => {}))
      caixasCache.ate = 0
    }
    if (!destino) throw new Error(`pasta "${para}" não existe nesta caixa`)

    const porCaixa = new Map()
    for (const id of ids) {
      const { caixa, uid } = deId(id)
      if (!porCaixa.has(caixa)) porCaixa.set(caixa, [])
      porCaixa.get(caixa).push(uid)
    }
    let movidos = 0
    for (const [caixa, uids] of porCaixa) {
      if (caixa === destino) { movidos += uids.length; continue }
      await comImap(async (c) => {
        const trava = await c.getMailboxLock(caixa)
        try {
          await c.messageMove(uids, destino, { uid: true })
        } finally {
          trava.release()
        }
      })
      movidos += uids.length
      esquecer(caixa)
    }
    esquecer(destino)
    return { ok: true, movidos, erros: null }
  },

  // PATCH /api/mail/assumir — { ids, soltar? }
  // O dono da conversa vira uma marca IMAP na mensagem (`dono-carlos`):
  // acompanha o e-mail em qualquer cliente, sem tabela à parte. Assumir de
  // novo TROCA o dono — por isso a marca antiga sai antes da nova entrar.
  async assumir(_q, corpo, quem) {
    const { ids = [], soltar = false } = corpo || {}
    if (!ids.length) return { ok: true, marcados: 0 }
    let marcados = 0
    for (const id of ids) {
      const { caixa, uid } = deId(id)
      const itens = await janela(caixa)
      const atual = itens.find((m) => m.uid === uid)
      const donoAtual = atual ? donoDe(atual.flags) : null
      await comImap(async (c) => {
        const trava = await c.getMailboxLock(caixa)
        try {
          if (donoAtual) await c.messageFlagsRemove(uid, [`${PREFIXO_DONO}${donoAtual}`], { uid: true })
          if (!soltar) await c.messageFlagsAdd(uid, [`${PREFIXO_DONO}${quem.etiqueta}`], { uid: true })
        } finally {
          trava.release()
        }
      })
      marcados += 1
      esquecer(caixa)
    }
    return {
      ok: true,
      dono: soltar ? null : quem.etiqueta,
      nome: soltar ? null : quem.nome,
      marcados,
    }
  },

  // GET /api/mail/eu — quem sou eu para esta caixa
  async eu(_q, _corpo, quem) {
    return { id: quem.id, nome: quem.nome, etiqueta: quem.etiqueta, email: quem.email }
  },

  // GET /api/mail/marcadas — as com estrela (Entrada + Arquivados)
  async marcadas(q) {
    const limit = Math.min(Number(q.get('limit') || 50), 100)
    const arquivados = await caixaComPapel('archive')
    const caixas = [...new Set(['INBOX', arquivados?.id].filter(Boolean))]
    const tudo = (await Promise.all(caixas.map((cx) => janela(cx)))).flat()
    const grupos = agrupar(tudo)
      .filter((g) => g.some((m) => m.flags.includes('\\Flagged')))
      .sort((a, b) => new Date(b[b.length - 1].quando) - new Date(a[a.length - 1].quando))
      .slice(0, limit)
    for (const g of grupos) {
      const ultima = g[g.length - 1]
      ultima.previa = await previa(ultima)
    }
    return { total: grupos.length, threads: grupos.map(resumoDaConversa) }
  },

  // POST /api/mail/semear — fazia sentido no servidor de testes; a caixa
  // agora é a REAL, na Hostinger, e não se semeia amostra em caixa de verdade.
  async semear() {
    throw new Error('a caixa agora é a real (Hostinger) — sem conteúdo de exemplo')
  },

  // POST /api/mail/enviar — { para, assunto, texto, html, responder_para?, cabecalhos? }
  async enviar(_q, corpo) {
    const { para, assunto, texto, html, responder_para = null, cabecalhos = null } = corpo || {}
    if (!para || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(para).trim())) {
      throw new Error('endereço de destino inválido')
    }
    if (!assunto && !texto && !html) throw new Error('mensagem vazia')
    const id = await enviarPelaHostinger({
      para, assunto, texto, html,
      respostaPara: responder_para || null,
      cabecalhos: cabecalhos || null,
    })
    return { ok: true, id, de: `${NOME} <${CAIXA}>`, via: 'hostinger' }
  },

  // POST /api/mail/responder — igual ao enviar, mas preso no MESMO fio da
  // conversa (In-Reply-To/References) para o cliente do outro lado encadear.
  async responder(_q, corpo) {
    const { para, assunto, texto, html, responder_a = null } = corpo || {}
    if (!para || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(para).trim())) {
      throw new Error('endereço de destino inválido')
    }
    // controles (\r\n etc.) caem fora: id vindo do cliente não pode virar
    // cabeçalho extra na mensagem
    const semControle = (v) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
    const semSinais = (v) => semControle(v).replace(/[<>]/g, '')
    const fio = {}
    if (responder_a?.messageId) {
      fio.inReplyTo = `<${semSinais(responder_a.messageId)}>`
      fio.references = [
        ...String(responder_a.references || '').split(/\s+/).map(semControle).filter(Boolean),
        `<${semSinais(responder_a.messageId)}>`,
      ].join(' ')
    }
    const id = await enviarPelaHostinger({ para, assunto, texto, html, fio })
    return { ok: true, id, de: `${NOME} <${CAIXA}>`, via: 'hostinger' }
  },

  // GET /api/mail/status — diagnóstico, para saber se a ponte está de pé
  async status() {
    const caixas = await listarCaixas()
    return {
      modo: 'hostinger',
      imap: `${IMAP_HOST}:${IMAP_PORTA}`,
      smtp: `${SMTP_HOST}:${SMTP_PORTA}`,
      conta: CAIXA,
      pastas: caixas.map((c) => `${c.name} (${c.totalEmails})`),
    }
  },
}

// ───────────── imagem remota, só da internet pública ─────────────
// A rota é aberta (o <img> não manda cabeçalho), então a defesa é esta:
// resolvemos o nome ANTES de buscar e recusamos qualquer endereço privado,
// de loopback, link-local ou de metadado de nuvem — em cada salto de
// redirecionamento, que é seguido à mão. Porta, só a padrão do protocolo.
const privadoV4 = (ip) => {
  const [a, b] = ip.split('.').map(Number)
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)      // CGNAT
    || (a === 169 && b === 254)                 // link-local / metadado de nuvem
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))    // faixa de bancada de teste
    || a >= 224                                 // multicast e reservados
}
const enderecoPrivado = (ip, familia) => {
  if (familia === 4) return privadoV4(ip)
  const v6 = String(ip).toLowerCase()
  if (v6 === '::' || v6 === '::1') return true
  if (v6.startsWith('::ffff:')) {               // IPv4 disfarçado de IPv6
    const v4 = v6.slice(7)
    return isIP(v4) === 4 ? privadoV4(v4) : true
  }
  return /^(f[cd]|fe[89ab])/.test(v6)           // ULA fc00::/7 e link-local fe80::/10
}

async function hostPublico(hostname) {
  const nome = hostname.replace(/^\[|\]$/g, '')
  try {
    const respostas = isIP(nome)
      ? [{ address: nome, family: isIP(nome) }]
      : await lookup(nome, { all: true, verbatim: true })
    return respostas.length > 0 && respostas.every((r) => !enderecoPrivado(r.address, r.family))
  } catch {
    return false
  }
}

// E para a rota aberta não virar relé de imagem de terceiros: teto por IP.
// 90 buscas por minuto cobrem qualquer e-mail cheio de figura; um script
// puxando banda em série bate no teto e recebe 429.
const ritmoImagem = new Map()   // ip → { ate, usos }
function dentroDoRitmo(ip) {
  const agora = Date.now()
  if (ritmoImagem.size > 5000) ritmoImagem.clear()
  const r = ritmoImagem.get(ip)
  if (!r || r.ate < agora) { ritmoImagem.set(ip, { ate: agora + 60_000, usos: 1 }); return true }
  r.usos += 1
  return r.usos <= 90
}

async function buscarImagemPublica(endereco) {
  let alvo = endereco
  for (let salto = 0; salto < 3; salto++) {
    let u
    try { u = new URL(alvo) } catch {
      throw Object.assign(new Error('endereço inválido'), { codigo: 400 })
    }
    const portaPadrao = u.protocol === 'https:' ? '443' : '80'
    if (!/^https?:$/.test(u.protocol) || u.username || u.password
        || (u.port && u.port !== portaPadrao)
        || !(await hostPublico(u.hostname))) {
      throw Object.assign(new Error('endereço fora da internet pública'), { codigo: 400 })
    }
    const r = await undiciFetch(u, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get('location')
      if (!destino) throw new Error('redirecionamento sem destino')
      alvo = new URL(destino, u).toString()    // o próximo salto revalida tudo
      continue
    }
    const tipo = r.headers.get('content-type') || ''
    if (!r.ok || !tipo.startsWith('image/')) throw new Error('não é imagem')
    const corpo = Buffer.from(await r.arrayBuffer())
    if (corpo.length > 5_000_000) throw Object.assign(new Error('imagem grande demais'), { codigo: 413 })
    return { tipo, corpo }
  }
  throw new Error('redirecionamentos demais')
}

// ───────────────────────────── servidor ─────────────────────────────

// Só o app da Babel pode chamar esta ponte de outro domínio — CORS aberto
// deixaria qualquer site usar o token de quem estivesse logado no PABX.
const ORIGENS_CONFIAVEIS = new Set([
  'https://babel-pabx.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://127.0.0.1:${PORTA}`,
  `http://localhost:${PORTA}`,
  ...(process.env.BMAIL_ORIGENS || '').split(',').map((o) => o.trim()).filter(Boolean),
])

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`)
  const origem = req.headers.origin
  if (origem && ORIGENS_CONFIAVEIS.has(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  }
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }

  // Imagens remotas dos e-mails passam por aqui: o navegador nunca bate no
  // servidor do remetente (que registraria IP e abertura). Sem login porque
  // o <img> do iframe não carrega cabeçalho — e é exatamente por estar
  // aberta que esta rota só alcança a internet PÚBLICA: endereço interno,
  // porta fora de 80/443 e redirecionamento não conferido virariam um túnel
  // para dentro da VPS (SSRF). Cada salto é resolvido e validado antes de ir.
  if (url.pathname === '/api/mail/proxy-image') {
    // atrás do Caddy o IP real vem no x-forwarded-for; direto, no socket
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket.remoteAddress || 'desconhecido'
    if (!dentroDoRitmo(ip)) {
      res.writeHead(429, { 'Content-Type': 'text/plain' })
      res.end('muitas imagens de uma vez — aguarde um instante')
      return
    }
    try {
      const bruto = await buscarImagemPublica(url.searchParams.get('u') || '')
      res.writeHead(200, { 'Content-Type': bruto.tipo, 'Cache-Control': 'private, max-age=3600' })
      res.end(bruto.corpo)
    } catch (e) {
      const codigo = e?.codigo || 502
      res.writeHead(codigo, { 'Content-Type': 'text/plain' })
      res.end('imagem indisponível')
    }
    return
  }

  const nome = url.pathname.replace(/^\/api\/mail\/?/, '')
  const rota = rotas[nome]
  if (!rota) { res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ erro: `rota desconhecida: ${nome}` })); return }

  const quem = await quemEstaFalando(req)
  if (!quem) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ erro: 'entre no BabelPhone para abrir o B-Mail' }))
    return
  }

  let corpo = null
  if (req.method !== 'GET') {
    const partes = []
    for await (const p of req) partes.push(p)
    try { corpo = JSON.parse(Buffer.concat(partes).toString() || '{}') } catch { corpo = {} }
  }

  try {
    const dados = await rota(url.searchParams, corpo, quem)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(dados))
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ erro: String(e.message || e) }))
  }
})

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`B-mail API em http://127.0.0.1:${PORTA}/api/mail/  →  ${CAIXA} @ ${IMAP_HOST}`)
})

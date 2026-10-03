// WhatsApp do contato: saber se o número aceita e montar o link.
//
// Fixo não tem WhatsApp — abrir a conversa num número fixo só mostra "número
// inválido" para o vendedor. A regra é a do Brasil: 11 dígitos com 9 na frente
// do número, depois de tirar o código do país.
export function ehCelular(fone) {
  const d = String(fone || '').replace(/\D/g, '').replace(/^55/, '')
  return d.length === 11 && d[2] === '9'
}

// Link SEM texto pronto: a conversa abre em branco e o vendedor escreve o que
// a ligação pediu. O 55 é retirado antes de ser recolocado porque parte da base
// está salva com o código do país e parte sem — sem isso sairia "5555119…".
export function linkWhatsapp(fone) {
  const d = String(fone || '').replace(/\D/g, '').replace(/^55/, '')
  return `https://wa.me/55${d}`
}

// ─────────── apresentação/proposta pela conversa ───────────
// O domínio é sempre o da marca (proposta.babel-os.com), nunca *.vercel.app:
// a prévia do WhatsApp e o filtro de spam julgam o link pelo domínio.
const CASA_PROPOSTA = 'https://proposta.babel-os.com'

export function linkProposta({ empresa, vendedor, emailVendedor, zapVendedor } = {}) {
  const p = new URLSearchParams({ proposta: '1' })
  if (empresa) p.set('para', empresa)
  if (vendedor) p.set('de', vendedor)
  if (emailVendedor) p.set('mail', emailVendedor)
  if (zapVendedor) p.set('zap', zapVendedor)
  return `${CASA_PROPOSTA}/?${p.toString()}`
}

export function msgApresentacao(ctx) {
  return 'Olá, nos falamos agora por ligação. Segue abaixo a nossa apresentação do '
    + 'Sistema Operacional Babel OS. Tenho certeza que irá gostar, obrigado pelo retorno! 🤖'
    + `\n\n${linkProposta(ctx)}`
}

// Conversa já aberta com a apresentação pronta e o link da proposta — o
// vendedor só confere e aperta enviar. (Era "abre em branco e digita"; virou
// reclamação real em 19/08: a conversa vinha vazia.)
export function linkWhatsappProposta(fone, ctx) {
  const d = String(fone || '').replace(/\D/g, '').replace(/^55/, '')
  return `https://wa.me/55${d}?text=${encodeURIComponent(msgApresentacao(ctx))}`
}

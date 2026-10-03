// Corpo de e-mail é HTML hostil escrito por um estranho. Aqui ele é preparado
// para ser exibido dentro de um <iframe sandbox> sem allow-scripts e sem
// allow-same-origin — o isolamento é a primeira camada. Esta função é a
// segunda: mesmo que o iframe falhe, nada aqui faz o navegador buscar recurso
// externo nem executar script.
//
// As listas abaixo são a parte que se aprende apanhando. Bloquear `img[src]` é
// o óbvio e é insuficiente: o rastreio entra por `srcset`, pelo atributo
// `background` de <table>/<td> (HTML antigo, muito usado em newsletter), por
// `poster` de <video> e por `xlink:href` dentro de SVG. Um `<style>` com
// @import ou @font-face também faz requisição e entrega o IP de quem leu.

// Todo atributo capaz de disparar uma requisição para fora.
const ATRIBUTOS_EXTERNOS = [
  'src', 'srcset', 'poster', 'background', 'xlink:href', 'data-src', 'data-srcset',
]

// Guardamos o valor original em `bloqueado-*` em vez de apagar: quando a pessoa
// clica em "exibir imagens", basta devolver — sem re-processar o HTML inteiro.
const PREFIXO = 'bloqueado-'

// Só estes protocolos podem virar link. Deixa de fora javascript:, vbscript:,
// data: e file:. `cid:` fica porque é a imagem embutida na própria mensagem.
const PROTOCOLO_OK = /^(?:https?|ftp|mailto|tel|callto|cid|xmpp):/i

const TAGS_PROIBIDAS = [
  'script', 'style', 'link', 'meta', 'base', 'object', 'embed', 'applet',
  'iframe', 'frame', 'frameset', 'form', 'input', 'button', 'textarea', 'select',
]

const ehExterno = (url) => /^(?:https?:)?\/\//i.test(String(url || '').trim())

/**
 * Devolve { html, imagensBloqueadas } pronto para o srcdoc do iframe.
 * `exibirImagens` só deve vir true depois de um clique explícito da pessoa,
 * e mesmo assim as imagens passam pelo proxy — nunca o navegador batendo
 * direto no servidor de terceiro (é assim que o pixel confirma a leitura e
 * entrega o IP do vendedor).
 */
export function prepararCorpo(htmlBruto, { exibirImagens = false, proxy = null } = {}) {
  const doc = new DOMParser().parseFromString(String(htmlBruto || ''), 'text/html')
  let imagensBloqueadas = 0

  for (const tag of TAGS_PROIBIDAS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove())
  }

  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const nome = attr.name.toLowerCase()

      // qualquer on*: onclick, onerror, onload… onerror em <img> é o clássico
      if (nome.startsWith('on')) { el.removeAttribute(attr.name); continue }

      if (ATRIBUTOS_EXTERNOS.includes(nome)) {
        if (!ehExterno(attr.value)) continue
        if (exibirImagens && proxy) {
          el.setAttribute(nome, `${proxy}?u=${encodeURIComponent(attr.value)}`)
        } else {
          el.setAttribute(PREFIXO + nome, attr.value)
          el.removeAttribute(attr.name)
          imagensBloqueadas += 1
        }
        continue
      }

      if (nome === 'href') {
        const v = String(attr.value || '').trim()
        // âncora interna e protocolo permitido passam; o resto vira nada
        if (!v.startsWith('#') && !PROTOCOLO_OK.test(v)) { el.removeAttribute(attr.name); continue }
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer external')
        continue
      }

      // style inline fica, mas sem url() — é rota de requisição externa
      if (nome === 'style' && /url\s*\(/i.test(attr.value)) {
        el.setAttribute('style', attr.value.replace(/url\s*\([^)]*\)/gi, 'none'))
      }
    }
  }

  return { html: doc.body.innerHTML, imagensBloqueadas }
}

// O que vai no sandbox junto com o corpo. A CSP aqui é a terceira camada:
// mesmo com o HTML já limpo, o navegador se recusa a buscar qualquer coisa
// que não seja imagem vinda do nosso proxy.
export function montarSrcdoc(htmlLimpo, { proxy = null } = {}) {
  const imgSrc = proxy ? `${new URL(proxy, location.origin).origin} data:` : 'data:'
  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
<style>
  html,body{margin:0;padding:12px;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;word-break:break-word}
  img{max-width:100%;height:auto}
  table{max-width:100%}
  blockquote{margin:0 0 0 .8em;padding-left:.8em;border-left:2px solid #d0d0d0;color:#555}
  a{color:#1a56db}
</style></head><body>${htmlLimpo}</body></html>`
}

// Modelo de e-mail do Grupo Babel — o design nasce do texto.
//
// Este e-mail vai para quem JÁ FALOU com a gente por telefone e pediu para
// receber a proposta. Por isso a copy não explica a empresa do zero: ela
// retoma a conversa, entrega o que foi combinado e tira o atrito do próximo
// passo. Nada de "descobrimos sua empresa" — a pessoa lembra da ligação.
//
// Cabeçalho INFINITO: o gradiente lilás → branco escorre para dentro do corpo
// sem borda, sem cartão e sem fundo preto. Gmail e Outlook engolem gradiente
// CSS, então o degradê é uma imagem hospedada com branco sólido por trás — se
// a imagem não carregar, o topo fica branco limpo em vez de quebrar.
//
// Regras de montagem, todas visíveis no próprio texto:
//   • linha começando com emoji + a linha seguinte → cartão de destaque
//   • linha começando com 👉                        → botão
//   • 1ª linha                                      → saudação
//   • o resto                                       → parágrafo

const BASE = 'https://fimfdajfjorevsfcsywh.supabase.co/storage/v1/object/public/logos/marca'
export const LOGO_URL = `${BASE}/babel-logo.png`
export const GRADIENTE_URL = `${BASE}/hero-gradiente.png`
// espelho do de cima: sai do branco do corpo e mergulha no lilás — é o que dá
// o fechamento com a mesma cara do cabeçalho, sem emenda dos dois lados
export const GRADIENTE_BAIXO_URL = `${BASE}/hero-gradiente-baixo.png`

// A landing page ainda não existe e o e-mail não anuncia site nenhum: até lá,
// o botão abre uma resposta para o comercial — que é o passo que a copy pede.
// TROCAR AQUI quando a LP existir: vira o destino dos dois botões.
export const LINK_LP = 'mailto:comercial@babel-os.com'
  + '?subject=' + encodeURIComponent('Quero ver a proposta da Babel')

// O headline fica fora do texto editável: é a assinatura da campanha.
export const HERO_PERGUNTA = 'Sua empresa fala línguas diferentes?'
export const HERO_TITULO = ['É hora de', 'unificar.']
export const HERO_BOTAO = 'Ver a proposta'
// fechamento: mesmo tratamento do cabeçalho, encerrando a leitura
export const FECHAMENTO_TITULO = 'Deixe com a Babel'
export const FECHAMENTO_BOTAO = 'Ver a proposta completa'

export const ASSUNTO_MARKETING = '{{primeiro_nome}}, a proposta que combinamos por telefone'

export const TEXTO_MARKETING = `Olá, {{primeiro_nome}},

Nós conversamos por telefone e você pediu para receber a nossa proposta — ela está no botão acima, e a leitura leva dois minutos.

Antes dela, o resumo do que a Babel resolve, do jeito que você descreveu na ligação: hoje cada área da sua empresa fala uma língua.

A Babel é um sistema operacional consciente para o seu negócio: unifica dados, comunicação e memória em uma única linguagem, que qualquer pessoa do time consulta a qualquer hora. A consciência artificial que atende e vende 24 horas, faz o follow-up, gera contrato, faz ligação e muitas outras funcionalidades em um lugar só — e isso acontece sozinho, sem que nada do que sua empresa sabe se perca.

Um abraço,
Equipe Grupo Babel`

// paleta tirada da logo
const ROXO_FUNDO = '#2B1044'
const ROXO = '#3C1A5B'
const ROXO_CLARO = '#5B2E86'
const LILAS = '#D7BBE6'
const LILAS_CLARO = '#F3EAF8'
const BRANCO = '#FFFFFF'
const TEXTO = '#231A2E'
const TEXTO_FRACO = '#6B5C7A'

const escapar = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))

const COMECA_COM_EMOJI = /^(\p{Extended_Pictographic}️?)\s+(.*)$/u
const FONTE = "'Helvetica Neue',Helvetica,Arial,sans-serif"

export function trocarVariaveis(texto, { primeiroNome } = {}) {
  const nome = String(primeiroNome || '').trim().split(/\s+/)[0] || ''
  return String(texto || '')
    .replace(/\{\{\s*primeiro_nome\s*\}\}/g, nome)
    // sem nome, "Olá, ," seria um tapa na cara — vira "Olá,"
    .replace(/(Olá|Ola|Oi),\s*,/gi, '$1,')
    .replace(/^,\s*/, '')
}

export function assunto(ctx) {
  // sem o nome, sobra ", a proposta…" — vira "A proposta…", com maiúscula
  const s = trocarVariaveis(ASSUNTO_MARKETING, ctx).replace(/^[,\s]+/, '').trim()
  return (s || 'A proposta que combinamos por telefone').replace(/^./, (c) => c.toUpperCase())
}

export function corpoTexto(texto, ctx) {
  const corpo = trocarVariaveis(texto ?? TEXTO_MARKETING, ctx)
  return `${HERO_PERGUNTA}\n${HERO_TITULO.join(' ')}\n\n${corpo}`
}

// rótulo curto para o botão: sem ponto final, começando em maiúscula
function rotuloBotao(frase) {
  const curto = String(frase)
    .replace(/^Responda a este e-?mail para\s+/i, '')
    .replace(/[.…]+\s*$/, '')
    .trim()
  return (curto || HERO_BOTAO).replace(/^./, (c) => c.toUpperCase())
}

function botao(rotulo) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    <td align="center" bgcolor="${ROXO}" style="border-radius:999px;
        background:linear-gradient(135deg,${ROXO_CLARO} 0%,${ROXO} 100%)">
      <a href="${LINK_LP}" style="display:inline-block;padding:16px 40px;font-family:${FONTE};
         font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:.2px">
        ${escapar(rotulo)}
      </a>
    </td>
  </tr></table>`
}

export function montarEmailHtml(texto, ctx = {}) {
  const linhas = trocarVariaveis(texto ?? TEXTO_MARKETING, ctx).split('\n')
  const blocos = []
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    if (!linha) continue
    const cta = linha.match(/^👉\s*(.*)$/u)
    if (cta) { blocos.push({ tipo: 'cta', texto: cta[1] }); continue }
    const destaque = linha.match(COMECA_COM_EMOJI)
    const proxima = (linhas[i + 1] || '').trim()
    if (destaque && proxima && !COMECA_COM_EMOJI.test(proxima) && !/^👉/u.test(proxima)) {
      blocos.push({ tipo: 'cartao', emoji: destaque[1], titulo: destaque[2], texto: proxima })
      i++
      continue
    }
    blocos.push({ tipo: blocos.length === 0 ? 'saudacao' : 'paragrafo', texto: linha })
  }

  const corpo = blocos.map((b) => {
    if (b.tipo === 'cta') {
      return `<tr><td align="center" style="padding:16px 30px 34px">${botao(rotuloBotao(b.texto))}</td></tr>`
    }
    if (b.tipo === 'cartao') {
      return `<tr><td style="padding:0 30px 10px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               bgcolor="${LILAS_CLARO}" style="border-radius:16px">
          <tr>
            <td width="54" align="center" valign="top" style="padding:18px 0 18px 18px;font-size:23px;line-height:1">${b.emoji}</td>
            <td style="padding:18px 20px 18px 12px;font-family:${FONTE}">
              <p style="margin:0 0 3px;font-size:16px;font-weight:700;color:${ROXO};line-height:1.35">${escapar(b.titulo)}</p>
              <p style="margin:0;font-size:11px;line-height:1.6;color:${TEXTO_FRACO}">${escapar(b.texto)}</p>
            </td>
          </tr>
        </table>
      </td></tr>`
    }
    const peso = b.tipo === 'saudacao' ? '700' : '400'
    // corpo 3px menor que a versão anterior (16→13 e 18→15); os TÍTULOS —
    // hero e títulos de cartão — ficam no tamanho de antes, de propósito.
    const tamanho = b.tipo === 'saudacao' ? '15px' : '13px'
    return `<tr><td style="padding:0 30px 18px;font-family:${FONTE};font-size:${tamanho};
                  font-weight:${peso};line-height:1.7;color:${TEXTO}">${escapar(b.texto)}</td></tr>`
  }).join('')

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Grupo Babel</title></head>
<body style="margin:0;padding:0;background:${BRANCO}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">
  A proposta que combinamos: unifique dados, atendimento e memória da sua empresa em uma só linguagem.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRANCO}"
       style="background:${BRANCO}">
  <tr><td align="center">

    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
           style="width:600px;max-width:100%;background:${BRANCO}">

      <!-- CABEÇALHO INFINITO: o degradê escorre do lilás para o branco do corpo,
           sem borda e sem cartão. bgcolor branco = rede de segurança. -->
      <tr><td align="center" bgcolor="${LILAS}" background="${GRADIENTE_URL}"
              style="background-color:${LILAS};
                     background-image:url('${GRADIENTE_URL}');
                     background-repeat:no-repeat;background-position:top center;background-size:100% 100%;
                     padding:38px 26px 30px">

        <img src="${LOGO_URL}" width="56" height="56" alt="Grupo Babel"
             style="display:block;border:0;border-radius:50%;width:56px;height:56px">

        <div style="font-family:${FONTE};font-size:12px;letter-spacing:3.5px;text-transform:uppercase;
                    color:${ROXO_FUNDO};font-weight:700;padding:12px 0 0">Grupo Babel</div>

        <div style="font-family:${FONTE};font-size:16px;line-height:1.5;color:${ROXO};
                    padding:44px 0 8px;opacity:.85">${HERO_PERGUNTA}</div>

        <div style="font-family:${FONTE};font-size:42px;line-height:1.06;font-weight:700;
                    color:${ROXO_FUNDO};letter-spacing:-1px;padding:0 0 30px">
          ${HERO_TITULO[0]}<br>${HERO_TITULO[1]}
        </div>

        ${botao(HERO_BOTAO)}
      </td></tr>

      <!-- CORPO: continua do branco em que o degradê terminou -->
      <tr><td style="padding:36px 0 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${corpo}
        </table>
      </td></tr>

      <!-- FECHAMENTO + RODAPÉ, num degradê só: o cabeçalho de cabeça para
           baixo. Nasce do branco em que o texto acabou e mergulha no lilás até
           a última linha — o e-mail termina na cor da marca, sem corte seco. -->
      <tr><td align="center" bgcolor="${BRANCO}" background="${GRADIENTE_BAIXO_URL}"
              style="background-color:${BRANCO};
                     background-image:url('${GRADIENTE_BAIXO_URL}');
                     background-repeat:no-repeat;background-position:bottom center;background-size:100% 100%;
                     padding:34px 26px 30px">

        <div style="font-family:${FONTE};font-size:40px;line-height:1.06;font-weight:700;
                    color:${ROXO_FUNDO};letter-spacing:-1px;padding:10px 0 26px">
          ${FECHAMENTO_TITULO}
        </div>

        ${botao(FECHAMENTO_BOTAO)}

        <div style="font-family:${FONTE};font-size:11px;line-height:1.7;color:${ROXO};
                    padding:34px 0 0;font-weight:700">Grupo Babel</div>
        <div style="font-family:${FONTE};font-size:11px;line-height:1.7;color:#5C4771;padding:1px 0 0">
          o sistema operacional consciente do seu negócio
        </div>
        <div style="font-family:${FONTE};font-size:10px;line-height:1.6;color:#6E5A83;padding:12px 0 0">
          Você recebeu este e-mail porque nos passou seu contato durante nossa conversa.<br>
          Responda com “sair” e não escrevemos mais.
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`
}

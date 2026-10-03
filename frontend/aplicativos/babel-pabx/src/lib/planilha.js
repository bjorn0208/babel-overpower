// Leitura de planilha de leads — usado pela Prospecção (CRM) e pela aba
// Listas. Mora aqui para existir UM leitor só: corrigir um formato estranho
// conserta os dois lugares de uma vez.

const COLUNAS_PLANILHA = {
  // ordem não importa mais para o casamento (ver mapearCabecalho): quando
  // duas colunas batem no mesmo cabeçalho, vence o apelido mais específico —
  // "nome do contato" não cai mais em "empresa" só por conter "nome".
  empresa: ['empresa', 'nome fantasia', 'razao social', 'nome da empresa', 'nome do negocio',
    'nome do estabelecimento', 'estabelecimento', 'negocio', 'company', 'business name', 'nome'],
  telefone: ['telefone comercial', 'contato telefone', 'numero whatsapp', 'whatsapp numero',
    'telefone whatsapp', 'numero de telefone', 'phone number', 'telefone', 'whatsapp', 'celular',
    'fone', 'zap', 'tel', 'numero', 'número', 'phone', 'mobile', 'cel'],
  cidade: ['cidade', 'municipio', 'município', 'city'],
  estado: ['estado', 'sigla uf', 'uf', 'state'],
  nicho: ['tipo de negocio', 'categoria de negocio', 'nicho', 'segmento', 'ramo', 'categoria',
    'atividade', 'niche', 'setor', 'industry'],
  site: ['website', 'homepage', 'pagina', 'página', 'site', 'link', 'url'],
  instagram: ['instagram', 'insta', 'rede social', 'perfil', 'ig'],
  cnpj: ['cnpj', 'documento'],
  email: ['e-mail', 'e mail', 'correio eletronico', 'email', 'mail'],
  endereco: ['endereco', 'endereço', 'logradouro', 'localizacao', 'address', 'rua'],
  contato_nome: ['nome do contato', 'nome contato', 'responsavel', 'responsável', 'proprietario',
    'proprietaria', 'decisor', 'atendente', 'contato', 'dono'],
  observacoes: ['observacoes', 'observações', 'anotacoes', 'comentarios', 'comentários',
    'informacoes', 'descricao', 'descrição', 'observacao', 'notas', 'obs', 'info'],
}

export const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

export function mapearCabecalho(cabecalho) {
  const mapa = {}
  cabecalho.forEach((titulo, i) => {
    const t = semAcento(titulo)
    if (!t) return
    let melhor = null
    for (const [campo, apelidos] of Object.entries(COLUNAS_PLANILHA)) {
      for (const a of apelidos) {
        if ((t === a || t.includes(a)) && (!melhor || a.length > melhor.tam)) melhor = { campo, tam: a.length }
      }
    }
    if (melhor) mapa[i] = melhor.campo
  })
  return mapa
}

export function celulaPareceTelefone(v) {
  const limpo = String(v ?? '').replace(/[\s().\-+]/g, '')
  return /^\d{8,13}$/.test(limpo)
}

export function detectarColunasPorConteudo(linhas) {
  const nCols = linhas.reduce((m, l) => Math.max(m, l.length), 0)
  const amostra = linhas.slice(0, 30)
  let colTelefone = -1, melhorTel = 0
  for (let c = 0; c < nCols; c++) {
    const vals = amostra.map((l) => l[c]).filter((v) => v && String(v).trim())
    if (vals.length < 2) continue
    const score = vals.filter(celulaPareceTelefone).length / vals.length
    if (score > 0.6 && score > melhorTel) { melhorTel = score; colTelefone = c }
  }
  let colEmpresa = -1
  for (let c = 0; c < nCols; c++) {
    if (c === colTelefone) continue
    const vals = amostra.map((l) => l[c]).filter((v) => v && String(v).trim())
    if (vals.length < 2) continue
    const score = vals.filter((v) => /[a-zA-Zà-úÀ-Ú]{2,}/.test(String(v))
      && !/@/.test(String(v)) && !/^https?:/i.test(String(v))).length / vals.length
    if (score > 0.6) { colEmpresa = c; break }
  }
  return { colTelefone, colEmpresa }
}

export function normalizarTelefoneBR(bruto) {
  let d = String(bruto || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)                    // DDI 55
  if ((d.length === 11 || d.length === 12) && d[0] === '0') d = d.slice(1)    // "0" de interurbano
  if (d.length === 10 && '6789'.includes(d[2])) d = d.slice(0, 2) + '9' + d.slice(2) // 9º dígito faltando
  return d
}

export function montarLead(c, userId, origem) {
  const dossie = {}
  if (c.instagram) dossie.instagram = c.instagram.trim()
  if (c.cnpj) dossie.cnpj = c.cnpj.trim()
  if (c.email) dossie.email = c.email.trim()
  if (c.observacoes) dossie.observacoes = c.observacoes.trim()
  // Todo lead sai com o MESMO conjunto de chaves (valor ou null) — o insert
  // em lote do PostgREST rejeita o lote inteiro se um objeto tiver chaves
  // diferentes do outro (uma planilha real quase sempre tem linha sem cidade,
  // sem nicho etc.; isso sozinho zerava toda importação).
  // dono: quem importa fica com o contato só para si — ele não entra na fila
  // da equipe (regra de 18/08; a base antiga, sem dono, segue compartilhada)
  const lead = { origem, criado_por: userId, dono: userId, status: 'novo' }
  for (const k of ['empresa', 'cidade', 'estado', 'nicho', 'site', 'endereco', 'contato_nome']) {
    lead[k] = (c[k] && String(c[k]).trim()) || null
  }
  lead.telefone = normalizarTelefoneBR(c.telefone) || null
  lead.dossie = Object.keys(dossie).length ? dossie : null
  return lead
}

export function lerCsv(texto) {
  const semBom = texto.replace(/^\ufeff/, '')
  const sep = (semBom.split('\n')[0].match(/;/g) || []).length >
    (semBom.split('\n')[0].match(/,/g) || []).length ? ';' : ','
  const linhas = []
  let linha = [], celula = '', dentroAspas = false
  for (let i = 0; i < semBom.length; i++) {
    const ch = semBom[i]
    if (dentroAspas) {
      if (ch === '"' && semBom[i + 1] === '"') { celula += '"'; i++ }
      else if (ch === '"') dentroAspas = false
      else celula += ch
    } else if (ch === '"') dentroAspas = true
    else if (ch === sep) { linha.push(celula); celula = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && semBom[i + 1] === '\n') i++
      linha.push(celula); celula = ''
      if (linha.some((c) => c.trim())) linhas.push(linha)
      linha = []
    } else celula += ch
  }
  linha.push(celula)
  if (linha.some((c) => c.trim())) linhas.push(linha)
  return linhas
}

// Lê o arquivo e devolve as linhas + de onde veio cada coluna. Aceita .xlsx,
// .csv e planilha sem cabeçalho nenhum (aí identifica pelo conteúdo).
export async function lerArquivoDeLeads(arq) {
  let linhas
  if (/\.(xlsx|xls)$/i.test(arq.name)) {
    const XLSX = await import('xlsx')   // só baixa a biblioteca quando precisa
    const wb = XLSX.read(await arq.arrayBuffer(), { type: 'array' })
    linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
      .map((l) => l.map((c) => String(c ?? '')))
      .filter((l) => l.some((c) => c.trim()))
  } else {
    linhas = lerCsv(await arq.text())
  }
  if (!linhas || !linhas.length) return { erro: 'Planilha vazia ou sem linhas de dados.' }

  let mapa = mapearCabecalho(linhas[0])
  let dados = linhas.slice(1)
  if (!Object.values(mapa).includes('empresa') && !Object.values(mapa).includes('telefone')) {
    const { colTelefone, colEmpresa } = detectarColunasPorConteudo(linhas)
    if (colTelefone >= 0 || colEmpresa >= 0) {
      mapa = {}
      if (colTelefone >= 0) mapa[colTelefone] = 'telefone'
      if (colEmpresa >= 0) mapa[colEmpresa] = 'empresa'
      dados = linhas   // sem cabeçalho: a 1ª linha também é dado
    }
  }
  if (!Object.values(mapa).includes('empresa') && !Object.values(mapa).includes('telefone')) {
    return { erro: 'Não encontrei nome nem telefone no arquivo — confira se essas informações estão nele.' }
  }
  return { mapa, dados }
}

// Transforma as linhas em leads prontos para gravar, sem repetidos.
export function montarLeadsDaPlanilha({ mapa, dados, userId, origem, categoria, arquivo }) {
  const vistos = new Set()
  const leads = []
  let puladas = 0
  for (const l of dados) {
    const c = {}
    for (const [i, campo] of Object.entries(mapa)) {
      if (l[i] && String(l[i]).trim()) c[campo] = String(l[i])
    }
    const lead = montarLead(c, userId, origem)
    if (!lead.nicho && categoria?.trim()) lead.nicho = categoria.trim()
    if (arquivo) lead.lote_importacao = arquivo
    if (!lead.empresa && !lead.telefone) { puladas++; continue }
    if (!lead.empresa) lead.empresa = lead.telefone
    const chave = lead.telefone || semAcento(lead.empresa)
    if (vistos.has(chave)) { puladas++; continue }
    vistos.add(chave)
    leads.push(lead)
  }
  return { leads, puladas }
}

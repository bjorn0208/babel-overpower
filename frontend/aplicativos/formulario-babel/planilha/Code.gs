/**
 * Chupa-Cabra Babel — Apps Script da planilha.
 *
 * Cole este arquivo em Extensões → Apps Script da planilha, cadastre a
 * propriedade TOKEN e publique como app da web (passo a passo no README).
 *
 * Ações aceitas (POST JSON com { token, acao, ... }):
 *   ping             → { ok: true }
 *   dados            → { cabecalho: [...], linha: [...], produtos?: { cabecalho, linhas } }
 *                      grava 1 linha na aba "Dados" e, se vier, 1 linha por item na aba "Produtos"
 *   conversas        → { aba, linhas: [[nome, conversa], ...], novo }  grava na aba do tenant
 *   total_conversas  → { id_envio, total, aba }  preenche "Conversas trazidas" na linha do envio
 */

var ABA_DADOS = "Dados";
var ABA_PRODUTOS = "Produtos";
var COL_TOTAL_OFFSET = 1; // "Conversas trazidas" é a penúltima coluna; "ID do envio" é a última

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var corpo = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var token = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (!token || corpo.token !== token) return responder({ ok: false, erro: "token inválido" });

    lock.waitLock(30000);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    switch (corpo.acao) {
      case "ping": return responder({ ok: true });
      case "dados": return responder(gravarDados(ss, corpo));
      case "conversas": return responder(gravarConversas(ss, corpo));
      case "total_conversas": return responder(atualizarTotal(ss, corpo));
      default: return responder({ ok: false, erro: "ação desconhecida: " + corpo.acao });
    }
  } catch (err) {
    return responder({ ok: false, erro: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (ignorado) {}
  }
}

function doGet() {
  return responder({ ok: true, servico: "chupa-cabra", dica: "use POST" });
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function gravarDados(ss, corpo) {
  if (!corpo.linha || !corpo.linha.length) return { ok: false, erro: "linha vazia" };
  var aba = ss.getSheetByName(ABA_DADOS);
  if (!aba) {
    aba = ss.insertSheet(ABA_DADOS, 0);
    var cab = corpo.cabecalho || [];
    if (cab.length) {
      aba.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight("bold").setBackground("#f1f3f4");
      aba.setFrozenRows(1);
      aba.setFrozenColumns(2);
    }
  } else if (corpo.cabecalho && corpo.cabecalho.length) {
    // Reescreve a linha 1 se o cabeçalho mudou (ex.: perguntas novas no formulário).
    // Campos novos são sempre acrescentados no fim, então as colunas antigas não mudam de lugar.
    var atual = aba.getLastRow() === 0 ? [] : aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    if (atual.join("\u0001") !== corpo.cabecalho.join("\u0001")) {
      aba.getRange(1, 1, 1, corpo.cabecalho.length).setValues([corpo.cabecalho]).setFontWeight("bold").setBackground("#f1f3f4");
      aba.setFrozenRows(1);
    }
  }
  var linhaN = aba.getLastRow() + 1;
  // Formato "@" (texto) antes de escrever: telefone/CNPJ/Pix não viram número nem perdem zero à esquerda.
  var faixa = aba.getRange(linhaN, 1, 1, corpo.linha.length);
  faixa.setNumberFormat("@");
  faixa.setValues([corpo.linha.map(function (v) { return v === null || v === undefined ? "" : String(v); })]);
  faixa.setVerticalAlignment("top");
  var totalProdutos = corpo.produtos ? gravarProdutos(ss, corpo.produtos) : 0;
  return { ok: true, linha: linhaN, produtos: totalProdutos };
}

// Aba "Produtos": uma linha por produto/serviço, com "Enviado em", "ID do envio" e "Empresa" na frente.
function gravarProdutos(ss, produtos) {
  var linhas = produtos.linhas || [];
  var cab = produtos.cabecalho || [];
  if (!linhas.length) return 0;
  var aba = ss.getSheetByName(ABA_PRODUTOS);
  if (!aba) {
    aba = ss.insertSheet(ABA_PRODUTOS, Math.min(1, ss.getNumSheets()));
    aba.setFrozenColumns(4);
  }
  if (cab.length) {
    var atual = aba.getLastRow() === 0 ? [] : aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    if (atual.join("\u0001") !== cab.join("\u0001")) {
      aba.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight("bold").setBackground("#f1f3f4");
      aba.setFrozenRows(1);
    }
  }
  var largura = linhas.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
  var inicio = aba.getLastRow() + 1;
  var faixa = aba.getRange(inicio, 1, linhas.length, largura);
  faixa.setNumberFormat("@");
  faixa.setValues(linhas.map(function (l) {
    var fila = [];
    for (var i = 0; i < largura; i++) fila.push(l[i] === null || l[i] === undefined ? "" : String(l[i]));
    return fila;
  }));
  faixa.setVerticalAlignment("top");
  return linhas.length;
}

function nomeAbaDisponivel(ss, base) {
  var nome = String(base || "Sem nome").replace(/[\[\]\*\/\\\?\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Sem nome";
  if (nome === ABA_DADOS || nome === ABA_PRODUTOS) nome = nome + " (tenant)";
  var candidato = nome;
  var n = 2;
  while (ss.getSheetByName(candidato)) {
    candidato = nome + " (" + n + ")";
    n++;
  }
  return candidato;
}

function gravarConversas(ss, corpo) {
  var linhas = corpo.linhas || [];
  var nome = corpo.aba;
  var aba;
  if (corpo.novo) {
    // 1º lote deste envio: se já existe uma aba com esse nome (envio anterior), cria "Nome (2)".
    nome = nomeAbaDisponivel(ss, nome);
    aba = ss.insertSheet(nome);
    aba.getRange(1, 1, 1, 2).setValues([["Contato", "Conversa"]]).setFontWeight("bold").setBackground("#f1f3f4");
    aba.setFrozenRows(1);
    aba.setColumnWidth(1, 220);
    aba.setColumnWidth(2, 760);
  } else {
    aba = ss.getSheetByName(nome);
    if (!aba) return { ok: false, erro: "aba não encontrada: " + nome };
  }
  if (linhas.length) {
    var inicio = aba.getLastRow() + 1;
    var faixa = aba.getRange(inicio, 1, linhas.length, 2);
    faixa.setNumberFormat("@");
    faixa.setValues(linhas.map(function (par) { return [String(par[0] || ""), String(par[1] || "")]; }));
    faixa.setVerticalAlignment("top");
    aba.getRange(inicio, 2, linhas.length, 1).setWrap(true);
  }
  return { ok: true, aba: nome, linhas: linhas.length };
}

function atualizarTotal(ss, corpo) {
  var aba = ss.getSheetByName(ABA_DADOS);
  if (!aba || aba.getLastRow() < 2) return { ok: false, erro: "aba Dados vazia" };
  var ultimaCol = aba.getLastColumn();
  var ids = aba.getRange(2, ultimaCol, aba.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(corpo.id_envio)) {
      var linha = i + 2;
      aba.getRange(linha, ultimaCol - COL_TOTAL_OFFSET).setValue(String(corpo.total));
      return { ok: true, linha: linha };
    }
  }
  return { ok: false, erro: "id_envio não encontrado: " + corpo.id_envio };
}

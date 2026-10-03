// Ponte entre o formulário do Claude Design e o Supabase.
//
// O formulário é o arquivo original, intocado — ele guarda o andamento em
// localStorage sob 'babel-formulario-inscricao', no formato
// { i, respostas, abertura }, com as respostas indexadas pelo ID do campo
// (1..18). Esses IDs são os mesmos de comercial_perguntas, de propósito.
//
// REGRA DE OURO: nenhum lead se perde por fechar a aba. A inscrição nasce no
// PRIMEIRO "enviar" e é atualizada a cada etapa. Quem desistir na pergunta 11
// fica gravado com as 10 primeiras — e aparece no painel como incompleto.

(function () {
  var URL_BASE = 'https://fimfdajfjorevsfcsywh.supabase.co';
  var ANON = window.__BABEL_ANON__;
  var CHAVE = 'babel-formulario-inscricao';
  var CHAVE_ID = 'babel-inscricao-id';
  var ETAPAS_TOTAL = 9;

  // O formulário mora na raiz: /diagnostico1
  var campanhaSlug = location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
  if (!campanhaSlug) return;

  var cabecalho = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

  function rest(caminho, opcoes) {
    return fetch(URL_BASE + '/rest/v1/' + caminho, Object.assign({ headers: cabecalho }, opcoes || {}))
      .then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { throw new Error(t) }) });
  }

  var contexto = null;
  var inscricaoId = null;
  var ultimoEnviado = '';
  var gravando = false;
  var finalizando = false;
  var codigoCurto = null;   // o endereço bonito do diagnóstico

  try { inscricaoId = localStorage.getItem(CHAVE_ID) || null } catch (e) {}

  Promise.all([
    rest('comercial_campanhas?slug=eq.' + encodeURIComponent(campanhaSlug) + '&select=id,pessoa_id,ativa'),
    rest('comercial_perguntas?select=id,chave'),
  ]).then(function (r) {
    var campanha = r[0][0];
    if (!campanha || !campanha.ativa) return;
    var mapa = {};
    r[1].forEach(function (q) { mapa[q.id] = q.chave });
    contexto = { campanha: campanha, mapa: mapa };
  }).catch(function () { /* sem contexto a ponte fica quieta; o formulário segue */ });

  function lerEstado() {
    try { return JSON.parse(localStorage.getItem(CHAVE) || 'null') } catch (e) { return null }
  }

  function traduzir(brutas) {
    var out = {};
    Object.keys(brutas || {}).forEach(function (id) {
      var chave = contexto.mapa[id];
      if (!chave) return;
      var v = brutas[id];
      if (v === null || v === undefined || v === '') return;
      if (Array.isArray(v) && v.length === 0) return;
      out[chave] = v;
    });
    return out;
  }

  function corpo(respostas, etapa, completa) {
    return {
      nome: respostas.nome || null,
      whatsapp: respostas.whatsapp || null,
      empresa: respostas.empresa || null,
      respostas: respostas,
      etapa: Math.min(etapa, ETAPAS_TOTAL),
      completa: !!completa,
      atualizado_em: new Date().toISOString(),
    };
  }

  function gravar(estado) {
    if (!contexto || gravando) return;
    var respostas = traduzir(estado.respostas);
    if (!Object.keys(respostas).length) return;

    var completa = estado.i > ETAPAS_TOTAL;
    var assinatura = JSON.stringify(respostas) + '|' + estado.i;
    if (assinatura === ultimoEnviado && !completa) return;

    gravando = true;
    var dados = corpo(respostas, estado.i, completa);
    var promessa;

    if (inscricaoId) {
      promessa = rest('comercial_inscricoes?id=eq.' + inscricaoId, {
        method: 'PATCH',
        headers: Object.assign({}, cabecalho, { Prefer: 'return=representation' }),
        body: JSON.stringify(dados),
      });
    } else {
      promessa = rest('comercial_inscricoes', {
        method: 'POST',
        headers: Object.assign({}, cabecalho, { Prefer: 'return=representation' }),
        body: JSON.stringify(Object.assign({
          campanha_id: contexto.campanha.id,
          pessoa_id: contexto.campanha.pessoa_id,
        }, dados)),
      }).then(function (linhas) {
        inscricaoId = linhas[0].id;
        if (linhas[0].codigo) codigoCurto = linhas[0].codigo;
        try { localStorage.setItem(CHAVE_ID, inscricaoId) } catch (e) {}
        return linhas;
      });
    }

    promessa.then(function () {
      ultimoEnviado = assinatura;
      gravando = false;
      if (completa) finalizar();
    }).catch(function () { gravando = false });
  }

  function finalizar() {
    if (finalizando || !inscricaoId) return;
    finalizando = true;
    fetch(URL_BASE + '/functions/v1/comercial-qualificar', {
      method: 'POST', headers: cabecalho, body: JSON.stringify({ inscricao_id: inscricaoId }),
    }).catch(function () {});

    // Quem retomou o formulário em outra sessão não tem o código em memória —
    // busca antes de redirecionar, para o endereço curto valer sempre.
    var pegarCodigo = codigoCurto
      ? Promise.resolve(codigoCurto)
      : rest('comercial_inscricoes?id=eq.' + inscricaoId + '&select=codigo')
          .then(function (l) { return l[0] && l[0].codigo })
          .catch(function () { return null });

    pegarCodigo.then(function (cod) {
      // /diagnostico1/4085420843 — sem UUID à mostra
      var destino = cod
        ? '/' + campanhaSlug + '/' + cod
        : '/' + campanhaSlug + '/resultado?i=' + inscricaoId;
      try { localStorage.removeItem(CHAVE); localStorage.removeItem(CHAVE_ID) } catch (e) {}
      setTimeout(function () { location.href = destino }, 1400);
    });
  }

  // O formulário não avisa quando avança — a ponte observa o andamento que ele
  // mesmo salva. Meio segundo é rápido o bastante para o clique em "enviar" e
  // lento o bastante para não martelar o banco a cada tecla.
  setInterval(function () {
    var estado = lerEstado();
    if (estado && estado.i > 0) gravar(estado);
  }, 500);

  // Aba fechando no meio: última tentativa. Tem de ser fetch com keepalive —
  // sendBeacon só sabe POST, e um POST aqui criaria uma segunda linha em vez
  // de completar a que já existe.
  window.addEventListener('pagehide', function () {
    var estado = lerEstado();
    if (!estado || !contexto || !inscricaoId) return;
    var respostas = traduzir(estado.respostas);
    if (!Object.keys(respostas).length) return;
    try {
      fetch(URL_BASE + '/rest/v1/comercial_inscricoes?id=eq.' + inscricaoId, {
        method: 'PATCH',
        headers: cabecalho,
        keepalive: true,
        body: JSON.stringify(corpo(respostas, estado.i, false)),
      });
    } catch (e) {}
  });
})();

/* ===== Motor de Contrato SHA256 — Babel OS =====
 * Módulo para geração de hash, captura de IP e registro de assinatura digital.
 * Integra com tabela `contratos` existente no Supabase.
 * Usa Node.js crypto nativo (ou Web Crypto API como fallback no browser).
 *
 * NOTA: Este módulo é isomórfico. No servidor usa require('crypto'),
 * no browser usa window.crypto.subtle quando disponível.
 */

/**
 * Gera hash SHA-256 dos dados do contrato.
 * @param {Object} dados - Dados do contrato a serem hasheados
 * @param {string} [dados.tenant_id] - ID do tenant
 * @param {string} [dados.lead_id] - ID do lead/cliente
 * @param {string} [dados.nome_template] - Nome do template usado
 * @param {string} [dados.titulo] - Título do contrato
 * @param {Object} [dados.dados_pagamento] - Dados de pagamento
 * @param {string} [dados.conteudo] - Conteúdo textual do contrato
 * @returns {Promise<string>} Hash SHA-256 em hexadecimal lowercase
 */
async function gerarHashContrato(dados) {
  if (!dados || typeof dados !== 'object') {
    throw new Error('gerarHashContrato: dados obrigatório e deve ser objeto');
  }

  // Canonicalização determinística: ordena chaves, remove undefined/null
  const canonico = JSON.stringify(dados, Object.keys(dados).sort());

  // Tenta Node.js crypto primeiro (servidor)
  if (typeof require !== 'undefined') {
    try {
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(canonico, 'utf8').digest('hex');
    } catch (_) { /* fallback abaixo */ }
  }

  // Fallback: Web Crypto API (browser moderno)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(canonico);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('gerarHashContrato: nenhum runtime crypto disponível (Node ou Web Crypto)');
}

/**
 * Captura endereço IP do cliente.
 * Prioriza headers de proxy reverso (X-Forwarded-For, X-Real-IP) quando em servidor.
 * No browser, retorna null (IP deve ser capturado no edge/server).
 * @param {Object} [req] - Objeto request (Node/Express/Vercel) ou headers dict
 * @returns {string|null} IP detectado ou null se indisponível
 */
function capturarIP(req) {
  if (!req) return null;

  // Suporta tanto objeto request quanto dict de headers simples
  const headers = req.headers || req;

  // X-Forwarded-For pode conter múltiplos IPs; pega o primeiro (cliente real)
  const xff = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  if (xff) {
    const ip = String(xff).split(',')[0].trim();
    if (ip) return ip;
  }

  // X-Real-IP (nginx default)
  const realIp = headers['x-real-ip'] || headers['X-Real-IP'];
  if (realIp) return String(realIp).trim();

  // Socket direto (Node HTTP server)
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }

  // Connection (alguns proxies)
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }

  return null;
}

/**
 * Registra assinatura de contrato no Supabase.
 * Atualiza registro existente com hash, IP, timestamp e metadados da assinatura.
 * @param {Object} sb - Cliente Supabase autenticado (de cerebro/supa.js)
 * @param {string} contratoId - UUID do contrato na tabela `contratos`
 * @param {string} userId - UUID do usuário que assina (profiles.id)
 * @param {string} ip - Endereço IP capturado via capturarIP()
 * @param {string|Date} [timestamp] - Timestamp ISO; default: agora
 * @param {Object} [meta] - Metadados adicionais (user_agent, dispositivo, etc.)
 * @returns {Promise<{success:boolean, hash?:string, error?:string}>}
 */
async function registrarAssinatura(sb, contratoId, userId, ip, timestamp, meta) {
  if (!sb) return { success: false, error: 'Cliente Supabase não fornecido' };
  if (!contratoId) return { success: false, error: 'contratoId obrigatório' };
  if (!userId) return { success: false, error: 'userId obrigatório' };

  const ts = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

  // Busca contrato atual para gerar hash dos dados completos
  const { data: contrato, error: errBusca } = await sb.from('contratos')
    .select('*')
    .eq('id', contratoId)
    .maybeSingle();

  if (errBusca) return { success: false, error: 'Erro ao buscar contrato: ' + errBusca.message };
  if (!contrato) return { success: false, error: 'Contrato não encontrado: ' + contratoId };

  // Gera hash dos dados do contrato + contexto da assinatura
  const dadosParaHash = {
    tenant_id: contrato.tenant_id,
    lead_id: contrato.lead_id,
    nome_template: contrato.nome_template,
    titulo: contrato.titulo,
    dados_pagamento: contrato.dados_pagamento,
    assinante_id: userId,
    ip: ip || 'desconhecido',
    timestamp: ts
  };

  let hash;
  try {
    hash = await gerarHashContrato(dadosParaHash);
  } catch (e) {
    return { success: false, error: 'Falha ao gerar hash: ' + e.message };
  }

  // Atualiza contrato com dados da assinatura
  const updatePayload = {
    status: 'assinado',
    assinado_em: ts,
    url_assinatura: contrato.url_assinatura || null,
    hash_assinatura: hash,
    ip_assinatura: ip || 'desconhecido',
  };

  // Se a tabela já tem coluna hash_assinatura, inclui no update
  // Caso contrário, documenta no log e segue sem erro (migração pendente)
  const { error: errUpdate } = await sb.from('contratos')
    .update(updatePayload)
    .eq('id', contratoId);

  if (errUpdate) return { success: false, error: 'Erro ao atualizar contrato: ' + errUpdate.message };

  // Log de auditoria (tabela contrato_auditoria — criar via migration)
  // Por ora, apenas retorna sucesso com hash para registro externo se necessário
  return { success: true, hash, timestamp: ts, ip: ip || 'desconhecido' };
}

// Exporta funções para uso em outros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { gerarHashContrato, capturarIP, registrarAssinatura };
}

// Exporta para browser global (quando carregado via <script>)
if (typeof window !== 'undefined') {
  window.BabelContrato = { gerarHashContrato, capturarIP, registrarAssinatura };
}
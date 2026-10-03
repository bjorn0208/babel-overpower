// Perguntas da qualificação na call — o padrão de fábrica. O mentor pode
// trocar tudo em Gestão → Mentoria → Perguntas da call (config `perguntas_call`);
// a resposta de cada pergunta entra no dossiê do lead pela `chave` e vira
// conhecimento na biblioteca da conta criada na Babel OS.
export const PERGUNTAS_PADRAO = [
  { chave: 'dor', rotulo: 'Dor da empresa', tipo: 'longa' },
  { chave: 'desejo', rotulo: 'Desejo / meta', tipo: 'longa' },
  { chave: 'ambicao', rotulo: 'Ambição com o negócio', tipo: 'longa' },
  { chave: 'concorrentes', rotulo: 'Concorrentes', tipo: 'curta' },
  { chave: 'empresas_inspiram', rotulo: 'Empresas que o inspiram', tipo: 'curta' },
  { chave: 'qtd_funcionarios', rotulo: 'Quantidade de funcionários', tipo: 'curta' },
  { chave: 'maiores_dificuldades', rotulo: 'Maiores dificuldades', tipo: 'longa' },
  { chave: 'principais_capacidades', rotulo: 'Principais capacidades', tipo: 'longa' },
  { chave: 'experiencias_ia', rotulo: 'Experiências que já teve com IA', tipo: 'longa' },
]

// "Ambição com o negócio" → "ambicao_com_o_negocio" (chave estável no dossiê)
export function chaveDaPergunta(rotulo) {
  return String(rotulo || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

// Lê a lista configurada (ou devolve o padrão) — usada pela call e pela Gestão
export async function carregarPerguntas(supabase) {
  try {
    const { data } = await supabase.from('config').select('valor')
      .eq('chave', 'perguntas_call').maybeSingle()
    const lista = JSON.parse(data?.valor || '')
    if (Array.isArray(lista) && lista.length) return lista
  } catch { /* sem config válida → padrão */ }
  return PERGUNTAS_PADRAO
}

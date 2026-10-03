// Edge Function: SIMULADOR da IA Ligadora (Bel) — conversa por texto com o
// MESMO cérebro do telefone: mesmo prompt, mesmo fluxo, mesma base RAG.
// Também gera amostra de voz (Fish TTS) para o seletor de vozes.
//   conversar → admin (JWT): devolve {fala, capturado, etapa, resultado, encerrar}
//   voz       → admin (JWT): devolve {audio: base64 wav}
// ATENÇÃO: o prompt daqui espelha montar_prompt() de /opt/babel/ia_ligadora.py —
// se mudar lá, mude aqui.
import { createClient } from "npm:@supabase/supabase-js@2";
import { encode as mpEncode } from "npm:@msgpack/msgpack@3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
const sessao = new (globalThis as any).Supabase.ai.Session("gte-small");

const VOZ_BEL = "5661bf8cb97740fcb10d2f756abf7779";

const FLUXO_PADRAO = [
  { id: "abertura", nome: "Abertura", meta: "Confirmar que fala com o responsável e prender a atenção" },
  { id: "descoberta", nome: "Descoberta", meta: "Entender a situação e a dor atual do cliente" },
  { id: "apresentacao", nome: "Apresentação", meta: "Conectar a solução à dor e despertar interesse" },
  { id: "objecao", nome: "Objeção", meta: "Dissolver dúvidas e resistências" },
  { id: "fechamento", nome: "Fechamento", meta: "Conseguir o agendamento/compromisso" },
  { id: "despedida", nome: "Despedida", meta: "Confirmar o combinado e encerrar bem" },
];


// Modo de conversa por tipo de campanha — espelho do motor (ia_ligadora.py)
const DICAS_TIPO: Record<string, string> = {
  vender: `
MODO VENDA: conduza para o compromisso de compra nesta ligação ou o próximo
passo concreto. Quando sentir interesse, peça o pedido com naturalidade
("quer que eu já deixe reservado pra você?").`,
  cobrar: `
MODO COBRANÇA (regras OBRIGATÓRIAS): tom cordial, respeitoso e discreto.
- NUNCA ameace, constranja ou exponha o débito a terceiros.
- CONFIRME que fala com a pessoa certa ANTES de citar qualquer valor.
- Se não for a pessoa, NÃO diga o motivo — só peça pra ela retornar.
- Objetivo: uma DATA CONCRETA de pagamento. Confirme repetindo a data.`,
  pos_venda: `
MODO PÓS-VENDA: você liga pra AGRADECER e cuidar, não pra vender.
Pergunte a nota de zero a dez, escute problemas de verdade (anote tudo em
"capturado") e só mencione novidade ou indicação se o clima estiver ótimo.`,
  pesquisa: `
MODO PESQUISA: peça permissão logo no início ("são dois minutinhos, posso?").
UMA pergunta do formulário por vez, agradeça cada resposta. Não venda nada.`,
  apresentar: `
MODO APRESENTAÇÃO: gere curiosidade e deixe a porta aberta — leve, sem
pressão de fechamento. O sucesso é a pessoa querer saber mais.`,
  convidar: `
MODO CONVITE: você liga para CONVIDAR a pessoa para um evento. Tom animado e
acolhedor — é um presente, não uma venda. Os detalhes do evento (data, local,
horário) estão na base de conhecimento: conte com entusiasmo, confirme presença
("posso contar com você?"), anote acompanhantes e diga que vai mandar o lembrete.
Confirmou presença → resultado "agendou".`,
};

// deno-lint-ignore no-explicit-any
function montarFormulario(camp: any): [string, string[]] {
  const form = camp.formulario;
  if (!form || !form.length) {
    return [(camp.campos ?? []).join(", ") || "nenhum campo específico", []];
  }
  const linhas: string[] = [];
  const obrigatorios: string[] = [];
  for (const c of form) {
    const rot = c.rotulo ?? "";
    const perg = (c.pergunta ?? "").trim();
    let linha = `  • ${rot}${c.obrigatorio ? " (OBRIGATÓRIO)" : ""}`;
    if (perg) linha += ` — pergunte assim: "${perg}"`;
    linhas.push(linha);
    if (c.obrigatorio) obrigatorios.push(rot);
  }
  return [linhas.join("\n"), obrigatorios];
}

// deno-lint-ignore no-explicit-any
function montarPrompt(camp: any, lead: any, contatoNome?: string, briefing?: string): string {
  const [formularioTxt, obrigatorios] = montarFormulario(camp);
  const conhecimento = (camp.base_conhecimento ?? "").trim();
  const fluxo = camp.fluxo?.length ? camp.fluxo : FLUXO_PADRAO;
  const etapasTxt = fluxo.map(
    // deno-lint-ignore no-explicit-any
    (e: any, i: number) => `  ${i + 1}. ${e.nome} — meta: ${e.meta}`,
  ).join("\n");
  // deno-lint-ignore no-explicit-any
  const ids = fluxo.map((e: any) => e.id).join(" → ");
  const blocoKb = conhecimento
    ? `

BASE DE CONHECIMENTO (única fonte de verdade sobre a empresa — NUNCA invente nada além disto):
${conhecimento}

REGRA ANTI-INVENÇÃO: se perguntarem algo que NÃO está na base de conhecimento,
responda com naturalidade que essa parte quem detalha é o especialista na
apresentação (ex.: "boa pergunta! esse detalhe o pessoal te mostra certinho na
call"). É PROIBIDO inventar preços, prazos, nomes ou características.`
    : "";
  let blocoPessoa = "";
  if (contatoNome) {
    blocoPessoa += `

QUEM VOCÊ ESTÁ LIGANDO: ${contatoNome}. Você JÁ SABE o nome — confirme com
leveza no início ("falo com ${contatoNome}?") e use o nome naturalmente.`;
  }
  if (briefing) {
    blocoPessoa += `

BRIEFING DO VENDEDOR sobre esta pessoa/empresa (use para PERSONALIZAR a
conversa com naturalidade — demonstre que conhece o contexto, mas NUNCA
recite isto como lista nem revele que tem uma ficha):
${briefing}`;
  }
  const dicaTipo = DICAS_TIPO[camp.tipo ?? ""] ?? "";
  const regraNome = contatoNome
    ? `NOME DO CLIENTE: você já sabe (${contatoNome}) — confirme que é a pessoa certa e use o nome com naturalidade (1-2 vezes na ligação, não mais).`
    : `${regraNome}`;
  return `Você é ${camp.persona}. Você está numa LIGAÇÃO TELEFÔNICA real com ${lead.empresa || "uma empresa"} (${lead.cidade || ""}, ramo: ${lead.nicho || "não informado"}).

SEU OBJETIVO FINAL: ${camp.objetivo}
${dicaTipo}${blocoPessoa}${blocoKb}

FLUXO DA LIGAÇÃO — você CONDUZ do início ao fim, não é passiva. Etapas na ordem:
${etapasTxt}
Regras do fluxo:
- Você recebe a cada momento em que ETAPA está. Trabalhe a meta dela.
- Avance para a próxima etapa SÓ quando a meta atual estiver cumprida.
- Se o cliente resistir ou fugir, trate e traga de volta para o rumo — não abandone o objetivo.
- Ordem das etapas (use estes ids no campo "etapa"): ${ids}

FORMULÁRIO — dados que você precisa coletar durante a conversa (faça as perguntas
de forma natural, encaixadas no papo, nunca como interrogatório):
${formularioTxt}
${obrigatorios.length ? "NÃO encerre a ligação sem ter coletado os dados OBRIGATÓRIOS: " + obrigatorios.join(", ") + "." : ""}
Cada dado que descobrir, coloque em "capturado" com o rótulo exato acima.

COMO VOCÊ FALA (isto é uma LIGAÇÃO por voz, não um texto — fale, não escreva):
- REGRA DE OURO DO TAMANHO: no MÁXIMO 2 frases curtas por vez. PONTO FINAL.
  Uma ligação é troca rápida — quem fala demais soa robô e é cortado.
  Exemplo CERTO: "Ah, entendi! A gente ajuda a organizar suas ligações e não
  perder cliente. Posso te mostrar como?" — parou aí, devolveu a bola.
- Se tiver muito a dizer, diga UMA coisa e pergunte antes de continuar.
- NUNCA leia listas ("temos três planos: um... dois..."). Fale como gente no telefone.
- Números por extenso e em grupos: "mil reais", "onze, nove-dois-um-zero...".
- Ao marcar dia/hora, CONFIRME repetindo: "quinta, dia vinte e quatro, às três da tarde — isso?".
- Use marcadores naturais: "ah, entendi", "perfeito", "deixa eu te perguntar", "olha só".
- Uma pergunta por vez. Reaja ao que a pessoa disse ANTES de puxar outro assunto.
- Use o NOME da pessoa quando descobrir.
- TERMINE TODA FALA com uma pergunta ou um convite claro ("faz sentido?", "posso
  te contar como?"). NUNCA termine em afirmação solta — a pessoa precisa saber
  que é a vez dela, senão fica um silêncio esquisito na linha.

NOME DO CLIENTE — REGRA DE FERRO: você NÃO SABE o nome de quem atendeu.
- NUNCA chame a pessoa por um nome que ela não disse NESTA ligação.
- Nomes que aparecem na base de conhecimento (dono, equipe) são do NOSSO lado
  (da empresa que está ligando) — NÃO são o cliente.
- Pergunte o nome cedo e com leveza ("com quem eu falo?"). A partir do momento
  em que a pessoa disser, use o nome DELA e guarde em "capturado".

ARQUITETURA DE CADA FALA (é isto que faz o diálogo encaixar):
1. REAJA primeiro ao que a pessoa ACABOU de dizer — curto e específico,
   ecoando a palavra dela ("Planilha, entendi.", "Sete anos, que legal!").
2. Depois, NO MÁXIMO uma informação nova.
3. Feche com UMA pergunta que avança a etapa atual.
Regras do encaixe:
- Se a pessoa PERGUNTAR algo, responda DIRETO na primeira frase (sem rodeio),
  e só depois devolva uma pergunta.
- Use o que ela disse antes ("você comentou que...") — memória cria conexão.
- Varie o formato: às vezes só reação+pergunta; às vezes só resposta direta.

SOAR GENTE, NÃO ROTEIRO (imperfeição leve = autenticidade):
- De vez em quando (NÃO sempre) comece com "É...", "Olha...", "Então...", "Ah, tá".
- Exemplo RUIM (perfeito demais): "Certamente! A Babel oferece uma solução completa."
- Exemplo BOM: "Ah, então... a gente cuida disso pra você, sabe? Sem complicação."
- No máximo UMA hesitação leve a cada 2-3 falas. Nunca duas seguidas.
- Frases de comprimento VARIADO: uma curtinha, depois uma média. Nunca o mesmo ritmo.

EMOÇÃO — comece SEMPRE a "fala" com um marcador entre colchetes que o sintetizador
usa para dar entonação. Escolha conforme o momento:
- abertura e quebra-gelo: [alegre] ou [rindo]
- explicando / ouvindo: [caloroso] ou [empática]
- objeção / cliente com dúvida: [calma]
- interesse e fechamento: [animada] ou [empolgada]
Exemplo de fala: "[alegre] Oi, tudo bem? Aqui é a Bel, da Babel!"

IDENTIDADE: você não anuncia que é uma IA. Se perguntarem diretamente, admita com
leveza ("sou sim, um atendimento inteligente da Babel!") e siga naturalmente. NUNCA minta dizendo que é humana.

QUANDO ENCERRAR (marque "encerrar": true e classifique em "resultado"):
- Cliente AGENDOU / topou a apresentação → resultado "agendou". Confirme dia/hora e despeça feliz.
- Cliente sem interesse claro ("não quero", "não preciso") → resultado "sem_interesse". Agradeça e encerre cordial.
- Cliente pede para PARAR ("tira meu número", "não me liga mais", "me remove") → resultado "nao_perturbe". Peça desculpas, garanta que não liga mais, encerre. (É obrigatório respeitar.)
- Momento ruim ("tô ocupado", "agora não dá", "tô dirigindo") → resultado "ligar_depois". Peça desculpa e encerre rápido.
- Já é cliente / já resolveu ("já uso", "já tenho") → resultado "sem_interesse".
Enquanto NADA disso acontece, "resultado" é "em_andamento" e "encerrar" é false — a conversa CONTINUA.

Se a transcrição vier com ERRO ou sem sentido (ruído da linha), NÃO responda ao conteúdo:
diga com leveza que picotou ("desculpa, cortou aqui — pode repetir?") e siga de onde estava.

RESPONDA SEMPRE em JSON puro, sem markdown, com "fala" como PRIMEIRO campo:
{"fala": "[emoção] o que você vai dizer", "capturado": {"campo": "valor, se houver"}, "etapa": "id da etapa atual", "resultado": "em_andamento", "encerrar": false}
- "etapa": EXATAMENTE um destes ids: ${ids}. Nenhum outro valor existe.
- "resultado": SOMENTE um destes: em_andamento, agendou, sem_interesse, nao_perturbe, ligar_depois. Nenhum outro valor existe.`;
}

// deno-lint-ignore no-explicit-any
function extrairJson(texto: string): any {
  texto = texto.trim();
  if (texto.startsWith("```")) {
    texto = texto.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
  }
  const candidatos = [texto];
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini >= 0 && ini < fim) {
    const bloco = texto.slice(ini, fim + 1);
    candidatos.push(bloco, bloco.replace(/\n/g, " "));
  }
  for (const cand of candidatos) {
    try {
      const obj = JSON.parse(cand);
      if (obj && typeof obj === "object" && obj.fala != null) return obj;
    } catch { /* tenta o próximo */ }
  }
  const m = texto.match(/"fala"\s*:\s*"([^"]+)/s);
  return {
    fala: m ? m[1].replace(/\\n/g, " ").trim() : "[caloroso] Desculpa, acho que cortou aqui. Pode repetir?",
    capturado: {}, encerrar: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const body = await req.json();

  // toda ação do simulador exige admin
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: udata } = await admin.auth.getUser(jwt);
  const uid = udata?.user?.id;
  if (!uid) return json({ erro: "não autenticado" }, 401);
  const { data: perfil } = await admin.from("profiles")
    .select("papel").eq("user_id", uid).single();
  if (perfil?.papel !== "admin") return json({ erro: "sem permissão" }, 403);

  async function chaveApi(provedor: string): Promise<string | null> {
    const { data } = await admin.from("chaves_api").select("chave")
      .eq("provedor", provedor).eq("ativa", true).limit(1);
    return data?.[0]?.chave ?? null;
  }

  // ---- amostra de voz (Fish TTS) ----
  if (body.acao === "voz") {
    const chave = await chaveApi("fish_audio");
    if (!chave) return json({ erro: "sem chave fish_audio" }, 400);
    // deno-lint-ignore no-explicit-any
    const corpo: any = {
      text: body.texto || "[alegre] Oi! Essa é a voz da sua campanha. Gostou?",
      format: "mp3", latency: "balanced", mp3_bitrate: 64,
      reference_id: body.voz_id || VOZ_BEL,
    };
    const vel = Number(body.velocidade || 1);
    if (Math.abs(vel - 1) > 0.01) corpo.prosody = { speed: vel, volume: 0 };
    const resp = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${chave}`,
        "Content-Type": "application/msgpack",
        "model": "s2",
      },
      body: mpEncode(corpo),
    });
    if (!resp.ok) return json({ erro: `fish ${resp.status}` }, 500);
    const buf = new Uint8Array(await resp.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 32768) {
      bin += String.fromCharCode(...buf.subarray(i, i + 32768));
    }
    return json({ audio: btoa(bin), tipo: "audio/mpeg" });
  }

  // ---- conversa simulada (mesmo cérebro do telefone) ----
  if (body.acao === "conversar") {
    const { data: camp } = await admin.from("campanhas_ia")
      .select("*").eq("id", body.campanha_id).single();
    if (!camp) return json({ erro: "campanha não encontrada" }, 404);
    const chave = await chaveApi("openrouter");
    if (!chave) return json({ erro: "sem chave openrouter" }, 400);

    const lead = body.lead ?? { empresa: "Empresa Exemplo", cidade: "São Paulo", nicho: "restaurante" };
    const fluxo = camp.fluxo?.length ? camp.fluxo : FLUXO_PADRAO;
    const etapaAtual = body.etapa_atual || fluxo[0].id;
    // deno-lint-ignore no-explicit-any
    const et = fluxo.find((e: any) => e.id === etapaAtual) ?? fluxo[0];

    const mensagens = [
      { role: "system", content: montarPrompt(camp, lead, body.contato_nome, body.briefing) },
      ...(body.mensagens ?? []),
    ];

    // RAG: mesmos fatos vetorizados da ligação real
    const ultimaUser = [...(body.mensagens ?? [])].reverse()
      .find((m: { role: string }) => m.role === "user");
    let guia = `ETAPA ATUAL: "${et.nome}" (id=${etapaAtual}). Meta agora: ${et.meta}.`;
    let achados = 0;
    if (ultimaUser?.content) {
      try {
        const emb = await sessao.run(String(ultimaUser.content), { mean_pool: true, normalize: true });
        const { data: rag } = await admin.rpc("buscar_conhecimento", {
          _campanha: camp.id, _emb: JSON.stringify(Array.from(emb)), _limite: 3,
        });
        const bons = (rag ?? []).filter((r: { similaridade: number }) => r.similaridade > 0.55);
        achados = bons.length;
        if (bons.length) {
          guia += "\nBASE DE CONHECIMENTO — responda fatos SOMENTE com base nisto:\n" +
            bons.map((a: { resposta: string }) => `- ${a.resposta}`).join("\n");
        }
      } catch { /* RAG é opcional no simulador */ }
    }
    mensagens.push({ role: "system", content: guia });

    const cfg = camp.config ?? {};
    const t0 = Date.now();
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: camp.modelo_llm,
        messages: mensagens,
        temperature: Number(cfg.temperatura ?? 0.7),
        max_tokens: 140,
        provider: { sort: "latency" },
      }),
    });
    if (!resp.ok) return json({ erro: `openrouter ${resp.status}: ${(await resp.text()).slice(0, 200)}` }, 500);
    const dados = await resp.json();
    const obj = extrairJson(dados.choices?.[0]?.message?.content ?? "");
    return json({ ...obj, rag_achados: achados, ms: Date.now() - t0 });
  }

  return json({ erro: "ação desconhecida" }, 400);
});

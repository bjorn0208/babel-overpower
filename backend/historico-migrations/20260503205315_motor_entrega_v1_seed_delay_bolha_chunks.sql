INSERT INTO public.regras_operacionais_chunks
  (escopo, categoria, regra, contexto, parametros, prioridade, ativo)
VALUES

(
  'global',
  'delay_bolha',
  'Cadência conservadora pós-incidente Lucas — fallback global de alta prioridade para chips novos ou conversas sem perfil específico identificado.',
  'Este perfil é o guardião padrão do ritmo de envio na plataforma, criado diretamente como resposta ao incidente onde um chip WhatsApp com apenas dois dias de vida recebeu mais de 400 mensagens por hora e foi banido. Ele atua sempre que nenhum outro perfil mais específico for identificado pela busca semântica, garantindo que o motor nunca opere sem um conjunto seguro de parâmetros mínimos. A conversa pode ser de qualquer natureza — apresentação do produto, dúvida inicial, resposta a campanha — mas a ausência de sinais fortes de contexto é em si um sinal de que cautela é necessária. O chip pode ser recém-conectado, o volume do dia pode estar alto, ou o lead pode ser novo e ainda não ter revelado sua intenção. Nesse cenário de incerteza, o agente deve se comportar como um humano atento e pausado: escreve, espera, deixa a mensagem respirar antes de continuar. Três bolhas no máximo por turno, com gaps de 3 a 8 segundos entre cada uma, garantem uma cadência que parece intencional sem parecer lenta demais.',
  '{"piso_min_ms":1500,"teto_max_ms":12000,"delay_min_ms":3000,"delay_max_ms":8000,"jitter_min_pct":15,"jitter_max_pct":25,"modulador":1.2,"max_bolhas":3}'::jsonb,
  12,
  true
),

(
  'global',
  'delay_bolha',
  'Lead fez pergunta objetiva curta ("quanto custa?", "tem agenda?") — resposta direta em até 2 bolhas, latência baixa.',
  'O lead formulou uma pergunta direta e objetiva, geralmente em poucas palavras: quer saber o preço, a disponibilidade, o prazo, ou como funciona um aspecto específico do serviço. Dados reais mostram que a mediana de comprimento de mensagem do lead é de apenas 21 caracteres, e quase 4 % das mensagens contêm palavras como "quanto", "valor" ou "custa" — esse é o cenário mais frequente das conversas da plataforma. O lead que pergunta dessa forma está em modo de avaliação rápida: ele quer a resposta antes de continuar investindo atenção. Uma resposta tardia ou fragmentada em muitas bolhas pode parecer hesitação ou falta de clareza, o que aumenta a chance de abandono. O agente deve responder com agilidade — sem ser instantâneo — em no máximo duas bolhas: uma para a resposta principal e, se necessário, uma segunda para complementar. O jitter leve garante naturalidade sem sacrificar a percepção de prontidão.',
  '{"piso_min_ms":800,"teto_max_ms":8000,"delay_min_ms":1000,"delay_max_ms":3500,"jitter_min_pct":10,"jitter_max_pct":20,"max_bolhas":2}'::jsonb,
  6,
  true
),

(
  'global',
  'delay_bolha',
  'Lead enviou mensagem densa (>150 chars) detalhando situação — agente "lê" antes de responder; delay inicial maior; até 3 bolhas.',
  'O lead escreveu uma mensagem longa e elaborada, descrevendo seu problema, contexto ou necessidade com riqueza de detalhes. Embora raro em termos relativos (menos de 1 % das mensagens ultrapassam 500 caracteres), esse comportamento sinaliza um lead de alto engajamento e intenção de compra mais madura: ele investiu tempo e energia na comunicação. Responder com velocidade excessiva nessa situação cria uma dissonância — transmite a sensação de que o agente não leu de verdade o que foi escrito. O atraso inicial maior funciona como um "tempo de leitura" artificial que valida o esforço do lead e constrói credibilidade. As bolhas seguintes também precisam de gaps adequados para que a resposta pareça reflexiva e construída, não gerada mecanicamente. O modulador leve aumenta os delays proporcionalmente à complexidade implícita da conversa.',
  '{"piso_min_ms":1500,"teto_max_ms":15000,"delay_min_ms":4000,"delay_max_ms":9000,"jitter_min_pct":15,"jitter_max_pct":25,"modulador":1.1,"max_bolhas":3}'::jsonb,
  6,
  true
),

(
  'global',
  'delay_bolha',
  'Agente explica em várias bolhas sequenciais — gaps moderados (2–5,5 s) entre cada para o lead acompanhar o raciocínio.',
  'O agente está construindo uma explicação em múltiplas partes: cada bolha carrega um fragmento lógico do raciocínio — um benefício, um passo de processo, uma característica do produto. Esse modo de comunicação é comum quando o lead faz uma pergunta ampla que exige uma resposta estruturada, ou quando o agente precisa guiar o lead por uma jornada de entendimento antes de apresentar a oferta. Enviar todas as bolhas com gaps muito curtos cria o efeito de "dump de informação" — o lead recebe tudo de uma vez, sem tempo para processar cada ponto, e tende a skippear ou perder atenção. Gaps de 2 a 5,5 segundos entre cada bolha educativa criam um ritmo de leitura natural, similar a como um humano pausaria durante uma explicação falada. O limite de 4 bolhas garante que o agente não se torne verboso — se a explicação precisar de mais partes, deve ser reestruturada.',
  '{"piso_min_ms":1000,"teto_max_ms":12000,"delay_min_ms":2000,"delay_max_ms":5500,"jitter_min_pct":15,"jitter_max_pct":25,"max_bolhas":4}'::jsonb,
  6,
  true
),

(
  'global',
  'delay_bolha',
  'Lead em tom de negociação ou objeção de preço — pausas maiores entre argumentos; modulador conservador; máximo 3 bolhas.',
  'O lead está sinalizando resistência ao preço ou condições, seja com uma objeção direta ("tá caro", "não tenho esse orçamento"), uma comparação com concorrente, ou uma negociação velada ("tem como fazer uma condição especial?"). Dados reais mostram quase 1 500 mensagens com palavras de preço nas conversas — esse cenário é frequente e representa um momento decisivo na jornada de compra. Nesse contexto, a velocidade da resposta pode trabalhar contra o agente: um argumento que chega rápido demais parece ensaiado e mecânico, reduzindo sua capacidade persuasiva. Pausas maiores entre cada argumento — de 3 a 8 segundos — transmitem peso e deliberação, como se o agente estivesse realmente considerando a situação antes de responder. O modulador 1.3 amplifica levemente o delay base existente, garantindo que mesmo quando o fallback de engajamento está ativo, o ritmo seja mais contido. Máximo 3 bolhas para não saturar o lead com argumentos em cascata.',
  '{"piso_min_ms":1500,"teto_max_ms":15000,"delay_min_ms":3000,"delay_max_ms":8000,"jitter_min_pct":10,"jitter_max_pct":20,"modulador":1.3,"max_bolhas":3}'::jsonb,
  7,
  true
),

(
  'global',
  'delay_bolha',
  'Lead com sinais de urgência emocional ("preciso agora", "urgente") — menor latência inicial; acolhimento rápido sem rajada de bolhas.',
  'O lead demonstrou urgência emocional: usou palavras como "urgente", "preciso agora", "rápido", ou comunicou uma situação de pressão temporal ou emocional. Dados reais identificaram 730 mensagens com esses sinais — cerca de 2 % do total — representando um segmento significativo de leads em estado elevado de ativação. Para esse lead, um delay longo na primeira resposta pode ser interpretado como descaso ou indiferença, o que intensifica a ansiedade e aumenta a probabilidade de abandono ou reclamação. A estratégia correta é acolher rápido na primeira bolha — não dar resposta completa ainda, mas sinalizar presença e atenção — e depois conduzir com calma em no máximo duas bolhas totais. O delay_min de 800 ms garante a resposta rápida sem ser instantânea (mantém humanidade); o teto de 8 s evita que uma segunda bolha chegue tarde demais. Este perfil espelha e complementa o chunk existente "lead ansioso pedindo prova" (delay_min:800, delay_max:2000), com janela ligeiramente maior para acomodar respostas de acolhimento mais elaboradas.',
  '{"piso_min_ms":800,"teto_max_ms":8000,"delay_min_ms":800,"delay_max_ms":3000,"jitter_min_pct":10,"jitter_max_pct":20,"modulador":0.85,"max_bolhas":2}'::jsonb,
  8,
  true
),

(
  'global',
  'delay_bolha',
  'Momento de pagamento ou envio de documento — uma ideia por bolha; gaps maiores (3,5–10 s) para lead processar cada etapa sem pressão.',
  'A conversa chegou no momento mais delicado da jornada de compra: o lead está prestes a realizar um pagamento via PIX, receber um link de boleto, enviar um documento, ou assinar algo. Dados reais registraram quase 1 000 mensagens com palavras como "pix", "pagar", "boleto" — esse é um momento de alta ocorrência e altíssimo impacto. Qualquer deslize aqui — incluindo um ritmo de envio que pareça pressão ou confusão — pode fazer o lead hesitar, desistir, ou questionar a idoneidade do processo. Cada bolha deve carregar exatamente uma instrução ou informação: o link de pagamento em uma bolha, a confirmação do valor em outra, as instruções de comprovante em outra. Gaps de 3,5 a 10 segundos dão ao lead tempo para ler, verificar, e executar cada etapa sem se sentir pressionado ou sobrecarregado. O jitter baixo (5–15 %) cria variação natural mas mantém o ritmo previsível — coerente com a seriedade do momento. O modulador 1.4 amplifica o cuidado sobre o delay base.',
  '{"piso_min_ms":2000,"teto_max_ms":15000,"delay_min_ms":3500,"delay_max_ms":10000,"jitter_min_pct":5,"jitter_max_pct":15,"modulador":1.4,"max_bolhas":3}'::jsonb,
  9,
  true
),

(
  'global',
  'delay_bolha',
  'Retomada de conversa após silêncio do lead — primeira bolha mais tardia; pick-up brando sem parecer automático; máximo 2 bolhas.',
  'O lead ficou em silêncio por um período significativo — horas ou dias — e o agente está retomando o contato, seja por um follow-up programado, um lembrete de item pendente, ou uma reativação de conversa parada. Este é um dos momentos mais sensíveis do fluxo de comunicação: o lead pode ter perdido o interesse, estar ocupado, ou simplesmente ter esquecido da conversa. Uma primeira bolha que chega de forma abrupta e instantânea parece mecânica — uma notificação automática, não uma presença humana. O delay maior na primeira bolha (4 a 12 segundos) cria a ilusão de que o agente "pensou" antes de escrever, tornando a retomada mais orgânica. O jitter mais alto (20–35 %) amplia a variação natural para evitar uniformidade entre diferentes retomadas no mesmo canal. Máximo 2 bolhas: a retomada deve ser leve e convidativa, não um monólogo — o objetivo é abrir uma porta, não forçar passagem.',
  '{"piso_min_ms":2000,"teto_max_ms":15000,"delay_min_ms":4000,"delay_max_ms":12000,"jitter_min_pct":20,"jitter_max_pct":35,"max_bolhas":2}'::jsonb,
  6,
  true
),

(
  'global',
  'delay_bolha',
  'Detector heurístico de pico de volume — muitas conversas ativas no mesmo chip recentemente; delays máximos para proteger o chip.',
  'Um heurístico operacional detectou que o chip WhatsApp deste canal está processando um volume incomumente alto de conversas simultâneas ou recentes — característica de uma campanha de marketing ativa, disparo de lista, ou pico orgânico inesperado. Este é o segundo perfil de mais alta prioridade na plataforma, logo atrás do default_seguro_pos_lucas, porque representa uma ameaça real ao chip: o incidente Lucas Ferraz demonstrou que ultrapassar os limites de um chip imaturo leva ao banimento, e um chip em campanha tem muito mais exposição ao risco. Quando este perfil é ativado, o motor de delay opera no modo mais conservador possível sem paralisar completamente o fluxo: delays de 5 a 15 segundos entre bolhas, máximo 2 bolhas por turno, e modulador alto (1.8x) que amplifica qualquer baseline existente. O objetivo não é dar a melhor experiência ao lead neste turno — é proteger o chip para que o negócio continue operando. A recuperação da qualidade conversacional pode ocorrer após o pico ser detectado como resolvido.',
  '{"piso_min_ms":3000,"teto_max_ms":15000,"delay_min_ms":5000,"delay_max_ms":15000,"jitter_min_pct":15,"jitter_max_pct":30,"modulador":1.8,"max_bolhas":2}'::jsonb,
  11,
  true
),

(
  'global',
  'delay_bolha',
  'Fallback bruto de último recurso — garante apenas piso, teto e jitter mínimos; atua se nenhum outro perfil atingir score mínimo.',
  'Este é o safety net de última camada do sistema de delay: quando nenhum outro chunk — nem mesmo o default_seguro_pos_lucas — consegue ser selecionado por qualquer motivo técnico ou de score, este perfil garante que o motor nunca opere sem parâmetros mínimos de humanização. A situação que o dispara é rara por design, mas possível em estados de transição: sistema em warmup, cache de regras vazio, ou erro silencioso no pipeline de seleção. O perfil não carrega nenhuma semântica conversacional — não representa um tipo de lead nem uma fase específica. Sua única responsabilidade é garantir que toda bolha enviada tenha pelo menos 1 segundo de delay e um jitter de 15–30 % que previna o padrão de intervalos exatamente iguais que os sistemas anti-spam do WhatsApp detectam como automação. Por ser um fallback puro, mantém parâmetros intencionalmente simples e conservadores — sem modulador, sem max_bolhas específico.',
  '{"piso_min_ms":1000,"teto_max_ms":12000,"jitter_min_pct":15,"jitter_max_pct":30}'::jsonb,
  5,
  true
);
;

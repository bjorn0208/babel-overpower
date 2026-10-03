
-- Migration 7 — Atualizar comments com referências EN
COMMENT ON COLUMN public.automacao_blocos.cenario IS 
  'Tipo de não-ação que o bloco orienta. ''qualquer'' aplica a todos.';

COMMENT ON COLUMN public.blocos_comportamento.trigger_acao IS 
  'Quando setado, liga o bloco a uma acao de blocos_gatilho.acao_disparada. Usado pra boost no reranker do search-behavior quando gatilho dispara no turno.';

COMMENT ON COLUMN public.blocos_conhecimento.tags IS 
  'Tags livres + tags semânticas de tom. Valores reservados: formal, informal. Bloco sem tag de tom = aceito em qualquer modo de tom do agente. Bloco com tag formal/informal = filtrado pelo retrieval quando agente está no modo correspondente ou detectou o tom em runtime (espelhado).';

COMMENT ON COLUMN public.blocos_conhecimento.tag IS 
  'Identificador único do bloco atômico por tenant+campo. Ex: empresa_{user_id}_endereco. Usado para DELETE+INSERT idempotente pelas edge fns cron-atomizar-*.';

COMMENT ON COLUMN public.blocos_meta.superseded_by IS 
  'Aponta pro bloco que substitui este. Quando setado, este bloco deve ficar ativo=false (versionamento sem perder historico).';

COMMENT ON COLUMN public.blocos_meta.stability_tier IS 
  'Maturidade do bloco. experimental (default no insert): bloco novo. promovido: >=5 leads usaram com resultado positivo. canonico: aprovado pra ser guard imutavel.';

COMMENT ON TABLE public.boosts_categoria IS 
  'Matriz de boost (D40 fix Luiz). Score adicionado pós-rerank quando bloco.category casa com intent detectado.';

COMMENT ON TABLE public.candidatos_bloco IS 
  'Excertos de conversa candidatos a virar bloco RAG. Promovidos quando N>=5 leads independentes (D5).';

COMMENT ON TABLE public.engajamento_turnos IS 
  'Camada 1 — histórico granular permanente de engajamento por turno (R01.3 Motor Vivo). 1 row por turno por conversa. Nunca deletar (soft delete via conversation ON DELETE CASCADE). Camada 2: crenca_conversa.belief_historico (rolling 5 working memory). Camada 3: engajamento_lead (agregado pré-calculado para filtro rápido em Campanha).';

COMMENT ON COLUMN public.memoria_lead.system_expired_at IS 
  'Quando o sistema marcou esse fato como expirado/substituido por bloco mais recente. NULL = ainda vivo no sistema.';

COMMENT ON TABLE public.vocabulario_curadoria IS 
  'Lista canônica de valores controlados (categoria conhecimento, severidade manipulacao, etc). Editável só por platform_admin via Curadoria.';

;

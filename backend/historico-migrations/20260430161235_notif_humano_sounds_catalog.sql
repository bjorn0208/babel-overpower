-- Catálogo de sons de notificação · CC BY 4.0 · notificationsounds.com
CREATE TABLE IF NOT EXISTS public.notification_sounds (
  id           text PRIMARY KEY,
  nome         text NOT NULL,
  descricao    text NOT NULL,
  arquivo      text NOT NULL,
  estilo       text NOT NULL,
  duracao_s    numeric(3,1) NOT NULL,
  tamanho_kb   integer NOT NULL,
  ordem        integer NOT NULL DEFAULT 0,
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_sounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura_publica_authenticated" ON public.notification_sounds;
CREATE POLICY "leitura_publica_authenticated" ON public.notification_sounds
  FOR SELECT TO authenticated
  USING (ativo = true);

INSERT INTO public.notification_sounds (id, nome, descricao, arquivo, estilo, duracao_s, tamanho_kb, ordem) VALUES
  ('slick',          'Deslizante',    'Toque sutil que entra e sai rapidamente',                'slick.mp3',          'whoosh',  2.0, 22, 1),
  ('involved',       'Envolvente',    'Tri-tone suave e caloroso',                              'involved.mp3',       'tritone', 2.0, 24, 2),
  ('checked-off',    'Concluído',     'Clique seco e preciso',                                   'checked-off.mp3',    'click',   2.0, 17, 3),
  ('swift-gesture',  'Gesto Rápido',  'Pluck eletrônico ascendente',                            'swift-gesture.mp3',  'pluck',   2.0, 19, 4),
  ('succeeded',      'Aprovado',      'Pop suave seguido de nota de confirmação',                'succeeded.mp3',      'pop',     2.0, 18, 5),
  ('elegant',        'Elegante',      'Sininho cristalino de um toque',                          'elegant.mp3',        'bell',    2.0, 18, 6),
  ('achievement',    'Conquista',     'Sequência curta de carrilhão',                            'achievement.mp3',    'chime',   2.0, 31, 7),
  ('out-of-nowhere', 'Do Nada',       'Toque de bolha leve e inesperado',                        'out-of-nowhere.mp3', 'bubble',  2.0, 20, 8),
  ('happy-to-help',  'Prestativo',    'Pop suave com acento de chime',                           'happy-to-help.mp3',  'chime',   2.0, 25, 9),
  ('jokingly',       'Jocoso',        'Clique/tap mínimo de 1 segundo, o mais discreto',         'jokingly.mp3',       'click',   1.0, 11, 10)
ON CONFLICT (id) DO UPDATE SET
  nome = excluded.nome, descricao = excluded.descricao, arquivo = excluded.arquivo,
  estilo = excluded.estilo, duracao_s = excluded.duracao_s, tamanho_kb = excluded.tamanho_kb,
  ordem = excluded.ordem;

COMMENT ON TABLE public.notification_sounds IS
  'Catalogo de sons de notificacao - CC BY 4.0 - notificationsounds.com';
;

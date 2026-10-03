
CREATE OR REPLACE FUNCTION public.migrar_automacoes_para_retornos(cfg jsonb)
RETURNS jsonb AS $$
DECLARE
  auto_contrato jsonb;
  agendamento_callback jsonb;
  lemb_assinatura jsonb;
  lemb_pagamento jsonb;
  novo_retornos jsonb;
  assinatura_valor int;
  assinatura_unidade text;
  pagamento_valor int;
  pagamento_unidade text;
BEGIN
  auto_contrato := cfg -> 'automacoes_contrato';
  agendamento_callback := cfg -> 'agendamento_callback';
  lemb_assinatura := auto_contrato -> 'lembrete_assinatura';
  lemb_pagamento := auto_contrato -> 'lembrete_pagamento';

  assinatura_valor := COALESCE((lemb_assinatura #>> '{intervalo,valor}')::int, 1);
  assinatura_unidade := COALESCE(lemb_assinatura #>> '{intervalo,unidade}', 'horas');
  pagamento_valor := COALESCE((lemb_pagamento #>> '{intervalo,valor}')::int, 2);
  pagamento_unidade := COALESCE(lemb_pagamento #>> '{intervalo,unidade}', 'horas');

  novo_retornos := jsonb_build_object(
    'agendamento_retorno', jsonb_build_object(
      'ativo', COALESCE((agendamento_callback ->> 'ativo')::boolean, true),
      'horario_default', '09:00',
      'dias_uteis_apenas', false,
      'janela_horario', jsonb_build_object('inicio', '08:00', 'fim', '20:00'),
      'lembrete_antes', COALESCE(agendamento_callback -> 'lembrete_retorno', jsonb_build_object('ativo', false, 'minutos_antes', 30)),
      'retomada', jsonb_build_object('tom', 'empatico')
    ),

    'cobranca_assinatura', jsonb_build_object(
      'ativo', COALESCE((lemb_assinatura ->> 'ativo')::boolean, true),
      'dias_uteis_apenas', false,
      'janela_horario', jsonb_build_object('inicio', '09:00', 'fim', '19:00'),
      'escalar_humano_apos_ultima', true,
      'tentativas', jsonb_build_array(
        jsonb_build_object(
          'ordem', 1,
          'quando', jsonb_build_object('tipo', 'tempo_relativo', 'valor', assinatura_valor, 'unidade', assinatura_unidade, 'base', 'envio_contrato'),
          'tom', 'empatico'
        ),
        jsonb_build_object(
          'ordem', 2,
          'quando', jsonb_build_object('tipo', 'tempo_relativo', 'valor', 24, 'unidade', 'horas', 'base', 'envio_contrato'),
          'tom', 'direto'
        ),
        jsonb_build_object(
          'ordem', 3,
          'quando', jsonb_build_object('tipo', 'tempo_relativo', 'valor', 72, 'unidade', 'horas', 'base', 'envio_contrato'),
          'tom', 'final'
        )
      )
    ),

    'cobranca_pagamento', jsonb_build_object(
      'ativo', COALESCE((lemb_pagamento ->> 'ativo')::boolean, true),
      'dias_uteis_apenas', false,
      'janela_horario', jsonb_build_object('inicio', '08:00', 'fim', '21:00'),
      'escalar_humano_apos_ultima', true,
      'pos_assinatura_sem_data_prometida', jsonb_build_object(
        'tentativas', jsonb_build_array(
          jsonb_build_object(
            'ordem', 1,
            'quando', jsonb_build_object('tipo', 'tempo_relativo', 'valor', pagamento_valor, 'unidade', pagamento_unidade, 'base', 'assinatura'),
            'tom', 'empatico'
          ),
          jsonb_build_object(
            'ordem', 2,
            'quando', jsonb_build_object('tipo', 'tempo_relativo', 'valor', 24, 'unidade', 'horas', 'base', 'assinatura'),
            'tom', 'direto'
          ),
          jsonb_build_object(
            'ordem', 3,
            'quando', jsonb_build_object('tipo', 'tempo_relativo', 'valor', 72, 'unidade', 'horas', 'base', 'assinatura'),
            'tom', 'final'
          )
        )
      ),
      'quando_lead_promete_data', jsonb_build_object(
        'respeitar_horario_lead', true,
        'tentativas', jsonb_build_array(
          jsonb_build_object(
            'ordem', 1,
            'quando', jsonb_build_object('tipo', 'relativo_a_data_prometida', 'offset_dias', 0, 'horario_padrao', '18:00', 'respeitar_horario_lead', true),
            'tom', 'empatico'
          ),
          jsonb_build_object(
            'ordem', 2,
            'quando', jsonb_build_object('tipo', 'relativo_a_data_prometida', 'offset_dias', 1, 'horario_padrao', '10:00', 'respeitar_horario_lead', false),
            'tom', 'direto'
          ),
          jsonb_build_object(
            'ordem', 3,
            'quando', jsonb_build_object('tipo', 'relativo_a_data_prometida', 'offset_dias', 2, 'horario_padrao', '15:00', 'respeitar_horario_lead', false),
            'tom', 'final'
          )
        )
      )
    )
  );

  RETURN cfg || jsonb_build_object('retornos', novo_retornos);
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Aplicar migracao para todos os agentes que ainda nao tem 'retornos'
UPDATE public.user_agents
SET configuracao = public.migrar_automacoes_para_retornos(configuracao),
    updated_at = now()
WHERE configuracao -> 'retornos' IS NULL;

;

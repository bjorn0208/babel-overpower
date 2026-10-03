-- Limpeza Geral v1.0 - Fix produção pós Fase 2
-- A tabela buffer_mensagens (renomeada de message_buffer) ainda tinha coluna messages.
-- Funções refatoradas pelo agente substituíram messages -> mensagens no body, mas a coluna real continuava messages.
-- Resultado: erros recorrentes 'column "mensagens" of relation "buffer_mensagens" does not exist'.
-- Solução: alinhar coluna ao novo padrão PT-BR.

ALTER TABLE public.buffer_mensagens RENAME COLUMN messages TO mensagens;

;

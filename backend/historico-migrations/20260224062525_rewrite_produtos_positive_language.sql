-- Reescrita de conteudo APROVADA pelo usuario — linguagem positiva
-- Zero impacto em schema/RLS/financeiro — apenas texto descritivo

UPDATE produtos SET descricao = 'Suspensao LEGAL dos apontamentos nos orgaos de protecao ao credito: SPC, Serasa, Boa Vista e Cartorios de Protesto. Servico exclusivo de SUSPENSAO LEGAL da exposicao negativa. Baseado na Lei 8.078 (CDC), artigos 42 e 43. Nome limpo em ate 30 dias uteis. PROIBIDO usar: quitacao, refinanciamento, renegociacao, acordo, pagamento de divida.'
WHERE id = '5ce863c8-8dea-45cb-8416-93287ed6d510';

UPDATE produto_conhecimento SET conteudo = 'Entendo sua frustracao. Muitas empresas prometem e ficam devendo. A diferenca eh que nosso processo eh juridico, baseado na lei. O servico SUSPENDE a exposicao negativa. Voce so paga o restante DEPOIS do resultado. Se a gente falhar, voce paga apenas a TAP inicial.'
WHERE produto_id = '5ce863c8-8dea-45cb-8416-93287ed6d510' AND titulo = 'Ja tentei e nao funcionou';

UPDATE produto_conhecimento SET conteudo = 'Sim. O servico suspende a exposicao negativa enquanto o cliente se organiza financeiramente. Com o credito restaurado, fica mais facil resolver pendencias com melhores condicoes.'
WHERE produto_id = '5ce863c8-8dea-45cb-8416-93287ed6d510' AND titulo = 'Posso continuar pagando minhas dividas?';

UPDATE produto_conhecimento SET conteudo = 'Isso eh muito nobre da sua parte. Mas enquanto voce junta dinheiro, seu nome continua restrito, voce continua sem credito, e os juros so crescem. Com a gente, voce limpa o nome AGORA e ganha tempo pra se organizar. O score sobe, voce consegue credito melhor, e fica mais facil resolver suas pendencias.'
WHERE produto_id = '5ce863c8-8dea-45cb-8416-93287ed6d510' AND titulo = 'Vou pagar minhas dividas';

UPDATE produto_conhecimento SET conteudo = 'Otima pergunta, eh importante ter cuidado mesmo. Nosso trabalho eh 100% baseado na Lei 8.078, o Codigo de Defesa do Consumidor. Os artigos 42 e 43 protegem o consumidor contra exposicao indevida de dados. Nosso corpo juridico entra com uma acao legal para garantir seu direito. Posso te mostrar nossos resultados e depoimentos de clientes.'
WHERE produto_id = '5ce863c8-8dea-45cb-8416-93287ed6d510' AND titulo = 'Isso eh golpe?';

UPDATE produto_conhecimento SET conteudo = '100% legal. Baseado no Codigo de Defesa do Consumidor (Lei 8.078), artigos 42 e 43, que protegem o consumidor contra exposicao indevida de registros negativos de credito.'
WHERE produto_id = '5ce863c8-8dea-45cb-8416-93287ed6d510' AND titulo = 'E legal?';

UPDATE produto_conhecimento SET conteudo = 'O cliente so paga as parcelas restantes SE entregarmos o nome limpo. Caso contrario, so paga a TAP inicial e pronto.'
WHERE produto_id = '5ce863c8-8dea-45cb-8416-93287ed6d510' AND titulo = 'E se nao funcionar?';
;

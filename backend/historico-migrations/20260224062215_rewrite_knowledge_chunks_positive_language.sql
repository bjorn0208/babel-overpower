-- Reescrever chunks com linguagem positiva (remover negações confusas)

-- Produto: Limpa Nome — remover "NAO eh quitacao, refinanciamento ou renegociacao"
UPDATE knowledge_chunks SET content = 'Limpa Nome: Suspensao LEGAL dos apontamentos nos orgaos de protecao ao credito: SPC, Serasa, Boa Vista e Cartorios de Protesto. O servico eh exclusivamente SUSPENSAO LEGAL da exposicao negativa, baseado na Lei 8.078 (CDC), artigos 42 e 43. Nome limpo em ate 30 dias uteis. PROIBIDO usar os termos: quitacao, refinanciamento, renegociacao, acordo, pagamento de divida. | Preco: R$997 | Prazo: Ate 30 dias uteis | Garantia: 6 meses em contrato. Se o nome voltar a ser negativado nesse periodo e o cliente estiver com pagamentos em dia, refaz todo o processo sem custo adicional. | Criterios: Se o cliente sabe se esta negativado no Serasa, SPC, Boa Vista e se o cliente sabe mais ou menos por cima o valor.'
WHERE id = '6566cf6d-0b94-4520-ab4b-3a052df4c1cc';

-- Base Juridica — reescrever sem negação
UPDATE knowledge_chunks SET content = 'Lei 8.078 — Codigo de Defesa do Consumidor. Artigo 42: A exposicao dos dados do consumidor que gere ridiculo ou constrangimento eh ilegal. Artigo 43: A exposicao de dados negativos eh totalmente indevida. O foco do servico eh a EXPOSICAO NEGATIVA da divida, e somente isso. PROIBIDO mencionar: renegociacao, quitacao, acordo com credores, pagamento de dividas.'
WHERE id = '3a424fd9-ff26-432d-8124-36937b84e95b';

-- Ja tentei e nao funcionou — reescrever positivo
UPDATE knowledge_chunks SET content = 'Entendo sua frustracao. Muitas empresas prometem e ficam devendo. A diferenca eh que nosso processo eh juridico, baseado na lei. O servico SUSPENDE a exposicao negativa usando a lei. Voce so paga o restante DEPOIS do resultado. Se a gente falhar, voce paga apenas a TAP inicial. Simples assim. PROIBIDO dizer: renegociar divida, quitar divida, acordo.'
WHERE id = '2792caac-581a-4910-b1f3-4f973801ec24';

-- Posso continuar pagando minhas dividas? — reescrever
UPDATE knowledge_chunks SET content = 'Sim. O servico suspende a exposicao negativa enquanto o cliente se organiza financeiramente. Com o credito restaurado, fica mais facil resolver pendencias com melhores condicoes.'
WHERE id = '57896813-5a09-40db-b6d3-710c220f4a3a';

-- Vou pagar minhas dividas — reescrever positivo
UPDATE knowledge_chunks SET content = 'Isso eh muito nobre da sua parte. Mas enquanto voce junta dinheiro, seu nome continua restrito, voce continua sem credito, e os juros so crescem. Com a gente, voce limpa o nome AGORA e ganha tempo pra se organizar. O score sobe, voce consegue credito melhor, e fica mais facil resolver suas pendencias. PROIBIDO dizer: renegociar, negociar dividas.'
WHERE id = '5f124d99-b6d1-4ac3-a4dd-f49e79e740d4';

-- Empresa — remover "suspensao legal de dividas" (confuso) → trocar pra clareza
UPDATE knowledge_chunks SET content = 'Renova CPF. CNPJ: 51.063.430/0001-93. Consultoria Juridica de Protecao ao Credito. Missao: ajudar pessoas a recuperarem seu poder de compra atraves da SUSPENSAO LEGAL dos registros negativos nos orgaos de protecao ao credito. Processo 100% legal baseado no Codigo de Defesa do Consumidor. O cliente so paga o restante DEPOIS que o nome estiver limpo. Endereco: Rua Comendador Gomes, 1285, Feira de Santana - Bahia. Instagram: https://www.instagram.com/renovacpfs'
WHERE id = 'cb590726-3cd0-4057-82ce-30177a4db163';

-- E legal? — reescrever sem dupla negação
UPDATE knowledge_chunks SET content = '100% legal. Baseado no Codigo de Defesa do Consumidor (Lei 8.078), artigos 42 e 43, que protegem o consumidor contra exposicao indevida de registros negativos de credito.'
WHERE id = '90b0fe7d-6e26-4ed4-8f55-d7df837589d2';
;

# Refatoração do Cadastro de Produtos — Babel OS

## Análise da Estrutura Atual

### Onde os produtos vivem hoje
1. **`agentes.fluxo.produtos`** (JSONB dentro da tabela `agentes`)
   - Cada agente tem sua própria lista de produtos embutida no fluxo
   - Sincronizado via `sincronizarProdutosAgente()` em `babel-banco.js` (linhas 582-602)
   - Sem tabela dedicada; produtos são sub-documentos de um agente

2. **`estoque_itens`** (tabela separada)
   - Controle de estoque por `tenant_id`
   - Campos: nome, quantidade, preço, categoria
   - Soft delete habilitado

3. **Loja (planos/pacotes/plus)**
   - Tabelas: `loja_planos`, `loja_pacotes_extra`, `loja_implantacao`, `loja_plus`
   - Admin-only, sem vínculo direto com produtos do tenant

### Problemas Identificados

| Problema | Impacto |
|----------|---------|
| Produtos acoplados ao agente | Não é possível gerenciar catálogo independente de fluxos |
| Sem entidade Produto unificada | Estoque e vendas usam estruturas diferentes |
| Sem categorias/tipos normalizados | Cada agente define seus próprios campos ad-hoc |
| Sem mídia associada | Imagens/fichas técnicas não têm lugar estruturado |
| UX de cadastro limitada | Inserção via JSON do agente, sem formulário dedicado |
| Sem histórico de preços | Alterações de preço perdem rastro |

---

## Plano de Refatoração

### Fase 1: Tabela `produtos` unificada (nova)

```sql
CREATE TABLE produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES profiles(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  sku TEXT,
  categoria TEXT,
  unidade TEXT DEFAULT 'un',
  preco_venda NUMERIC(12,2) NOT NULL DEFAULT 0,
  preco_custo NUMERIC(12,2),
  estoque_minimo INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_produtos_tenant ON produtos(tenant_id);
CREATE INDEX idx_produtos_categoria ON produtos(categoria);
CREATE INDEX idx_produtos_ativo ON produtos(is_active) WHERE deleted_at IS NULL;

ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY produtos_tenant ON produtos
  USING (auth.uid() = tenant_id OR EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND tenant_id = produtos.tenant_id
  ));
```

### Fase 2: Tabela `produto_midias` (nova)

```sql
CREATE TABLE produto_midias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('imagem', 'ficha_tecnica', 'video')),
  url TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_produto_midias_produto ON produto_midias(produto_id);
```

### Fase 3: Tabela `produto_historico_preco` (nova)

```sql
CREATE TABLE produto_historico_preco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES produtos(id),
  preco_venda NUMERIC(12,2) NOT NULL,
  preco_custo NUMERIC(12,2),
  alterado_por UUID REFERENCES profiles(id),
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_produto_historico ON produto_historico_preco(produto_id, created_at DESC);
```

### Fase 4: Migração de dados existentes

```sql
-- Extrair produtos de agentes.fluxo.produtos para tabela nova
INSERT INTO produtos (tenant_id, nome, descricao, categoria, unidade, preco_venda, metadata)
SELECT
  a.user_id AS tenant_id,
  p->>'nome' AS nome,
  p->>'descricao' AS descricao,
  p->>'categoria' AS categoria,
  COALESCE(p->>'unidade', 'un') AS unidade,
  COALESCE((p->>'preco')::numeric, 0) AS preco_venda,
  jsonb_build_object('origem', 'agente_fluxo', 'agente_id', a.id, 'legacy_id', p->>'id')
FROM agentes a, jsonb_array_elements(a.fluxo->'produtos') p
WHERE a.fluxo ? 'produtos'
ON CONFLICT DO NOTHING;
```

### Fase 5: Compatibilidade retroativa

Manter leitura dual durante transição:
1. Novo código lê de `produtos` primeiro
2. Fallback para `agentes.fluxo.produtos` se vazio
3. Escrita sempre vai para `produtos` + espelha no agente (dual-write)
4. Após 60 dias sem uso do fallback, remover código legado

---

## UX Melhorada (Frontend)

### Formulário de Cadastro
- Campos básicos: nome, SKU, categoria (dropdown editável), unidade
- Preços: venda e custo com máscara monetária
- Estoque: mínimo configurável + alerta visual
- Mídia: upload drag-and-drop, preview, reordenação
- Rich text para descrição longa
- Tags/metadata customizáveis

### Lista de Produtos
- Tabela paginada com busca por nome/SKU/categoria
- Filtros: ativo/inativo, faixa de preço, categoria
- Edição inline rápida (preço, estoque, status)
- Export CSV/PDF
- Import CSV (com validação e preview)

### Integrações
- Vínculo com `estoque_itens`: produto pode ter item de estoque associado
- Vínculo com contratos: produtos selecionáveis na geração de contrato
- Vínculo com loja: opção "publicar na loja" com preço específico
- Agente: produtos disponíveis no fluxo via referência (não mais embed)

---

## Checklist de Implementação

- [ ] Criar migration SQL para tabelas novas
- [ ] Implementar CRUD em `babel-banco.js` (coleção `produtos`)
- [ ] Migrar dados existentes de `agentes.fluxo.produtos`
- [ ] Criar tela de cadastro/lista em `babel-os.html`
- [ ] Adicionar middleware de validação (SKU único por tenant)
- [ ] Trigger para `produto_historico_preco` on UPDATE
- [ ] Testar compatibilidade retroativa com agentes existentes
- [ ] Documentar API no LEIA-ME.txt

---

## Notas

- **Não quebrar**: agentes existentes devem continuar funcionando durante transição
- **Performance**: índice composto `(tenant_id, is_active)` para listagens frequentes
- **Auditoria**: toda alteração de preço gera registro automático via trigger
- **RLS**: políticas alinhadas com o plano multitenant (ver MULTITENANT_PLAN.md)
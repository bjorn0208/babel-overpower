# Plano Multitenant Completo — Babel OS

## Status Atual (Auditoria)

### Estrutura Existente
O sistema atual opera com **dois níveis** de isolamento:

1. **Platform Admin** (`system_role = 'platform_admin'`)
   - Acesso global a todos os tenants
   - Gerencia nichos, loja, curadoria, pacotes
   - Impersonação via RPC `impersonate-user`

2. **Tenant** (`system_role = 'tenant'`, `parent_user_id IS NULL`)
   - Isolamento por `tenant_id` nas tabelas
   - Dados próprios: leads, contratos, financeiro, campanhas, rifas
   - Sem hierarquia interna definida

### Gaps Identificados

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| Hierarquia plana | Não há distinção entre funcionários, prestadores, vendedores dentro do tenant | Todos têm acesso igual aos dados do tenant |
| Sem RBAC granular | Permissões são binárias (admin vs não-admin) | Não é possível restringir módulos por função |
| Vida pessoal misturada | Dados pessoais do usuário não separados dos dados comerciais | Risco de privacidade e LGPD |
| Fornecedores sem entidade | Prestadores/fornecedores do tenant não têm tabela própria | Gestão informal via leads ou contatos |
| Indicadores sem vínculo formal | Rede multinível existe mas sem relação explícita com vendas | Comissões calculadas mas auditoria difícil |

---

## Schema Proposto

### 1. Tabela `user_roles` (nova)

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  tenant_id UUID REFERENCES profiles(id), -- NULL para platform roles
  role_type TEXT NOT NULL CHECK (role_type IN (
    'platform_admin',
    'platform_staff',        -- funcionários adm
    'babel_provider',        -- prestadores babel
    'babel_seller',          -- vendedores babel
    'babel_indicator',       -- indicadores babel
    'tenant_owner',          -- usuário dono
    'tenant_staff',          -- funcionários usuário
    'tenant_provider',       -- fornecedores/prestadores usuário
    'lead',                  -- lead
    'customer',              -- cliente
    'personal'               -- vida pessoal
  )),
  parent_role_id UUID REFERENCES user_roles(id), -- hierarquia
  scope JSONB DEFAULT '{}', -- permissões específicas por módulo
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id, role_type)
);

-- Índice para consultas rápidas
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);
CREATE INDEX idx_user_roles_type ON user_roles(role_type);
CREATE INDEX idx_user_roles_parent ON user_roles(parent_role_id);
```

### 2. Tabela `tenant_members` (nova)

```sql
CREATE TABLE tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES profiles(id),
  member_id UUID NOT NULL REFERENCES profiles(id),
  member_type TEXT NOT NULL CHECK (member_type IN (
    'staff', 'provider', 'seller', 'indicator'
  )),
  invited_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, member_id)
);
```

### 3. Tabela `suppliers` (nova)

```sql
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  cpf_cnpj TEXT,
  category TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);
```

### 4. Tabela `personal_data` (nova — vida pessoal)

```sql
CREATE TABLE personal_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  category TEXT NOT NULL, -- 'health', 'family', 'goals', 'notes'
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  is_encrypted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: apenas o próprio usuário acessa
ALTER TABLE personal_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_data_owner ON personal_data
  USING (auth.uid() = user_id);
```

### 5. Extensão da tabela `profiles`

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_role TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reports_to UUID REFERENCES profiles(id);
```

---

## Migração Necessária

### Fase 1: Preparação (sem downtime)
1. Criar tabelas novas (`user_roles`, `tenant_members`, `suppliers`, `personal_data`)
2. Adicionar colunas em `profiles`
3. Criar índices
4. **Não alterar lógica existente ainda**

### Fase 2: Backfill
```sql
-- Migrar tenants existentes para user_roles
INSERT INTO user_roles (user_id, tenant_id, role_type)
SELECT id, id, 'tenant_owner'
FROM profiles
WHERE system_role = 'tenant' AND parent_user_id IS NULL;

-- Migrar platform admins
INSERT INTO user_roles (user_id, role_type)
SELECT id, 'platform_admin'
FROM profiles
WHERE system_role = 'platform_admin';
```

### Fase 3: Dual-write
1. Novo código escreve em ambas estruturas (antiga + nova)
2. Leitura prioriza nova estrutura, fallback para antiga
3. Monitorar inconsistências por 2 semanas

### Fase 4: Cutover
1. Parar escrita na estrutura antiga
2. Validar integridade
3. Remover código legado
4. Drop colunas depreciadas (após 90 dias)

---

## Matriz de Permissões Proposta

| Módulo | platform_admin | platform_staff | tenant_owner | tenant_staff | tenant_provider | lead | customer |
|--------|---------------|----------------|--------------|--------------|-----------------|------|----------|
| Dashboard | ✅ todos | ✅ todos | ✅ próprio | ✅ próprio | ❌ | ❌ | ❌ |
| Leads | ✅ todos | ✅ todos | ✅ próprio | ✅ próprio | ⚠️ atribuídos | ❌ | ❌ |
| Contratos | ✅ todos | ✅ todos | ✅ próprio | ✅ próprio | ❌ | ❌ | ⚠️ próprio |
| Financeiro | ✅ todos | ✅ todos | ✅ próprio | ⚠️ view only | ❌ | ❌ | ❌ |
| Produtos | ✅ todos | ✅ todos | ✅ próprio | ✅ próprio | ❌ | ❌ | ⚠️ catálogo |
| Loja | ✅ todos | ✅ todos | ✅ próprio | ✅ próprio | ❌ | ✅ | ✅ |
| Pessoal | ❌ | ❌ | ✅ próprio | ✅ próprio | ✅ próprio | ✅ próprio | ✅ próprio |

Legenda: ✅ = acesso total, ⚠️ = acesso parcial, ❌ = sem acesso

---

## Notas de Implementação

- **RLS**: Todas as tabelas novas devem ter Row Level Security ativado
- **Auditoria**: Log de mudanças de role em tabela `role_changes`
- **Cache**: Invalidar cache de permissões ao alterar roles
- **API**: Endpoints devem validar role antes de executar
- **Frontend**: `babel-banco.js` precisa filtrar coleções por role do usuário
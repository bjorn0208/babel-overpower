# Supabase Branching — Recomendações para Babel OS

## Contexto

O projeto Babel OS utiliza Supabase como backend (PostgreSQL + Auth + Storage + Edge Functions).
Este documento estabelece melhores práticas de branching e ambientes para desenvolvimento seguro.

---

## Estratégia de Ambientes Recomendada

### 1. Produção (`main`)
- Branch: `main`
- Supabase Project: `babel-production`
- Dados reais, RLS ativo, backups automáticos
- **Nunca** fazer deploy direto sem PR aprovado
- Migrations via Supabase CLI: `supabase db push --linked`

### 2. Staging / Preview (`staging`)
- Branch: `staging`
- Supabase Project: `babel-staging`
- Dados anonimizados ou seed controlado
- Usado para validação pré-produção
- Deploy automático no merge para `staging`
- Testes de integração rodam aqui

### 3. Desenvolvimento (`dev`)
- Branch: `dev`
- Supabase Project: `babel-dev`
- Dados de teste livres
- Feature branches fazem merge aqui primeiro
- Reset frequente permitido

### 4. Feature Branches (Preview Branches)
- Pattern: `feature/*`, `fix/*`, `hotfix/*`
- **Supabase Branching** (preview databases efêmeras)
- Cada PR cria um branch temporário no Supabase
- Isolamento total de schema e dados
- Destruição automática após merge/close

---

## Supabase Branching (Preview Databases)

### Como Funciona
- Supabase cria um clone COW (copy-on-write) do banco staging
- Branch herda schema + dados do momento da criação
- Mudanças no branch não afetam staging/main
- Tempo de criação: ~2 segundos
- Limite: 10 branches ativos por projeto (plano Pro)

### Comandos CLI

```bash
# Criar branch a partir de staging
supabase branches create --name feature-contratos-sha256

# Listar branches ativos
supabase branches list

# Conectar ao branch (muda o link temporariamente)
supabase link --project-ref <branch-project-ref>

# Fazer migration no branch
supabase db push

# Deletar branch após merge
supabase branches delete <branch-id>
```

### Integração com GitHub
```yaml
# .github/workflows/supabase-preview.yml
name: Supabase Preview
on:
  pull_request:
    branches: [staging]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: supabase/setup-cli@v1
      - run: supabase branches create --name pr-${{ github.event.number }}
      - run: supabase db push
      - run: supabase test db
      # Comenta no PR com URL do branch
```

---

## Migrations Seguras

### Regras
1. **Sempre** usar migrations versionadas (`supabase/migrations/`)
2. **Nunca** editar migration já aplicada em staging/prod
3. Migrations devem ser idempotentes quando possível
4. Backward-compatible: nova coluna deve ter default ou aceitar NULL
5. Testar migration em preview branch antes de staging

### Estrutura de Arquivos
```
supabase/
├── migrations/
│   ├── 20261001000000_init_schema.sql
│   ├── 20261002000000_add_user_roles.sql
│   └── 20261003000000_contrato_hash_column.sql
├── seed.sql          # Dados iniciais para dev/staging
├── config.toml       # Configuração por ambiente
└── functions/        # Edge Functions
```

### Workflow de Migration
```bash
# 1. Criar migration
supabase migration new add_base_conhecimento

# 2. Editar SQL gerado em supabase/migrations/XXXX_add_base_conhecimento.sql

# 3. Aplicar localmente
supabase db reset

# 4. Aplicar em preview branch
supabase link --project-ref <preview-ref>
supabase db push

# 5. Após validação, aplicar em staging
supabase link --project-ref staging-ref
supabase db push

# 6. Em produção, apenas via CI/CD após aprovação
```

---

## Seed Data por Ambiente

### Dev/Staging
```sql
-- supabase/seed.sql
-- Executado automaticamente no `supabase db reset`

-- Admin platform
INSERT INTO profiles (id, email, full_name, system_role)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin@babel.local', 'Admin Platform', 'platform_admin')
ON CONFLICT DO NOTHING;

-- Tenant demo
INSERT INTO profiles (id, email, full_name, system_role)
VALUES ('00000000-0000-0000-0000-000000000002', 'demo@babel.local', 'Tenant Demo', 'tenant')
ON CONFLICT DO NOTHING;
```

### Produção
- **Nunca** usar seed.sql em produção
- Dados via aplicação ou scripts controlados
- Backup antes de qualquer carga bulk

---

## Variáveis de Ambiente por Branch

```bash
# .env.local (desenvolvimento)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJ...local
SUPABASE_SERVICE_ROLE_KEY=eyJ...local

# .env.staging
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_ANON_KEY=eyJ...staging

# .env.production
SUPABASE_URL=https://abc.supabase.co
SUPABASE_ANON_KEY=eyJ...production
```

No Vercel: configurar Environment Variables por ambiente (Preview / Production).

---

## Checklist de Deploy

- [ ] Migration testada em preview branch
- [ ] RLS policies revisadas
- [ ] Seed data atualizado (se aplicável)
- [ ] Edge Functions deployadas (`supabase functions deploy`)
- [ ] Variáveis de ambiente sincronizadas
- [ ] Backup automático verificado
- [ ] Rollback plan documentado

---

## Referências

- [Supabase Branching Docs](https://supabase.com/docs/guides/deployment/branching)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Database Migrations Guide](https://supabase.com/docs/guides/deployment/database-migrations)
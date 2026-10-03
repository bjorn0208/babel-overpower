
-- ============================================================
-- 004a ROLES + PERMISSIONS TABLES
-- ============================================================

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  scope TEXT NOT NULL DEFAULT 'tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (slug, name, description, is_system, scope) VALUES
  ('platform_admin', 'Admin da Plataforma', 'Acesso total irrestrito a todos os tenants', true, 'platform'),
  ('tenant_owner', 'Dono', 'Dono do tenant. Controle total da sua conta', true, 'tenant'),
  ('team_admin', 'Administrador', 'Gerencia equipe, agentes e configuracoes', true, 'tenant'),
  ('team_operator', 'Operador', 'Monitora conversas, responde leads, edita knowledge', true, 'tenant'),
  ('team_viewer', 'Visualizador', 'Somente visualizacao, sem edicao', true, 'tenant');

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO permissions (slug, name, resource, action) VALUES
  ('dashboard.view', 'Ver dashboard', 'dashboard', 'read'),
  ('conversations.view', 'Ver conversas', 'conversations', 'read'),
  ('conversations.respond', 'Responder conversas', 'conversations', 'respond'),
  ('agents.view', 'Ver agentes', 'agents', 'read'),
  ('agents.edit', 'Editar agentes', 'agents', 'update'),
  ('agents.create', 'Criar agentes', 'agents', 'create'),
  ('agents.delete', 'Excluir agentes', 'agents', 'delete'),
  ('knowledge.view', 'Ver base de conhecimento', 'knowledge', 'read'),
  ('knowledge.edit', 'Editar base de conhecimento', 'knowledge', 'update'),
  ('leads.view', 'Ver leads', 'leads', 'read'),
  ('leads.manage', 'Gerenciar leads', 'leads', 'manage'),
  ('team.view', 'Ver equipe', 'team', 'read'),
  ('team.manage', 'Gerenciar equipe', 'team', 'manage'),
  ('billing.view', 'Ver financeiro', 'billing', 'read'),
  ('billing.manage', 'Gerenciar financeiro', 'billing', 'manage'),
  ('settings.view', 'Ver configuracoes', 'settings', 'read'),
  ('settings.manage', 'Gerenciar configuracoes', 'settings', 'manage'),
  ('flows.view', 'Ver fluxos', 'flows', 'read'),
  ('flows.edit', 'Editar fluxos', 'flows', 'update'),
  ('security.view', 'Ver incidentes de seguranca', 'security', 'read');

CREATE TABLE profile_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  granted_by UUID NOT NULL REFERENCES profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES profiles(id)
);

CREATE UNIQUE INDEX idx_profile_roles_active
  ON profile_roles (profile_id, tenant_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_profile_roles_tenant ON profile_roles (tenant_id);

ALTER TABLE profile_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id),
  permission_id UUID NOT NULL REFERENCES permissions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

;

-- V003: auditoría y configuración de la plataforma
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);

CREATE TABLE config (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users (id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO config (key, value) VALUES
  ('move_timeout_seconds', '30'::jsonb),
  ('challenge_ttl_hours', '24'::jsonb),
  ('demo_welcome_credits', '1000'::jsonb),
  ('demo_daily_deposit_limit', '10000'::jsonb),
  ('demo_max_stake', '1000'::jsonb)
ON CONFLICT (key) DO NOTHING;

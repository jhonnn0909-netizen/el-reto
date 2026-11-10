-- V004: cuentas OAuth vinculadas (inicio de sesión con Google y Facebook)
-- Ampliación de autenticación pedida por Jhon el 2026-11-10.
-- Una cuenta de El Reto puede tener varias cuentas OAuth vinculadas
-- (una por proveedor). El correo del proveedor ya está verificado por
-- el proveedor; la vinculación no cambia la contraseña local (que
-- puede ser NULL si la cuenta se creó solo con OAuth).
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('GOOGLE', 'FACEBOOK')),
  provider_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_email ON oauth_accounts (email);

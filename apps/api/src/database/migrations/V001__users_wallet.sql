-- V001: usuarios, autenticación, billetera y ledger (doble partida, inmutable)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Función común para mantener updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============ Usuarios y autenticación ============
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(30) NOT NULL,
  -- email y password_hash son anulables: los invitados (role='GUEST',
  -- CONTRACTS.md §9.2) no tienen correo ni contraseña.
  email VARCHAR(255),
  password_hash TEXT,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  role VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN', 'GUEST')),
  status VARCHAR(25) NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED')),
  email_verified_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);
-- Unicidad sin distinción de mayúsculas (CONTRACTS.md §3.1): una
-- restricción UNIQUE de tabla no admite expresiones, por lo que la
-- unicidad de lower(username) va como índice único (corrección de
-- integración 2026-11-10: V001 nunca se había aplicado — la migración
-- fallaba aquí con `syntax error at or near "("` y la transacción
-- revertía — así que la corrección es en la propia V001).
CREATE INDEX idx_users_email ON users (email);
CREATE UNIQUE INDEX idx_users_username_lower ON users (lower(username));
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  bio TEXT,
  country CHAR(2),
  birth_date DATE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_token_hash ON sessions (refresh_token_hash);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address INET,
  success BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts_email ON login_attempts (email, attempted_at);
CREATE INDEX idx_login_attempts_ip ON login_attempts (ip_address, attempted_at);

CREATE TABLE security_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  event_type VARCHAR(60) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_security_events_user ON security_events (user_id, created_at);

-- ============ Billetera (DEMO: créditos virtuales, sin valor real) ============
CREATE TABLE wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  currency VARCHAR(10) NOT NULL DEFAULT 'CREDITO',
  available_balance BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
  version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_wallet_accounts_updated_at BEFORE UPDATE ON wallet_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE system_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  currency VARCHAR(10) NOT NULL DEFAULT 'CREDITO',
  available_balance BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
  version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_system_accounts_updated_at BEFORE UPDATE ON system_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Cuentas de sistema (contrapartidas de doble partida)
INSERT INTO system_accounts (code) VALUES ('MINT'), ('PROMO'), ('ESCROW'), ('HOUSE')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(40) NOT NULL CHECK (type IN (
    'WELCOME_BONUS', 'DEPOSIT', 'WITHDRAWAL', 'PROMO_CREDIT',
    'BET_HOLD', 'BET_RELEASE', 'WIN_PAYOUT', 'REFUND', 'REVERSAL', 'ADJUSTMENT')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
  user_id UUID NOT NULL REFERENCES users (id),
  reference_type VARCHAR(50),
  reference_id UUID,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_wallet_tx_user ON wallet_transactions (user_id, created_at);
CREATE INDEX idx_wallet_tx_reference ON wallet_transactions (reference_type, reference_id);

-- Ledger inmutable de doble partida: cada transacción tiene al menos 2
-- asientos y la suma de DEBIT = suma de CREDIT por transacción.
CREATE TABLE ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES wallet_transactions (id),
  account_type VARCHAR(10) NOT NULL CHECK (account_type IN ('USER', 'SYSTEM')),
  account_id UUID NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  balance_after BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_tx ON ledger_entries (transaction_id);
CREATE INDEX idx_ledger_account ON ledger_entries (account_type, account_id, created_at);

-- Prohibir UPDATE y DELETE sobre el ledger (inmutable). Los reversos se
-- hacen con asientos compensatorios en una transacción REVERSAL nueva.
CREATE OR REPLACE FUNCTION prevent_ledger_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'El ledger es inmutable: no se puede modificar ni borrar asientos. Usa una transacción REVERSAL.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_ledger_no_update BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
CREATE TRIGGER trg_ledger_no_delete BEFORE DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  credits BIGINT NOT NULL CHECK (credits > 0),
  max_uses INT NOT NULL DEFAULT 1 CHECK (max_uses >= 0),
  used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes (id),
  user_id UUID NOT NULL REFERENCES users (id),
  transaction_id UUID REFERENCES wallet_transactions (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, user_id)
);

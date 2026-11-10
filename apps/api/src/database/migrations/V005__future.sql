-- V005: base para la siguiente fase (SIN endpoints ni lógica todavía).
-- Torneos, niveles, insignias y usuario de sistema del reto diario.
-- Los torneos y la concesión de insignias quedan como siguiente fase;
-- solo se deja el esquema listo y los niveles sembrados.

-- ============ Usuario de sistema del reto diario ============
-- 'el-reto' es el creador del reto diario. No tiene login: su contraseña
-- es el hash bcrypt de un UUID aleatorio que nadie conoce. Rol USER para
-- no tocar el esquema de roles (V001); nunca inicia sesión ni juega.
INSERT INTO users (id, username, email, password_hash, display_name, role, status, email_verified_at)
VALUES (
  '00000000-0000-0000-0000-0000000000e1',
  'el-reto',
  'sistema@elreto.local',
  crypt(gen_random_uuid()::text, gen_salt('bf', 12)),
  'El Reto',
  'USER',
  'ACTIVE',
  now()
)
-- La unicidad de username es el índice único sobre lower(username)
-- (V001): el árbitro del ON CONFLICT debe ser esa expresión
-- (corrección de integración 2026-11-10; V005 nunca se había aplicado).
ON CONFLICT (lower(username)) DO NOTHING;

-- ============ Niveles (por puntos de ranking) ============
CREATE TABLE levels (
  level INT PRIMARY KEY CHECK (level >= 1),
  min_points INT NOT NULL CHECK (min_points >= 0),
  title VARCHAR(50) NOT NULL,
  UNIQUE (min_points)
);

INSERT INTO levels (level, min_points, title) VALUES
  (1, 0, 'Novato'),
  (2, 100, 'Retador'),
  (3, 250, 'Competidor'),
  (4, 500, 'Experto'),
  (5, 1000, 'Maestro'),
  (6, 2000, 'Leyenda')
ON CONFLICT (level) DO NOTHING;

-- ============ Insignias (solo base; la concesión es siguiente fase) ============
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(50) NOT NULL DEFAULT 'trophy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_badges (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges (id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
CREATE INDEX idx_user_badges_user ON user_badges (user_id, awarded_at);

-- ============ Torneos (solo base; sin endpoints ni lógica) ============
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  game_type VARCHAR(20) NOT NULL DEFAULT 'RPS',
  status VARCHAR(12) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'FINISHED', 'CANCELLED')),
  max_players INT NOT NULL DEFAULT 8 CHECK (max_players >= 2),
  current_round INT NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tournaments_status ON tournaments (status, created_at);
CREATE TRIGGER trg_tournaments_updated_at BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tournament_players (
  tournament_id UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seed INT,
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ELIMINATED', 'WITHDRAWN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE tournament_matches (
  tournament_id UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  round INT NOT NULL CHECK (round >= 1),
  bracket_position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, match_id),
  UNIQUE (tournament_id, round, bracket_position)
);

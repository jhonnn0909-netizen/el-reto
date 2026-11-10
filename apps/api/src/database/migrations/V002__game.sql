-- V002: retos, partidas, rondas, movimientos, ranking y notificaciones
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users (id),
  title VARCHAR(120),
  visibility VARCHAR(10) NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  invite_code VARCHAR(16) UNIQUE,
  format VARCHAR(12) NOT NULL DEFAULT 'BEST_OF_3'
    CHECK (format IN ('BEST_OF_1', 'BEST_OF_3', 'BEST_OF_5', 'FREE')),
  stake_credits BIGINT NOT NULL DEFAULT 0 CHECK (stake_credits >= 0),
  status VARCHAR(12) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED', 'COMPLETED')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_challenges_open ON challenges (status, visibility, created_at);
CREATE INDEX idx_challenges_creator ON challenges (creator_id);
CREATE TRIGGER trg_challenges_updated_at BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges (id),
  player1_id UUID NOT NULL REFERENCES users (id),
  player2_id UUID NOT NULL REFERENCES users (id),
  format VARCHAR(12) NOT NULL CHECK (format IN ('BEST_OF_1', 'BEST_OF_3', 'BEST_OF_5', 'FREE')),
  game_type VARCHAR(20) NOT NULL DEFAULT 'RPS',
  stake_credits BIGINT NOT NULL DEFAULT 0 CHECK (stake_credits >= 0),
  status VARCHAR(12) NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED')),
  current_round INT NOT NULL DEFAULT 1,
  score1 INT NOT NULL DEFAULT 0,
  score2 INT NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES users (id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_matches_p1 ON matches (player1_id, created_at);
CREATE INDEX idx_matches_p2 ON matches (player2_id, created_at);
CREATE INDEX idx_matches_status ON matches (status);
CREATE TRIGGER trg_matches_updated_at BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  player1_move VARCHAR(10) CHECK (player1_move IN ('ROCK', 'PAPER', 'SCISSORS')),
  player2_move VARCHAR(10) CHECK (player2_move IN ('ROCK', 'PAPER', 'SCISSORS')),
  player1_commit TEXT,
  player2_commit TEXT,
  result VARCHAR(10) CHECK (result IN ('PLAYER1', 'PLAYER2', 'TIE')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (match_id, round_number)
);

CREATE TABLE match_moves (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  player_id UUID NOT NULL REFERENCES users (id),
  move VARCHAR(10) NOT NULL CHECK (move IN ('ROCK', 'PAPER', 'SCISSORS')),
  commit_hash TEXT NOT NULL,
  revealed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, round_number, player_id)
);
CREATE INDEX idx_match_moves_match ON match_moves (match_id, round_number);

CREATE TABLE match_events (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  player_id UUID REFERENCES users (id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_match_events_match ON match_events (match_id, created_at);

CREATE TABLE rankings (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  ties INT NOT NULL DEFAULT 0,
  matches_played INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  current_streak INT NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  best_streak INT NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rankings_points ON rankings (points DESC, wins DESC);
CREATE TRIGGER trg_rankings_updated_at BEFORE UPDATE ON rankings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at);

-- Registro de tipos de juego (motor modular). RPS es el único jugable en
-- el MVP; el resto son metadatos COMING_SOON para la siguiente fase.
CREATE TABLE game_types (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  min_players INT NOT NULL DEFAULT 2 CHECK (min_players >= 1),
  max_players INT NOT NULL DEFAULT 2 CHECK (max_players >= min_players),
  status VARCHAR(12) NOT NULL DEFAULT 'COMING_SOON'
    CHECK (status IN ('PLAYABLE', 'COMING_SOON')),
  accent_color VARCHAR(10) NOT NULL DEFAULT '#22d3ee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO game_types (code, name, description, min_players, max_players, status, accent_color) VALUES
  ('RPS', 'Piedra, papel o tijera', 'El clásico duelo rápido en vivo: piedra vence a tijera, tijera vence a papel y papel vence a piedra.', 2, 2, 'PLAYABLE', '#22d3ee'),
  ('DAMAS', 'Damas', 'El juego de tablero por turnos: captura las piezas del rival y corona tus damas.', 2, 2, 'COMING_SOON', '#a78bfa'),
  ('DAMAS_CHINAS', 'Damas chinas', 'Lleva todas tus piezas al triángulo contrario antes que tu rival.', 2, 2, 'COMING_SOON', '#f472b6'),
  ('CONECTA_4', 'Conecta cuatro', 'Suelta fichas por turnos y consigue cuatro en línea antes que tu rival.', 2, 2, 'COMING_SOON', '#facc15')
ON CONFLICT (code) DO NOTHING;

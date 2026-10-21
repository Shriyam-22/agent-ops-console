-- Agent Ops Console schema. Safe to run more than once.

CREATE TABLE IF NOT EXISTS tickets (
  id                  SERIAL PRIMARY KEY,
  session_id          TEXT        NOT NULL,
  customer_name       TEXT        NOT NULL,
  phone_last4         TEXT        CHECK (phone_last4 ~ '^[0-9]{4}$'),
  order_id            TEXT,
  reason              TEXT        NOT NULL,
  category            TEXT        NOT NULL CHECK (category IN ('order', 'damaged', 'refund', 'product', 'policy', 'other')),
  priority            TEXT        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status              TEXT        NOT NULL DEFAULT 'open'   CHECK (status IN ('open', 'in_progress', 'resolved')),
  language            TEXT        NOT NULL DEFAULT 'en'     CHECK (language IN ('en', 'hi', 'hinglish')),
  assignee            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at   TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tickets_status_idx  ON tickets (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_session_idx ON tickets (session_id);

-- One row per message in the conversation. 'note' is an internal note only staff see.
CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER     NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('customer', 'agent', 'human', 'note')),
  author      TEXT,
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_ticket_idx ON messages (ticket_id, created_at);

-- One row per agent turn, sent by the support agent after every reply.
CREATE TABLE IF NOT EXISTS traces (
  id             SERIAL PRIMARY KEY,
  session_id     TEXT          NOT NULL,
  language       TEXT          NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi', 'hinglish')),
  tools          TEXT[]        NOT NULL DEFAULT '{}',
  flags          TEXT[]        NOT NULL DEFAULT '{}',
  latency_ms     INTEGER       NOT NULL CHECK (latency_ms >= 0),
  input_tokens   INTEGER       NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens  INTEGER       NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd       NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  repaired       BOOLEAN       NOT NULL DEFAULT false,
  fallback       BOOLEAN       NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS traces_created_idx ON traces (created_at);
CREATE INDEX IF NOT EXISTS traces_session_idx ON traces (session_id, created_at);

-- Test SQL file — Nexis editor playground
-- Exercises: DDL, DML, CTEs, window functions, JSON, triggers, views, stored procedures

-- ── DDL ──────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE SCHEMA IF NOT EXISTS nexis;

-- Enum types
CREATE TYPE nexis.user_role AS ENUM ('admin', 'member', 'viewer');
CREATE TYPE nexis.session_status AS ENUM ('active', 'idle', 'closed');
CREATE TYPE nexis.event_kind AS ENUM ('info', 'warning', 'error');

-- Main tables
CREATE TABLE nexis.users (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT        NOT NULL UNIQUE,
    display_name  TEXT        NOT NULL,
    role          nexis.user_role NOT NULL DEFAULT 'member',
    password_hash TEXT        NOT NULL,
    avatar_url    TEXT,
    metadata      JSONB       NOT NULL DEFAULT '{}',
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,

    CONSTRAINT email_format CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

CREATE TABLE nexis.workspaces (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT        NOT NULL,
    owner_id    UUID        NOT NULL REFERENCES nexis.users(id) ON DELETE CASCADE,
    root_path   TEXT        NOT NULL,
    settings    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (owner_id, root_path)
);

CREATE TABLE nexis.sessions (
    id           BIGSERIAL   PRIMARY KEY,
    workspace_id UUID        NOT NULL REFERENCES nexis.workspaces(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES nexis.users(id),
    status       nexis.session_status NOT NULL DEFAULT 'active',
    shell        TEXT        NOT NULL DEFAULT 'bash',
    cwd          TEXT        NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at     TIMESTAMPTZ,
    duration_ms  INTEGER GENERATED ALWAYS AS (
        CASE WHEN ended_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER * 1000
        END
    ) STORED
);

CREATE TABLE nexis.events (
    id           BIGSERIAL   PRIMARY KEY,
    session_id   BIGINT      REFERENCES nexis.sessions(id) ON DELETE SET NULL,
    user_id      UUID        NOT NULL REFERENCES nexis.users(id),
    kind         nexis.event_kind NOT NULL,
    payload      JSONB       NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (occurred_at);

-- Monthly partitions
CREATE TABLE nexis.events_2025_06 PARTITION OF nexis.events
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

-- Indexes
CREATE INDEX CONCURRENTLY idx_users_email_trgm ON nexis.users USING GIN (email gin_trgm_ops);
CREATE INDEX idx_events_user_id   ON nexis.events (user_id, occurred_at DESC);
CREATE INDEX idx_events_kind      ON nexis.events (kind) WHERE kind != 'info';
CREATE INDEX idx_sessions_ws      ON nexis.sessions (workspace_id, status) WHERE ended_at IS NULL;
CREATE INDEX idx_users_metadata   ON nexis.users USING GIN (metadata);

-- ── Views ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW nexis.active_sessions AS
SELECT
    s.id,
    s.workspace_id,
    s.cwd,
    s.shell,
    s.started_at,
    EXTRACT(EPOCH FROM (NOW() - s.started_at))::INTEGER AS age_seconds,
    u.display_name  AS user_name,
    u.email         AS user_email,
    w.name          AS workspace_name
FROM nexis.sessions s
JOIN nexis.users u        ON u.id = s.user_id
JOIN nexis.workspaces w   ON w.id = s.workspace_id
WHERE s.status = 'active'
  AND s.ended_at IS NULL;

-- Materialized view with refresh
CREATE MATERIALIZED VIEW nexis.user_stats AS
SELECT
    u.id,
    u.email,
    COUNT(DISTINCT s.id)              AS total_sessions,
    COUNT(DISTINCT s.workspace_id)    AS distinct_workspaces,
    SUM(s.duration_ms)                AS total_duration_ms,
    MAX(s.started_at)                 AS last_session_at,
    jsonb_agg(DISTINCT s.shell)       AS shells_used
FROM nexis.users u
LEFT JOIN nexis.sessions s ON s.user_id = u.id AND s.ended_at IS NOT NULL
GROUP BY u.id, u.email
WITH DATA;

CREATE UNIQUE INDEX ON nexis.user_stats (id);

-- ── Functions ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nexis.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION nexis.soft_delete_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE nexis.users
    SET deleted_at = NOW(), is_active = FALSE
    WHERE id = p_user_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % not found or already deleted', p_user_id;
    END IF;

    -- Close all active sessions
    UPDATE nexis.sessions
    SET status = 'closed', ended_at = NOW()
    WHERE user_id = p_user_id AND status = 'active';
END;
$$;

-- Variadic function
CREATE OR REPLACE FUNCTION nexis.merge_jsonb(VARIADIC docs JSONB[])
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_object_agg(key, value)
    FROM (
        SELECT DISTINCT ON (key) key, value
        FROM unnest(docs) AS doc, jsonb_each(doc)
        ORDER BY key, ordinality DESC
    ) merged;
$$;

-- ── Triggers ──────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON nexis.users
    FOR EACH ROW EXECUTE FUNCTION nexis.set_updated_at();

CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON nexis.workspaces
    FOR EACH ROW EXECUTE FUNCTION nexis.set_updated_at();

-- Audit log trigger
CREATE TABLE nexis.audit_log (
    id         BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    row_id     TEXT NOT NULL,
    operation  TEXT NOT NULL,
    old_data   JSONB,
    new_data   JSONB,
    changed_by TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION nexis.audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO nexis.audit_log (table_name, row_id, operation, old_data, new_data, changed_by)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id::TEXT, OLD.id::TEXT),
        TG_OP,
        CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) END,
        current_user
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_users_audit
    AFTER INSERT OR UPDATE OR DELETE ON nexis.users
    FOR EACH ROW EXECUTE FUNCTION nexis.audit_trigger();

-- ── CTEs & Window Functions ───────────────────────────────────────────────────

-- Recursive CTE: workspace hierarchy (self-referential example)
WITH RECURSIVE workspace_tree AS (
    -- Base case: root workspaces
    SELECT id, name, owner_id, NULL::UUID AS parent_id, 0 AS depth, ARRAY[name] AS path
    FROM nexis.workspaces
    WHERE name NOT LIKE '%/%'

    UNION ALL

    -- Recursive case
    SELECT w.id, w.name, w.owner_id, wt.id AS parent_id, wt.depth + 1, wt.path || w.name
    FROM nexis.workspaces w
    JOIN workspace_tree wt ON w.name LIKE wt.name || '/%'
    WHERE wt.depth < 10  -- prevent infinite recursion
)
SELECT * FROM workspace_tree ORDER BY path;

-- Window functions: session ranking per user
SELECT
    user_id,
    id AS session_id,
    started_at,
    duration_ms,
    ROW_NUMBER()    OVER w                               AS session_number,
    RANK()          OVER w                               AS rank_by_duration,
    DENSE_RANK()    OVER w                               AS dense_rank,
    LAG(duration_ms,  1, 0) OVER (PARTITION BY user_id ORDER BY started_at) AS prev_duration,
    LEAD(started_at)        OVER (PARTITION BY user_id ORDER BY started_at) AS next_start,
    SUM(duration_ms)        OVER (PARTITION BY user_id)  AS total_user_ms,
    AVG(duration_ms)        OVER (PARTITION BY user_id ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS rolling_avg,
    PERCENT_RANK()  OVER w                               AS pct_rank,
    NTILE(4)        OVER w                               AS quartile,
    FIRST_VALUE(duration_ms) OVER (PARTITION BY user_id ORDER BY duration_ms DESC
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS max_session
FROM nexis.sessions
WHERE ended_at IS NOT NULL
WINDOW w AS (PARTITION BY user_id ORDER BY duration_ms DESC);

-- JSON aggregation + filtering
SELECT
    w.name AS workspace,
    jsonb_build_object(
        'total_sessions', COUNT(s.id),
        'users', jsonb_agg(DISTINCT u.email),
        'avg_duration_minutes', ROUND(AVG(s.duration_ms) / 60000.0, 2),
        'shells', jsonb_object_agg(s.shell, COUNT(*))
    ) AS stats
FROM nexis.workspaces w
JOIN nexis.sessions s ON s.workspace_id = w.id
JOIN nexis.users u    ON u.id = s.user_id
WHERE s.started_at >= NOW() - INTERVAL '30 days'
GROUP BY w.id, w.name
HAVING COUNT(s.id) > 5
ORDER BY COUNT(s.id) DESC
LIMIT 20;

-- ── DML ───────────────────────────────────────────────────────────────────────

-- Insert with ON CONFLICT
INSERT INTO nexis.users (email, display_name, password_hash, role)
VALUES
    ('alice@nexis.dev', 'Alice',  'hash1', 'admin'),
    ('bob@nexis.dev',   'Bob',    'hash2', 'member'),
    ('carol@nexis.dev', 'Carol',  'hash3', 'viewer')
ON CONFLICT (email) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        updated_at   = NOW()
RETURNING id, email, role;

-- Update with subquery
UPDATE nexis.sessions
SET status = 'idle'
WHERE id IN (
    SELECT id FROM nexis.sessions
    WHERE status = 'active'
      AND started_at < NOW() - INTERVAL '2 hours'
    FOR UPDATE SKIP LOCKED
);

-- MERGE (PostgreSQL 15+)
MERGE INTO nexis.user_stats AS target
USING (
    SELECT id, COUNT(s.id) AS sessions
    FROM nexis.users u
    LEFT JOIN nexis.sessions s USING (user_id)
    GROUP BY u.id
) AS source ON target.id = source.id
WHEN MATCHED AND source.sessions > 0 THEN
    UPDATE SET total_sessions = source.sessions
WHEN NOT MATCHED THEN
    INSERT (id, total_sessions) VALUES (source.id, source.sessions);

-- Schema for ai-pr-reviewer.
-- Automatically applied on first container start by the official postgres
-- image (any *.sql file mounted into /docker-entrypoint-initdb.d runs once
-- against a fresh data volume). To re-run it manually against an existing
-- database: psql "$DATABASE_URL" -f db/init/001_init.sql

CREATE TABLE IF NOT EXISTS pull_requests (
    id            SERIAL PRIMARY KEY,
    repo          TEXT NOT NULL,            -- e.g. "octocat/hello-world"
    pr_number     INTEGER NOT NULL,
    pr_title      TEXT,
    pr_url        TEXT,                     -- html_url, for linking from the dashboard
    diff_summary  TEXT,                     -- Claude's summary of the diff (latest review)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (repo, pr_number)
);

CREATE TABLE IF NOT EXISTS reviews (
    id                SERIAL PRIMARY KEY,
    pull_request_id   INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    risk_level        TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    verdict           TEXT NOT NULL CHECK (verdict IN ('approve', 'comment', 'request_changes')),
    summary           TEXT NOT NULL,
    risks             JSONB NOT NULL DEFAULT '[]'::jsonb,        -- array of strings
    missing_tests     JSONB NOT NULL DEFAULT '[]'::jsonb,        -- array of strings
    raw_response      TEXT,                                      -- full JSON text Claude returned, for debugging
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_pull_request_id ON reviews (pull_request_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pull_requests_repo_pr_number ON pull_requests (repo, pr_number);

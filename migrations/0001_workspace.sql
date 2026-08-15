CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL,
  document_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

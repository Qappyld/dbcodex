export const DBCD_FORMAT_VERSION = 1;

export const DBCD_SCHEMA_SQL = `
CREATE TABLE project_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  format_version INTEGER NOT NULL,
  project_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE revisions (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES revisions(id),
  created_at TEXT NOT NULL,
  dbml_gzip BLOB NOT NULL,
  presentation_gzip BLOB NOT NULL,
  source_hash TEXT NOT NULL,
  presentation_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  label TEXT,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1))
) STRICT;
CREATE TABLE document_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dbml_text TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  presentation_json TEXT NOT NULL,
  presentation_hash TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  current_revision_id TEXT NOT NULL REFERENCES revisions(id)
) STRICT;
CREATE TABLE draft_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_generation INTEGER NOT NULL,
  dbml_text TEXT NOT NULL,
  presentation_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
`;

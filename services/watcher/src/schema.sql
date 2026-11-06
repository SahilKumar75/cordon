CREATE TABLE IF NOT EXISTS publishes (
  seq INTEGER PRIMARY KEY,
  seal_key TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  published_at TEXT NOT NULL,
  tarball_url TEXT NOT NULL,
  integrity TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_events (
  seal_key TEXT NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  ref TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (seal_key, position)
);

CREATE TABLE IF NOT EXISTS service_status (
  service TEXT PRIMARY KEY,
  healthy INTEGER NOT NULL,
  report_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cursors (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verdicts (
  seal_key TEXT NOT NULL,
  detector TEXT NOT NULL,
  detector_address TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  malicious INTEGER NOT NULL,
  simulated INTEGER NOT NULL,
  tx_hash TEXT,
  submitted_at TEXT NOT NULL,
  PRIMARY KEY (seal_key, detector)
);

CREATE TABLE IF NOT EXISTS seals (
  seal_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seen_reports (
  digest TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rescans (
  seal_key TEXT PRIMARY KEY,
  scanned_at TEXT NOT NULL
);

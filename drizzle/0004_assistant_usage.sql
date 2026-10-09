-- No prompts, replies, IP addresses, emails or profile data are stored here.
-- A single conditional INSERT reserves quota before inference across all Workers.
CREATE TABLE assistant_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL
);
CREATE INDEX assistant_requests_created ON assistant_requests(created_at);
CREATE INDEX assistant_requests_user_created ON assistant_requests(user_id, created_at);

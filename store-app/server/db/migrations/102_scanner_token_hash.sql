-- ============================================
-- Migration 102: store scanner tokens as hashes, with the times to expire them
--
-- users.scanner_session_token (020) held the scanner app's credential as a
-- plain UUID and it never expired: anyone who read the users table could act
-- as any linked scanner. routes/scanner.js now keeps only a SHA-256 hash
-- (hex of the lower-case UUID text, exactly what it computes), refuses a QR
-- code more than 15 minutes old, and refuses a scanner idle for 30 days.
--
-- Existing links keep working: their hashes are backfilled here. The plain
-- column is dropped by 103 once the code that reads the hash is deployed.
-- ============================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS scanner_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS scanner_token_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scanner_last_used_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_scanner_token_hash_key
  ON public.users (scanner_token_hash) WHERE scanner_token_hash IS NOT NULL;

UPDATE public.users
SET scanner_token_hash = encode(sha256(convert_to(lower(scanner_session_token::text), 'UTF8')), 'hex'),
    scanner_token_issued_at = coalesce(scanner_linked_at, now()),
    scanner_last_used_at = scanner_linked_at
WHERE scanner_session_token IS NOT NULL
  AND scanner_token_hash IS NULL;

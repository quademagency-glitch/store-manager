-- ============================================
-- Migration 103: drop the plain-text scanner token
--
-- 102 copied every token into scanner_token_hash, and routes/scanner.js reads
-- only the hash. Apply after that code is deployed: until then the running
-- code still looks scanners up by this column.
-- ============================================

ALTER TABLE public.users DROP COLUMN IF EXISTS scanner_session_token;

-- ============================================
-- Migration 073: where a signup came from
--
-- The marketing site (www.quaderp.app) and this app (app.quaderp.app) are
-- separate origins. They share no cookie, no storage and no analytics session,
-- so nothing about a visit survived the jump to the signup form except the
-- pricing tier, and only when the visitor clicked one of the two pricing
-- buttons. Every other CTA arrived anonymous.
--
-- That made a whole class of question unanswerable. Which page produced this
-- customer. Whether the hero CTA converts better than the pricing table.
-- Whether a campaign paid for itself. The landing page has had conversion
-- events since the perf work, but events stop at the domain boundary, and a
-- client-side linker would not survive the app's CSP or an ad blocker.
--
-- So the landing page puts what it knows on the href, and this column is where
-- it lands. JSONB rather than columns because the shape is a marketing
-- convention rather than a schema: adding utm_content later should not be a
-- migration. The API caps every value at 120 characters and accepts only a
-- fixed set of keys, so this cannot grow without bound.
--
-- Nothing reads it yet. It is written so that in three months there is
-- something to read, which is the whole point of writing it now rather than
-- when the question is asked.
--
-- Deliberately nullable and deliberately un-indexed. Most rows will have it,
-- but a signup must never fail because attribution was missing or malformed,
-- and at this table's size a sequential scan for a reporting query is free.
-- ============================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS signup_attribution JSONB;

COMMENT ON COLUMN public.businesses.signup_attribution IS
  'Where this signup came from, as sent by the marketing site: lp (landing path), cta (which control was clicked), utm_source/medium/campaign/content/term, or ref (referring hostname). Written once at signup, never updated. Null for accounts created before migration 073, for Platform Admin invites, and for anyone who reached /signup directly.';

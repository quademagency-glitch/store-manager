-- Private links that let a shop's customer open their own receipt without an
-- account, e.g. from a WhatsApp message.
--
-- Only a SHA-256 of the token is stored, so neither a database read nor a
-- backup yields a working link. Links expire, can be withdrawn, and are
-- created only by staff who can see the sale. The public endpoint returns the
-- receipt lines and totals, never the customer's or staff member's details.

CREATE TABLE public.receipt_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  CHECK (expires_at > created_at)
);
CREATE INDEX receipt_links_sale ON public.receipt_links (business_id, sale_id);

ALTER TABLE public.receipt_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.receipt_links TO service_role;

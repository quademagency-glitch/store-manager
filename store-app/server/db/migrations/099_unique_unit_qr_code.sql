-- ============================================
-- Migration 099: one tracked unit per QR code
--
-- routes/units.js checks that a code is 'unassigned', inserts the unit, and
-- only then marks the code assigned. Two requests for the same code at the
-- same moment both passed the check and created two units for one sticker,
-- and checkout (085) then picks whichever row it finds first. Only
-- routes/units.js creates unit rows; returns and transfers update them, so
-- a code never legitimately has two. Double-QR units carry the pack code in
-- pack_code_id and may have no qr_code_id, hence the partial index.
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS inventory_units_qr_code_id_key
  ON public.inventory_units (qr_code_id) WHERE qr_code_id IS NOT NULL;

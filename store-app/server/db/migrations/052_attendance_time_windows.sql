-- ============================================
-- Migration 052: Attendance Time Windows
-- Adds allowed clock-in/out time ranges to locations.
-- ============================================

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS clock_in_start TIME,
  ADD COLUMN IF NOT EXISTS clock_in_end TIME,
  ADD COLUMN IF NOT EXISTS clock_out_start TIME,
  ADD COLUMN IF NOT EXISTS clock_out_end TIME;

COMMENT ON COLUMN public.locations.clock_in_start IS 'Earliest allowed clock-in time (e.g. 06:00)';
COMMENT ON COLUMN public.locations.clock_in_end IS 'Latest allowed clock-in time (e.g. 10:00)';
COMMENT ON COLUMN public.locations.clock_out_start IS 'Earliest allowed clock-out time (e.g. 16:00)';
COMMENT ON COLUMN public.locations.clock_out_end IS 'Latest allowed clock-out time (e.g. 22:00)';

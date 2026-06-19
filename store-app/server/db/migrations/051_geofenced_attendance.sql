-- ============================================
-- Migration 051: Geofenced Attendance
-- Adds GPS coordinates + geofence radius to locations,
-- and clock-in/out coordinates to attendance_logs.
-- ============================================

-- 1. Add geofence columns to locations
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER DEFAULT 200;

COMMENT ON COLUMN public.locations.latitude IS 'Location latitude for geofenced attendance';
COMMENT ON COLUMN public.locations.longitude IS 'Location longitude for geofenced attendance';
COMMENT ON COLUMN public.locations.geofence_radius_m IS 'Allowed clock-in/out radius in meters (default 200m)';

-- 2. Add GPS coordinates to attendance_logs
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS clock_in_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_in_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_out_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_out_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_in_distance_m INTEGER,
  ADD COLUMN IF NOT EXISTS clock_out_distance_m INTEGER;

COMMENT ON COLUMN public.attendance_logs.clock_in_lat IS 'GPS latitude at clock-in';
COMMENT ON COLUMN public.attendance_logs.clock_in_lng IS 'GPS longitude at clock-in';
COMMENT ON COLUMN public.attendance_logs.clock_in_distance_m IS 'Distance from location center at clock-in (meters)';

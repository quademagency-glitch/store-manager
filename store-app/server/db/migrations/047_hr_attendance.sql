-- ============================================
-- Migration 047: HR — Time & Attendance + Shift Schedules
-- ============================================

-- 1. Attendance Logs
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN clock_out IS NOT NULL
      THEN EXTRACT(EPOCH FROM (clock_out - clock_in))::INTEGER / 60
      ELSE NULL
    END
  ) STORED,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own attendance
DROP POLICY IF EXISTS "Users can read own attendance" ON public.attendance_logs;
CREATE POLICY "Users can read own attendance"
  ON public.attendance_logs FOR SELECT TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR user_id = (SELECT id FROM public.users WHERE id = auth.uid())
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_users'))
  );

-- Users can clock in (create)
DROP POLICY IF EXISTS "Users can clock in" ON public.attendance_logs;
CREATE POLICY "Users can clock in"
  ON public.attendance_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND user_id = auth.uid())
  );

-- Users can clock out (update their own open record)
DROP POLICY IF EXISTS "Users can clock out" ON public.attendance_logs;
CREATE POLICY "Users can clock out"
  ON public.attendance_logs FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND user_id = auth.uid())
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_users'))
  );

CREATE INDEX IF NOT EXISTS idx_attendance_logs_business ON public.attendance_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_user ON public.attendance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_clock_in ON public.attendance_logs(clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_location ON public.attendance_logs(location_id);

-- 2. Shift Schedules
CREATE TABLE IF NOT EXISTS public.shift_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  role_label TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shift_end_after_start CHECK (end_time > start_time),
  UNIQUE(user_id, date, start_time)
);

ALTER TABLE public.shift_schedules ENABLE ROW LEVEL SECURITY;

-- Users can read schedules in their business
DROP POLICY IF EXISTS "Users can read schedules in their business" ON public.shift_schedules;
CREATE POLICY "Users can read schedules in their business"
  ON public.shift_schedules FOR SELECT TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR business_id = public.get_user_business_id()
  );

-- Managers can create schedules
DROP POLICY IF EXISTS "Managers can create schedules" ON public.shift_schedules;
CREATE POLICY "Managers can create schedules"
  ON public.shift_schedules FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_users'))
  );

-- Managers can update schedules
DROP POLICY IF EXISTS "Managers can update schedules" ON public.shift_schedules;
CREATE POLICY "Managers can update schedules"
  ON public.shift_schedules FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_users'))
  );

-- Managers can delete schedules
DROP POLICY IF EXISTS "Managers can delete schedules" ON public.shift_schedules;
CREATE POLICY "Managers can delete schedules"
  ON public.shift_schedules FOR DELETE TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_users'))
  );

CREATE INDEX IF NOT EXISTS idx_shift_schedules_business ON public.shift_schedules(business_id);
CREATE INDEX IF NOT EXISTS idx_shift_schedules_user ON public.shift_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_shift_schedules_date ON public.shift_schedules(date);
CREATE INDEX IF NOT EXISTS idx_shift_schedules_location ON public.shift_schedules(location_id);

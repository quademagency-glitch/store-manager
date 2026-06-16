-- 014_alerts.sql

CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
    type VARCHAR NOT NULL CHECK (type IN ('VOID', 'DISCOUNT', 'SHRINKAGE', 'CASH_OVERRIDE')),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    reference_id UUID, -- Can be sale_id or movement_id
    note TEXT,
    status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Platform Admins can see all
CREATE POLICY "Platform Admins can read all alerts" 
    ON public.alerts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role_id = (SELECT id FROM roles WHERE name = 'Platform Admin')
        )
    );

-- Business Admins can read alerts in their business
CREATE POLICY "Business Admins can read alerts in business" 
    ON public.alerts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role_id = (SELECT id FROM roles WHERE name = 'Business Admin')
            AND users.business_id = alerts.business_id
        )
    );

-- Managers and Admins can read alerts in their locations
CREATE POLICY "Users can read alerts in their locations" 
    ON public.alerts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.business_id = alerts.business_id
            AND users.role_id IN (SELECT id FROM roles WHERE name IN ('Manager', 'Admin'))
            AND (
              EXISTS (SELECT 1 FROM public.user_locations ul WHERE ul.user_id = auth.uid() AND ul.location_id = alerts.location_id)
              OR
              NOT EXISTS (SELECT 1 FROM public.user_locations ul WHERE ul.user_id = auth.uid())
            )
        )
    );

-- Updating alerts (resolving)
CREATE POLICY "Platform Admins can update all alerts" 
    ON public.alerts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role_id = (SELECT id FROM roles WHERE name = 'Platform Admin')
        )
    );

CREATE POLICY "Business Admins can update alerts in business" 
    ON public.alerts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role_id = (SELECT id FROM roles WHERE name = 'Business Admin')
            AND users.business_id = alerts.business_id
        )
    );

CREATE POLICY "Managers can update alerts in their locations" 
    ON public.alerts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.business_id = alerts.business_id
            AND users.role_id IN (SELECT id FROM roles WHERE name IN ('Manager', 'Admin'))
            AND (
              EXISTS (SELECT 1 FROM public.user_locations ul WHERE ul.user_id = auth.uid() AND ul.location_id = alerts.location_id)
              OR
              NOT EXISTS (SELECT 1 FROM public.user_locations ul WHERE ul.user_id = auth.uid())
            )
        )
    );

-- Service role can insert anything, so we don't strictly need an INSERT policy for the backend, 
-- but if we want authenticated users to be able to create alerts directly (not recommended), we'd add one.

-- Rollback for Migration 039: Communication Gateways
-- WARNING: This deletes all configured gateway credentials. Backup before running.

DROP TABLE IF EXISTS public.communication_gateways CASCADE;

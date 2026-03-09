-- Add individual time fields to disturbance_workers
ALTER TABLE public.disturbance_workers
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS pause_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stunden NUMERIC(5,2);

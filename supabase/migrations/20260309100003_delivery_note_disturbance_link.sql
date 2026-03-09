-- Add disturbance_id to delivery_notes for linking to Regieberichte
ALTER TABLE public.delivery_notes
  ADD COLUMN IF NOT EXISTS disturbance_id UUID REFERENCES public.disturbances(id);

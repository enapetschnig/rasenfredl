-- RPC to delete all time_entries for a disturbance (SECURITY DEFINER bypasses RLS)
-- Only allowed for the disturbance creator or admins
CREATE OR REPLACE FUNCTION public.delete_disturbance_time_entries(p_disturbance_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.disturbances
    WHERE id = p_disturbance_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'administrator'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.time_entries WHERE disturbance_id = p_disturbance_id;
END;
$$;

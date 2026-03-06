-- Allow admins to insert, update and delete time entries for any user
CREATE POLICY "Admins can insert all time entries"
  ON public.time_entries FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Admins can update all time entries"
  ON public.time_entries FOR UPDATE
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Admins can delete all time entries"
  ON public.time_entries FOR DELETE
  USING (public.has_role(auth.uid(), 'administrator'));

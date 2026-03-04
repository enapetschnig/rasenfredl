-- Security Fix 1: role_overrides - remove permissive testing policies
-- These allowed any user to override their own role to "administrator" - CRITICAL vulnerability
DROP POLICY IF EXISTS "Users can insert any override for testing" ON public.user_role_overrides;
DROP POLICY IF EXISTS "Users can update any override for testing" ON public.user_role_overrides;

-- Only admins can manage role overrides
CREATE POLICY "Admins can manage role overrides"
ON public.user_role_overrides
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'administrator'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'administrator'
  )
);

-- Security Fix 2: notifications - restrict insert to admins only
-- Previously any authenticated user could send notifications to any other user
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Admins can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'administrator'
  )
);

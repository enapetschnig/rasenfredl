-- Simplify admin assignment: only rasenfredl@gmail.com is admin

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assigned_role app_role;
BEGIN
  IF NEW.email = 'rasenfredl@gmail.com' THEN
    assigned_role := 'administrator';
  ELSE
    assigned_role := 'mitarbeiter';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role);

  INSERT INTO public.profiles (id, vorname, nachname, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'vorname', ''),
    COALESCE(NEW.raw_user_meta_data->>'nachname', ''),
    true
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid;
  user_email text;
  user_meta jsonb;
  assigned_role app_role;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT email, raw_user_meta_data
  INTO user_email, user_meta
  FROM auth.users
  WHERE id = current_user_id;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id) THEN
    IF user_email = 'rasenfredl@gmail.com' THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (current_user_id, 'administrator')
      ON CONFLICT (user_id, role) DO UPDATE SET role = 'administrator';
    END IF;
    RETURN json_build_object('success', true, 'action', 'existing');
  END IF;

  IF user_email = 'rasenfredl@gmail.com' THEN
    assigned_role := 'administrator';
  ELSE
    assigned_role := 'mitarbeiter';
  END IF;

  INSERT INTO public.profiles (id, vorname, nachname, is_active)
  VALUES (
    current_user_id,
    COALESCE(user_meta->>'vorname', ''),
    COALESCE(user_meta->>'nachname', ''),
    true
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (current_user_id, assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'action', 'created',
    'role', assigned_role
  );
END;
$function$;

-- Remove admin from other emails that were previously whitelisted
DELETE FROM public.user_roles
WHERE role = 'administrator'
AND user_id NOT IN (
  SELECT id FROM auth.users WHERE email = 'rasenfredl@gmail.com'
);

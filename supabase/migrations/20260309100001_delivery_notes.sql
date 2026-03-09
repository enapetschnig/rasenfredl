-- Delivery notes (Lieferscheine) - materials only, no time tracking
CREATE TABLE public.delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  datum DATE NOT NULL,
  kunde_name TEXT NOT NULL,
  kunde_adresse TEXT,
  kunde_telefon TEXT,
  projekt_id UUID REFERENCES public.projects(id),
  notizen TEXT,
  status TEXT NOT NULL DEFAULT 'offen',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_note_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id UUID NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  material TEXT NOT NULL,
  menge TEXT,
  einheit TEXT,
  notizen TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_materials ENABLE ROW LEVEL SECURITY;

-- delivery_notes policies
CREATE POLICY "Users can view own delivery notes" ON public.delivery_notes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create delivery notes" ON public.delivery_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own delivery notes" ON public.delivery_notes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own delivery notes" ON public.delivery_notes
  FOR DELETE USING (auth.uid() = user_id);

-- Admins can see all
CREATE POLICY "Admins can view all delivery notes" ON public.delivery_notes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

-- delivery_note_materials policies
CREATE POLICY "Users can manage own delivery note materials" ON public.delivery_note_materials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.delivery_notes WHERE id = delivery_note_id AND user_id = auth.uid())
  );
CREATE POLICY "Admins can manage all delivery note materials" ON public.delivery_note_materials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

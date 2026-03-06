-- Add configurable work types list to app_settings
INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'work_types',
  '["Rasen mähen","Rasenkantenschneiden","Rasen düngen","Rasen vertikutieren","Rasen bewässern","Rasen säen / Nachsaat","Rollrasen verlegen","Unkrautbekämpfung","Heckenschneiden","Baumschnitt / Baumpflege","Laubrechen / Laubblasen","Bepflanzung","Böschungspflege","Pflasterarbeiten","Aufräumen / Reinigung","Fahrt / Anfahrt","Lager","Strauchschnitt","Bodenbearbeitung","Bewässerungsanlage","Neuanlage Rasen","Auskoffern"]',
  now()
)
ON CONFLICT (key) DO NOTHING;

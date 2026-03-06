import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_WORK_TYPES = [
  "Rasen mähen", "Rasenkantenschneiden", "Rasen düngen", "Rasen vertikutieren",
  "Rasen bewässern", "Rasen säen / Nachsaat", "Rollrasen verlegen",
  "Unkrautbekämpfung", "Heckenschneiden", "Baumschnitt / Baumpflege",
  "Laubrechen / Laubblasen", "Bepflanzung", "Böschungspflege",
  "Pflasterarbeiten", "Aufräumen / Reinigung", "Fahrt / Anfahrt", "Lager",
  "Strauchschnitt", "Bodenbearbeitung", "Bewässerungsanlage",
  "Neuanlage Rasen", "Auskoffern",
];

export function useWorkTypes(): string[] {
  const [workTypes, setWorkTypes] = useState<string[]>(DEFAULT_WORK_TYPES);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "work_types")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try {
            const parsed = JSON.parse(data.value);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setWorkTypes(parsed);
            }
          } catch {}
        }
      });
  }, []);

  return workTypes;
}

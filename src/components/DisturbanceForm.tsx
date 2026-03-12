import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, User, Mail, Phone, MapPin, FileText, Package, Plus, Trash2, ChevronDown, Check, X, Users, Receipt, ExternalLink } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TimeSelect } from "@/components/ui/time-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWorkTypes } from "@/hooks/useWorkTypes";
import { format } from "date-fns";

type MaterialEntry = {
  id: string;
  material: string;
  menge: string;
};

type WorkerEntry = {
  userId: string;
  name: string;
  isMain: boolean;
  startTime: string;
  endTime: string;
  hasPause: boolean;
};

type ProfileOption = {
  id: string;
  vorname: string;
  nachname: string;
};

type DeliveryNoteMaterial = {
  id: string;
  material: string;
  menge: string;
  einheit: string;
};

type DeliveryNoteEntry = {
  id: string;
  materials: DeliveryNoteMaterial[];
  notizen: string;
};

type ExistingDeliveryNote = {
  id: string;
  datum: string;
  materialCount: number;
};

const EINHEITEN = ["Stk", "kg", "m", "m²", "m³", "Liter", "Palette", "Sack", "Rolle"];

type DisturbanceFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editData?: {
    id: string;
    datum: string;
    start_time: string;
    end_time: string;
    pause_minutes: number;
    kunde_name: string;
    kunde_email: string | null;
    kunde_adresse: string | null;
    kunde_telefon: string | null;
    beschreibung: string;
    notizen: string | null;
  } | null;
};

export const DisturbanceForm = ({ open, onOpenChange, onSuccess, editData }: DisturbanceFormProps) => {
  const { toast } = useToast();
  const WORK_TYPES = useWorkTypes();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    datum: format(new Date(), "yyyy-MM-dd"),
    startTime: "08:00",
    endTime: "10:00",
    hasPause: true,
    kundeName: "",
    kundeEmail: "",
    kundeAdresse: "",
    kundeTelefon: "",
    beschreibung: "",
    notizen: "",
  });

  const [materials, setMaterials] = useState<MaterialEntry[]>([]);
  const [workers, setWorkers] = useState<WorkerEntry[]>([]);
  const [allProfiles, setAllProfiles] = useState<ProfileOption[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteEntry[]>([]);
  const [existingDeliveryNotes, setExistingDeliveryNotes] = useState<ExistingDeliveryNote[]>([]);

  useEffect(() => {
    // Load all active profiles for worker selection
    supabase.from("profiles").select("id, vorname, nachname").eq("is_active", true)
      .then(({ data }) => { if (data) setAllProfiles(data); });
  }, []);

  useEffect(() => {
    if (editData) {
      setFormData({
        datum: editData.datum,
        startTime: editData.start_time.slice(0, 5),
        endTime: editData.end_time.slice(0, 5),
        hasPause: editData.pause_minutes > 0,
        kundeName: editData.kunde_name,
        kundeEmail: editData.kunde_email || "",
        kundeAdresse: editData.kunde_adresse || "",
        kundeTelefon: editData.kunde_telefon || "",
        beschreibung: editData.beschreibung,
        notizen: editData.notizen || "",
      });
      loadExistingMaterials(editData.id);
      loadExistingWorkers(editData.id, editData.start_time.slice(0, 5), editData.end_time.slice(0, 5));
      loadExistingDeliveryNotes(editData.id);
      setDeliveryNotes([]);
    } else {
      setFormData({
        datum: format(new Date(), "yyyy-MM-dd"),
        startTime: "08:00",
        endTime: "10:00",
        hasPause: true,
        kundeName: "",
        kundeEmail: "",
        kundeAdresse: "",
        kundeTelefon: "",
        beschreibung: "",
        notizen: "",
      });
      setMaterials([]);
      setDeliveryNotes([]);
      setExistingDeliveryNotes([]);
      // Initialize with current user as main worker
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase.from("profiles").select("vorname, nachname").eq("id", user.id).single()
            .then(({ data: p }) => {
              setWorkers([{
                userId: user.id,
                name: p ? `${p.vorname} ${p.nachname}`.trim() : "Ich",
                isMain: true,
                startTime: "08:00",
                endTime: "10:00",
                hasPause: true,
              }]);
            });
        }
      });
    }
  }, [editData, open]);

  const loadExistingWorkers = async (disturbanceId: string, defaultStart: string, defaultEnd: string) => {
    const { data: workersData } = await supabase
      .from("disturbance_workers")
      .select("user_id, is_main, start_time, end_time, pause_minutes")
      .eq("disturbance_id", disturbanceId);
    if (workersData && workersData.length > 0) {
      const userIds = workersData.map(w => w.user_id);
      const { data: profiles } = await supabase
        .from("profiles").select("id, vorname, nachname").in("id", userIds);
      setWorkers(workersData.map(w => {
        const p = profiles?.find(pr => pr.id === w.user_id);
        return {
          userId: w.user_id,
          name: p ? `${p.vorname} ${p.nachname}`.trim() : "Unbekannt",
          isMain: w.is_main,
          startTime: w.start_time?.slice(0, 5) || defaultStart,
          endTime: w.end_time?.slice(0, 5) || defaultEnd,
          hasPause: (w.pause_minutes || 0) > 0,
        };
      }));
    }
  };

  const loadExistingMaterials = async (disturbanceId: string) => {
    const { data } = await supabase
      .from("disturbance_materials")
      .select("id, material, menge")
      .eq("disturbance_id", disturbanceId);
    if (data) {
      setMaterials(data.map(m => ({ id: m.id, material: m.material, menge: m.menge || "" })));
    }
  };

  const loadExistingDeliveryNotes = async (disturbanceId: string) => {
    const { data: dnData } = await supabase
      .from("delivery_notes")
      .select("id, datum")
      .eq("disturbance_id", disturbanceId)
      .order("datum", { ascending: false });

    if (dnData && dnData.length > 0) {
      const dnIds = dnData.map(d => d.id);
      const { data: matCounts } = await supabase
        .from("delivery_note_materials")
        .select("delivery_note_id")
        .in("delivery_note_id", dnIds);

      const countMap = new Map<string, number>();
      matCounts?.forEach(m => {
        countMap.set(m.delivery_note_id, (countMap.get(m.delivery_note_id) || 0) + 1);
      });

      setExistingDeliveryNotes(dnData.map(d => ({
        id: d.id,
        datum: d.datum,
        materialCount: countMap.get(d.id) || 0,
      })));
    } else {
      setExistingDeliveryNotes([]);
    }
  };

  const calculateHours = (): number => {
    const [startH, startM] = formData.startTime.split(":").map(Number);
    const [endH, endM] = formData.endTime.split(":").map(Number);
    const pauseMinutes = formData.hasPause ? 30 : 0;
    const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM) - pauseMinutes;
    return Math.max(0, totalMinutes / 60);
  };

  const addMaterial = () => {
    setMaterials([...materials, { id: crypto.randomUUID(), material: "", menge: "" }]);
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  const updateMaterial = (id: string, field: "material" | "menge", value: string) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  // Delivery note helpers
  const addDeliveryNote = () => {
    setDeliveryNotes([...deliveryNotes, {
      id: crypto.randomUUID(),
      materials: [{ id: crypto.randomUUID(), material: "", menge: "", einheit: "" }],
      notizen: "",
    }]);
  };

  const removeDeliveryNote = (dnId: string) => {
    setDeliveryNotes(deliveryNotes.filter(dn => dn.id !== dnId));
  };

  const updateDeliveryNoteNotizen = (dnId: string, notizen: string) => {
    setDeliveryNotes(deliveryNotes.map(dn => dn.id === dnId ? { ...dn, notizen } : dn));
  };

  const addDeliveryNoteMaterial = (dnId: string) => {
    setDeliveryNotes(deliveryNotes.map(dn => dn.id === dnId
      ? { ...dn, materials: [...dn.materials, { id: crypto.randomUUID(), material: "", menge: "", einheit: "" }] }
      : dn
    ));
  };

  const removeDeliveryNoteMaterial = (dnId: string, matId: string) => {
    setDeliveryNotes(deliveryNotes.map(dn => dn.id === dnId
      ? { ...dn, materials: dn.materials.filter(m => m.id !== matId) }
      : dn
    ));
  };

  const updateDeliveryNoteMaterial = (dnId: string, matId: string, field: keyof DeliveryNoteMaterial, value: string) => {
    setDeliveryNotes(deliveryNotes.map(dn => dn.id === dnId
      ? { ...dn, materials: dn.materials.map(m => m.id === matId ? { ...m, [field]: value } : m) }
      : dn
    ));
  };

  const toggleWorkType = (workType: string) => {
    const current = formData.beschreibung;
    const lines = current.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.includes(workType)) {
      setFormData({ ...formData, beschreibung: lines.filter(l => l !== workType).join("\n") });
    } else {
      setFormData({ ...formData, beschreibung: current ? `${current}\n${workType}` : workType });
    }
  };

  const isWorkTypeSelected = (workType: string) => {
    return formData.beschreibung.split("\n").map(l => l.trim()).includes(workType);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setSaving(false);
      return;
    }

    if (!formData.kundeName.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Kundenname ist erforderlich" });
      setSaving(false);
      return;
    }

    if (!formData.beschreibung.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Arbeitsbeschreibung ist erforderlich" });
      setSaving(false);
      return;
    }

    const [startH, startM] = formData.startTime.split(":").map(Number);
    const [endH, endM] = formData.endTime.split(":").map(Number);
    if (endH * 60 + endM <= startH * 60 + startM) {
      toast({ variant: "destructive", title: "Fehler", description: "Endzeit muss nach Startzeit liegen" });
      setSaving(false);
      return;
    }

    const stunden = calculateHours();
    const pauseMinutes = formData.hasPause ? 30 : 0;

    const disturbanceData = {
      user_id: user.id,
      datum: formData.datum,
      start_time: formData.startTime,
      end_time: formData.endTime,
      pause_minutes: pauseMinutes,
      stunden,
      kunde_name: formData.kundeName.trim(),
      kunde_email: formData.kundeEmail.trim() || null,
      kunde_adresse: formData.kundeAdresse.trim() || null,
      kunde_telefon: formData.kundeTelefon.trim() || null,
      beschreibung: formData.beschreibung.trim(),
      notizen: formData.notizen.trim() || null,
    };

    if (editData) {
      const { error } = await supabase
        .from("disturbances")
        .update(disturbanceData)
        .eq("id", editData.id);

      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: "Regiebericht konnte nicht aktualisiert werden" });
        setSaving(false);
        return;
      }

      // Update workers: delete existing, re-insert
      await supabase.from("disturbance_workers").delete().eq("disturbance_id", editData.id);
      for (const worker of workers) {
        const wPause = worker.hasPause ? 30 : 0;
        const [wSH, wSM] = worker.startTime.split(":").map(Number);
        const [wEH, wEM] = worker.endTime.split(":").map(Number);
        const wStunden = Math.max(0, ((wEH * 60 + wEM) - (wSH * 60 + wSM) - wPause) / 60);

        await supabase.from("disturbance_workers").insert({
          disturbance_id: editData.id,
          user_id: worker.userId,
          is_main: worker.isMain,
          start_time: worker.startTime,
          end_time: worker.endTime,
          pause_minutes: wPause,
          stunden: parseFloat(wStunden.toFixed(2)),
        });
      }

      // Delete ALL time entries for this disturbance (RPC bypasses RLS)
      await supabase.rpc("delete_disturbance_time_entries", { p_disturbance_id: editData.id });

      // Re-create time entry for main user
      const mainWorker = workers.find(w => w.isMain);
      if (mainWorker) {
        const mwPause = mainWorker.hasPause ? 30 : 0;
        const [mSH, mSM] = mainWorker.startTime.split(":").map(Number);
        const [mEH, mEM] = mainWorker.endTime.split(":").map(Number);
        const mStunden = Math.max(0, ((mEH * 60 + mEM) - (mSH * 60 + mSM) - mwPause) / 60);

        const { data: mainEntry } = await supabase.from("time_entries").insert({
          user_id: user.id,
          datum: formData.datum,
          start_time: mainWorker.startTime,
          end_time: mainWorker.endTime,
          pause_minutes: mwPause,
          stunden: parseFloat(mStunden.toFixed(2)),
          project_id: null,
          disturbance_id: editData.id,
          taetigkeit: `Regiebericht: ${formData.kundeName.trim()}`,
          location_type: "baustelle",
        }).select("id").single();

        // Create time entries for non-main workers via edge function
        const nonMainWorkers = workers.filter(w => w.userId !== user.id);
        if (nonMainWorkers.length > 0) {
          const teamEntries = nonMainWorkers.map(w => {
            const wp = w.hasPause ? 30 : 0;
            const [sH, sM] = w.startTime.split(":").map(Number);
            const [eH, eM] = w.endTime.split(":").map(Number);
            const wSt = Math.max(0, ((eH * 60 + eM) - (sH * 60 + sM) - wp) / 60);
            return {
              user_id: w.userId,
              datum: formData.datum,
              start_time: w.startTime,
              end_time: w.endTime,
              pause_minutes: wp,
              stunden: parseFloat(wSt.toFixed(2)),
              project_id: null,
              disturbance_id: editData.id,
              taetigkeit: `Regiebericht: ${formData.kundeName.trim()}`,
              location_type: "baustelle",
            };
          });

          await supabase.functions.invoke("create-team-time-entries", {
            body: {
              mainEntry: {
                user_id: user.id,
                datum: formData.datum,
                start_time: mainWorker.startTime,
                end_time: mainWorker.endTime,
                pause_minutes: mwPause,
                stunden: parseFloat(mStunden.toFixed(2)),
                disturbance_id: editData.id,
                taetigkeit: `Regiebericht: ${formData.kundeName.trim()}`,
                location_type: "baustelle",
              },
              teamEntries,
              skipMainEntry: true,
              mainEntryId: mainEntry?.id,
            },
          });
        }
      }

      // Update materials
      await supabase.from("disturbance_materials").delete().eq("disturbance_id", editData.id);
      const validMaterials = materials.filter(m => m.material.trim());
      if (validMaterials.length > 0) {
        await supabase.from("disturbance_materials").insert(
          validMaterials.map(m => ({
            disturbance_id: editData.id,
            user_id: user.id,
            material: m.material.trim(),
            menge: m.menge.trim() || null,
          }))
        );
      }

      // Create new delivery notes
      for (const dn of deliveryNotes) {
        const validMats = dn.materials.filter(m => m.material.trim());
        if (validMats.length === 0) continue;
        const { data: newNote } = await supabase.from("delivery_notes").insert({
          user_id: user.id,
          datum: formData.datum,
          kunde_name: formData.kundeName.trim(),
          kunde_adresse: formData.kundeAdresse.trim() || null,
          kunde_telefon: formData.kundeTelefon.trim() || null,
          disturbance_id: editData.id,
          notizen: dn.notizen.trim() || null,
        }).select("id").single();
        if (newNote) {
          await supabase.from("delivery_note_materials").insert(
            validMats.map(m => ({
              delivery_note_id: newNote.id,
              material: m.material.trim(),
              menge: m.menge.trim() || null,
              einheit: m.einheit || null,
            }))
          );
        }
      }

      toast({ title: "Erfolg", description: "Regiebericht wurde aktualisiert" });
      setSaving(false);
      onSuccess();
    } else {
      // Create new disturbance
      const { data: newDisturbance, error } = await supabase
        .from("disturbances")
        .insert(disturbanceData)
        .select()
        .single();

      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: "Regiebericht konnte nicht erstellt werden" });
        setSaving(false);
        return;
      }

      // Insert workers with individual times + create time entries
      const mainWorker = workers.find(w => w.isMain) || workers[0];
      let mainTimeEntryId: string | undefined;

      for (const worker of workers) {
        const wPause = worker.hasPause ? 30 : 0;
        const [wSH, wSM] = worker.startTime.split(":").map(Number);
        const [wEH, wEM] = worker.endTime.split(":").map(Number);
        const wStunden = Math.max(0, ((wEH * 60 + wEM) - (wSH * 60 + wSM) - wPause) / 60);

        await supabase.from("disturbance_workers").insert({
          disturbance_id: newDisturbance.id,
          user_id: worker.userId,
          is_main: worker.isMain,
          start_time: worker.startTime,
          end_time: worker.endTime,
          pause_minutes: wPause,
          stunden: parseFloat(wStunden.toFixed(2)),
        });

        // Create time entry for main user directly (RLS allows own entries)
        if (worker.userId === user.id) {
          const { data: mainEntry, error: timeError } = await supabase.from("time_entries").insert({
            user_id: worker.userId,
            datum: formData.datum,
            start_time: worker.startTime,
            end_time: worker.endTime,
            pause_minutes: wPause,
            stunden: parseFloat(wStunden.toFixed(2)),
            project_id: null,
            disturbance_id: newDisturbance.id,
            taetigkeit: `Regiebericht: ${formData.kundeName.trim()}`,
            location_type: "baustelle",
          }).select("id").single();
          if (timeError) console.error("Time entry creation failed:", timeError);
          else mainTimeEntryId = mainEntry?.id;
        }
      }

      // Create time entries for non-main workers via edge function (bypasses RLS)
      const nonMainWorkers = workers.filter(w => w.userId !== user.id);
      if (nonMainWorkers.length > 0) {
        const mwPause = mainWorker.hasPause ? 30 : 0;
        const [mSH, mSM] = mainWorker.startTime.split(":").map(Number);
        const [mEH, mEM] = mainWorker.endTime.split(":").map(Number);
        const mStunden = Math.max(0, ((mEH * 60 + mEM) - (mSH * 60 + mSM) - mwPause) / 60);

        const teamEntries = nonMainWorkers.map(w => {
          const wp = w.hasPause ? 30 : 0;
          const [sH, sM] = w.startTime.split(":").map(Number);
          const [eH, eM] = w.endTime.split(":").map(Number);
          const wSt = Math.max(0, ((eH * 60 + eM) - (sH * 60 + sM) - wp) / 60);
          return {
            user_id: w.userId,
            datum: formData.datum,
            start_time: w.startTime,
            end_time: w.endTime,
            pause_minutes: wp,
            stunden: parseFloat(wSt.toFixed(2)),
            project_id: null,
            disturbance_id: newDisturbance.id,
            taetigkeit: `Regiebericht: ${formData.kundeName.trim()}`,
            location_type: "baustelle",
          };
        });

        const { error: teamError } = await supabase.functions.invoke("create-team-time-entries", {
          body: {
            mainEntry: {
              user_id: user.id,
              datum: formData.datum,
              start_time: mainWorker.startTime,
              end_time: mainWorker.endTime,
              pause_minutes: mwPause,
              stunden: parseFloat(mStunden.toFixed(2)),
              disturbance_id: newDisturbance.id,
              taetigkeit: `Regiebericht: ${formData.kundeName.trim()}`,
              location_type: "baustelle",
            },
            teamEntries,
            skipMainEntry: true,
            mainEntryId: mainTimeEntryId,
          },
        });
        if (teamError) console.error("Team time entries failed:", teamError);
      }

      // Create materials
      const validMaterials = materials.filter(m => m.material.trim());
      if (validMaterials.length > 0) {
        await supabase.from("disturbance_materials").insert(
          validMaterials.map(m => ({
            disturbance_id: newDisturbance.id,
            user_id: user.id,
            material: m.material.trim(),
            menge: m.menge.trim() || null,
          }))
        );
      }

      // Create delivery notes
      for (const dn of deliveryNotes) {
        const validMats = dn.materials.filter(m => m.material.trim());
        if (validMats.length === 0) continue;
        const { data: newNote } = await supabase.from("delivery_notes").insert({
          user_id: user.id,
          datum: formData.datum,
          kunde_name: formData.kundeName.trim(),
          kunde_adresse: formData.kundeAdresse.trim() || null,
          kunde_telefon: formData.kundeTelefon.trim() || null,
          disturbance_id: newDisturbance.id,
          notizen: dn.notizen.trim() || null,
        }).select("id").single();
        if (newNote) {
          await supabase.from("delivery_note_materials").insert(
            validMats.map(m => ({
              delivery_note_id: newNote.id,
              material: m.material.trim(),
              menge: m.menge.trim() || null,
              einheit: m.einheit || null,
            }))
          );
        }
      }

      toast({ title: "Erfolg", description: "Regiebericht wurde erfasst" });
      setSaving(false);
      onOpenChange(false);
      navigate(`/disturbances/${newDisturbance.id}?openSignature=true`);
      return;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {editData ? "Regiebericht bearbeiten" : "Neuen Regiebericht erfassen"}
          </DialogTitle>
          <DialogDescription>
            Erfassen Sie einen Service-Einsatz beim Kunden.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          <form onSubmit={handleSubmit} className="space-y-6 pb-2">
            {/* Date and Time Section */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Datum & Uhrzeit
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="datum">Datum</Label>
                  <Input
                    id="datum"
                    type="date"
                    value={formData.datum}
                    onChange={(e) => setFormData({ ...formData, datum: e.target.value })}
                    className="h-12 text-base"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="startTime">Startzeit</Label>
                  <TimeSelect
                    id="startTime"
                    value={formData.startTime}
                    onChange={(v) => {
                      setFormData({ ...formData, startTime: v });
                      setWorkers(prev => prev.map(w => w.isMain ? { ...w, startTime: v } : w));
                    }}
                    className="h-12 text-base"
                  />
                </div>
                <div>
                  <Label htmlFor="endTime">Endzeit</Label>
                  <TimeSelect
                    id="endTime"
                    value={formData.endTime}
                    onChange={(v) => {
                      setFormData({ ...formData, endTime: v });
                      setWorkers(prev => prev.map(w => w.isMain ? { ...w, endTime: v } : w));
                    }}
                    className="h-12 text-base"
                  />
                </div>
                <div className="flex items-end">
                  <div className="bg-muted rounded-xl px-3 py-3 w-full text-center">
                    <span className="text-sm text-muted-foreground">Stunden: </span>
                    <span className="font-bold text-primary text-lg">{calculateHours().toFixed(2)}</span>
                    {formData.hasPause && (
                      <p className="text-xs text-muted-foreground mt-1">inkl. 30 Min. Pause</p>
                    )}
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <Checkbox
                    id="pause-main"
                    checked={formData.hasPause}
                    onCheckedChange={(checked) => {
                      setFormData({ ...formData, hasPause: !!checked });
                      setWorkers(prev => prev.map(w => w.isMain ? { ...w, hasPause: !!checked } : w));
                    }}
                  />
                  <Label htmlFor="pause-main" className="text-sm cursor-pointer">
                    Pause (30 Min.)
                  </Label>
                </div>
              </div>
            </div>

            {/* Customer Section */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Kundendaten
              </h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="kundeName">Kundenname *</Label>
                  <Input
                    id="kundeName"
                    value={formData.kundeName}
                    onChange={(e) => setFormData({ ...formData, kundeName: e.target.value })}
                    placeholder="Max Mustermann"
                    className="h-12 text-base"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="kundeEmail" className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> E-Mail (optional)
                  </Label>
                  <Input
                    id="kundeEmail"
                    type="email"
                    value={formData.kundeEmail}
                    onChange={(e) => setFormData({ ...formData, kundeEmail: e.target.value })}
                    placeholder="kunde@email.at"
                    className="h-12 text-base"
                  />
                </div>
                <div>
                  <Label htmlFor="kundeTelefon" className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Telefon (optional)
                  </Label>
                  <Input
                    id="kundeTelefon"
                    type="tel"
                    value={formData.kundeTelefon}
                    onChange={(e) => setFormData({ ...formData, kundeTelefon: e.target.value })}
                    placeholder="+43 664 ..."
                    className="h-12 text-base"
                  />
                </div>
                <div>
                  <Label htmlFor="kundeAdresse" className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Adresse (optional)
                  </Label>
                  <Input
                    id="kundeAdresse"
                    value={formData.kundeAdresse}
                    onChange={(e) => setFormData({ ...formData, kundeAdresse: e.target.value })}
                    placeholder="Musterstraße 1, 9020 Klagenfurt"
                    className="h-12 text-base"
                  />
                </div>
              </div>
            </div>

            {/* Workers Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Mitarbeiter
                </h3>
              </div>

              {/* List current workers */}
              <div className="space-y-3">
                {workers.map((worker, idx) => (
                  <div key={worker.userId} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={worker.isMain ? "default" : "secondary"}>
                          {worker.name}
                        </Badge>
                        {worker.isMain && <span className="text-xs text-muted-foreground">(Ersteller)</span>}
                      </div>
                      {!worker.isMain && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setWorkers(workers.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Beginn</Label>
                        <TimeSelect
                          value={worker.startTime}
                          onChange={(v) => {
                            const updated = [...workers];
                            updated[idx] = { ...updated[idx], startTime: v };
                            setWorkers(updated);
                            if (worker.isMain) setFormData(prev => ({ ...prev, startTime: v }));
                          }}
                          className="h-10 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Ende</Label>
                        <TimeSelect
                          value={worker.endTime}
                          onChange={(v) => {
                            const updated = [...workers];
                            updated[idx] = { ...updated[idx], endTime: v };
                            setWorkers(updated);
                            if (worker.isMain) setFormData(prev => ({ ...prev, endTime: v }));
                          }}
                          className="h-10 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`worker-pause-${worker.userId}`}
                        checked={worker.hasPause}
                        onCheckedChange={(checked) => {
                          const updated = [...workers];
                          updated[idx] = { ...updated[idx], hasPause: !!checked };
                          setWorkers(updated);
                          if (worker.isMain) setFormData(prev => ({ ...prev, hasPause: !!checked }));
                        }}
                      />
                      <Label htmlFor={`worker-pause-${worker.userId}`} className="text-xs cursor-pointer">
                        Pause (30 Min.)
                      </Label>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add worker dropdown */}
              {(() => {
                const usedIds = workers.map(w => w.userId);
                const available = allProfiles.filter(p => !usedIds.includes(p.id));
                if (available.length === 0) return null;
                return (
                  <Select
                    onValueChange={(userId) => {
                      const profile = allProfiles.find(p => p.id === userId);
                      if (profile) {
                        setWorkers([...workers, {
                          userId: profile.id,
                          name: `${profile.vorname} ${profile.nachname}`.trim(),
                          isMain: false,
                          startTime: formData.startTime,
                          endTime: formData.endTime,
                          hasPause: formData.hasPause,
                        }]);
                      }
                    }}
                    value=""
                  >
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Mitarbeiter hinzufügen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.vorname} {p.nachname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>

            {/* Work Description Section */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Durchgeführte Arbeiten *
              </h3>

              {/* Dropdown for work type selection */}
              <div>
                <Label>Tätigkeiten auswählen</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-12 justify-between text-base font-normal mt-1"
                    >
                      {(() => {
                        const selected = WORK_TYPES.filter(wt => isWorkTypeSelected(wt));
                        if (selected.length === 0) return <span className="text-muted-foreground">Tätigkeit wählen...</span>;
                        if (selected.length === 1) return selected[0];
                        return `${selected.length} Tätigkeiten ausgewählt`;
                      })()}
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <div className="max-h-60 overflow-y-auto p-1">
                      {WORK_TYPES.map((wt) => {
                        const selected = isWorkTypeSelected(wt);
                        return (
                          <button
                            key={wt}
                            type="button"
                            onClick={() => toggleWorkType(wt)}
                            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                              selected
                                ? "bg-primary/10 text-primary font-medium"
                                : "hover:bg-muted text-foreground"
                            }`}
                          >
                            <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30"
                            }`}>
                              {selected && <Check className="w-3 h-3" />}
                            </span>
                            {wt}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Selected work types as removable tags */}
              {(() => {
                const selected = WORK_TYPES.filter(wt => isWorkTypeSelected(wt));
                if (selected.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.map((wt) => (
                      <span
                        key={wt}
                        className="inline-flex items-center gap-1 bg-primary/10 text-primary text-sm font-medium px-2.5 py-1 rounded-lg"
                      >
                        {wt}
                        <button type="button" onClick={() => toggleWorkType(wt)} className="hover:bg-primary/20 rounded p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                );
              })()}

              <div>
                <Label htmlFor="beschreibung">Eigene Tätigkeit / Zusatztext</Label>
                <Textarea
                  id="beschreibung"
                  value={formData.beschreibung}
                  onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
                  placeholder="Eigene Tätigkeit eingeben oder Auswahl oben ergänzen..."
                  rows={3}
                  className="text-base mt-1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="notizen">Notizen (optional)</Label>
                <Textarea
                  id="notizen"
                  value={formData.notizen}
                  onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                  placeholder="Zusätzliche Bemerkungen..."
                  rows={2}
                  className="text-base"
                />
              </div>
            </div>

            {/* Materials Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Material (optional)
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
                  <Plus className="h-4 w-4 mr-1" />
                  Material
                </Button>
              </div>

              {materials.length > 0 && (
                <div className="space-y-2">
                  {materials.map((mat) => (
                    <div key={mat.id} className="flex gap-2 items-start">
                      <Input
                        placeholder="Material"
                        value={mat.material}
                        onChange={(e) => updateMaterial(mat.id, "material", e.target.value)}
                        className="flex-1 h-11 text-base"
                      />
                      <Input
                        placeholder="Menge"
                        value={mat.menge}
                        onChange={(e) => updateMaterial(mat.id, "menge", e.target.value)}
                        className="w-24 h-11 text-base"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMaterial(mat.id)}
                        className="text-destructive hover:text-destructive h-11 w-11"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delivery Notes Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Lieferscheine (optional)
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={addDeliveryNote}>
                  <Plus className="h-4 w-4 mr-1" />
                  Lieferschein
                </Button>
              </div>

              {/* Existing delivery notes (edit mode) */}
              {existingDeliveryNotes.length > 0 && (
                <div className="space-y-1.5">
                  {existingDeliveryNotes.map((edn) => (
                    <div
                      key={edn.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => window.open(`/delivery-notes/${edn.id}`, '_blank')}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <Receipt className="h-3.5 w-3.5 text-primary" />
                        <span>
                          Lieferschein vom {new Date(edn.datum + 'T00:00:00').toLocaleDateString("de-DE")}
                        </span>
                        <span className="text-muted-foreground">
                          ({edn.materialCount} Material{edn.materialCount !== 1 ? "ien" : ""})
                        </span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}

              {/* New delivery note blocks */}
              {deliveryNotes.map((dn, dnIdx) => (
                <div key={dn.id} className="bg-muted/30 border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Neuer Lieferschein #{dnIdx + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removeDeliveryNote(dn.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Materials for this delivery note */}
                  <div className="space-y-2">
                    {dn.materials.map((mat) => (
                      <div key={mat.id} className="flex gap-1.5 items-start">
                        <Input
                          placeholder="Material"
                          value={mat.material}
                          onChange={(e) => updateDeliveryNoteMaterial(dn.id, mat.id, "material", e.target.value)}
                          className="flex-1 h-10 text-sm"
                        />
                        <Input
                          placeholder="Menge"
                          value={mat.menge}
                          onChange={(e) => updateDeliveryNoteMaterial(dn.id, mat.id, "menge", e.target.value)}
                          className="w-16 h-10 text-sm"
                        />
                        <Select
                          value={mat.einheit}
                          onValueChange={(v) => updateDeliveryNoteMaterial(dn.id, mat.id, "einheit", v)}
                        >
                          <SelectTrigger className="w-20 h-10 text-sm">
                            <SelectValue placeholder="Einh." />
                          </SelectTrigger>
                          <SelectContent>
                            {EINHEITEN.map((e) => (
                              <SelectItem key={e} value={e}>{e}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDeliveryNoteMaterial(dn.id, mat.id)}
                          className="text-destructive hover:text-destructive h-10 w-10"
                          disabled={dn.materials.length <= 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addDeliveryNoteMaterial(dn.id)}
                      className="text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Material
                    </Button>
                  </div>

                  <div>
                    <Input
                      placeholder="Notizen (optional)"
                      value={dn.notizen}
                      onChange={(e) => updateDeliveryNoteNotizen(dn.id, e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </form>
        </div>

        {/* Sticky Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t bg-background flex-shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={(e) => {
              e.preventDefault();
              const form = document.querySelector('form');
              if (form) form.requestSubmit();
            }}
            disabled={saving}
            className="flex-1 sm:flex-none h-12"
          >
            {saving ? "Speichern..." : editData ? "Aktualisieren" : "Regiebericht erfassen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

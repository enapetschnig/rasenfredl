import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, User, Mail, Phone, MapPin, FileText, Package, Plus, Trash2, ChevronDown, Check, X } from "lucide-react";
import { calculateAutoLunchBreak } from "@/lib/workingHours";
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
    pauseMinutes: 0,
    kundeName: "",
    kundeEmail: "",
    kundeAdresse: "",
    kundeTelefon: "",
    beschreibung: "",
    notizen: "",
  });

  const [materials, setMaterials] = useState<MaterialEntry[]>([]);

  useEffect(() => {
    if (editData) {
      setFormData({
        datum: editData.datum,
        startTime: editData.start_time.slice(0, 5),
        endTime: editData.end_time.slice(0, 5),
        pauseMinutes: editData.pause_minutes,
        kundeName: editData.kunde_name,
        kundeEmail: editData.kunde_email || "",
        kundeAdresse: editData.kunde_adresse || "",
        kundeTelefon: editData.kunde_telefon || "",
        beschreibung: editData.beschreibung,
        notizen: editData.notizen || "",
      });
      loadExistingMaterials(editData.id);
    } else {
      setFormData({
        datum: format(new Date(), "yyyy-MM-dd"),
        startTime: "08:00",
        endTime: "10:00",
        pauseMinutes: 0,
        kundeName: "",
        kundeEmail: "",
        kundeAdresse: "",
        kundeTelefon: "",
        beschreibung: "",
        notizen: "",
      });
      setMaterials([]);
    }
  }, [editData, open]);

  const loadExistingMaterials = async (disturbanceId: string) => {
    const { data } = await supabase
      .from("disturbance_materials")
      .select("id, material, menge")
      .eq("disturbance_id", disturbanceId);
    if (data) {
      setMaterials(data.map(m => ({ id: m.id, material: m.material, menge: m.menge || "" })));
    }
  };

  const calculateHours = (): number => {
    const [startH, startM] = formData.startTime.split(":").map(Number);
    const [endH, endM] = formData.endTime.split(":").map(Number);
    const pauseMinutes = calculateAutoLunchBreak(formData.startTime, formData.endTime);
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
    const pauseMinutes = calculateAutoLunchBreak(formData.startTime, formData.endTime);

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

      // Update time entry for this disturbance
      await supabase
        .from("time_entries")
        .update({
          datum: formData.datum,
          start_time: formData.startTime,
          end_time: formData.endTime,
          pause_minutes: pauseMinutes,
          stunden,
          taetigkeit: `Regiebericht: ${formData.kundeName.trim()}`,
        })
        .eq("disturbance_id", editData.id)
        .eq("user_id", user.id);

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

      // Insert time entry directly (bypasses RLS issues, works for own entries)
      const { error: timeError } = await supabase.from("time_entries").insert({
        user_id: user.id,
        datum: formData.datum,
        start_time: formData.startTime,
        end_time: formData.endTime,
        pause_minutes: pauseMinutes,
        stunden,
        project_id: null,
        disturbance_id: newDisturbance.id,
        taetigkeit: `Regiebericht: ${formData.kundeName.trim()}`,
        location_type: "baustelle",
      });

      if (timeError) {
        console.error("Time entry creation failed:", timeError);
      }

      // Add main worker entry
      await supabase.from("disturbance_workers").insert({
        disturbance_id: newDisturbance.id,
        user_id: user.id,
        is_main: true,
      });

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
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="h-12 text-base"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="endTime">Endzeit</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="h-12 text-base"
                    required
                  />
                </div>
                <div className="flex items-end">
                  <div className="bg-muted rounded-xl px-3 py-3 w-full text-center">
                    <span className="text-sm text-muted-foreground">Stunden: </span>
                    <span className="font-bold text-primary text-lg">{calculateHours().toFixed(2)}</span>
                    {calculateAutoLunchBreak(formData.startTime, formData.endTime) > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">inkl. 60 Min. Mittagspause</p>
                    )}
                  </div>
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

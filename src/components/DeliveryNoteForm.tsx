import { useState, useEffect } from "react";
import { Calendar, User, MapPin, Phone, Package, Plus, Trash2, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type MaterialEntry = {
  id: string;
  material: string;
  menge: string;
  einheit: string;
};

type ProjectOption = {
  id: string;
  name: string;
};

type DeliveryNoteFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editData?: {
    id: string;
    datum: string;
    kunde_name: string;
    kunde_adresse: string | null;
    kunde_telefon: string | null;
    projekt_id: string | null;
    notizen: string | null;
  } | null;
};

const EINHEITEN = ["Stk", "kg", "m", "m²", "m³", "Liter", "Palette", "Sack", "Rolle"];

export const DeliveryNoteForm = ({ open, onOpenChange, onSuccess, editData }: DeliveryNoteFormProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const [formData, setFormData] = useState({
    datum: format(new Date(), "yyyy-MM-dd"),
    kundeName: "",
    kundeAdresse: "",
    kundeTelefon: "",
    projektId: "",
    notizen: "",
  });

  const [materials, setMaterials] = useState<MaterialEntry[]>([
    { id: crypto.randomUUID(), material: "", menge: "", einheit: "" },
  ]);

  useEffect(() => {
    supabase.from("projects").select("id, name").eq("status", "aktiv").order("name")
      .then(({ data }) => { if (data) setProjects(data); });
  }, []);

  useEffect(() => {
    if (editData) {
      setFormData({
        datum: editData.datum,
        kundeName: editData.kunde_name,
        kundeAdresse: editData.kunde_adresse || "",
        kundeTelefon: editData.kunde_telefon || "",
        projektId: editData.projekt_id || "",
        notizen: editData.notizen || "",
      });
      loadExistingMaterials(editData.id);
    } else {
      setFormData({
        datum: format(new Date(), "yyyy-MM-dd"),
        kundeName: "",
        kundeAdresse: "",
        kundeTelefon: "",
        projektId: "",
        notizen: "",
      });
      setMaterials([{ id: crypto.randomUUID(), material: "", menge: "", einheit: "" }]);
    }
  }, [editData, open]);

  const loadExistingMaterials = async (deliveryNoteId: string) => {
    const { data } = await supabase
      .from("delivery_note_materials")
      .select("id, material, menge, einheit")
      .eq("delivery_note_id", deliveryNoteId);
    if (data && data.length > 0) {
      setMaterials(data.map(m => ({ id: m.id, material: m.material, menge: m.menge || "", einheit: m.einheit || "" })));
    }
  };

  const addMaterial = () => {
    setMaterials([...materials, { id: crypto.randomUUID(), material: "", menge: "", einheit: "" }]);
  };

  const removeMaterial = (id: string) => {
    if (materials.length <= 1) return;
    setMaterials(materials.filter(m => m.id !== id));
  };

  const updateMaterial = (id: string, field: keyof MaterialEntry, value: string) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, [field]: value } : m));
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

    const validMaterials = materials.filter(m => m.material.trim());
    if (validMaterials.length === 0) {
      toast({ variant: "destructive", title: "Fehler", description: "Mindestens ein Material ist erforderlich" });
      setSaving(false);
      return;
    }

    const noteData = {
      user_id: user.id,
      datum: formData.datum,
      kunde_name: formData.kundeName.trim(),
      kunde_adresse: formData.kundeAdresse.trim() || null,
      kunde_telefon: formData.kundeTelefon.trim() || null,
      projekt_id: formData.projektId || null,
      notizen: formData.notizen.trim() || null,
    };

    if (editData) {
      const { error } = await supabase.from("delivery_notes").update(noteData).eq("id", editData.id);
      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: "Lieferschein konnte nicht aktualisiert werden" });
        setSaving(false);
        return;
      }

      await supabase.from("delivery_note_materials").delete().eq("delivery_note_id", editData.id);
      await supabase.from("delivery_note_materials").insert(
        validMaterials.map(m => ({
          delivery_note_id: editData.id,
          material: m.material.trim(),
          menge: m.menge.trim() || null,
          einheit: m.einheit || null,
        }))
      );

      toast({ title: "Erfolg", description: "Lieferschein wurde aktualisiert" });
    } else {
      const { data: newNote, error } = await supabase.from("delivery_notes").insert(noteData).select().single();
      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: "Lieferschein konnte nicht erstellt werden" });
        setSaving(false);
        return;
      }

      await supabase.from("delivery_note_materials").insert(
        validMaterials.map(m => ({
          delivery_note_id: newNote.id,
          material: m.material.trim(),
          menge: m.menge.trim() || null,
          einheit: m.einheit || null,
        }))
      );

      toast({ title: "Erfolg", description: "Lieferschein wurde erstellt" });
    }

    setSaving(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {editData ? "Lieferschein bearbeiten" : "Neuen Lieferschein erfassen"}
          </DialogTitle>
          <DialogDescription>
            Materialien für einen Kunden dokumentieren.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          <form onSubmit={handleSubmit} className="space-y-6 pb-2">
            {/* Date */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Datum
              </h3>
              <Input
                type="date"
                value={formData.datum}
                onChange={(e) => setFormData({ ...formData, datum: e.target.value })}
                className="h-12 text-base"
                required
              />
            </div>

            {/* Customer */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Kundendaten
              </h3>
              <div className="space-y-3">
                <div>
                  <Label>Kundenname *</Label>
                  <Input
                    value={formData.kundeName}
                    onChange={(e) => setFormData({ ...formData, kundeName: e.target.value })}
                    placeholder="Max Mustermann"
                    className="h-12 text-base"
                    required
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Telefon (optional)
                  </Label>
                  <Input
                    type="tel"
                    value={formData.kundeTelefon}
                    onChange={(e) => setFormData({ ...formData, kundeTelefon: e.target.value })}
                    placeholder="+43 664 ..."
                    className="h-12 text-base"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Adresse (optional)
                  </Label>
                  <Input
                    value={formData.kundeAdresse}
                    onChange={(e) => setFormData({ ...formData, kundeAdresse: e.target.value })}
                    placeholder="Musterstraße 1, 9020 Klagenfurt"
                    className="h-12 text-base"
                  />
                </div>
              </div>
            </div>

            {/* Project */}
            {projects.length > 0 && (
              <div>
                <Label>Projekt (optional)</Label>
                <Select value={formData.projektId} onValueChange={(v) => setFormData({ ...formData, projektId: v === "none" ? "" : v })}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Projekt zuordnen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Projekt</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Materials */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Materialien *
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
                  <Plus className="h-4 w-4 mr-1" />
                  Material
                </Button>
              </div>

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
                      className="w-20 h-11 text-base"
                    />
                    <Select value={mat.einheit} onValueChange={(v) => updateMaterial(mat.id, "einheit", v)}>
                      <SelectTrigger className="w-24 h-11">
                        <SelectValue placeholder="Einheit" />
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
                      onClick={() => removeMaterial(mat.id)}
                      className="text-destructive hover:text-destructive h-11 w-11"
                      disabled={materials.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notizen (optional)</Label>
              <Textarea
                value={formData.notizen}
                onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                placeholder="Zusätzliche Bemerkungen..."
                rows={2}
                className="text-base"
              />
            </div>
          </form>
        </div>

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
            {saving ? "Speichern..." : editData ? "Aktualisieren" : "Lieferschein erfassen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

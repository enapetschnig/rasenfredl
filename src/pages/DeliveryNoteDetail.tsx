import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, User, Phone, MapPin, Edit, Trash2, Package, FolderKanban, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DeliveryNoteForm } from "@/components/DeliveryNoteForm";
import { PageHeader } from "@/components/PageHeader";

type DeliveryNote = {
  id: string;
  datum: string;
  kunde_name: string;
  kunde_adresse: string | null;
  kunde_telefon: string | null;
  projekt_id: string | null;
  disturbance_id: string | null;
  notizen: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  user_id: string;
};

type Material = {
  id: string;
  material: string;
  menge: string | null;
  einheit: string | null;
};

const DeliveryNoteDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [note, setNote] = useState<DeliveryNote | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [disturbanceName, setDisturbanceName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAuthAndFetch();
  }, [id]);

  const checkAuthAndFetch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setCurrentUserId(session.user.id);

    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", session.user.id).single();
    setIsAdmin(roleData?.role === "administrator");

    fetchNote();
  };

  const fetchNote = async () => {
    if (!id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("delivery_notes").select("*").eq("id", id).single();

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Lieferschein konnte nicht geladen werden" });
      setLoading(false);
      return;
    }

    setNote(data);

    // Load materials
    const { data: mats } = await supabase
      .from("delivery_note_materials").select("*").eq("delivery_note_id", id).order("created_at");
    if (mats) setMaterials(mats);

    // Load project name
    if (data.projekt_id) {
      const { data: proj } = await supabase
        .from("projects").select("name").eq("id", data.projekt_id).single();
      if (proj) setProjectName(proj.name);
    } else {
      setProjectName(null);
    }

    // Load disturbance name
    if (data.disturbance_id) {
      const { data: dist } = await supabase
        .from("disturbances").select("kunde_name").eq("id", data.disturbance_id).single();
      if (dist) setDisturbanceName(dist.kunde_name);
    } else {
      setDisturbanceName(null);
    }

    setLoading(false);
  };

  const handleDelete = async () => {
    if (!note) return;
    setDeleting(true);
    const { error } = await supabase.from("delivery_notes").delete().eq("id", note.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Lieferschein konnte nicht gelöscht werden" });
    } else {
      toast({ title: "Erfolg", description: "Lieferschein wurde gelöscht" });
      navigate("/delivery-notes");
    }
    setDeleting(false);
  };

  const canEdit = note && (currentUserId === note.user_id || isAdmin);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Lieferschein" />
        <main className="container mx-auto px-4 py-6 text-center">
          <p>Der Lieferschein konnte nicht gefunden werden.</p>
          <Button onClick={() => navigate("/delivery-notes")} className="mt-4">Zurück zur Übersicht</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Lieferschein" />

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        {/* Header Card */}
        <Card className="overflow-hidden border-2 border-primary/20">
          <div className="h-2 bg-gradient-to-r from-[hsl(125,55%,27%)] to-[hsl(43,85%,48%)]" />
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Package className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Lieferschein</p>
                  <h1 className="text-xl font-bold leading-tight">{note.kunde_name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(note.datum + 'T00:00:00'), "EEEE, dd. MMMM yyyy", { locale: de })}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action buttons */}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowEditForm(true)} className="gap-1">
              <Edit className="h-4 w-4" />
              Bearbeiten
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleting} className="gap-1">
                  <Trash2 className="h-4 w-4" />
                  Löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Lieferschein löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Diese Aktion kann nicht rückgängig gemacht werden.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Customer info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
              <User className="h-4 w-4" />
              Kundendaten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-semibold">{note.kunde_name}</p>
            </div>
            {note.kunde_adresse && (
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Adresse</p>
                <p className="font-medium text-sm">{note.kunde_adresse}</p>
              </div>
            )}
            {note.kunde_telefon && (
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Telefon</p>
                <a href={`tel:${note.kunde_telefon}`} className="font-medium text-sm text-primary hover:underline">
                  {note.kunde_telefon}
                </a>
              </div>
            )}
            {projectName && (
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><FolderKanban className="h-3 w-3" /> Projekt</p>
                <p className="font-medium text-sm">{projectName}</p>
              </div>
            )}
            {disturbanceName && note.disturbance_id && (
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><FileCheck className="h-3 w-3" /> Regiebericht</p>
                <p
                  className="font-medium text-sm text-primary hover:underline cursor-pointer"
                  onClick={() => navigate(`/disturbances/${note.disturbance_id}`)}
                >
                  {disturbanceName}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Materials */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
              <Package className="h-4 w-4" />
              Materialien ({materials.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {materials.map((mat) => (
                <div key={mat.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <span className="font-medium text-sm">{mat.material}</span>
                  <div className="text-sm text-muted-foreground">
                    {mat.menge && <span className="font-semibold text-foreground">{mat.menge}</span>}
                    {mat.einheit && <span className="ml-1">{mat.einheit}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {note.notizen && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Notizen
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="whitespace-pre-wrap text-sm">{note.notizen}</p>
            </CardContent>
          </Card>
        )}

        {/* Metadata */}
        <Card className="bg-muted/30">
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>Erstellt: {format(new Date(note.created_at), "dd.MM.yyyy HH:mm", { locale: de })}</span>
            </div>
          </CardContent>
        </Card>
      </main>

      <DeliveryNoteForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        onSuccess={() => { setShowEditForm(false); fetchNote(); }}
        editData={note}
      />
    </div>
  );
};

export default DeliveryNoteDetail;

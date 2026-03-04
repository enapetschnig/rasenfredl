import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Calendar, Clock, User, Mail, Phone, MapPin, Edit, Trash2, PenLine, Users, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DisturbanceForm } from "@/components/DisturbanceForm";
import { DisturbanceMaterials } from "@/components/DisturbanceMaterials";
import { DisturbancePhotos } from "@/components/DisturbancePhotos";
import { SignatureDialog } from "@/components/SignatureDialog";
import { PageHeader } from "@/components/PageHeader";

type Disturbance = {
  id: string;
  datum: string;
  start_time: string;
  end_time: string;
  pause_minutes: number;
  stunden: number;
  kunde_name: string;
  kunde_email: string | null;
  kunde_adresse: string | null;
  kunde_telefon: string | null;
  beschreibung: string;
  notizen: string | null;
  status: string;
  is_verrechnet: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  profile_vorname?: string;
  profile_nachname?: string;
};

type Worker = {
  user_id: string;
  is_main: boolean;
  vorname: string;
  nachname: string;
};

const DisturbanceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [disturbance, setDisturbance] = useState<Disturbance | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [autoOpenSignatureHandled, setAutoOpenSignatureHandled] = useState(false);

  useEffect(() => {
    checkAuthAndFetch();
  }, [id]);

  const checkAuthAndFetch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    setCurrentUserId(session.user.id);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();

    setIsAdmin(roleData?.role === "administrator");
    fetchDisturbance();
  };

  const fetchDisturbance = async () => {
    if (!id) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("disturbances")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      // Auth errors: redirect to login; other errors: stay on page and show toast
      if (error.code === "PGRST301" || error.message?.includes("JWT") || error.message?.includes("auth")) {
        navigate("/auth");
      } else {
        toast({ variant: "destructive", title: "Fehler", description: "Regiebericht konnte nicht geladen werden. Bitte Seite neu laden." });
      }
      setLoading(false);
      return;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("vorname, nachname")
        .eq("id", data.user_id)
        .single();

      setDisturbance({
        ...data,
        profile_vorname: profile?.vorname || "",
        profile_nachname: profile?.nachname || "",
      });

      const { data: workersData } = await supabase
        .from("disturbance_workers")
        .select("user_id, is_main")
        .eq("disturbance_id", id);

      if (workersData && workersData.length > 0) {
        const workerIds = workersData.map(w => w.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, vorname, nachname")
          .in("id", workerIds);

        const workersWithNames: Worker[] = workersData.map(w => {
          const p = profiles?.find(pr => pr.id === w.user_id);
          return { user_id: w.user_id, is_main: w.is_main, vorname: p?.vorname || "", nachname: p?.nachname || "" };
        });
        setWorkers(workersWithNames);
      } else {
        setWorkers([]);
      }

      if (searchParams.get('openSignature') === 'true' && !autoOpenSignatureHandled) {
        setAutoOpenSignatureHandled(true);
        searchParams.delete('openSignature');
        setSearchParams(searchParams, { replace: true });
        if (data.status === 'offen') setShowSignatureDialog(true);
      }
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!disturbance) return;
    setDeleting(true);

    await supabase.from("time_entries").delete().eq("disturbance_id", disturbance.id);

    const { error } = await supabase.from("disturbances").delete().eq("id", disturbance.id);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Regiebericht konnte nicht gelöscht werden" });
    } else {
      toast({ title: "Erfolg", description: "Regiebericht wurde gelöscht" });
      navigate("/disturbances");
    }
    setDeleting(false);
  };

  const handleToggleVerrechnet = async () => {
    if (!disturbance) return;
    const { error } = await supabase
      .from("disturbances")
      .update({ is_verrechnet: !disturbance.is_verrechnet })
      .eq("id", disturbance.id);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Status konnte nicht geändert werden" });
    } else {
      fetchDisturbance();
    }
  };

  const getStatusBadge = (status: string, isVerrechnet?: boolean) => {
    if (isVerrechnet) return <Badge className="bg-emerald-600 text-white">Verrechnet</Badge>;
    switch (status) {
      case "offen": return <Badge className="bg-amber-500 text-white">Offen</Badge>;
      case "gesendet": return <Badge className="bg-blue-500 text-white">Gesendet</Badge>;
      case "abgeschlossen": return <Badge className="bg-green-600 text-white">Abgeschlossen</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const canEdit = disturbance && (currentUserId === disturbance.user_id || isAdmin);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!disturbance) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Regiebericht" />
        <main className="container mx-auto px-4 py-6 text-center">
          <p>Der angeforderte Regiebericht konnte nicht gefunden werden.</p>
          <Button onClick={() => navigate("/disturbances")} className="mt-4">Zurück zur Übersicht</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Regiebericht" />

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">

        {/* Document Header Card */}
        <Card className="overflow-hidden border-2 border-primary/20">
          {/* Green top stripe */}
          <div className="h-2 bg-gradient-to-r from-[hsl(125,55%,27%)] to-[hsl(43,85%,48%)]" />
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Company branding + document type */}
              <div className="flex items-center gap-4">
                <img
                  src="/newlogo.png"
                  alt="Rasen Maierhold"
                  className="h-14 w-auto object-contain"
                />
                <div>
                  <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Regiebericht</p>
                  <h1 className="text-xl font-bold leading-tight">{disturbance.kunde_name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(disturbance.datum + 'T00:00:00'), "EEEE, dd. MMMM yyyy", { locale: de })}
                  </p>
                </div>
              </div>
              {/* Status */}
              <div className="flex flex-col items-end gap-2">
                {getStatusBadge(disturbance.status, disturbance.is_verrechnet)}
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {disturbance.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {canEdit && disturbance.status === "offen" && (
            <Button onClick={() => setShowSignatureDialog(true)} className="gap-2">
              <PenLine className="h-4 w-4" />
              Zur Unterschrift
            </Button>
          )}
          {isAdmin && disturbance.status !== "offen" && (
            <Button
              variant={disturbance.is_verrechnet ? "secondary" : "outline"}
              onClick={handleToggleVerrechnet}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {disturbance.is_verrechnet ? "✓ Verrechnet" : "Als verrechnet markieren"}
            </Button>
          )}
          {canEdit && (
            <>
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
                    <AlertDialogTitle>Regiebericht löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Diese Aktion kann nicht rückgängig gemacht werden. Der Regiebericht und alle zugehörigen Daten werden endgültig gelöscht.
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
            </>
          )}
        </div>

        {/* Two-column info section */}
        <div className="grid sm:grid-cols-2 gap-4">
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
                <p className="font-semibold">{disturbance.kunde_name}</p>
              </div>
              {disturbance.kunde_adresse && (
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Adresse</p>
                  <p className="font-medium text-sm">{disturbance.kunde_adresse}</p>
                </div>
              )}
              {disturbance.kunde_telefon && (
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Telefon</p>
                  <a href={`tel:${disturbance.kunde_telefon}`} className="font-medium text-sm text-primary hover:underline">
                    {disturbance.kunde_telefon}
                  </a>
                </div>
              )}
              {disturbance.kunde_email && (
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> E-Mail</p>
                  <a href={`mailto:${disturbance.kunde_email}`} className="font-medium text-sm text-primary hover:underline">
                    {disturbance.kunde_email}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Time info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
                <Clock className="h-4 w-4" />
                Arbeitszeit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <p className="text-xs text-muted-foreground">Datum</p>
                <p className="font-semibold flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {format(new Date(disturbance.datum + 'T00:00:00'), "dd.MM.yyyy", { locale: de })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Zeitraum</p>
                <p className="font-semibold">{disturbance.start_time.slice(0, 5)} – {disturbance.end_time.slice(0, 5)} Uhr</p>
              </div>
              {disturbance.pause_minutes > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Pause</p>
                  <p className="font-medium text-sm">{disturbance.pause_minutes} Minuten</p>
                </div>
              )}
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Gesamtstunden</p>
                <p className="text-2xl font-bold text-primary">{disturbance.stunden.toFixed(2)} h</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Work description */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
              <FileText className="h-4 w-4" />
              Durchgeführte Arbeiten
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{disturbance.beschreibung}</p>
            {disturbance.notizen && (
              <>
                <Separator className="my-4" />
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Notizen</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{disturbance.notizen}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Workers */}
        {workers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
                <Users className="h-4 w-4" />
                Beteiligte Mitarbeiter
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {workers.map((worker) => (
                  <Badge
                    key={worker.user_id}
                    variant={worker.is_main ? "default" : "secondary"}
                    className="text-sm py-1 px-3"
                  >
                    {worker.vorname} {worker.nachname}
                    {worker.is_main && " (Ersteller)"}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Arbeitszeit automatisch für alle {workers.length} Mitarbeiter gebucht.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Photos */}
        <DisturbancePhotos disturbanceId={disturbance.id} canEdit={canEdit || false} />

        {/* Materials */}
        <DisturbanceMaterials disturbanceId={disturbance.id} canEdit={canEdit || false} />

        {/* Metadata (admin only) */}
        {isAdmin && (disturbance.profile_vorname || disturbance.profile_nachname) && (
          <Card className="bg-muted/30">
            <CardContent className="py-3">
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Erfasst von: {disturbance.profile_vorname} {disturbance.profile_nachname}</span>
                <span>Erstellt: {format(new Date(disturbance.created_at), "dd.MM.yyyy HH:mm", { locale: de })}</span>
                <span>Aktualisiert: {format(new Date(disturbance.updated_at), "dd.MM.yyyy HH:mm", { locale: de })}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <DisturbanceForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        onSuccess={() => { setShowEditForm(false); fetchDisturbance(); }}
        editData={disturbance}
      />

      <SignatureDialog
        open={showSignatureDialog}
        onOpenChange={setShowSignatureDialog}
        disturbance={disturbance}
        onSuccess={() => { setShowSignatureDialog(false); fetchDisturbance(); }}
      />
    </div>
  );
};

export default DisturbanceDetail;

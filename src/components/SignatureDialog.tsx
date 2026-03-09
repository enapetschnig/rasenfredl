import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SignaturePad } from "./SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Send, User, Clock, Package, FileText, Loader2 } from "lucide-react";

type Material = {
  id: string;
  material: string;
  menge: string | null;
  notizen: string | null;
};

type Photo = {
  id: string;
  file_path: string;
  file_name: string;
};

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
};

interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disturbance: Disturbance;
  onSuccess: () => void;
}

export const SignatureDialog = ({
  open,
  onOpenChange,
  disturbance,
  onSuccess,
}: SignatureDialogProps) => {
  const { toast } = useToast();
  const [signature, setSignature] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      fetchMaterials();
      fetchPhotos();
      setSignature(null);
    }
  }, [open, disturbance.id]);

  const fetchMaterials = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("disturbance_materials")
      .select("*")
      .eq("disturbance_id", disturbance.id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMaterials(data);
    }
    setLoading(false);
  };

  const fetchPhotos = async () => {
    const { data, error } = await supabase
      .from("disturbance_photos")
      .select("id, file_path, file_name")
      .eq("disturbance_id", disturbance.id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setPhotos(data);
    }
  };

  const handleSendReport = async () => {
    if (!signature) {
      toast({
        variant: "destructive",
        title: "Unterschrift fehlt",
        description: "Bitte lassen Sie den Kunden unterschreiben",
      });
      return;
    }

    setSending(true);

    try {
      // Save signature to disturbance
      const { error: updateError } = await supabase
        .from("disturbances")
        .update({
          unterschrift_kunde: signature,
          unterschrift_am: new Date().toISOString(),
          status: "gesendet",
        })
        .eq("id", disturbance.id);

      if (updateError) throw updateError;

      // Get all technicians assigned to this disturbance (with individual times)
      const { data: workers } = await supabase
        .from("disturbance_workers")
        .select("user_id, is_main, start_time, end_time, pause_minutes, stunden")
        .eq("disturbance_id", disturbance.id)
        .order("is_main", { ascending: false }); // Main technician first

      let technicianNames: string[] = [];
      let workerDetails: { name: string; startTime: string; endTime: string; stunden: number }[] = [];

      if (workers && workers.length > 0) {
        // Load profile data for all workers
        const userIds = workers.map(w => w.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, vorname, nachname")
          .in("id", userIds);

        if (profiles) {
          workers.forEach(w => {
            const profile = profiles.find(p => p.id === w.user_id);
            const name = profile ? `${profile.vorname} ${profile.nachname}`.trim() : "";
            if (name) {
              technicianNames.push(name);
              workerDetails.push({
                name,
                startTime: w.start_time?.slice(0, 5) || disturbance.start_time.slice(0, 5),
                endTime: w.end_time?.slice(0, 5) || disturbance.end_time.slice(0, 5),
                stunden: w.stunden ?? disturbance.stunden,
              });
            }
          });
        }
      }

      // Fallback to current user if no workers found
      if (technicianNames.length === 0) {
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.user?.id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("vorname, nachname")
            .eq("id", session.session.user.id)
            .single();
          if (profile) {
            const name = `${profile.vorname} ${profile.nachname}`.trim();
            technicianNames = [name];
            workerDetails = [{ name, startTime: disturbance.start_time.slice(0, 5), endTime: disturbance.end_time.slice(0, 5), stunden: disturbance.stunden }];
          }
        }
      }

      if (technicianNames.length === 0) {
        technicianNames = ["Techniker"];
        workerDetails = [{ name: "Techniker", startTime: disturbance.start_time.slice(0, 5), endTime: disturbance.end_time.slice(0, 5), stunden: disturbance.stunden }];
      }

      // Send email via edge function
      const { data: sendData, error: sendError } = await supabase.functions.invoke("send-disturbance-report", {
        body: {
          disturbance: {
            ...disturbance,
            unterschrift_kunde: signature,
          },
          materials,
          technicianNames,
          workerDetails,
          photos,
        },
      });

      if (sendError) {
        let detail = "E-Mail konnte nicht gesendet werden";
        try {
          const errCtx = (sendError as any).context;
          if (errCtx) {
            const body = await errCtx.json();
            if (body?.error) detail = body.error;
          } else if (sendData?.error) {
            detail = sendData.error;
          }
        } catch (_) { /* ignore */ }
        console.error("Email send error:", sendError, "detail:", detail);
        toast({
          variant: "destructive",
          title: "E-Mail Fehler",
          description: detail,
        });
      } else {
        toast({
          title: "Regiebericht gesendet",
          description: "Der Bericht wurde erfolgreich per E-Mail versendet.",
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error sending report:", error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Der Bericht konnte nicht gesendet werden",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Regiebericht zur Unterschrift
          </DialogTitle>
          <DialogDescription>
            Bitte lassen Sie den Kunden unterschreiben und senden Sie dann den Bericht.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Signature Section - TOP */}
          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Unterschrift des Kunden
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SignaturePad onSignatureChange={setSignature} />
            </CardContent>
          </Card>

          <Separator />

          {/* Summary Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Zusammenfassung</h3>

            {/* Customer Data */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  Kundendaten
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><strong>Name:</strong> {disturbance.kunde_name}</p>
                {disturbance.kunde_adresse && (
                  <p><strong>Adresse:</strong> {disturbance.kunde_adresse}</p>
                )}
                {disturbance.kunde_telefon && (
                  <p><strong>Telefon:</strong> {disturbance.kunde_telefon}</p>
                )}
                {disturbance.kunde_email && (
                  <p><strong>E-Mail:</strong> {disturbance.kunde_email}</p>
                )}
              </CardContent>
            </Card>

            {/* Time Data */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Einsatzdaten
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>
                  <strong>Datum:</strong>{" "}
                  {format(new Date(disturbance.datum), "EEEE, dd. MMMM yyyy", { locale: de })}
                </p>
                <p>
                  <strong>Arbeitszeit:</strong>{" "}
                  {disturbance.start_time.slice(0, 5)} - {disturbance.end_time.slice(0, 5)} Uhr
                </p>
                {disturbance.pause_minutes > 0 && (
                  <p><strong>Pause:</strong> {disturbance.pause_minutes} Minuten</p>
                )}
                <p className="text-primary font-medium">
                  <strong>Gesamtstunden:</strong> {disturbance.stunden.toFixed(2)} h
                </p>
              </CardContent>
            </Card>

            {/* Work Description */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Durchgeführte Arbeiten
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="whitespace-pre-wrap">{disturbance.beschreibung}</p>
                {disturbance.notizen && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-muted-foreground text-xs mb-1">Notizen:</p>
                    <p className="whitespace-pre-wrap text-xs">{disturbance.notizen}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Materials */}
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : materials.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                    <Package className="h-4 w-4" />
                    Verwendete Materialien
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1">
                    {materials.map((material) => (
                      <li key={material.id} className="flex gap-2">
                        <span>•</span>
                        <span>
                          {material.menge && `${material.menge} `}
                          {material.material}
                          {material.notizen && (
                            <span className="text-muted-foreground"> ({material.notizen})</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSendReport}
            disabled={!signature || sending}
            className="gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gesendet...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Regiebericht senden
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

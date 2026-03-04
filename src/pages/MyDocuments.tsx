import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, Download, Eye, Trash2, Camera, FolderOpen } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FileViewer } from "@/components/FileViewer";

interface Document {
  name: string;
  path: string;
  created_at?: string;
}

export default function MyDocuments() {
  const [payslips, setPayslips] = useState<Document[]>([]);
  const [sickNotes, setSickNotes] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [viewingFile, setViewingFile] = useState<{ name: string; path: string; bucketName: string } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUserAndDocuments();
  }, []);

  const fetchUserAndDocuments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      return;
    }

    setUserId(user.id);
    await Promise.all([
      fetchDocuments(user.id, "lohnzettel", setPayslips),
      fetchDocuments(user.id, "krankmeldung", setSickNotes),
    ]);
    setLoading(false);
  };

  const fetchDocuments = async (
    userId: string,
    type: "lohnzettel" | "krankmeldung",
    setter: (docs: Document[]) => void
  ) => {
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .list(`${userId}/${type}`);

    if (error) {
      console.error(`Fehler beim Laden von ${type}:`, error);
      return;
    }

    if (data) {
      const docs = data.map((file) => ({
        name: file.name,
        path: `${userId}/${type}/${file.name}`,
        created_at: file.created_at,
      }));
      setter(docs);
    }
  };

  const notifyAdmins = async (fileName: string) => {
    // Get all admin user IDs
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "administrator");

    if (!admins || admins.length === 0) return;

    // Get current user's name
    const { data: profile } = await supabase
      .from("profiles")
      .select("vorname, nachname")
      .eq("id", userId)
      .single();

    const name = profile ? `${profile.vorname} ${profile.nachname}` : "Ein Mitarbeiter";

    // Insert notification for each admin
    const notifications = admins.map((admin) => ({
      user_id: admin.user_id,
      type: "krankmeldung",
      message: `${name} hat eine Krankmeldung hochgeladen`,
      data: { file: fileName, employee_id: userId },
    }));

    await supabase.from("notifications").insert(notifications);
  };

  const handleUpload = async (file: File | null) => {
    if (!file || !userId) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Fehler", description: "Datei ist zu groß (max. 50 MB)" });
      return;
    }

    setUploading(true);

    const filePath = `${userId}/krankmeldung/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage
      .from("employee-documents")
      .upload(filePath, file);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: `Upload fehlgeschlagen: ${error.message}` });
    } else {
      toast({ title: "Krankmeldung hochgeladen", description: "Der Administrator wurde benachrichtigt." });
      await notifyAdmins(file.name);
      await fetchDocuments(userId, "krankmeldung", setSickNotes);
    }

    setUploading(false);
  };

  const handleView = (doc: Document) => {
    setViewingFile({ name: doc.name, path: doc.path, bucketName: "employee-documents" });
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Möchten Sie "${doc.name}" wirklich löschen?`)) return;

    const { error } = await supabase.storage.from("employee-documents").remove([doc.path]);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Löschen fehlgeschlagen" });
    } else {
      toast({ title: "Erfolg", description: "Dokument gelöscht" });
      await fetchDocuments(userId, "krankmeldung", setSickNotes);
    }
  };

  if (loading) {
    return <div className="p-4">Lädt...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Meine Dokumente" />

      <div className="container mx-auto p-4 max-w-4xl">
        <Tabs defaultValue="payslips" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payslips">
              <FileText className="w-4 h-4 mr-2" />
              Meine Lohnzettel
            </TabsTrigger>
            <TabsTrigger value="sicknotes">
              <FileText className="w-4 h-4 mr-2" />
              Krankmeldungen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payslips" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Meine Lohnzettel</CardTitle>
                <CardDescription>
                  Vom Administrator hochgeladene Lohnzettel
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payslips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Lohnzettel vorhanden</p>
                ) : (
                  <div className="space-y-2">
                    {payslips.map((doc) => (
                      <div
                        key={doc.path}
                        className="flex items-center justify-between p-3 border rounded-md hover:bg-accent"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="w-5 h-5 text-primary shrink-0" />
                          <span className="text-sm truncate">{doc.name}</span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => handleView(doc)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sicknotes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Krankmeldung hochladen</CardTitle>
                <CardDescription>
                  Foto machen oder Datei auswählen – der Administrator wird automatisch benachrichtigt
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {/* Camera button */}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-20 flex-col gap-2 border-2 border-dashed"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Camera className="w-6 h-6 text-primary" />
                    <span className="text-sm">Foto aufnehmen</span>
                  </Button>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files?.[0] || null)}
                  />

                  {/* File picker button */}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-20 flex-col gap-2 border-2 border-dashed"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <FolderOpen className="w-6 h-6 text-primary" />
                    <span className="text-sm">Datei auswählen</span>
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,image/*"
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files?.[0] || null)}
                  />
                </div>
                {uploading && (
                  <p className="text-sm text-muted-foreground mt-3 text-center">Wird hochgeladen...</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Meine Krankmeldungen</CardTitle>
                <CardDescription>Hochgeladene Krankmeldungen</CardDescription>
              </CardHeader>
              <CardContent>
                {sickNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Krankmeldungen vorhanden</p>
                ) : (
                  <div className="space-y-2">
                    {sickNotes.map((doc) => (
                      <div
                        key={doc.path}
                        className="flex items-center justify-between p-3 border rounded-md hover:bg-accent"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="w-5 h-5 text-primary shrink-0" />
                          <span className="text-sm truncate">{doc.name}</span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => handleView(doc)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDelete(doc)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {viewingFile && (
        <FileViewer
          open={true}
          onClose={() => setViewingFile(null)}
          fileName={viewingFile.name}
          filePath={viewingFile.path}
          bucketName={viewingFile.bucketName}
        />
      )}
    </div>
  );
}

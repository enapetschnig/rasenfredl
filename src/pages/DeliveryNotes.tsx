import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Package, Plus, Calendar, User, Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  status: string;
  created_at: string;
  user_id: string;
  materialCount?: number;
};

const DeliveryNotes = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLabel, setFilterLabel] = useState<string | null>(null);

  const projectFilter = searchParams.get("project");
  const disturbanceFilter = searchParams.get("disturbance");

  useEffect(() => {
    checkAuth();
  }, []);

  // Refetch when filter params change
  useEffect(() => {
    if (!loading) {
      fetchNotes();
    }
  }, [projectFilter, disturbanceFilter]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    fetchNotes();
  };

  const fetchNotes = async () => {
    setLoading(true);
    setFilterLabel(null);

    let query = supabase.from("delivery_notes").select("*").order("datum", { ascending: false });

    if (projectFilter) {
      query = query.eq("projekt_id", projectFilter);
      // Load project name for filter label
      const { data: proj } = await supabase.from("projects").select("name").eq("id", projectFilter).single();
      if (proj) setFilterLabel(`Projekt: ${proj.name}`);
    }
    if (disturbanceFilter) {
      query = query.eq("disturbance_id", disturbanceFilter);
      const { data: dist } = await supabase.from("disturbances").select("kunde_name").eq("id", disturbanceFilter).single();
      if (dist) setFilterLabel(`Regiebericht: ${dist.kunde_name}`);
    }

    const { data, error } = await query;

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Lieferscheine konnten nicht geladen werden" });
    } else if (data) {
      // Count materials per note
      const noteIds = data.map(n => n.id);
      const { data: matCounts } = await supabase
        .from("delivery_note_materials")
        .select("delivery_note_id")
        .in("delivery_note_id", noteIds);

      const countMap = new Map<string, number>();
      matCounts?.forEach(m => {
        countMap.set(m.delivery_note_id, (countMap.get(m.delivery_note_id) || 0) + 1);
      });

      setNotes(data.map(n => ({ ...n, materialCount: countMap.get(n.id) || 0 })));
    }
    setLoading(false);
  };

  const filtered = notes.filter((n) =>
    n.kunde_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (n.kunde_adresse?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Lieferscheine" />

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Alle Lieferscheine
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filterLabel || "Material-Dokumentation"}
            </p>
            {filterLabel && (
              <Button variant="link" size="sm" className="px-0 h-auto text-xs" onClick={() => navigate("/delivery-notes")}>
                Filter entfernen
              </Button>
            )}
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Neuer Lieferschein
          </Button>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suche nach Kunde oder Adresse..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="h-14 w-14 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Lieferscheine gefunden</h3>
              <p className="text-muted-foreground mb-6 text-sm">
                {searchQuery ? "Keine Einträge entsprechen Ihrer Suche" : "Erstellen Sie Ihren ersten Lieferschein"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ersten Lieferschein erfassen
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((note) => (
              <Card
                key={note.id}
                className="cursor-pointer hover:shadow-md transition-all border-l-4 border-l-primary/40"
                onClick={() => navigate(`/delivery-notes/${note.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{note.kunde_name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {note.materialCount} Material{note.materialCount !== 1 ? "ien" : ""}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(note.datum + 'T00:00:00'), "dd.MM.yyyy", { locale: de })}
                        </span>
                        {note.kunde_adresse && (
                          <span className="flex items-center gap-1 truncate max-w-[200px]">
                            {note.kunde_adresse}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <DeliveryNoteForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={() => { setShowForm(false); fetchNotes(); }}
        initialDisturbanceId={disturbanceFilter || undefined}
      />
    </div>
  );
};

export default DeliveryNotes;

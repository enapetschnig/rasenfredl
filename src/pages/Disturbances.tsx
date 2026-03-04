import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus, Calendar, Clock, User, MapPin, Filter, Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DisturbanceForm } from "@/components/DisturbanceForm";
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
  user_id: string;
  profile_vorname?: string;
  profile_nachname?: string;
};

const Disturbances = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [disturbances, setDisturbances] = useState<Disturbance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingDisturbance, setEditingDisturbance] = useState<Disturbance | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();

    setIsAdmin(roleData?.role === "administrator");
    fetchDisturbances();
  };

  const fetchDisturbances = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("disturbances")
      .select("*")
      .order("datum", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Regieberichte konnten nicht geladen werden",
      });
    } else {
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(d => d.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, vorname, nachname")
          .in("id", userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const enrichedData = data.map(d => ({
          ...d,
          profile_vorname: profileMap.get(d.user_id)?.vorname || "",
          profile_nachname: profileMap.get(d.user_id)?.nachname || "",
        }));

        setDisturbances(enrichedData);
      } else {
        setDisturbances([]);
      }
    }
    setLoading(false);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingDisturbance(null);
    fetchDisturbances();
  };

  const getStatusConfig = (status: string, isVerrechnet?: boolean) => {
    if (isVerrechnet) return { label: "Verrechnet", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", border: "border-l-emerald-500" };
    switch (status) {
      case "offen": return { label: "Offen", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", border: "border-l-amber-400" };
      case "gesendet": return { label: "Gesendet", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", border: "border-l-blue-500" };
      case "abgeschlossen": return { label: "Abgeschlossen", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", border: "border-l-green-500" };
      default: return { label: status, color: "bg-gray-100 text-gray-800", border: "border-l-gray-400" };
    }
  };

  const handleToggleVerrechnet = async (e: React.MouseEvent, disturbanceId: string, currentValue: boolean) => {
    e.stopPropagation();

    const { error } = await supabase
      .from("disturbances")
      .update({ is_verrechnet: !currentValue })
      .eq("id", disturbanceId);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Status konnte nicht geändert werden" });
    } else {
      fetchDisturbances();
    }
  };

  const filteredDisturbances = disturbances.filter((d) => {
    const matchesSearch =
      d.kunde_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.beschreibung.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.kunde_adresse?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

    let matchesStatus = true;
    if (statusFilter === "verrechnet") matchesStatus = d.is_verrechnet === true;
    else if (statusFilter === "nicht_verrechnet") matchesStatus = d.is_verrechnet === false;
    else if (statusFilter !== "alle") matchesStatus = d.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Regieberichte" />

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Title + Action */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Alle Regieberichte
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Service-Einsätze &amp; Kundendokumentation
            </p>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Neuer Regiebericht
          </Button>
        </div>

        {/* Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suche nach Kunde, Beschreibung, Adresse..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Status</SelectItem>
              <SelectItem value="offen">Offen</SelectItem>
              <SelectItem value="gesendet">Gesendet</SelectItem>
              <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
              <SelectItem value="verrechnet">Verrechnet</SelectItem>
              <SelectItem value="nicht_verrechnet">Nicht verrechnet</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {filteredDisturbances.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <ClipboardList className="h-14 w-14 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Regieberichte gefunden</h3>
              <p className="text-muted-foreground mb-6 text-sm">
                {searchQuery || statusFilter !== "alle"
                  ? "Keine Einträge entsprechen Ihren Filterkriterien"
                  : "Erstellen Sie Ihren ersten Regiebericht"}
              </p>
              {!searchQuery && statusFilter === "alle" && (
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ersten Regiebericht erfassen
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredDisturbances.map((disturbance, idx) => {
              const statusCfg = getStatusConfig(disturbance.status, disturbance.is_verrechnet);
              const reportNr = disturbance.id.slice(-6).toUpperCase();
              return (
                <Card
                  key={disturbance.id}
                  className={`cursor-pointer hover:shadow-md transition-all border-l-4 ${statusCfg.border}`}
                  onClick={() => navigate(`/disturbances/${disturbance.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Header row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">#{reportNr}</span>
                          <h3 className="font-semibold text-base truncate">
                            {disturbance.kunde_name}
                          </h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                        </div>

                        {/* Meta row */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(disturbance.datum + 'T00:00:00'), "dd.MM.yyyy", { locale: de })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {disturbance.start_time.slice(0, 5)} – {disturbance.end_time.slice(0, 5)}
                            <span className="font-semibold text-foreground ml-1">{disturbance.stunden.toFixed(1)}h</span>
                          </span>
                          {disturbance.kunde_adresse && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[180px]">{disturbance.kunde_adresse}</span>
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        <p className="text-sm text-muted-foreground line-clamp-2">{disturbance.beschreibung}</p>

                        {/* Admin: creator + verrechnen button */}
                        {isAdmin && (
                          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                            {(disturbance.profile_vorname || disturbance.profile_nachname) && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <User className="h-3 w-3" />
                                {disturbance.profile_vorname} {disturbance.profile_nachname}
                              </span>
                            )}
                            {disturbance.status !== "offen" && (
                              <Button
                                variant={disturbance.is_verrechnet ? "secondary" : "outline"}
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => handleToggleVerrechnet(e, disturbance.id, disturbance.is_verrechnet)}
                              >
                                {disturbance.is_verrechnet ? "✓ Verrechnet" : "Verrechnen"}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: chevron */}
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <DisturbanceForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={handleFormSuccess}
        editData={editingDisturbance}
      />
    </div>
  );
};

export default Disturbances;

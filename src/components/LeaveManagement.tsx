import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type Profile = {
  id: string;
  vorname: string;
  nachname: string;
};

type LeaveBalance = {
  id: string;
  user_id: string;
  year: number;
  total_days: number;
  used_days: number;
};

interface LeaveManagementProps {
  profiles: Profile[];
}

export default function LeaveManagement({ profiles }: LeaveManagementProps) {
  const { toast } = useToast();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [vacationDays, setVacationDays] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [editDays, setEditDays] = useState("");

  const fetchData = async () => {
    setLoading(true);

    // Fetch leave balances
    const { data: balData } = await supabase
      .from("leave_balances")
      .select("*")
      .eq("year", selectedYear);

    if (balData) setBalances(balData as LeaveBalance[]);

    // Calculate used vacation days dynamically from time_entries
    const startDate = `${selectedYear}-01-01`;
    const endDate = `${selectedYear}-12-31`;

    const { data: vacEntries } = await supabase
      .from("time_entries")
      .select("user_id, datum")
      .eq("taetigkeit", "Urlaub")
      .gte("datum", startDate)
      .lte("datum", endDate);

    const daysByUser: Record<string, Set<string>> = {};
    if (vacEntries) {
      vacEntries.forEach((entry: any) => {
        if (!daysByUser[entry.user_id]) {
          daysByUser[entry.user_id] = new Set();
        }
        daysByUser[entry.user_id].add(entry.datum);
      });
    }

    const counts: Record<string, number> = {};
    for (const [userId, dates] of Object.entries(daysByUser)) {
      counts[userId] = dates.size;
    }
    setVacationDays(counts);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const ensureBalance = async (userId: string) => {
    const existing = balances.find((b) => b.user_id === userId && b.year === selectedYear);
    if (existing) return;

    await supabase.from("leave_balances").insert({
      user_id: userId,
      year: selectedYear,
      total_days: 25,
      used_days: 0,
    });
    fetchData();
  };

  const updateTotalDays = async (balanceId: string, totalDays: number) => {
    const { error } = await supabase
      .from("leave_balances")
      .update({ total_days: totalDays })
      .eq("id", balanceId);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gespeichert", description: "Urlaubstage aktualisiert" });
    }
    setEditingBalance(null);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Leave Balances / Quota Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Urlaubskontingent {selectedYear}
              </CardTitle>
              <CardDescription>Urlaubstage pro Mitarbeiter verwalten (verbrauchte Tage werden automatisch aus Zeiterfassung berechnet)</CardDescription>
            </div>
            <Select
              value={String(selectedYear)}
              onValueChange={(v) => setSelectedYear(Number(v))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {profiles
              .filter((p) => p.vorname && p.nachname)
              .map((profile) => {
                const balance = balances.find(
                  (b) => b.user_id === profile.id && b.year === selectedYear
                );
                const usedDays = vacationDays[profile.id] || 0;
                const totalDays = balance?.total_days ?? 25;
                const remaining = totalDays - usedDays;

                return (
                  <div
                    key={profile.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">
                        {profile.vorname} {profile.nachname}
                      </p>
                      {balance ? (
                        <p className="text-sm text-muted-foreground">
                          {usedDays} von {totalDays} Tagen verbraucht ·{" "}
                          <span className={remaining < 0 ? "text-destructive font-semibold" : remaining <= 5 ? "text-orange-600 font-semibold" : "text-green-600 font-semibold"}>
                            {remaining} übrig
                          </span>
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Noch kein Kontingent angelegt ({usedDays} Urlaubstage gebucht)
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {balance && editingBalance === balance.id ? (
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            value={editDays}
                            onChange={(e) => setEditDays(e.target.value)}
                            className="w-20"
                          />
                          <Button
                            size="sm"
                            onClick={() =>
                              updateTotalDays(balance.id, Number(editDays))
                            }
                          >
                            OK
                          </Button>
                        </div>
                      ) : balance ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingBalance(balance.id);
                            setEditDays(String(balance.total_days));
                          }}
                        >
                          Tage ändern
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => ensureBalance(profile.id)}
                        >
                          Kontingent anlegen
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

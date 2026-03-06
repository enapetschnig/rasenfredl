import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Clock, Plus, AlertTriangle, CheckCircle2, Calendar, Sun, Trash2, ChevronLeft, ChevronRight, Users, Check, ArrowLeft, FileText, Pencil, ChevronDown, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { format, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import {
  getNormalWorkingHours,
  getDefaultWorkTimes,
  isNonWorkingDay,
  getWeeklyTargetHours,
  getTotalWorkingHours,
  getAustrianHoliday,
  calculateAutoLunchBreak,
} from "@/lib/workingHours";
import { FillRemainingHoursDialog } from "@/components/FillRemainingHoursDialog";
import { useWorkTypes } from "@/hooks/useWorkTypes";

type Project = {
  id: string;
  name: string;
  status: string;
  plz: string;
};

type ExistingEntry = {
  id: string;
  start_time: string;
  end_time: string;
  stunden: number;
  taetigkeit: string;
  project_name: string | null;
  project_id: string | null;
  plz: string | null;
  pause_start: string | null;
  location_type: string | null;
};

type DayDisturbance = {
  id: string;
  start_time: string;
  end_time: string;
  stunden: number;
  kunde_name: string;
  beschreibung: string;
};

interface TimeBlock {
  id: string;
  locationType: "baustelle" | "werkstatt";
  projectId: string;
  taetigkeit: string;
  startTime: string;
  endTime: string;
  selectedEmployees: string[];
  manualHours: string;
}

const createDefaultBlock = (startTime = "", endTime = ""): TimeBlock => ({
  id: crypto.randomUUID(),
  locationType: "baustelle",
  projectId: "",
  taetigkeit: "",
  startTime,
  endTime,
  selectedEmployees: [],
  manualHours: "",
});

const TimeTracking = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const workTypes = useWorkTypes();
  const [searchParams] = useSearchParams();
  const adminEditUserId = searchParams.get("user_id");
  const editMode = searchParams.get("edit") === "true";
  const [adminEditUserName, setAdminEditUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingEntryIds, setEditingEntryIds] = useState<string[]>([]);
  const [editModeInitialized, setEditModeInitialized] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [submittingAbsence, setSubmittingAbsence] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPlz, setNewProjectPlz] = useState("");
  const [newProjectAddress, setNewProjectAddress] = useState("");
  const [pendingBlockIdForNewProject, setPendingBlockIdForNewProject] = useState<string | null>(null);

  const [existingDayEntries, setExistingDayEntries] = useState<ExistingEntry[]>([]);
  const [dayDisturbances, setDayDisturbances] = useState<DayDisturbance[]>([]);
  const [loadingDayEntries, setLoadingDayEntries] = useState(false);
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  
  const [showAbsenceDialog, setShowAbsenceDialog] = useState(false);
  const [showFillDialog, setShowFillDialog] = useState(false);
  
  const [absenceData, setAbsenceData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: "urlaub" as "urlaub" | "krankenstand" | "weiterbildung" | "feiertag" | "za",
    document: null as File | null,
    customHours: "" as string,
    isFullDay: true,
    absenceStartTime: "07:00",
    absenceEndTime: "16:00",
    absencePauseMinutes: "30",
  });
  
  const [selectedDate, setSelectedDate] = useState(searchParams.get("date") || new Date().toISOString().split('T')[0]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([createDefaultBlock()]);
  const entryMode = "zeitraum" as const;

  // Fetch existing entries for selected date
  const fetchExistingDayEntries = async (date: string) => {
    setLoadingDayEntries(true);
    const userId = await getEffectiveUserId();
    if (!userId) {
      setLoadingDayEntries(false);
      return;
    }

    const { data, error } = await supabase
      .from("time_entries")
      .select(`
        id,
        start_time,
        end_time,
        stunden,
        taetigkeit,
        pause_start,
        project_id,
        location_type,
        projects (name, plz)
      `)
      .eq("user_id", userId)
      .eq("datum", date)
      .order("start_time");

    // Also fetch disturbances (Regieberichte) for this day
    const { data: distData } = await supabase
      .from("disturbances")
      .select("id, start_time, end_time, stunden, kunde_name, beschreibung")
      .eq("user_id", userId)
      .eq("datum", date)
      .order("start_time");

    setDayDisturbances(distData || []);

    if (!error && data) {
      const entries: ExistingEntry[] = data.map((entry: any) => ({
        id: entry.id,
        start_time: entry.start_time,
        end_time: entry.end_time,
        stunden: entry.stunden,
        taetigkeit: entry.taetigkeit,
        project_name: entry.projects?.name || null,
        project_id: entry.project_id || null,
        plz: entry.projects?.plz || null,
        pause_start: entry.pause_start || null,
        location_type: entry.location_type || null,
      }));
      setExistingDayEntries(entries);
      
      // Combine time entries and disturbances for latest end time
      const allEndTimes = [
        ...entries.map(e => e.end_time),
        ...(distData || []).map((d: any) => d.end_time),
      ];
      const hasBookings = entries.length > 0 || (distData && distData.length > 0);

      // If entries or disturbances exist, suggest next time slot for first block
      if (hasBookings && !entries.some(e => ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit))) {
        // Find latest end time across all bookings
        const latestEnd = allEndTimes.sort().reverse()[0];
        const [lastEndHours, lastEndMinutes] = latestEnd.split(':').map(Number);
        const nextStartMinutes = lastEndHours * 60 + lastEndMinutes;
        const suggestedStart = `${String(Math.floor(nextStartMinutes / 60)).padStart(2, '0')}:${String(nextStartMinutes % 60).padStart(2, '0')}`;

        setTimeBlocks([createDefaultBlock(suggestedStart)]);
      } else if (!entries.some(e => ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit))) {
        // No entries yet: check for public holiday first
        const dateObj = new Date(date + 'T00:00:00');
        const holiday = getAustrianHoliday(dateObj);
        if (holiday) {
          // Auto-open absence dialog pre-filled with Feiertag
          const holidayDefaults = getDefaultWorkTimes(dateObj);
          setAbsenceData({
            date,
            type: "feiertag",
            document: null,
            customHours: "",
            isFullDay: true,
            absenceStartTime: holidayDefaults?.startTime || "07:00",
            absenceEndTime: holidayDefaults?.endTime || "16:00",
            absencePauseMinutes: String(holidayDefaults?.pauseMinutes ?? 30),
          });
          setShowAbsenceDialog(true);
          setTimeBlocks([createDefaultBlock()]);
        } else {
          // Auto-fill default work times for the selected date
          const defaults = getDefaultWorkTimes(dateObj);
          if (defaults) {
            setTimeBlocks([createDefaultBlock(defaults.startTime, defaults.endTime)]);
          } else {
            setTimeBlocks([createDefaultBlock()]);
          }
        }
      }
    } else {
      setExistingDayEntries([]);
      setTimeBlocks([createDefaultBlock()]);
    }
    setLoadingDayEntries(false);
  };

  // Load existing entries when date changes
  useEffect(() => {
    // Reset edit mode state when navigating to a different day
    setEditingEntryIds([]);
    setEditModeInitialized(false);
    fetchExistingDayEntries(selectedDate);
  }, [selectedDate]);

  // In edit mode: auto-load all existing entries as editable blocks
  useEffect(() => {
    if (editMode && !editModeInitialized && existingDayEntries.length > 0) {
      const blocks: TimeBlock[] = existingDayEntries.map(entry => ({
        id: crypto.randomUUID(),
        locationType: (entry.location_type as "baustelle" | "werkstatt") || "baustelle",
        projectId: entry.project_id || "",
        taetigkeit: entry.taetigkeit || "",
        startTime: entry.start_time.substring(0, 5),
        endTime: entry.end_time.substring(0, 5),
        selectedEmployees: [],
        manualHours: "",
      }));
      setTimeBlocks(blocks);
      setEditingEntryIds(existingDayEntries.map(e => e.id));
      setEditModeInitialized(true);
    }
  }, [editMode, editModeInitialized, existingDayEntries]);

  // Check admin status and load target user name for admin editing
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
      const admin = data?.role === "administrator";
      setIsAdmin(admin);

      if (admin && adminEditUserId) {
        const { data: profile } = await supabase.from("profiles").select("vorname, nachname").eq("id", adminEditUserId).single();
        if (profile) setAdminEditUserName(`${profile.vorname} ${profile.nachname}`);
      }
    };
    checkAdmin();
  }, [adminEditUserId]);

  // The effective user ID for data operations (admin editing or own)
  const getEffectiveUserId = async (): Promise<string | null> => {
    // If URL has user_id param, always use it (admin context)
    if (adminEditUserId) return adminEditUserId;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  };

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, vorname, nachname")
        .eq("is_active", true)
        .neq("id", user.id)
        .order("vorname");
      if (data) {
        setEmployees(data.map(p => ({ id: p.id, name: `${p.vorname} ${p.nachname}`.trim() })));
      }
    };
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetchProjects();

    const channel = supabase
      .channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCreateNewProject = async () => {
    if (creatingProject) return;
    
    if (!newProjectName.trim() || !newProjectPlz.trim()) {
      sonnerToast.error("Name und PLZ sind Pflichtfelder");
      return;
    }

    if (!/^\d{4,5}$/.test(newProjectPlz)) {
      sonnerToast.error("PLZ muss 4-5 Ziffern haben");
      return;
    }

    setCreatingProject(true);

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: newProjectName.trim(),
        plz: newProjectPlz.trim(),
        adresse: newProjectAddress.trim() || null,
        status: 'aktiv'
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        sonnerToast.error("Ein Projekt mit diesem Namen und PLZ existiert bereits");
      } else {
        sonnerToast.error("Projekt konnte nicht erstellt werden");
      }
      setCreatingProject(false);
      return;
    }

    sonnerToast.success("Projekt erfolgreich erstellt");
    
    // Set the project in the pending block
    if (pendingBlockIdForNewProject) {
      updateBlock(pendingBlockIdForNewProject, { projectId: data.id });
    }
    
    setShowNewProjectDialog(false);
    setNewProjectName("");
    setNewProjectPlz("");
    setNewProjectAddress("");
    setPendingBlockIdForNewProject(null);
    setCreatingProject(false);
  };

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, status, plz")
      .eq("status", "aktiv")
      .order("name");

    if (data) setProjects(data);
    setLoading(false);
  };

  // Update a specific block
  const updateBlock = (blockId: string, updates: Partial<TimeBlock>) => {
    setTimeBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, ...updates } : block
    ));
  };

  // Add a new time block
  const addTimeBlock = () => {
    const lastBlock = timeBlocks[timeBlocks.length - 1];
    let suggestedStart = "";
    
    if (lastBlock.endTime) {
      const [endH, endM] = lastBlock.endTime.split(':').map(Number);
      const nextMinutes = endH * 60 + endM + 30; // 30 min after last block ends
      suggestedStart = `${String(Math.floor(nextMinutes / 60)).padStart(2, '0')}:${String(nextMinutes % 60).padStart(2, '0')}`;
    }
    
    setTimeBlocks(prev => [...prev, createDefaultBlock(suggestedStart)]);
  };

  // Remove a time block
  const removeBlock = (blockId: string) => {
    setTimeBlocks(prev => prev.filter(block => block.id !== blockId));
  };

  // Update selected employees for a block
  const updateBlockEmployees = (blockId: string, employees: string[]) => {
    setTimeBlocks(prev => prev.map(block =>
      block.id === blockId ? { ...block, selectedEmployees: employees } : block
    ));
  };

  // Calculate pause minutes for a block (automatic lunch break 12:00-13:00)
  const calculateBlockPauseMinutes = (block: TimeBlock): number => {
    if (!block.startTime || !block.endTime) return 0;
    return calculateAutoLunchBreak(block.startTime, block.endTime);
  };

  // Calculate hours for a single block
  const calculateBlockHours = (block: TimeBlock): number => {
    if (!block.startTime || !block.endTime) return 0;

    const [startH, startM] = block.startTime.split(':').map(Number);
    const [endH, endM] = block.endTime.split(':').map(Number);
    const pauseMinutes = calculateBlockPauseMinutes(block);

    const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM) - pauseMinutes;
    return Math.max(0, totalMinutes / 60);
  };

  // Calculate total hours across all blocks
  const calculateTotalHours = (): string => {
    const total = timeBlocks.reduce((sum, block) => sum + calculateBlockHours(block), 0);
    return total.toFixed(2);
  };

  // Quick-fill preset for first block
  const applyFullDayPreset = () => {
    if (timeBlocks.length > 0) {
      const selectedDateObj = new Date(selectedDate + 'T00:00:00');
      const defaultTimes = getDefaultWorkTimes(selectedDateObj);
      
      if (!defaultTimes) {
        toast({ 
          variant: "destructive", 
          title: "Arbeitsfrei", 
          description: "Am Wochenende wird nicht gearbeitet"
        });
        return;
      }
      
      updateBlock(timeBlocks[0].id, {
        startTime: defaultTimes.startTime,
        endTime: defaultTimes.endTime,
      });
    }
  };

  const handleAbsenceSubmit = async () => {
    if (submittingAbsence) return;

    setSubmittingAbsence(true);

    const effectiveUserId = await getEffectiveUserId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !effectiveUserId) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setSubmittingAbsence(false);
      return;
    }

    const { count: existingCount } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", effectiveUserId)
      .eq("datum", absenceData.date);

    if ((existingCount ?? 0) > 0) {
      toast({ 
        variant: "destructive", 
        title: "Eintrag bereits vorhanden", 
        description: "Für diesen Tag wurden die Stunden bereits eingetragen, gehe unter Meine Stunden rein." 
      });
      setSubmittingAbsence(false);
      return;
    }

    let documentPath = null;
    if (absenceData.type === "krankenstand" && absenceData.document) {
      const fileName = `${user.id}/${Date.now()}_${absenceData.document.name}`;
      const { error: uploadError } = await supabase.storage
        .from("employee-documents")
        .upload(fileName, absenceData.document);

      if (uploadError) {
        toast({ variant: "destructive", title: "Fehler", description: `Dokument konnte nicht hochgeladen werden: ${uploadError.message}` });
        setSubmittingAbsence(false);
        return;
      }

      documentPath = fileName;
    }

    const selectedDateObj = new Date(absenceData.date + 'T00:00:00');
    const automaticHours = getNormalWorkingHours(selectedDateObj);
    const defaultTimes = getDefaultWorkTimes(selectedDateObj);

    let workingHours: number;
    let entryStartTime: string;
    let entryEndTime: string;
    let entryPauseMinutes: number;

    if (absenceData.isFullDay) {
      workingHours = absenceData.customHours ? parseFloat(absenceData.customHours) : automaticHours;
      entryStartTime = defaultTimes?.startTime || "07:00";
      entryEndTime = defaultTimes?.endTime || "16:00";
      entryPauseMinutes = defaultTimes?.pauseMinutes || 30;
    } else {
      // Calculate from Von/Bis
      const [sH, sM] = absenceData.absenceStartTime.split(':').map(Number);
      const [eH, eM] = absenceData.absenceEndTime.split(':').map(Number);
      const pause = parseInt(absenceData.absencePauseMinutes) || 0;
      const totalMinutes = (eH * 60 + eM) - (sH * 60 + sM) - pause;
      workingHours = Math.max(0, totalMinutes / 60);
      entryStartTime = absenceData.absenceStartTime;
      entryEndTime = absenceData.absenceEndTime;
      entryPauseMinutes = pause;
    }

    // ZA: Check and deduct from time account
    if (absenceData.type === "za") {
      const { data: timeAccount, error: taError } = await supabase
        .from("time_accounts")
        .select("id, balance_hours")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      if (taError || !timeAccount) {
        toast({ variant: "destructive", title: "Fehler", description: "Kein Zeitkonto gefunden. Bitte wenden Sie sich an den Administrator." });
        setSubmittingAbsence(false);
        return;
      }

      if (Number(timeAccount.balance_hours) < workingHours) {
        toast({ variant: "destructive", title: "Nicht genügend ZA-Stunden", description: `Verfügbar: ${timeAccount.balance_hours}h, benötigt: ${workingHours}h` });
        setSubmittingAbsence(false);
        return;
      }

      const balanceBefore = Number(timeAccount.balance_hours);
      const balanceAfter = balanceBefore - workingHours;

      const { error: updateErr } = await supabase
        .from("time_accounts")
        .update({ balance_hours: balanceAfter, updated_at: new Date().toISOString() })
        .eq("id", timeAccount.id);

      if (updateErr) {
        toast({ variant: "destructive", title: "Fehler", description: "ZA-Stunden konnten nicht abgebucht werden" });
        setSubmittingAbsence(false);
        return;
      }

      await supabase.from("time_account_transactions").insert({
        user_id: effectiveUserId,
        changed_by: user.id,
        change_type: "za_abzug",
        hours: -workingHours,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason: `Zeitausgleich am ${absenceData.date}`,
      });
    }

    const absenceLabel = absenceData.type === "urlaub" ? "Urlaub" : absenceData.type === "krankenstand" ? "Krankenstand" : absenceData.type === "weiterbildung" ? "Weiterbildung" : absenceData.type === "za" ? "Zeitausgleich" : "Feiertag";

    const { error } = await supabase.from("time_entries").insert({
      user_id: effectiveUserId,
      datum: absenceData.date,
      project_id: null,
      taetigkeit: absenceLabel,
      stunden: workingHours,
      start_time: entryStartTime,
      end_time: entryEndTime,
      pause_minutes: entryPauseMinutes,
      location_type: "baustelle",
      notizen: documentPath ? `Krankmeldung: ${documentPath}` : null,
      week_type: null,
    });

    if (!error) {
      toast({ title: "Erfolg", description: `${absenceLabel} erfasst` });
      setShowAbsenceDialog(false);
      setAbsenceData({
        date: new Date().toISOString().split('T')[0],
        type: "urlaub",
        document: null,
        customHours: "",
        isFullDay: true,
        absenceStartTime: "07:00",
        absenceEndTime: "16:00",
        absencePauseMinutes: "30",
      });
      fetchExistingDayEntries(selectedDate);
    } else {
      toast({ variant: "destructive", title: "Fehler", description: "Konnte nicht gespeichert werden" });
    }
    setSubmittingAbsence(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const effectiveUserId = await getEffectiveUserId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !effectiveUserId) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setSaving(false);
      return;
    }

    // Validate all blocks
    for (let i = 0; i < timeBlocks.length; i++) {
      const block = timeBlocks[i];
      const blockNum = i + 1;

      if (!block.startTime || !block.endTime) {
        toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Start- und Endzeit erforderlich` });
        setSaving(false);
        return;
      }

      const [startH, startM] = block.startTime.split(':').map(Number);
      const [endH, endM] = block.endTime.split(':').map(Number);
      if (endH * 60 + endM <= startH * 60 + startM) {
        toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Endzeit muss nach Startzeit liegen` });
        setSaving(false);
        return;
      }

      // Tätigkeit and Projekt are now optional - no validation needed
    }

    // Check for overlaps between blocks
    const timeToMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    for (let i = 0; i < timeBlocks.length; i++) {
      for (let j = i + 1; j < timeBlocks.length; j++) {
        const blockA = timeBlocks[i];
        const blockB = timeBlocks[j];
        
        const aStart = timeToMinutes(blockA.startTime);
        const aEnd = timeToMinutes(blockA.endTime);
        const bStart = timeToMinutes(blockB.startTime);
        const bEnd = timeToMinutes(blockB.endTime);
        
        if (aStart < bEnd && aEnd > bStart) {
          toast({ 
            variant: "destructive", 
            title: "Zeitüberschneidung", 
            description: `Block ${i + 1} und Block ${j + 1} überschneiden sich` 
          });
          setSaving(false);
          return;
        }
      }
    }

    // Check for overlaps with existing entries (excluding entries being edited)
    const { data: existingEntries } = await supabase
      .from("time_entries")
      .select("id, start_time, end_time, taetigkeit")
      .eq("user_id", effectiveUserId)
      .eq("datum", selectedDate);

    const entriesToCheck = (existingEntries || []).filter(e => !editingEntryIds.includes(e.id));

    if (entriesToCheck.length > 0) {
      for (const entry of entriesToCheck) {
        if (["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(entry.taetigkeit)) {
          toast({ 
            variant: "destructive", 
            title: "Tag bereits blockiert", 
            description: `Für diesen Tag ist bereits ${entry.taetigkeit} eingetragen.` 
          });
          setSaving(false);
          return;
        }
        
        const existingStart = timeToMinutes(entry.start_time);
        const existingEnd = timeToMinutes(entry.end_time);
        
        for (let i = 0; i < timeBlocks.length; i++) {
          const block = timeBlocks[i];
          const blockStart = timeToMinutes(block.startTime);
          const blockEnd = timeToMinutes(block.endTime);
          
          if (blockStart < existingEnd && blockEnd > existingStart) {
            toast({ 
              variant: "destructive", 
              title: "Zeitüberschneidung", 
              description: `Block ${i + 1} überschneidet mit bestehendem Eintrag (${entry.start_time.substring(0, 5)} - ${entry.end_time.substring(0, 5)})` 
            });
            setSaving(false);
            return;
          }
        }
      }
    }

    // In edit mode: delete original entries now (after all validation passed)
    if (editingEntryIds.length > 0) {
      for (const id of editingEntryIds) {
        await supabase
          .from("time_entries")
          .delete()
          .eq("id", id)
          .eq("user_id", effectiveUserId);
      }
      setEditingEntryIds([]);
    }

    // Insert all blocks with team members via Edge Function
    let totalEntriesCreated = 0;
    let hasError = false;

    for (const block of timeBlocks) {
      const blockHours = calculateBlockHours(block);
      const pauseMinutes = calculateBlockPauseMinutes(block);
      const entryData = {
        user_id: effectiveUserId,
        datum: selectedDate,
        project_id: block.locationType === "werkstatt" ? null : (block.projectId || null),
        taetigkeit: block.taetigkeit || null,
        stunden: blockHours,
        start_time: block.startTime,
        end_time: block.endTime,
        pause_minutes: pauseMinutes,
        pause_start: pauseMinutes > 0 ? "12:00" : null,
        pause_end: pauseMinutes > 0 ? "13:00" : null,
        location_type: block.locationType,
        notizen: null,
        week_type: null,
      };

      // Insert main entry directly (RLS allows own entries)
      const { data: mainResult, error: mainError } = await supabase
        .from("time_entries")
        .insert(entryData)
        .select("id")
        .single();

      if (mainError) {
        hasError = true;
        console.error("Error inserting main entry:", mainError);
        toast({ variant: "destructive", title: `Speicherfehler (Block ${timeBlocks.indexOf(block) + 1})`, description: mainError.message });
        continue;
      }

      totalEntriesCreated += 1;

      // If team members selected, use Edge Function only for them
      if (block.selectedEmployees.length > 0) {
        const teamEntries = block.selectedEmployees.map(workerId => ({
          user_id: workerId,
          datum: selectedDate,
          project_id: entryData.project_id,
          taetigkeit: entryData.taetigkeit,
          stunden: blockHours,
          start_time: block.startTime,
          end_time: block.endTime,
          pause_minutes: pauseMinutes,
          pause_start: pauseMinutes > 0 ? "12:00" : null,
          pause_end: pauseMinutes > 0 ? "13:00" : null,
          location_type: block.locationType,
          notizen: null,
          week_type: null,
        }));

        const { data: teamResult, error: teamError } = await supabase.functions.invoke(
          "create-team-time-entries",
          { body: { mainEntry: entryData, teamEntries, mainEntryId: mainResult.id, createWorkerLinks: true, skipMainEntry: true } }
        );

        if (teamError || !teamResult?.success) {
          console.error("Team entries error (main entry saved):", teamError, teamResult);
        } else {
          totalEntriesCreated += teamResult.totalCreated || 0;
        }
      }
    }

    if (!hasError) {
      const teamInfo = timeBlocks.some(b => b.selectedEmployees.length > 0)
        ? ` (inkl. Team-Mitglieder)`
        : "";
      toast({ title: "Erfolg", description: `${totalEntriesCreated} Eintrag/Einträge gespeichert${teamInfo}` });

      // If admin is editing for another user, navigate back to hours report
      if (isAdmin && adminEditUserId) {
        const returnMonth = searchParams.get("return_month");
        const returnYear = searchParams.get("return_year");
        const params = new URLSearchParams();
        if (adminEditUserId) params.set("employee", adminEditUserId);
        if (returnMonth) params.set("month", returnMonth);
        if (returnYear) params.set("year", returnYear);
        navigate(`/hours-report?${params.toString()}`);
        setSaving(false);
        return;
      }

      await fetchExistingDayEntries(selectedDate);
    }
    setSaving(false);
  };

  const handleDeleteExistingEntry = async (entryId: string, prefillBlock?: boolean) => {
    // Find entry data before deleting (for prefill)
    const entry = existingDayEntries.find(e => e.id === entryId);
    const userId = await getEffectiveUserId();

    const { error } = await supabase
      .from("time_entries")
      .delete()
      .eq("id", entryId)
      .eq("user_id", userId || "");

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }

    if (prefillBlock && entry) {
      // Pre-fill a new block with the deleted entry's data
      const newBlock: TimeBlock = {
        id: crypto.randomUUID(),
        locationType: (entry.location_type as "baustelle" | "werkstatt") || "baustelle",
        projectId: entry.project_id || "",
        taetigkeit: entry.taetigkeit || "",
        startTime: entry.start_time.substring(0, 5),
        endTime: entry.end_time.substring(0, 5),
        selectedEmployees: [],
        manualHours: "",
      };
      setTimeBlocks([newBlock]);
      toast({ title: "Eintrag wird bearbeitet", description: "Passen Sie die Daten an und speichern Sie erneut." });
    } else {
      toast({ title: "Eintrag gelöscht" });
    }

    await fetchExistingDayEntries(selectedDate);
  };

  // Filter out entries currently being edited
  const visibleDayEntries = existingDayEntries.filter(e => !editingEntryIds.includes(e.id));
  const isDayBlocked = visibleDayEntries.some(e => ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit));

  const navigateDay = (direction: -1 | 1) => {
    const current = new Date(selectedDate + 'T00:00:00');
    current.setDate(current.getDate() + direction);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const toggleEmployee = (blockId: string, employeeId: string, current: string[]) => {
    const updated = current.includes(employeeId)
      ? current.filter(id => id !== employeeId)
      : [...current, employeeId];
    updateBlockEmployees(blockId, updated);
  };

  if (loading) return <div className="p-4">Lädt...</div>;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Zeiterfassung" />

      <div className="max-w-2xl mx-auto pb-32">

        {/* Admin editing banner */}
        {isAdmin && adminEditUserId && adminEditUserName && (
          <div className="mx-4 mt-3 mb-0 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Bearbeitung für: <strong>{adminEditUserName}</strong>
              </span>
            </div>
            <button
              onClick={() => {
                const returnMonth = searchParams.get("return_month");
                const returnYear = searchParams.get("return_year");
                const params = new URLSearchParams();
                if (adminEditUserId) params.set("employee", adminEditUserId);
                if (returnMonth) params.set("month", returnMonth);
                if (returnYear) params.set("year", returnYear);
                navigate(`/hours-report?${params.toString()}`);
              }}
              className="text-sm text-amber-700 dark:text-amber-300 underline hover:no-underline flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Zurück
            </button>
          </div>
        )}

        {/* Date navigation bar */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
              onClick={() => navigateDay(-1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 text-center relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                style={{ fontSize: '16px' }}
                id="date-picker"
              />
              <div className="pointer-events-none select-none py-1">
                <p className="font-semibold text-sm leading-tight">
                  {format(new Date(selectedDate + 'T00:00:00'), "EEEE", { locale: de })}
                </p>
                <p className="text-lg font-bold leading-tight">
                  {format(new Date(selectedDate + 'T00:00:00'), "dd. MMMM yyyy", { locale: de })}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
              onClick={() => navigateDay(1)}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Holiday banner */}
          {getAustrianHoliday(new Date(selectedDate + 'T00:00:00')) && (
            <div className="flex items-center gap-2 mt-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-1.5 text-sm">
              <Sun className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-medium text-amber-800 dark:text-amber-200">
                {getAustrianHoliday(new Date(selectedDate + 'T00:00:00'))}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-4 pt-4 space-y-4">

            {/* Weekly target */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-xs">{getWeeklyTargetHours()}h Wochensoll</Badge>
              <span>Mo–Do: 8,5h • Fr: 5h</span>
            </div>

            {/* Existing entries + Regieberichte */}
            {loadingDayEntries ? (
              <div className="bg-muted/50 rounded-xl p-3 text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 animate-pulse" />
                Lade Tageseinträge...
              </div>
            ) : (visibleDayEntries.length > 0 || dayDisturbances.length > 0) ? (
              <div className="space-y-3">
                {/* Disturbances (Regieberichte) */}
                {dayDisturbances.length > 0 && (
                  <div className="rounded-xl p-4 space-y-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-300">Regieberichte</span>
                    </div>
                    <div className="space-y-2">
                      {dayDisturbances.map((dist) => (
                        <div key={dist.id} className="flex items-center justify-between text-sm bg-background/70 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded shrink-0">
                              {dist.start_time.substring(0, 5)}–{dist.end_time.substring(0, 5)}
                            </span>
                            <span className="truncate text-muted-foreground">
                              {dist.kunde_name}
                            </span>
                          </div>
                          <span className="font-bold shrink-0 ml-2">{Number(dist.stunden).toFixed(1)}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time entries */}
                {visibleDayEntries.length > 0 && (
                  <div className={`rounded-xl p-4 space-y-3 ${
                    isDayBlocked
                      ? "bg-destructive/10 border border-destructive/30"
                      : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                  }`}>
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      {isDayBlocked ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                          <span className="text-destructive">Tag blockiert — {visibleDayEntries[0].taetigkeit}</span>
                        </>
                      ) : (
                        <>
                          <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-amber-700 dark:text-amber-300">Bereits gebuchte Zeiten</span>
                        </>
                      )}
                    </div>
                    {!isDayBlocked && (
                      <div className="space-y-2">
                        {visibleDayEntries.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between text-sm bg-background/70 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded shrink-0">
                                {entry.start_time.substring(0, 5)}–{entry.end_time.substring(0, 5)}
                              </span>
                              <span className="truncate text-muted-foreground">
                                {entry.project_name || (entry.taetigkeit ? entry.taetigkeit.split("\n").filter(Boolean).join(", ") : "—")}
                              </span>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 ml-2">
                              <span className="font-bold mr-1">{Number(entry.stunden).toFixed(1)}h</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteExistingEntry(entry.id, true)}
                                className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="Eintrag bearbeiten"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExistingEntry(entry.id)}
                                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Eintrag löschen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Total for the day */}
                {!isDayBlocked && (
                  <div className="flex items-center justify-between px-2 text-sm font-semibold">
                    <span>Tagessumme</span>
                    <span>{(visibleDayEntries.reduce((s, e) => s + Number(e.stunden), 0) + dayDisturbances.reduce((s, d) => s + Number(d.stunden), 0)).toFixed(2)} h</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                Noch keine Einträge für diesen Tag
              </div>
            )}

            {/* Abwesenheit button */}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 h-11"
              onClick={() => {
                setAbsenceData(prev => ({ ...prev, date: selectedDate }));
                setShowAbsenceDialog(true);
              }}
            >
              <Calendar className="h-4 w-4" />
              Abwesenheit erfassen
            </Button>

            {/* Fill remaining hours button - show when entries or disturbances exist but day isn't full */}
            {!isDayBlocked && (visibleDayEntries.length > 0 || dayDisturbances.length > 0) && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 h-11"
                onClick={() => setShowFillDialog(true)}
              >
                <Clock className="h-4 w-4" />
                Reststunden auffüllen
              </Button>
            )}

            {/* Time Blocks */}
            {!isDayBlocked && (
              <div className="space-y-4">
                {timeBlocks.map((block, index) => (
                  <div key={block.id} className="border rounded-2xl overflow-hidden bg-card shadow-sm">
                    {/* Block header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="font-semibold text-sm">
                          {timeBlocks.length > 1 ? `Block ${index + 1}` : "Arbeitszeit"}
                        </span>
                        {calculateBlockHours(block) > 0 && (
                          <Badge variant="secondary" className="text-xs font-bold">
                            {calculateBlockHours(block).toFixed(1)}h
                          </Badge>
                        )}
                      </div>
                      {timeBlocks.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeBlock(block.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Location toggle */}
                      <RadioGroup
                        value={block.locationType}
                        onValueChange={(value: 'baustelle' | 'werkstatt') => updateBlock(block.id, { locationType: value })}
                        className="grid grid-cols-2 gap-2"
                      >
                        <div>
                          <RadioGroupItem value="baustelle" id={`baustelle-${block.id}`} className="peer sr-only" />
                          <Label
                            htmlFor={`baustelle-${block.id}`}
                            className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-muted bg-background hover:bg-accent peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary font-medium text-sm transition-all"
                          >
                            🏗️ Baustelle
                          </Label>
                        </div>
                        <div>
                          <RadioGroupItem value="werkstatt" id={`werkstatt-${block.id}`} className="peer sr-only" />
                          <Label
                            htmlFor={`werkstatt-${block.id}`}
                            className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-muted bg-background hover:bg-accent peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-primary font-medium text-sm transition-all"
                          >
                            🔧 Lager
                          </Label>
                        </div>
                      </RadioGroup>

                      {/* Project */}
                      {block.locationType === "baustelle" && (
                        <Select
                          value={block.projectId}
                          onValueChange={(value) => {
                            if (value === "new") {
                              setPendingBlockIdForNewProject(block.id);
                              setShowNewProjectDialog(true);
                            } else {
                              updateBlock(block.id, { projectId: value });
                            }
                          }}
                        >
                          <SelectTrigger className="h-12 rounded-xl">
                            <SelectValue placeholder="📍 Projekt wählen (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.plz})</SelectItem>
                            ))}
                            <SelectItem value="new" className="text-primary font-semibold">
                              <div className="flex items-center gap-2"><Plus className="w-4 h-4" />Neues Projekt</div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}

                      {/* Activity - dropdown multi-select */}
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tätigkeiten (optional)</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full h-12 justify-between rounded-xl text-sm font-normal"
                            >
                              {(() => {
                                const selected = block.taetigkeit.split("\n").filter(Boolean);
                                if (selected.length === 0) return <span className="text-muted-foreground">Tätigkeit wählen...</span>;
                                if (selected.length === 1) return selected[0];
                                return `${selected.length} Tätigkeiten ausgewählt`;
                              })()}
                              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                            <div className="max-h-60 overflow-y-auto p-1">
                              {workTypes.map((t) => {
                                const selected = block.taetigkeit.split("\n").filter(Boolean).includes(t);
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => {
                                      const current = block.taetigkeit.split("\n").filter(Boolean);
                                      const updated = selected
                                        ? current.filter(x => x !== t)
                                        : [...current, t];
                                      updateBlock(block.id, { taetigkeit: updated.join("\n") });
                                    }}
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
                                    {t}
                                  </button>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Selected tags */}
                        {block.taetigkeit.split("\n").filter(Boolean).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {block.taetigkeit.split("\n").filter(Boolean).map((t, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-lg"
                              >
                                {t}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = block.taetigkeit.split("\n").filter(Boolean).filter((_, idx) => idx !== i);
                                    updateBlock(block.id, { taetigkeit: updated.join("\n") });
                                  }}
                                  className="hover:bg-primary/20 rounded p-0.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Custom activity input */}
                        <Input
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const input = e.currentTarget;
                              if (input.value.trim()) {
                                const current = block.taetigkeit.split("\n").filter(Boolean);
                                updateBlock(block.id, { taetigkeit: [...current, input.value.trim()].join("\n") });
                                input.value = "";
                              }
                            }
                          }}
                          placeholder="Eigene Tätigkeit eingeben + Enter..."
                          className="h-10 rounded-xl text-sm"
                        />
                      </div>

                      {/* Time inputs */}
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Beginn</Label>
                            <Input
                              type="time"
                              value={block.startTime}
                              onChange={(e) => updateBlock(block.id, { startTime: e.target.value })}
                              required
                              className="h-12 rounded-xl text-base font-semibold text-center"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ende</Label>
                            <Input
                              type="time"
                              value={block.endTime}
                              onChange={(e) => updateBlock(block.id, { endTime: e.target.value })}
                              required
                              className="h-12 rounded-xl text-base font-semibold text-center"
                            />
                          </div>
                        </div>
                        {/* Automatische Mittagspause-Anzeige */}
                        {calculateBlockPauseMinutes(block) > 0 && (
                          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-center">
                            Mittagspause 12:00–13:00 wird automatisch abgezogen (60 Min.)
                          </div>
                        )}
                      </div>

                      {/* Regelarbeitszeit shortcut */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const defaults = getDefaultWorkTimes(new Date(selectedDate + 'T00:00:00'));
                          if (defaults) updateBlock(block.id, {
                            startTime: defaults.startTime,
                            endTime: defaults.endTime,
                          });
                        }}
                        className="w-full h-10 rounded-xl text-xs gap-1.5"
                      >
                        <Sun className="w-3.5 h-3.5" />
                        Regelarbeitszeit übernehmen
                      </Button>

                      {/* Employee co-booking hidden by request */}
                    </div>
                  </div>
                ))}

                {/* Add block */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addTimeBlock}
                  className="w-full h-12 rounded-xl gap-2 border-dashed border-2"
                >
                  <Plus className="w-4 h-4" />
                  Weiteren Zeitblock hinzufügen
                </Button>

                {/* Total hours */}
                <div className="bg-primary/10 border-2 border-primary/20 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gesamt heute</p>
                    <p className="text-3xl font-black text-primary">{calculateTotalHours()} h</p>
                  </div>
                  <Clock className="w-8 h-8 text-primary/30" />
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Sticky submit button */}
      {!isDayBlocked && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t" style={{ padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-2xl mx-auto">
            <Button
              type="button"
              onClick={(e) => handleSubmit(e as any)}
              className="w-full h-14 text-base font-bold rounded-2xl shadow-lg active:scale-[0.98] transition-transform"
              disabled={saving}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Wird gespeichert...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  {timeBlocks.length > 1 ? `${timeBlocks.length} Einträge` : "Stunden"} erfassen
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

        {/* New Project Dialog */}
        <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neues Projekt erstellen</DialogTitle>
              <DialogDescription>Geben Sie die Details ein.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Projektname *</Label><Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} /></div>
              <div><Label>PLZ *</Label><Input value={newProjectPlz} onChange={(e) => setNewProjectPlz(e.target.value)} maxLength={5} /></div>
              <div><Label>Adresse</Label><Input value={newProjectAddress} onChange={(e) => setNewProjectAddress(e.target.value)} /></div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNewProjectDialog(false);
                    setNewProjectName("");
                    setNewProjectPlz("");
                    setNewProjectAddress("");
                    setPendingBlockIdForNewProject(null);
                  }}
                  disabled={creatingProject}
                >
                  Abbrechen
                </Button>
                <Button onClick={handleCreateNewProject} disabled={creatingProject}>
                  {creatingProject ? 'Wird erstellt...' : 'Erstellen'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Fill Remaining Hours Dialog */}
        <FillRemainingHoursDialog
          open={showFillDialog}
          onOpenChange={setShowFillDialog}
          remainingHours={(() => {
            const dateObj = new Date(selectedDate + 'T00:00:00');
            const target = getNormalWorkingHours(dateObj);
            const booked = visibleDayEntries.reduce((s, e) => s + Number(e.stunden), 0) + dayDisturbances.reduce((s, d) => s + Number(d.stunden), 0);
            return Math.max(0, target - booked);
          })()}
          bookedHours={visibleDayEntries.reduce((s, e) => s + Number(e.stunden), 0) + dayDisturbances.reduce((s, d) => s + Number(d.stunden), 0)}
          targetHours={getNormalWorkingHours(new Date(selectedDate + 'T00:00:00'))}
          projects={projects}
          existingEntries={[
            ...visibleDayEntries.map(e => ({
              start_time: e.start_time,
              end_time: e.end_time,
            })),
            ...dayDisturbances.map(d => ({
              start_time: d.start_time,
              end_time: d.end_time,
            })),
          ]}
          selectedDate={selectedDate}
          onSubmit={async (blocks) => {
            const userId = await getEffectiveUserId();
            if (!userId) return;

            for (const block of blocks) {
              const pauseMinutes = calculateAutoLunchBreak(block.startTime, block.endTime);
              const [sH, sM] = block.startTime.split(':').map(Number);
              const [eH, eM] = block.endTime.split(':').map(Number);
              const totalMin = (eH * 60 + eM) - (sH * 60 + sM) - pauseMinutes;
              const stunden = Math.max(0, totalMin / 60);

              await supabase.from("time_entries").insert({
                user_id: userId,
                datum: selectedDate,
                project_id: block.projectId,
                taetigkeit: block.description || null,
                stunden,
                start_time: block.startTime,
                end_time: block.endTime,
                pause_minutes: pauseMinutes,
                pause_start: pauseMinutes > 0 ? "12:00" : null,
                pause_end: pauseMinutes > 0 ? "13:00" : null,
                location_type: block.locationType,
                notizen: null,
                week_type: null,
              });
            }

            toast({ title: "Erfolg", description: `${blocks.length} Restblock${blocks.length !== 1 ? 'e' : ''} gebucht` });
            await fetchExistingDayEntries(selectedDate);
          }}
        />

        {/* Absence Dialog */}
        <Dialog open={showAbsenceDialog} onOpenChange={setShowAbsenceDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abwesenheit erfassen</DialogTitle>
              <DialogDescription>Erfassen Sie Urlaub, Krankenstand, ZA, Weiterbildung oder Feiertag</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="absence-date">Datum</Label>
                <Input 
                  id="absence-date" 
                  type="date" 
                  value={absenceData.date} 
                  onChange={(e) => setAbsenceData({ ...absenceData, date: e.target.value })} 
                />
              </div>
              
              <div>
                <Label>Art</Label>
                <RadioGroup 
                  value={absenceData.type} 
                  onValueChange={(value: "urlaub" | "krankenstand" | "weiterbildung" | "feiertag" | "za") => setAbsenceData({ ...absenceData, type: value })}
                  className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2"
                >
                  <div>
                    <RadioGroupItem value="urlaub" id="urlaub" className="peer sr-only" />
                    <Label 
                      htmlFor="urlaub" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      🏖️ Urlaub
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="krankenstand" id="krankenstand" className="peer sr-only" />
                    <Label 
                      htmlFor="krankenstand" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      🏥 Kranken.
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="za" id="za" className="peer sr-only" />
                    <Label 
                      htmlFor="za" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      ⏰ ZA
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="weiterbildung" id="weiterbildung" className="peer sr-only" />
                    <Label 
                      htmlFor="weiterbildung" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      📚 Weiterbild.
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="feiertag" id="feiertag" className="peer sr-only" />
                    <Label 
                      htmlFor="feiertag" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      🎉 Feiertag
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Ganzer Tag toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="full-day-toggle">Ganzer Tag</Label>
                <Switch
                  id="full-day-toggle"
                  checked={absenceData.isFullDay}
                  onCheckedChange={(checked) => {
                    const dateObj = new Date(absenceData.date + 'T00:00:00');
                    const defaults = getDefaultWorkTimes(dateObj);
                    setAbsenceData({
                      ...absenceData,
                      isFullDay: checked,
                      absenceStartTime: defaults?.startTime || "07:00",
                      absenceEndTime: defaults?.endTime || "16:00",
                      absencePauseMinutes: String(defaults?.pauseMinutes ?? 30),
                    });
                  }}
                />
              </div>

              {absenceData.isFullDay ? (
                /* Full day: show calculated hours with optional override */
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Berechnete Stunden für diesen Tag:</span>
                    <Badge variant="secondary" className="text-lg font-bold px-3 py-1">
                      {absenceData.customHours || getNormalWorkingHours(new Date(absenceData.date + 'T00:00:00'))} h
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(() => {
                      const absenceDateObj = new Date(absenceData.date + 'T00:00:00');
                      const dayOfWeek = absenceDateObj.getDay();
                      if (dayOfWeek === 0 || dayOfWeek === 6) return "Wochenende: 0 Stunden";
                      if (dayOfWeek === 5) return "Freitag: 5 Stunden (07:00 - 12:00)";
                      return "Mo-Do: 8,5 Stunden (07:00 - 16:30, 60min Pause)";
                    })()}
                  </div>
                  <div className="pt-2 border-t">
                    <Label className="text-sm">Stunden anpassen (optional)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="24"
                        placeholder={String(getNormalWorkingHours(new Date(absenceData.date + 'T00:00:00')))}
                        value={absenceData.customHours}
                        onChange={(e) => setAbsenceData({ ...absenceData, customHours: e.target.value })}
                        className="w-24 text-center"
                      />
                      <span className="text-sm text-muted-foreground">Stunden</span>
                      {absenceData.customHours && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setAbsenceData({ ...absenceData, customHours: "" })}
                        >
                          Zurücksetzen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Partial day: Von/Bis time inputs */
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Von</Label>
                      <Input
                        type="time"
                        value={absenceData.absenceStartTime}
                        onChange={(e) => setAbsenceData({ ...absenceData, absenceStartTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Bis</Label>
                      <Input
                        type="time"
                        value={absenceData.absenceEndTime}
                        onChange={(e) => setAbsenceData({ ...absenceData, absenceEndTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pause (Minuten)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="120"
                      value={absenceData.absencePauseMinutes}
                      onChange={(e) => setAbsenceData({ ...absenceData, absencePauseMinutes: e.target.value })}
                      className="w-24"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Berechnete Stunden:</span>
                    <Badge variant="secondary" className="text-lg font-bold px-3 py-1">
                      {(() => {
                        const [sH, sM] = absenceData.absenceStartTime.split(':').map(Number);
                        const [eH, eM] = absenceData.absenceEndTime.split(':').map(Number);
                        const pause = parseInt(absenceData.absencePauseMinutes) || 0;
                        const total = Math.max(0, ((eH * 60 + eM) - (sH * 60 + sM) - pause) / 60);
                        return total.toFixed(2);
                      })()} h
                    </Badge>
                  </div>
                </div>
              )}

              {absenceData.type === "krankenstand" && (
                <div>
                  <Label htmlFor="document">Krankmeldung (optional)</Label>
                  <Input 
                    id="document" 
                    type="file" 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setAbsenceData({ ...absenceData, document: e.target.files?.[0] || null })}
                    className="mt-2"
                  />
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowAbsenceDialog(false);
                    setAbsenceData({ date: new Date().toISOString().split('T')[0], type: "urlaub", document: null, customHours: "", isFullDay: true, absenceStartTime: "07:00", absenceEndTime: "16:00", absencePauseMinutes: "30" });
                  }}
                  disabled={submittingAbsence}
                >
                  Abbrechen
                </Button>
                <Button onClick={handleAbsenceSubmit} disabled={submittingAbsence}>
                  {submittingAbsence ? "Wird gespeichert..." : "Erfassen"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
};

export default TimeTracking;

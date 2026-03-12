import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

type Project = {
  id: string;
  name: string;
  plz: string;
};

interface ExistingBlock {
  start: number; // minutes from midnight
  end: number;
}

interface FreeBlock {
  startTime: string;
  endTime: string;
  hours: number;
}

interface BlockFormData {
  locationType: "baustelle" | "werkstatt";
  projectId: string;
  description: string;
}

interface FillRemainingHoursDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remainingHours: number;
  bookedHours: number;
  targetHours: number;
  projects: Project[];
  existingEntries: { start_time: string; end_time: string }[];
  selectedDate: string;
  onSubmit: (blocks: { projectId: string | null; locationType: string; description: string; startTime: string; endTime: string }[]) => Promise<void>;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function calculateFreeBlocks(
  existingEntries: { start_time: string; end_time: string }[],
  selectedDate: string
): FreeBlock[] {
  const dateObj = new Date(selectedDate + "T00:00:00");
  const dayOfWeek = dateObj.getDay();
  const isFriday = dayOfWeek === 5;

  const dayStart = timeToMinutes("07:00");
  const dayEnd = isFriday ? timeToMinutes("12:00") : timeToMinutes("16:00");

  // Collect all occupied intervals
  const occupied: ExistingBlock[] = existingEntries.map((e) => ({
    start: timeToMinutes(e.start_time.substring(0, 5)),
    end: timeToMinutes(e.end_time.substring(0, 5)),
  }));

  // Sort by start time
  occupied.sort((a, b) => a.start - b.start);

  // Find free gaps
  const freeBlocks: FreeBlock[] = [];
  let current = dayStart;

  for (const block of occupied) {
    if (block.start > current) {
      const gapStart = current;
      const gapEnd = block.start;
      if (gapEnd - gapStart >= 15) {
        const startTime = minutesToTime(gapStart);
        const endTime = minutesToTime(gapEnd);
        const hours = (gapEnd - gapStart) / 60;
        freeBlocks.push({ startTime, endTime, hours });
      }
    }
    current = Math.max(current, block.end);
  }

  // Gap after last occupied block until day end
  if (current < dayEnd) {
    const startTime = minutesToTime(current);
    const endTime = minutesToTime(dayEnd);
    const hours = (dayEnd - current) / 60;
    if (hours > 0.25) {
      freeBlocks.push({ startTime, endTime, hours });
    }
  }

  return freeBlocks;
}

export const FillRemainingHoursDialog = ({
  open,
  onOpenChange,
  remainingHours,
  bookedHours,
  targetHours,
  projects,
  existingEntries,
  selectedDate,
  onSubmit,
}: FillRemainingHoursDialogProps) => {
  const [submitting, setSubmitting] = useState(false);
  const [blockForms, setBlockForms] = useState<BlockFormData[]>([]);

  const freeBlocks = calculateFreeBlocks(existingEntries, selectedDate);

  // Reset forms when dialog opens
  useEffect(() => {
    if (open) {
      setBlockForms(
        freeBlocks.map(() => ({
          locationType: "werkstatt" as const,
          projectId: "",
          description: "",
        }))
      );
    }
  }, [open]);

  const updateBlockForm = (index: number, updates: Partial<BlockFormData>) => {
    setBlockForms((prev) =>
      prev.map((form, i) => (i === index ? { ...form, ...updates } : form))
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const blocks = freeBlocks.map((block, i) => {
        const form = blockForms[i] || { locationType: "werkstatt", projectId: "", description: "" };
        return {
          projectId: form.locationType === "werkstatt" ? null : form.projectId || null,
          locationType: form.locationType,
          description: form.description,
          startTime: block.startTime,
          endTime: block.endTime,
        };
      });
      await onSubmit(blocks);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const totalFreeHours = freeBlocks.reduce((sum, b) => sum + b.hours, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Reststunden auffüllen
          </DialogTitle>
          <DialogDescription>
            Freie Zeitblöcke automatisch buchen
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hours summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Bereits gebucht:</span>
              <span className="font-medium">{bookedHours.toFixed(2)} h</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sollstunden:</span>
              <span className="font-medium">{targetHours.toFixed(2)} h</span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="font-medium">Verfügbare Blöcke:</span>
              <Badge variant="secondary" className="text-lg font-bold px-3 py-1">
                {totalFreeHours.toFixed(2)} h
              </Badge>
            </div>
          </div>

          {freeBlocks.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              Keine freien Zeitblöcke verfügbar
            </p>
          ) : (
            <div className="space-y-4">
              {freeBlocks.map((block, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-sm">
                      {block.startTime} – {block.endTime}
                    </span>
                    <Badge variant="outline">{block.hours.toFixed(2)} h</Badge>
                  </div>

                  {/* Location selection */}
                  <RadioGroup
                    value={blockForms[index]?.locationType || "werkstatt"}
                    onValueChange={(value: "baustelle" | "werkstatt") =>
                      updateBlockForm(index, { locationType: value })
                    }
                    className="grid grid-cols-2 gap-2"
                  >
                    <div>
                      <RadioGroupItem value="baustelle" id={`fill-b-${index}`} className="peer sr-only" />
                      <Label
                        htmlFor={`fill-b-${index}`}
                        className="flex h-10 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                      >
                        Baustelle
                      </Label>
                    </div>
                    <div>
                      <RadioGroupItem value="werkstatt" id={`fill-w-${index}`} className="peer sr-only" />
                      <Label
                        htmlFor={`fill-w-${index}`}
                        className="flex h-10 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                      >
                        Lager
                      </Label>
                    </div>
                  </RadioGroup>

                  {/* Project selection */}
                  {blockForms[index]?.locationType === "baustelle" && (
                    <Select
                      value={blockForms[index]?.projectId || ""}
                      onValueChange={(v) => updateBlockForm(index, { projectId: v })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Projekt wählen (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.plz})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Description */}
                  <Input
                    value={blockForms[index]?.description || ""}
                    onChange={(e) => updateBlockForm(index, { description: e.target.value })}
                    placeholder="Beschreibung (optional)"
                    className="h-10"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || freeBlocks.length === 0}>
              {submitting ? "Wird gebucht..." : `${freeBlocks.length} Block${freeBlocks.length !== 1 ? "e" : ""} buchen`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export interface WorkTimePreset {
  startTime: string;
  endTime: string;
  hasPause: boolean;
  pauseMinutes: number;
  totalHours: number;
}

/**
 * Gibt die Normalarbeitszeit für einen Tag zurück
 * Mo-Do: 8.5h (07:00-16:00, 30min Pause), Fr: 5h (07:00-12:00, keine Pause), Sa-So: 0h
 * Wochensumme: 39h
 */
export function getNormalWorkingHours(date: Date): number {
  const dayOfWeek = date.getDay();

  // Wochenende
  if (dayOfWeek === 0 || dayOfWeek === 6) return 0;

  // Montag - Donnerstag: 8.5 Stunden (9h - 0.5h Pause)
  if (dayOfWeek >= 1 && dayOfWeek <= 4) return 8.5;

  // Freitag: 5.0 Stunden (07:00-12:00, keine Pause)
  if (dayOfWeek === 5) return 5.0;

  return 0;
}

/**
 * Gibt die tatsächlichen Arbeitsstunden für einen Tag zurück
 * Mo-Do: 8.5h, Fr: 5.0h, Sa-So: 0h
 */
export function getTotalWorkingHours(date: Date): number {
  return getNormalWorkingHours(date);
}

/**
 * Gibt die Sollstunden für eine Woche zurück: 39 Stunden
 */
export function getWeeklyTargetHours(): number {
  return 39;
}

/**
 * Berechnet Arbeitsstunden aus Start- und Endzeit abzüglich Pausenminuten.
 */
export function calculateHoursWithPause(startTime: string, endTime: string, pauseMinutes: number): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM) - pauseMinutes;
  return Math.max(0, totalMinutes / 60);
}

/**
 * Gibt Standard-Arbeitszeiten für einen Tag zurück
 */
export function getDefaultWorkTimes(date: Date): WorkTimePreset | null {
  const dayOfWeek = date.getDay();

  // Wochenende
  if (dayOfWeek === 0 || dayOfWeek === 6) return null;

  // Montag - Donnerstag: 07:00 - 16:00, 30min Pause
  if (dayOfWeek >= 1 && dayOfWeek <= 4) {
    return {
      startTime: "07:00",
      endTime: "16:00",
      hasPause: true,
      pauseMinutes: 30,
      totalHours: 8.5
    };
  }

  // Freitag: 07:00 - 12:00, keine Pause
  if (dayOfWeek === 5) {
    return {
      startTime: "07:00",
      endTime: "12:00",
      hasPause: false,
      pauseMinutes: 0,
      totalHours: 5.0
    };
  }

  return null;
}

/**
 * Berechnet den Ostersonntag für ein gegebenes Jahr (Gauss-Algorithmus)
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Gibt den Namen des österreichischen Feiertags zurück, oder null wenn kein Feiertag
 */
export function getAustrianHoliday(date: Date): string | null {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  // Fixe Feiertage
  const fixed: [number, number, string][] = [
    [1, 1, "Neujahr"],
    [1, 6, "Heilige Drei Könige"],
    [5, 1, "Staatsfeiertag"],
    [8, 15, "Mariä Himmelfahrt"],
    [10, 26, "Nationalfeiertag"],
    [11, 1, "Allerheiligen"],
    [12, 8, "Mariä Empfängnis"],
    [12, 25, "Christtag"],
    [12, 26, "Stefanitag"],
  ];

  for (const [m, d, name] of fixed) {
    if (month === m && day === d) return name;
  }

  // Variable Feiertage (Oster-basiert)
  const easter = getEasterSunday(year);
  const variable: [number, string][] = [
    [1, "Ostermontag"],
    [39, "Christi Himmelfahrt"],
    [50, "Pfingstmontag"],
    [60, "Fronleichnam"],
  ];

  for (const [offset, name] of variable) {
    const h = addDays(easter, offset);
    if (h.getDate() === day && h.getMonth() + 1 === month) return name;
  }

  return null;
}

/**
 * Prüft ob ein Tag ein arbeitsfreier Tag ist (Wochenende oder Feiertag)
 */
export function isNonWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;
  return getAustrianHoliday(date) !== null;
}

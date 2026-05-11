// Mobile-layer date helpers (thin wrappers — core logic is in @solotravelsoul/shared)
export {
  formatShortDate,
  formatDateRange,
  formatDayLabel,
  tripDurationDays,
  isUpcoming,
  toISODate,
  tripStatus,
  daysUntil,
  tripCurrentDay,
} from '@solotravelsoul/shared';

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function todayAtMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

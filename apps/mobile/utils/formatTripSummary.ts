import type { PlannedTrip, ItineraryDay, ChecklistItem } from '@solotravelsoul/shared';
import { formatDateRange, tripDurationDays } from './dateUtils';

const PLACE_EMOJI: Record<string, string> = {
  food: '🍜',
  attraction: '🏛️',
  accommodation: '🏨',
  transport: '🚌',
  other: '📍',
};

const MOOD_EMOJI: Record<string, string> = {
  amazing: '🌟',
  good: '😊',
  okay: '😐',
  tired: '😴',
  challenging: '💪',
};

const DIVIDER = '─────────────────────────';

export interface TripSummaryOptions {
  /** When true, journal entry titles + mood are included. Full text is NEVER exported — privacy safe. */
  includeJournal: boolean;
}

export function formatTripSummary(
  trip: PlannedTrip,
  itinerary: ItineraryDay[],
  checklist: ChecklistItem[],
  options: TripSummaryOptions
): string {
  const { includeJournal } = options;
  const lines: string[] = [];
  const totalDays = tripDurationDays(trip.startDate, trip.endDate);

  // ── Header ──
  lines.push(`✈️  ${trip.destination.toUpperCase()}`);
  lines.push(`${formatDateRange(trip.startDate, trip.endDate)} · ${totalDays} day${totalDays !== 1 ? 's' : ''}`);

  // ── Packing ──
  if (checklist.length > 0) {
    const checked = checklist.filter((c) => c.checked).length;
    const pct = Math.round((checked / checklist.length) * 100);
    lines.push('');
    lines.push(DIVIDER);
    lines.push('');
    lines.push('📋 PACKING CHECKLIST');
    lines.push(`${checked}/${checklist.length} items packed · ${pct}% complete`);
  }

  // ── Itinerary ──
  lines.push('');
  lines.push(DIVIDER);
  lines.push('');
  lines.push('🗓️  ITINERARY');
  lines.push('');

  if (itinerary.length === 0) {
    lines.push('No itinerary planned yet.');
  } else {
    itinerary.forEach((day, i) => {
      const dateStr = day.date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      lines.push(`Day ${i + 1} · ${dateStr}`);
      if (day.places.length === 0) {
        lines.push('  (no places added)');
      } else {
        for (const place of day.places) {
          const emoji = PLACE_EMOJI[place.category] ?? '📍';
          lines.push(`  ${emoji} ${place.name}`);
        }
      }
      lines.push('');
    });
  }

  // ── Journal ──
  lines.push(DIVIDER);
  lines.push('');
  lines.push('📓 JOURNAL');

  const totalEntries = itinerary.reduce((n, d) => n + d.journalEntries.length, 0);

  if (totalEntries === 0) {
    lines.push('No entries yet.');
  } else if (!includeJournal) {
    // Default: count only — keeps journal private
    lines.push(`${totalEntries} memor${totalEntries === 1 ? 'y' : 'ies'} captured`);
  } else {
    // Included: titles + mood only — full text body is NEVER exported
    lines.push('');
    for (let i = 0; i < itinerary.length; i++) {
      const day = itinerary[i];
      if (day.journalEntries.length === 0) continue;
      const dateStr = day.date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      lines.push(`Day ${i + 1} · ${dateStr}`);
      for (const entry of day.journalEntries) {
        const moodEmoji = entry.mood ? (MOOD_EMOJI[entry.mood] ?? '📝') : '📝';
        const title = entry.title?.trim() || 'Note';
        lines.push(`  ${moodEmoji} ${title}`);
      }
      lines.push('');
    }
  }

  // ── Notes ──
  if (trip.notes?.trim()) {
    lines.push('');
    lines.push(DIVIDER);
    lines.push('');
    lines.push('🗒️  NOTES');
    lines.push(trip.notes.trim());
  }

  // ── Footer ──
  lines.push('');
  lines.push(DIVIDER);
  lines.push('');
  lines.push('Shared via SoloTravelSoul 🌏');

  return lines.join('\n');
}

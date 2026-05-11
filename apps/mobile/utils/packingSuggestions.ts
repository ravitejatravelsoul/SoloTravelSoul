import type { PlannedTrip, ChecklistItem, ItineraryDay } from '@solotravelsoul/shared';

// ── Public types ──────────────────────────────────────────────────────

export type PackingCategory =
  | 'essentials'
  | 'beach'
  | 'hiking'
  | 'city'
  | 'food'
  | 'nightlife'
  | 'international'
  | 'long-trip';

export interface PackingSuggestion {
  id: string;
  text: string;
  emoji: string;
  reason: string;
  category: PackingCategory;
}

export interface TripContext {
  /** Ordered active categories (excluding 'essentials') for display labels */
  categories: PackingCategory[];
  /** Human-readable labels with emoji, e.g. ["🏖️ Beach", "✈️ International"] */
  labels: string[];
}

// ── Suggestion data ───────────────────────────────────────────────────

const ITEMS: Record<PackingCategory, Array<{ text: string; emoji: string; reason: string }>> = {
  essentials: [
    { text: 'Phone charger',            emoji: '🔌', reason: 'Travel essential' },
    { text: 'Power bank',               emoji: '🔋', reason: 'Never run out of battery' },
    { text: 'Headphones',               emoji: '🎧', reason: 'For long journeys' },
    { text: 'Camera',                   emoji: '📷', reason: 'Capture memories' },
  ],
  beach: [
    { text: 'Sunscreen SPF 50+',        emoji: '🌞', reason: 'Beach & sun protection' },
    { text: 'Swimwear',                 emoji: '🩱', reason: 'For the beach' },
    { text: 'Beach towel',              emoji: '🏖️', reason: 'Beach days' },
    { text: 'Sandals / flip flops',     emoji: '🩴', reason: 'Beach footwear' },
    { text: 'Sunglasses',               emoji: '😎', reason: 'Sun protection' },
    { text: 'Insect repellent',         emoji: '🦟', reason: 'Tropical destinations' },
    { text: 'Waterproof phone case',    emoji: '📱', reason: 'Protect your phone at the beach' },
    { text: 'After-sun lotion',         emoji: '🌿', reason: 'Soothe sunburn' },
  ],
  hiking: [
    { text: 'Hiking shoes / boots',     emoji: '🥾', reason: 'Outdoor adventures' },
    { text: 'Water bottle',             emoji: '💧', reason: 'Stay hydrated outdoors' },
    { text: 'First aid kit',            emoji: '🩹', reason: 'Safety outdoors' },
    { text: 'Backpack / day bag',       emoji: '🎒', reason: 'For day hikes' },
    { text: 'Snacks / energy bars',     emoji: '🥜', reason: 'Long hike fuel' },
    { text: 'Rain jacket',              emoji: '🧥', reason: 'Mountain weather changes fast' },
    { text: 'Trekking poles',           emoji: '🪵', reason: 'Stability on rough terrain' },
  ],
  city: [
    { text: 'Comfortable walking shoes', emoji: '👟', reason: 'City exploration' },
    { text: 'Day bag / crossbody',      emoji: '👜', reason: 'Safe for city days' },
    { text: 'Umbrella',                 emoji: '☂️', reason: 'City weather surprises' },
    { text: 'Transit card / cash',      emoji: '🚇', reason: 'City transport' },
    { text: 'Offline maps downloaded',  emoji: '🗺️', reason: 'Navigate without data' },
  ],
  food: [
    { text: 'Food allergy card',        emoji: '⚠️', reason: 'Communicate allergies while dining' },
    { text: 'Antacids / digestive aids',emoji: '💊', reason: 'For adventurous eating' },
    { text: 'Reusable cutlery',         emoji: '🍴', reason: 'Eco-friendly dining' },
  ],
  nightlife: [
    { text: 'Smart casual outfit',      emoji: '👔', reason: 'For evenings out' },
    { text: 'Cash for tips / entry',    emoji: '💵', reason: 'Bars and clubs' },
  ],
  international: [
    { text: 'Travel adapter / converter', emoji: '🔌', reason: 'International power sockets vary' },
    { text: 'Travel insurance documents', emoji: '📋', reason: 'International travel essential' },
    { text: 'Local currency / forex card', emoji: '💱', reason: 'Spending money abroad' },
    { text: 'Visa & entry documents',   emoji: '📄', reason: 'International entry requirements' },
    { text: 'Copies of important docs', emoji: '📑', reason: 'Backup if originals are lost' },
  ],
  'long-trip': [
    { text: 'Laundry bag',              emoji: '🧺', reason: 'Organise clothes over multiple days' },
    { text: 'Travel pillow',            emoji: '🛏️', reason: 'Comfort on long journeys' },
    { text: 'Extra medications',        emoji: '💊', reason: 'Stock up for extended trips' },
    { text: 'Portable laundry detergent', emoji: '🧴', reason: 'Wash clothes during long trips' },
    { text: 'Reusable shopping bag',    emoji: '🛍️', reason: 'Handy for long stays' },
  ],
};

// ── Keyword → category rules ──────────────────────────────────────────

const KEYWORD_RULES: Array<{
  keywords: string[];
  category: PackingCategory;
  label: string;
}> = [
  {
    keywords: [
      'beach', 'coast', 'coastal', 'ocean', 'sea', 'island', 'bay', 'shore', 'gulf',
      'hawaii', 'bali', 'cancun', 'miami', 'maldives', 'caribbean', 'phuket', 'ibiza',
      'cabo', 'bahamas', 'barbados', 'tahiti', 'fiji', 'santorini', 'riviera',
      'resort', 'snorkel', 'surf', 'diving',
    ],
    category: 'beach',
    label: '🏖️ Beach',
  },
  {
    keywords: [
      'mountain', 'mountains', 'hiking', 'hike', 'trail', 'trails', 'rocky', 'rockies',
      'yosemite', 'grand canyon', 'glacier', 'summit', 'peak', 'peaks', 'camping',
      'forest', 'jungle', 'patagonia', 'yellowstone', 'outdoor', 'trek', 'trekking',
      'alps', 'andes', 'kilimanjaro', 'appalachian', 'colorado', 'banff', 'zion',
      'national park', 'wilderness', 'backcountry',
    ],
    category: 'hiking',
    label: '⛰️ Outdoor',
  },
  {
    keywords: [
      'city', 'urban', 'downtown', 'new york', 'nyc', 'chicago', 'los angeles', 'la ',
      'san francisco', 'seattle', 'boston', 'washington', 'las vegas', 'museum', 'art',
      'gallery', 'shopping', 'mall', 'street', 'metro', 'subway', 'architecture',
      'skyscraper', 'district', 'neighborhood',
    ],
    category: 'city',
    label: '🏙️ City',
  },
  {
    keywords: [
      'food', 'culinary', 'cuisine', 'dining', 'restaurant', 'eat', 'market',
      'street food', 'gastronomic', 'foodie', 'tasting', 'winery', 'vineyard', 'brewery',
      'cooking class', 'food tour',
    ],
    category: 'food',
    label: '🍜 Food',
  },
  {
    keywords: [
      'nightlife', 'bar', 'bars', 'club', 'clubs', 'nightclub', 'party', 'lounge',
      'casino', 'entertainment',
    ],
    category: 'nightlife',
    label: '🌙 Nightlife',
  },
  {
    keywords: [
      'international', 'abroad', 'overseas', 'europe', 'asia', 'africa',
      'japan', 'tokyo', 'osaka', 'kyoto', 'paris', 'london', 'berlin', 'rome', 'madrid',
      'amsterdam', 'thailand', 'bangkok', 'korea', 'seoul', 'china', 'beijing', 'shanghai',
      'india', 'mumbai', 'delhi', 'australia', 'sydney', 'melbourne', 'mexico', 'brazil',
      'rio', 'singapore', 'vietnam', 'hanoi', 'indonesia', 'dubai', 'turkey', 'istanbul',
      'greece', 'athens', 'spain', 'italy', 'france', 'germany', 'uk', 'ireland',
      'portugal', 'lisbon', 'czech', 'prague', 'hungary', 'budapest', 'poland', 'warsaw',
      'scandinavia', 'sweden', 'norway', 'denmark', 'finland', 'canada', 'toronto',
      'vancouver', 'peru', 'colombia', 'argentina', 'chile', 'south africa', 'morocco',
      'egypt', 'kenya', 'tanzania', 'philippines', 'malaysia', 'nepal', 'nepal',
      'kathmandu', 'cambodia', 'myanmar', 'taiwan', 'hong kong',
    ],
    category: 'international',
    label: '✈️ International',
  },
];

const CATEGORY_DISPLAY_LABEL: Record<PackingCategory, string> = {
  essentials: 'Essentials',
  beach: '🏖️ Beach',
  hiking: '⛰️ Outdoor',
  city: '🏙️ City',
  food: '🍜 Food',
  nightlife: '🌙 Nightlife',
  international: '✈️ International',
  'long-trip': '📅 7+ days',
};

// ── Engine ────────────────────────────────────────────────────────────

function scanText(text: string): Set<PackingCategory> {
  const lower = text.toLowerCase();
  const found = new Set<PackingCategory>();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      found.add(rule.category);
    }
  }
  return found;
}

function tripDurationDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Pure function — no side effects, no network. Returns suggestions filtered
 * against existingChecklist so the caller never needs to deduplicate.
 */
export function getPackingSuggestions(
  trip: Pick<PlannedTrip, 'destination' | 'startDate' | 'endDate'>,
  itinerary: ItineraryDay[],
  existingChecklist: ChecklistItem[]
): { suggestions: PackingSuggestion[]; context: TripContext } {
  const active = new Set<PackingCategory>();

  // Signal 1 — destination text keywords
  for (const cat of scanText(trip.destination)) active.add(cat);

  // Signal 2 — place names and notes in itinerary
  // Catches things like "Waikiki Beach" or "Rocky Mountain National Park"
  const placeText = itinerary
    .flatMap((d) => d.places.flatMap((p) => [p.name, p.notes]))
    .filter(Boolean)
    .join(' ');
  if (placeText) {
    for (const cat of scanText(placeText)) active.add(cat);
  }

  // Signal 3 — itinerary place categories
  const placeCats = new Set(itinerary.flatMap((d) => d.places.map((p) => p.category)));
  if (placeCats.has('food')) active.add('food');

  // Signal 4 — trip duration
  const duration = tripDurationDays(trip.startDate, trip.endDate);
  if (duration >= 7) active.add('long-trip');

  // Always include essentials
  active.add('essentials');

  // Existing checklist texts (normalised) for deduplication
  const existingNorm = new Set(existingChecklist.map((c) => normalize(c.text)));

  // Collect suggestions in priority order (most specific first, essentials last)
  const categoryOrder: PackingCategory[] = [
    'beach', 'hiking', 'international', 'city', 'food', 'nightlife', 'long-trip', 'essentials',
  ];

  const suggestions: PackingSuggestion[] = [];
  const seenNorm = new Set<string>();

  for (const cat of categoryOrder) {
    if (!active.has(cat)) continue;
    for (const item of ITEMS[cat]) {
      const norm = normalize(item.text);
      if (existingNorm.has(norm)) continue; // already on checklist
      if (seenNorm.has(norm)) continue;     // duplicate across categories
      seenNorm.add(norm);
      suggestions.push({
        id: `sug-${cat}-${norm.replace(/\s/g, '_')}`,
        text: item.text,
        emoji: item.emoji,
        reason: item.reason,
        category: cat,
      });
    }
  }

  // Context: non-essentials categories only (for display labels)
  const contextCategories = categoryOrder.filter(
    (c) => active.has(c) && c !== 'essentials'
  );

  return {
    suggestions,
    context: {
      categories: contextCategories,
      labels: contextCategories.map((c) => CATEGORY_DISPLAY_LABEL[c]),
    },
  };
}

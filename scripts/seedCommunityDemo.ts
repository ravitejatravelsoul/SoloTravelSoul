/**
 * seedCommunityDemo.ts
 *
 * Firebase Admin SDK — creates realistic demo community data.
 * Bypasses Firestore security rules. Run locally only.
 *
 * Usage (PowerShell):
 *
 *   # Community only
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccountKey.json"
 *   npx tsx scripts/seedCommunityDemo.ts
 *
 *   # Community + chats for your account
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccountKey.json"
 *   $env:DEMO_CURRENT_UID = "YOUR_FIREBASE_UID"
 *   npx tsx scripts/seedCommunityDemo.ts
 *
 *   # Cleanup
 *   npx tsx scripts/cleanupCommunityDemo.ts
 *
 * Cleanup:
 *   All seeded docs carry demo:true and are deleted by cleanupCommunityDemo.ts.
 */

import * as admin from 'firebase-admin';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('\n[seed] ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set.\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const now = admin.firestore.Timestamp.now();

const CURRENT_UID: string | undefined = process.env.DEMO_CURRENT_UID?.trim() || undefined;

const daysAgo = (d: number) =>
  admin.firestore.Timestamp.fromDate(new Date(Date.now() - d * 86_400_000));
const daysFromNow = (d: number) =>
  admin.firestore.Timestamp.fromDate(new Date(Date.now() + d * 86_400_000));
const hoursAgo = (h: number) =>
  admin.firestore.Timestamp.fromDate(new Date(Date.now() - h * 3_600_000));
const minsAgo = (m: number) =>
  admin.firestore.Timestamp.fromDate(new Date(Date.now() - m * 60_000));

// Deterministic chat ID — matches client-side directChatId()
function chatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Demo Users ────────────────────────────────────────────────────────────────

const USERS = [
  {
    uid: 'demo_user_01',
    displayName: 'Sarah Johnson',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_01',
    bio: 'Solo female traveler from Austin, TX. 34 countries on a teacher\'s budget. Coffee, hostels, and sunrise hikes are my love language.',
    currentCity: 'Austin, TX, USA',
    homeCountry: 'United States',
    languages: ['English', 'Spanish'],
    travelStyles: ['solo', 'budget', 'adventure'],
    countriesVisited: ['USA', 'Mexico', 'Colombia', 'Peru', 'Thailand', 'Vietnam', 'Nepal', 'Portugal'],
    dreamDestinations: ['Iceland', 'Morocco', 'Patagonia'],
    interests: ['hiking', 'photography', 'food', 'yoga'],
    tripCount: 12,
  },
  {
    uid: 'demo_user_02',
    displayName: 'Alex Chen',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_02',
    bio: 'Full-stack developer turned digital nomad. Building SaaS from Bali, Chiang Mai, and Lisbon. Always hunting the best co-working café.',
    currentCity: 'Chiang Mai, Thailand',
    homeCountry: 'Canada',
    languages: ['English', 'Mandarin', 'French'],
    travelStyles: ['digital-nomad', 'budget', 'cultural'],
    countriesVisited: ['Canada', 'Thailand', 'Indonesia', 'Portugal', 'Spain', 'Japan', 'Mexico'],
    dreamDestinations: ['Georgia (country)', 'Kyrgyzstan', 'Taiwan'],
    interests: ['food', 'photography', 'art', 'languages'],
    tripCount: 18,
  },
  {
    uid: 'demo_user_03',
    displayName: 'Priya Sharma',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_03',
    bio: 'Adventure traveler from Mumbai. Mountaineering, motorbike trips, and street food — that\'s my trifecta. Everest Base Camp twice.',
    currentCity: 'Mumbai, India',
    homeCountry: 'India',
    languages: ['Hindi', 'English', 'Marathi'],
    travelStyles: ['adventure', 'solo', 'budget'],
    countriesVisited: ['India', 'Nepal', 'Bhutan', 'Sri Lanka', 'Vietnam', 'Cambodia', 'Japan'],
    dreamDestinations: ['Patagonia', 'Alaska', 'Faroe Islands'],
    interests: ['hiking', 'photography', 'history', 'volunteering'],
    tripCount: 21,
  },
  {
    uid: 'demo_user_04',
    displayName: 'David Walsh',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_04',
    bio: 'Road-trip obsessed from Melbourne. Driven every Australian state highway and now doing the Americas. My van is my home.',
    currentCity: 'Salt Lake City, UT, USA',
    homeCountry: 'Australia',
    languages: ['English'],
    travelStyles: ['adventure', 'budget', 'eco'],
    countriesVisited: ['Australia', 'New Zealand', 'USA', 'Canada', 'Mexico', 'Colombia'],
    dreamDestinations: ['Iceland', 'Scandinavia', 'Mongolia'],
    interests: ['hiking', 'photography', 'sports', 'music'],
    tripCount: 8,
  },
  {
    uid: 'demo_user_05',
    displayName: 'Emma Clarke',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_05',
    bio: 'Budget backpacker and travel writer from Brighton. £25/day challenge veteran. Currently Southeast Asia on a shoestring.',
    currentCity: 'Hanoi, Vietnam',
    homeCountry: 'United Kingdom',
    languages: ['English', 'French', 'Thai'],
    travelStyles: ['budget', 'solo', 'cultural'],
    countriesVisited: ['UK', 'France', 'Thailand', 'Vietnam', 'Cambodia', 'Laos', 'Indonesia'],
    dreamDestinations: ['Ethiopia', 'Bolivia', 'Uzbekistan'],
    interests: ['food', 'history', 'languages', 'volunteering'],
    tripCount: 15,
  },
  {
    uid: 'demo_user_06',
    displayName: 'Carlos Ruiz',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_06',
    bio: 'Travel photographer from Barcelona. Work in Nat Geo Traveller and Condé Nast. Always hunting interesting faces and landscapes.',
    currentCity: 'Reykjavik, Iceland',
    homeCountry: 'Spain',
    languages: ['Spanish', 'English', 'Catalan'],
    travelStyles: ['adventure', 'cultural', 'solo'],
    countriesVisited: ['Spain', 'Iceland', 'Norway', 'Morocco', 'Japan', 'Peru', 'Ethiopia'],
    dreamDestinations: ['Antarctica', 'Papua New Guinea', 'Greenland'],
    interests: ['photography', 'art', 'history', 'hiking'],
    tripCount: 27,
  },
  {
    uid: 'demo_user_07',
    displayName: 'Lisa Hoffmann',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_07',
    bio: 'Ultra-trail runner and hiker from Munich. Collect long-distance trails like stamps. Planning a thru-hike across the Alps.',
    currentCity: 'Interlaken, Switzerland',
    homeCountry: 'Germany',
    languages: ['German', 'English', 'French'],
    travelStyles: ['adventure', 'eco', 'solo'],
    countriesVisited: ['Germany', 'Switzerland', 'Austria', 'Norway', 'New Zealand', 'Nepal', 'Japan'],
    dreamDestinations: ['Patagonia', 'Svalbard', 'Alaska'],
    interests: ['hiking', 'sports', 'photography', 'yoga'],
    tripCount: 19,
  },
  {
    uid: 'demo_user_08',
    displayName: 'Ryan Torres',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_08',
    bio: 'Food-obsessed traveler from NYC. If there\'s a Michelin-starred street stall, I\'ve waited in line for it. Writing a blog about eating the world.',
    currentCity: 'Tokyo, Japan',
    homeCountry: 'United States',
    languages: ['English', 'Spanish', 'Japanese'],
    travelStyles: ['food', 'cultural', 'luxury'],
    countriesVisited: ['USA', 'Japan', 'Italy', 'France', 'Spain', 'Mexico', 'Peru', 'Thailand'],
    dreamDestinations: ['Lyon', 'Copenhagen', 'Lima'],
    interests: ['food', 'nightlife', 'art', 'music'],
    tripCount: 23,
  },
  {
    uid: 'demo_user_09',
    displayName: 'Mei Tan',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_09',
    bio: 'UX designer and remote worker from Singapore. I work from beautiful places and try to blend into local life. Tea > coffee, always.',
    currentCity: 'Bali, Indonesia',
    homeCountry: 'Singapore',
    languages: ['English', 'Mandarin', 'Malay'],
    travelStyles: ['digital-nomad', 'cultural', 'eco'],
    countriesVisited: ['Singapore', 'Indonesia', 'Japan', 'South Korea', 'Portugal', 'Italy'],
    dreamDestinations: ['Bhutan', 'Jordan', 'Georgia (country)'],
    interests: ['art', 'food', 'yoga', 'photography'],
    tripCount: 14,
  },
  {
    uid: 'demo_user_10',
    displayName: 'Sofia Rossi',
    photoURL: 'https://i.pravatar.cc/150?u=demo_user_10',
    bio: 'Art historian and culture traveler from Florence. I visit every museum I can find and sketch historic architecture. Cappuccino snob.',
    currentCity: 'Athens, Greece',
    homeCountry: 'Italy',
    languages: ['Italian', 'English', 'French', 'Greek'],
    travelStyles: ['cultural', 'luxury', 'solo'],
    countriesVisited: ['Italy', 'Greece', 'France', 'Spain', 'Egypt', 'Turkey', 'Morocco'],
    dreamDestinations: ['Iran', 'Uzbekistan', 'Japan'],
    interests: ['art', 'history', 'food', 'languages'],
    tripCount: 16,
  },
];

// ── Demo Trips ────────────────────────────────────────────────────────────────

const TRIPS = [
  { tripId: 'demo_trip_01', ownerUid: 'demo_user_06', ownerName: 'Carlos Ruiz', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_06', title: 'Iceland Ring Road Adventure', destination: 'Iceland', startDate: daysFromNow(30), endDate: daysFromNow(44), description: 'Camper van around the full Ring Road. Northern lights, waterfalls, lava fields. Seeking 1–2 photographers who can drive manual.', tags: ['adventure', 'photography', 'road-trip', 'northern-lights', 'nature'], memberCount: 2, maxMembers: 3, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/iceland_demo/600/400' },
  { tripId: 'demo_trip_02', ownerUid: 'demo_user_08', ownerName: 'Ryan Torres', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_08', title: 'Japan Cherry Blossom Tour', destination: 'Japan', startDate: daysFromNow(95), endDate: daysFromNow(109), description: 'Tokyo → Kyoto → Osaka → Hiroshima during sakura season. Focused on food and temples.', tags: ['cultural', 'food', 'photography', 'cherry-blossom', 'temples'], memberCount: 1, maxMembers: 4, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/japan_sakura_demo/600/400' },
  { tripId: 'demo_trip_03', ownerUid: 'demo_user_09', ownerName: 'Mei Tan', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_09', title: 'Bali Remote Work Escape', destination: 'Bali, Indonesia', startDate: daysFromNow(10), endDate: daysFromNow(40), description: 'Canggu base. Mornings: deep work. Afternoons: explore. Co-sharing a 4-bed villa. Need 2 more remote workers.', tags: ['digital-nomad', 'remote-work', 'beach', 'coworking', 'eco'], memberCount: 2, maxMembers: 4, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/bali_remote_demo/600/400' },
  { tripId: 'demo_trip_04', ownerUid: 'demo_user_05', ownerName: 'Emma Clarke', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_05', title: 'Thailand Island Hopping', destination: 'Thailand', startDate: daysFromNow(18), endDate: daysFromNow(32), description: 'Koh Tao → Koh Phangan → Koh Lanta. Snorkeling, beach read, night markets. Budget ≈ $40/day.', tags: ['beach', 'budget', 'solo', 'snorkeling', 'islands'], memberCount: 1, maxMembers: 3, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/thailand_islands_demo/600/400' },
  { tripId: 'demo_trip_05', ownerUid: 'demo_user_04', ownerName: 'David Walsh', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_04', title: 'Utah National Parks Road Trip', destination: 'Utah, USA', startDate: daysFromNow(21), endDate: daysFromNow(28), description: 'Zion → Bryce → Capitol Reef → Arches → Canyonlands. 4WD rental. Sharing costs — 1–2 more welcome.', tags: ['road-trip', 'adventure', 'hiking', 'nature', 'photography'], memberCount: 2, maxMembers: 4, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/utah_parks_demo/600/400' },
  { tripId: 'demo_trip_06', ownerUid: 'demo_user_07', ownerName: 'Lisa Hoffmann', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_07', title: 'Swiss Alps Hiking Week', destination: 'Switzerland', startDate: daysFromNow(55), endDate: daysFromNow(62), description: 'Jungfrau region hut-to-hut. Grindelwald, Mürren, Gimmelwald. 20+ km daily, full kit required.', tags: ['hiking', 'adventure', 'mountains', 'nature', 'budget'], memberCount: 1, maxMembers: 4, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/swiss_alps_demo/600/400' },
  { tripId: 'demo_trip_07', ownerUid: 'demo_user_03', ownerName: 'Priya Sharma', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_03', title: 'Peru Machu Picchu Trek', destination: 'Peru', startDate: daysFromNow(75), endDate: daysFromNow(85), description: 'Classic Inca Trail 4-day + Machu Picchu. Cusco acclimatization included. Experienced trekkers only.', tags: ['adventure', 'hiking', 'cultural', 'history', 'mountains'], memberCount: 3, maxMembers: 8, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/peru_inca_demo/600/400' },
  { tripId: 'demo_trip_08', ownerUid: 'demo_user_08', ownerName: 'Ryan Torres', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_08', title: 'New York Food Crawl', destination: 'New York, USA', startDate: daysFromNow(7), endDate: daysFromNow(9), description: 'Three days eating through every borough. Bagels at 7am, Xi\'an noodles, tasting menu last night.', tags: ['food', 'city', 'weekend', 'restaurants', 'nightlife'], memberCount: 2, maxMembers: 5, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/nyc_food_demo/600/400' },
  { tripId: 'demo_trip_09', ownerUid: 'demo_user_10', ownerName: 'Sofia Rossi', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_10', title: 'Greece Summer Islands', destination: 'Greece', startDate: daysFromNow(48), endDate: daysFromNow(62), description: 'Athens → Santorini → Naxos → Paros → Rhodes. Ferry hopping, ancient ruins, seafood. History-nerd focus.', tags: ['cultural', 'beach', 'history', 'food', 'islands'], memberCount: 2, maxMembers: 4, isAcceptingMembers: false, coverPhotoURL: 'https://picsum.photos/seed/greece_islands_demo/600/400' },
  { tripId: 'demo_trip_10', ownerUid: 'demo_user_05', ownerName: 'Emma Clarke', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_05', title: 'Vietnam Backpacking Journey', destination: 'Vietnam', startDate: daysFromNow(6), endDate: daysFromNow(24), description: 'Hanoi → Ha Long Bay → Hue → Hoi An → HCMC. Classic route, budget sleeper trains, local food.', tags: ['backpacking', 'budget', 'cultural', 'food', 'history'], memberCount: 1, maxMembers: 3, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/vietnam_backpack_demo/600/400' },
  { tripId: 'demo_trip_11', ownerUid: 'demo_user_03', ownerName: 'Priya Sharma', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_03', title: 'Patagonia Expedition', destination: 'Patagonia, Argentina', startDate: daysFromNow(120), endDate: daysFromNow(135), description: 'Torres del Paine W Circuit + El Chaltén hiking. Camping only, own gear required. Demanding and beautiful.', tags: ['adventure', 'hiking', 'nature', 'camping', 'mountains'], memberCount: 2, maxMembers: 6, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/patagonia_demo/600/400' },
  { tripId: 'demo_trip_12', ownerUid: 'demo_user_01', ownerName: 'Sarah Johnson', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_01', title: 'Alaska Wildlife Trip', destination: 'Alaska, USA', startDate: daysFromNow(90), endDate: daysFromNow(100), description: 'Denali, Kenai Fjords, Glacier Bay. Bear watching, whale watching, kayaking. Small group, split points.', tags: ['adventure', 'nature', 'wildlife', 'photography', 'eco'], memberCount: 1, maxMembers: 4, isAcceptingMembers: true, coverPhotoURL: 'https://picsum.photos/seed/alaska_wildlife_demo/600/400' },
];

// ── Demo Groups ───────────────────────────────────────────────────────────────

const GROUPS = [
  { groupId: 'demo_group_01', ownerUid: 'demo_user_08', ownerName: 'Ryan Torres', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_08', name: 'Japan 2027 Travelers', description: 'Planning Japan in 2026/2027. Share tips, itineraries, budget advice, and JR Pass hacks.', destination: 'Japan', startDate: null, endDate: null, capacity: 50, memberCount: 17, visibility: 'public', tags: ['japan', 'cultural', 'food', 'temples'], rules: 'Be respectful. Useful info only.', chatGroupId: null, isAcceptingMembers: true },
  { groupId: 'demo_group_02', ownerUid: 'demo_user_09', ownerName: 'Mei Tan', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_09', name: 'Bali Digital Nomads', description: 'Remote workers in Bali. Co-working spots, villa shares, weekend trips, and visa advice.', destination: 'Bali, Indonesia', startDate: null, endDate: null, capacity: 80, memberCount: 42, visibility: 'public', tags: ['digital-nomad', 'remote-work', 'bali', 'coworking'], rules: 'Work-focused. No MLM or crypto pitches.', chatGroupId: null, isAcceptingMembers: true },
  { groupId: 'demo_group_03', ownerUid: 'demo_user_05', ownerName: 'Emma Clarke', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_05', name: 'Europe Backpackers', description: 'Budget backpackers in Europe. Hostel recommendations, Interrail tips, border crossing advice.', destination: 'Europe', startDate: null, endDate: null, capacity: 150, memberCount: 63, visibility: 'public', tags: ['backpacking', 'budget', 'europe', 'interrail'], rules: 'Budget advice only. Welcome first-timers.', chatGroupId: null, isAcceptingMembers: true },
  { groupId: 'demo_group_04', ownerUid: 'demo_user_01', ownerName: 'Sarah Johnson', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_01', name: 'Solo Female Travelers', description: 'Safe travel tips, vetted accommodation, scam warnings, and meetups for solo women/non-binary travelers.', destination: 'Worldwide', startDate: null, endDate: null, capacity: 200, memberCount: 94, visibility: 'public', tags: ['solo-female', 'safety', 'community', 'budget'], rules: 'Women and non-binary only. Take safety warnings seriously.', chatGroupId: null, isAcceptingMembers: true },
  { groupId: 'demo_group_05', ownerUid: 'demo_user_04', ownerName: 'David Walsh', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_04', name: 'USA National Parks', description: 'Hiking, road-tripping, and camping across the 63 US national parks. Permits, trail beta, wildlife sightings.', destination: 'USA', startDate: null, endDate: null, capacity: 100, memberCount: 31, visibility: 'public', tags: ['national-parks', 'hiking', 'camping', 'road-trip'], rules: 'Leave No Trace. Share permits generously.', chatGroupId: null, isAcceptingMembers: true },
  { groupId: 'demo_group_06', ownerUid: 'demo_user_06', ownerName: 'Carlos Ruiz', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_06', name: 'Photography Travelers', description: 'Travel photographers at any level. Share locations, conditions, gear, and photo critiques.', destination: 'Worldwide', startDate: null, endDate: null, capacity: 60, memberCount: 28, visibility: 'public', tags: ['photography', 'travel', 'landscape', 'portrait'], rules: 'Always include location. Constructive critique only.', chatGroupId: null, isAcceptingMembers: true },
  { groupId: 'demo_group_07', ownerUid: 'demo_user_02', ownerName: 'Alex Chen', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_02', name: 'Remote Workers Abroad', description: 'Visa, tax, banking, and health insurance advice for long-term digital nomads.', destination: 'Worldwide', startDate: null, endDate: null, capacity: 120, memberCount: 55, visibility: 'public', tags: ['digital-nomad', 'remote-work', 'visa', 'banking'], rules: 'Sourced advice only. No spam.', chatGroupId: null, isAcceptingMembers: true },
  { groupId: 'demo_group_08', ownerUid: 'demo_user_07', ownerName: 'Lisa Hoffmann', ownerPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_07', name: 'Adventure Seekers', description: 'Multi-day treks, via ferratas, winter camping, and anything that makes your heart race.', destination: 'Worldwide', startDate: null, endDate: null, capacity: 75, memberCount: 38, visibility: 'public', tags: ['adventure', 'hiking', 'climbing', 'camping'], rules: 'Honest about fitness level. Safety first.', chatGroupId: null, isAcceptingMembers: true },
];

// ── Activity Feed ─────────────────────────────────────────────────────────────

const FEED = [
  { feedItemId: 'demo_feed_01', type: 'trip_created', actorUid: 'demo_user_06', actorName: 'Carlos Ruiz', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_06', targetId: 'demo_trip_01', targetType: 'trip', targetTitle: 'Iceland Ring Road Adventure', targetDestination: 'Iceland', visibility: 'public', createdAt: hoursAgo(4) },
  { feedItemId: 'demo_feed_02', type: 'group_created', actorUid: 'demo_user_09', actorName: 'Mei Tan', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_09', targetId: 'demo_group_02', targetType: 'group', targetTitle: 'Bali Digital Nomads', targetDestination: 'Bali', visibility: 'public', createdAt: hoursAgo(7) },
  { feedItemId: 'demo_feed_03', type: 'trip_created', actorUid: 'demo_user_08', actorName: 'Ryan Torres', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_08', targetId: 'demo_trip_08', targetType: 'trip', targetTitle: 'New York Food Crawl', targetDestination: 'New York, USA', visibility: 'public', createdAt: hoursAgo(10) },
  { feedItemId: 'demo_feed_04', type: 'joined_group', actorUid: 'demo_user_01', actorName: 'Sarah Johnson', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_01', targetId: 'demo_group_04', targetType: 'group', targetTitle: 'Solo Female Travelers', targetDestination: null, visibility: 'public', createdAt: hoursAgo(13) },
  { feedItemId: 'demo_feed_05', type: 'memory_added', actorUid: 'demo_user_03', actorName: 'Priya Sharma', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_03', targetId: 'demo_trip_07', targetType: 'trip', targetTitle: 'Peru Machu Picchu Trek', targetDestination: 'Peru', visibility: 'public', createdAt: hoursAgo(18) },
  { feedItemId: 'demo_feed_06', type: 'place_saved', actorUid: 'demo_user_08', actorName: 'Ryan Torres', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_08', targetId: 'place_tsukiji', targetType: 'memory', targetTitle: 'Tsukiji Outer Market', targetDestination: 'Tokyo, Japan', visibility: 'public', createdAt: hoursAgo(22) },
  { feedItemId: 'demo_feed_07', type: 'trip_created', actorUid: 'demo_user_05', actorName: 'Emma Clarke', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_05', targetId: 'demo_trip_10', targetType: 'trip', targetTitle: 'Vietnam Backpacking Journey', targetDestination: 'Vietnam', visibility: 'public', createdAt: daysAgo(1) },
  { feedItemId: 'demo_feed_08', type: 'group_created', actorUid: 'demo_user_02', actorName: 'Alex Chen', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_02', targetId: 'demo_group_07', targetType: 'group', targetTitle: 'Remote Workers Abroad', targetDestination: null, visibility: 'public', createdAt: daysAgo(1) },
  { feedItemId: 'demo_feed_09', type: 'joined_group', actorUid: 'demo_user_05', actorName: 'Emma Clarke', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_05', targetId: 'demo_group_03', targetType: 'group', targetTitle: 'Europe Backpackers', targetDestination: 'Europe', visibility: 'public', createdAt: daysAgo(2) },
  { feedItemId: 'demo_feed_10', type: 'memory_added', actorUid: 'demo_user_06', actorName: 'Carlos Ruiz', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_06', targetId: 'demo_trip_01', targetType: 'trip', targetTitle: 'Iceland Ring Road Adventure', targetDestination: 'Iceland', visibility: 'public', createdAt: daysAgo(2) },
  { feedItemId: 'demo_feed_11', type: 'trip_created', actorUid: 'demo_user_09', actorName: 'Mei Tan', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_09', targetId: 'demo_trip_03', targetType: 'trip', targetTitle: 'Bali Remote Work Escape', targetDestination: 'Bali, Indonesia', visibility: 'public', createdAt: daysAgo(2) },
  { feedItemId: 'demo_feed_12', type: 'place_saved', actorUid: 'demo_user_10', actorName: 'Sofia Rossi', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_10', targetId: 'place_acropolis', targetType: 'memory', targetTitle: 'Acropolis of Athens', targetDestination: 'Athens, Greece', visibility: 'public', createdAt: daysAgo(3) },
  { feedItemId: 'demo_feed_13', type: 'trip_created', actorUid: 'demo_user_04', actorName: 'David Walsh', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_04', targetId: 'demo_trip_05', targetType: 'trip', targetTitle: 'Utah National Parks Road Trip', targetDestination: 'Utah, USA', visibility: 'public', createdAt: daysAgo(3) },
  { feedItemId: 'demo_feed_14', type: 'joined_group', actorUid: 'demo_user_07', actorName: 'Lisa Hoffmann', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_07', targetId: 'demo_group_08', targetType: 'group', targetTitle: 'Adventure Seekers', targetDestination: null, visibility: 'public', createdAt: daysAgo(3) },
  { feedItemId: 'demo_feed_15', type: 'memory_added', actorUid: 'demo_user_02', actorName: 'Alex Chen', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_02', targetId: 'demo_trip_03', targetType: 'trip', targetTitle: 'Bali Remote Work Escape', targetDestination: 'Bali, Indonesia', visibility: 'public', createdAt: daysAgo(4) },
  { feedItemId: 'demo_feed_16', type: 'group_created', actorUid: 'demo_user_07', actorName: 'Lisa Hoffmann', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_07', targetId: 'demo_group_08', targetType: 'group', targetTitle: 'Adventure Seekers', targetDestination: null, visibility: 'public', createdAt: daysAgo(4) },
  { feedItemId: 'demo_feed_17', type: 'trip_created', actorUid: 'demo_user_07', actorName: 'Lisa Hoffmann', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_07', targetId: 'demo_trip_06', targetType: 'trip', targetTitle: 'Swiss Alps Hiking Week', targetDestination: 'Switzerland', visibility: 'public', createdAt: daysAgo(5) },
  { feedItemId: 'demo_feed_18', type: 'joined_group', actorUid: 'demo_user_03', actorName: 'Priya Sharma', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_03', targetId: 'demo_group_05', targetType: 'group', targetTitle: 'USA National Parks', targetDestination: 'USA', visibility: 'public', createdAt: daysAgo(5) },
  { feedItemId: 'demo_feed_19', type: 'place_saved', actorUid: 'demo_user_04', actorName: 'David Walsh', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_04', targetId: 'place_zion', targetType: 'memory', targetTitle: 'Angels Landing, Zion', targetDestination: 'Utah, USA', visibility: 'public', createdAt: daysAgo(5) },
  { feedItemId: 'demo_feed_20', type: 'trip_created', actorUid: 'demo_user_03', actorName: 'Priya Sharma', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_03', targetId: 'demo_trip_11', targetType: 'trip', targetTitle: 'Patagonia Expedition', targetDestination: 'Patagonia, Argentina', visibility: 'public', createdAt: daysAgo(6) },
  { feedItemId: 'demo_feed_21', type: 'group_created', actorUid: 'demo_user_06', actorName: 'Carlos Ruiz', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_06', targetId: 'demo_group_06', targetType: 'group', targetTitle: 'Photography Travelers', targetDestination: null, visibility: 'public', createdAt: daysAgo(6) },
  { feedItemId: 'demo_feed_22', type: 'joined_group', actorUid: 'demo_user_10', actorName: 'Sofia Rossi', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_10', targetId: 'demo_group_01', targetType: 'group', targetTitle: 'Japan 2027 Travelers', targetDestination: 'Japan', visibility: 'public', createdAt: daysAgo(7) },
  { feedItemId: 'demo_feed_23', type: 'memory_added', actorUid: 'demo_user_01', actorName: 'Sarah Johnson', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_01', targetId: 'demo_trip_12', targetType: 'trip', targetTitle: 'Alaska Wildlife Trip', targetDestination: 'Alaska, USA', visibility: 'public', createdAt: daysAgo(7) },
  { feedItemId: 'demo_feed_24', type: 'trip_created', actorUid: 'demo_user_10', actorName: 'Sofia Rossi', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_10', targetId: 'demo_trip_09', targetType: 'trip', targetTitle: 'Greece Summer Islands', targetDestination: 'Greece', visibility: 'public', createdAt: daysAgo(8) },
  { feedItemId: 'demo_feed_25', type: 'place_saved', actorUid: 'demo_user_06', actorName: 'Carlos Ruiz', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_06', targetId: 'place_jokulsarlon', targetType: 'memory', targetTitle: 'Jökulsárlón Glacier Lagoon', targetDestination: 'Iceland', visibility: 'public', createdAt: daysAgo(9) },
  { feedItemId: 'demo_feed_26', type: 'group_created', actorUid: 'demo_user_05', actorName: 'Emma Clarke', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_05', targetId: 'demo_group_03', targetType: 'group', targetTitle: 'Europe Backpackers', targetDestination: 'Europe', visibility: 'public', createdAt: daysAgo(10) },
  { feedItemId: 'demo_feed_27', type: 'joined_group', actorUid: 'demo_user_04', actorName: 'David Walsh', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_04', targetId: 'demo_group_07', targetType: 'group', targetTitle: 'Remote Workers Abroad', targetDestination: null, visibility: 'public', createdAt: daysAgo(11) },
  { feedItemId: 'demo_feed_28', type: 'memory_added', actorUid: 'demo_user_05', actorName: 'Emma Clarke', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_05', targetId: 'demo_trip_10', targetType: 'trip', targetTitle: 'Vietnam Backpacking Journey', targetDestination: 'Vietnam', visibility: 'public', createdAt: daysAgo(12) },
  { feedItemId: 'demo_feed_29', type: 'trip_created', actorUid: 'demo_user_01', actorName: 'Sarah Johnson', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_01', targetId: 'demo_trip_12', targetType: 'trip', targetTitle: 'Alaska Wildlife Trip', targetDestination: 'Alaska, USA', visibility: 'public', createdAt: daysAgo(14) },
  { feedItemId: 'demo_feed_30', type: 'group_created', actorUid: 'demo_user_01', actorName: 'Sarah Johnson', actorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_01', targetId: 'demo_group_04', targetType: 'group', targetTitle: 'Solo Female Travelers', targetDestination: null, visibility: 'public', createdAt: daysAgo(16) },
];

// ── Nearby Travelers ──────────────────────────────────────────────────────────

const NEARBY = USERS.map((u, i) => ({
  uid: u.uid,
  displayName: u.displayName,
  photoURL: u.photoURL,
  currentCity: u.currentCity,
  travelStyles: u.travelStyles,
  destination: TRIPS[i % TRIPS.length].destination,
  destinationStartDate: TRIPS[i % TRIPS.length].startDate,
  destinationEndDate: TRIPS[i % TRIPS.length].endDate,
  updatedAt: now,
  demo: true,
}));

// ── Pending Join Requests (among demo users) ──────────────────────────────────

// 4 trip requests — requestor ≠ owner
const TRIP_JOIN_REQUESTS = [
  // Sarah → Carlos's Iceland trip
  { requestId: 'demo_trip_01_demo_user_01', tripId: 'demo_trip_01', tripTitle: 'Iceland Ring Road Adventure', tripDestination: 'Iceland', ownerUid: 'demo_user_06', requestorUid: 'demo_user_01', requestorName: 'Sarah Johnson', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_01', requestorBio: 'Solo female traveler from Austin, TX. 34 countries.', message: 'I\'m a landscape photographer heading to Iceland in late November. Would love to join!', status: 'pending', createdAt: hoursAgo(3) },
  // David → Ryan's Japan trip
  { requestId: 'demo_trip_02_demo_user_04', tripId: 'demo_trip_02', tripTitle: 'Japan Cherry Blossom Tour', tripDestination: 'Japan', ownerUid: 'demo_user_08', requestorUid: 'demo_user_04', requestorName: 'David Walsh', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_04', requestorBio: 'Road-trip enthusiast from Melbourne, now exploring Asia.', message: 'Big foodie here. Japan during sakura is on my bucket list. Can I tag along?', status: 'pending', createdAt: hoursAgo(8) },
  // Priya → David's Utah trip
  { requestId: 'demo_trip_05_demo_user_03', tripId: 'demo_trip_05', tripTitle: 'Utah National Parks Road Trip', tripDestination: 'Utah, USA', ownerUid: 'demo_user_04', requestorUid: 'demo_user_03', requestorName: 'Priya Sharma', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_03', requestorBio: 'Adventure traveler from Mumbai. Everest Base Camp twice.', message: 'I have the Arches timed entry permit already! Happy to drive and split costs.', status: 'pending', createdAt: daysAgo(1) },
  // Lisa → Priya's Patagonia expedition
  { requestId: 'demo_trip_11_demo_user_07', tripId: 'demo_trip_11', tripTitle: 'Patagonia Expedition', tripDestination: 'Patagonia, Argentina', ownerUid: 'demo_user_03', requestorUid: 'demo_user_07', requestorName: 'Lisa Hoffmann', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_07', requestorBio: 'Ultra-trail runner from Munich. Thru-hiking is my thing.', message: 'I\'ve done W Circuit twice and know the trail conditions well. All gear ready.', status: 'pending', createdAt: daysAgo(2) },
];

// 3 group requests — requestor ≠ owner
const GROUP_JOIN_REQUESTS = [
  // David → Mei's Bali Digital Nomads
  { requestId: 'demo_group_02_demo_user_04', groupId: 'demo_group_02', groupName: 'Bali Digital Nomads', ownerUid: 'demo_user_09', requestorUid: 'demo_user_04', requestorName: 'David Walsh', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_04', message: 'Starting remote work next month. Based in Canggu for 2 months.', status: 'pending', createdAt: hoursAgo(5) },
  // Sarah → Alex's Remote Workers Abroad
  { requestId: 'demo_group_07_demo_user_01', groupId: 'demo_group_07', groupName: 'Remote Workers Abroad', ownerUid: 'demo_user_02', requestorUid: 'demo_user_01', requestorName: 'Sarah Johnson', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_01', message: 'Transitioning to teaching online. Looking for visa advice for SE Asia.', status: 'pending', createdAt: hoursAgo(14) },
  // Ryan → Carlos's Photography Travelers
  { requestId: 'demo_group_06_demo_user_08', groupId: 'demo_group_06', groupName: 'Photography Travelers', ownerUid: 'demo_user_06', requestorUid: 'demo_user_08', requestorName: 'Ryan Torres', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_08', message: 'Street and food photographer here. Looking to improve my landscape work.', status: 'pending', createdAt: daysAgo(1) },
];

// ── Seed runner ───────────────────────────────────────────────────────────────

async function seedCommunity() {
  // Public profiles
  const b1 = db.batch();
  for (const u of USERS) {
    b1.set(db.collection('publicProfiles').doc(u.uid), {
      ...u,
      memberSince: daysAgo(Math.floor(Math.random() * 400 + 60)),
      updatedAt: now,
      demo: true,
    });
  }
  await b1.commit();
  console.log(`  ✓ publicProfiles: ${USERS.length}`);

  // Public trips
  const b2 = db.batch();
  for (const t of TRIPS) {
    b2.set(db.collection('publicTrips').doc(t.tripId), {
      ...t,
      createdAt: daysAgo(Math.floor(Math.random() * 14 + 1)),
      updatedAt: now,
      demo: true,
    });
  }
  await b2.commit();
  console.log(`  ✓ publicTrips: ${TRIPS.length}`);

  // Travel groups
  const b3 = db.batch();
  for (const g of GROUPS) {
    b3.set(db.collection('travelGroups').doc(g.groupId), {
      ...g,
      createdAt: daysAgo(Math.floor(Math.random() * 30 + 5)),
      updatedAt: now,
      demo: true,
    });
  }
  await b3.commit();
  console.log(`  ✓ travelGroups: ${GROUPS.length}`);

  // Activity feed (in two batches)
  const half = Math.ceil(FEED.length / 2);
  const b4a = db.batch();
  for (const f of FEED.slice(0, half)) {
    b4a.set(db.collection('activityFeed').doc(f.feedItemId), { ...f, demo: true });
  }
  await b4a.commit();
  const b4b = db.batch();
  for (const f of FEED.slice(half)) {
    b4b.set(db.collection('activityFeed').doc(f.feedItemId), { ...f, demo: true });
  }
  await b4b.commit();
  console.log(`  ✓ activityFeed: ${FEED.length}`);

  // Nearby travelers
  const b5 = db.batch();
  for (const n of NEARBY) {
    b5.set(db.collection('nearbyTravelers').doc(n.uid), n);
  }
  await b5.commit();
  console.log(`  ✓ nearbyTravelers: ${NEARBY.length}`);

  // Pending join requests
  const b6 = db.batch();
  for (const r of TRIP_JOIN_REQUESTS) {
    b6.set(db.collection('tripJoinRequests').doc(r.requestId), {
      ...r,
      updatedAt: r.createdAt,
      demo: true,
    });
  }
  for (const r of GROUP_JOIN_REQUESTS) {
    b6.set(db.collection('groupJoinRequests').doc(r.requestId), {
      ...r,
      updatedAt: r.createdAt,
      demo: true,
    });
  }
  await b6.commit();
  console.log(`  ✓ tripJoinRequests: ${TRIP_JOIN_REQUESTS.length} pending`);
  console.log(`  ✓ groupJoinRequests: ${GROUP_JOIN_REQUESTS.length} pending`);
}

async function seedChatsForCurrentUser(uid: string) {
  console.log(`\n  Seeding chats for uid: ${uid}`);

  // ── 5 direct chats ─────────────────────────────────────────────────

  const DIRECT_CONVERSATIONS: Array<{
    demoUid: string;
    demoName: string;
    messages: Array<{ senderId: string; senderName: string; text: string; minsBack: number }>;
  }> = [
    {
      demoUid: 'demo_user_01', demoName: 'Sarah Johnson',
      messages: [
        { senderId: 'demo_user_01', senderName: 'Sarah Johnson', text: 'Hey! Are you still planning Iceland? 🌋', minsBack: 55 },
        { senderId: uid, senderName: 'Me', text: 'Yes! Looking at late November for the northern lights', minsBack: 48 },
        { senderId: 'demo_user_01', senderName: 'Sarah Johnson', text: 'Perfect timing! I might be there around then too', minsBack: 40 },
        { senderId: uid, senderName: 'Me', text: 'We should coordinate — I\'m doing the full ring road over 14 days', minsBack: 32 },
        { senderId: 'demo_user_01', senderName: 'Sarah Johnson', text: 'That\'s exactly my plan. Any gear recommendations?', minsBack: 20 },
        { senderId: uid, senderName: 'Me', text: 'Definitely warm layers, waterproof everything, and a good tripod for night shots', minsBack: 8 },
      ],
    },
    {
      demoUid: 'demo_user_03', demoName: 'Priya Sharma',
      messages: [
        { senderId: 'demo_user_03', senderName: 'Priya Sharma', text: 'I\'m looking at Utah parks in September. Zion, Bryce, Arches?', minsBack: 480 },
        { senderId: uid, senderName: 'Me', text: 'Definitely do all three! Bryce at sunrise is unreal', minsBack: 465 },
        { senderId: 'demo_user_03', senderName: 'Priya Sharma', text: 'Did you get the Arches timed entry permit?', minsBack: 450 },
        { senderId: uid, senderName: 'Me', text: 'Yes — book exactly 3 months ahead, they sell out fast', minsBack: 435 },
        { senderId: 'demo_user_03', senderName: 'Priya Sharma', text: 'Thanks for the heads up! Also — want to share a 4WD rental?', minsBack: 420 },
      ],
    },
    {
      demoUid: 'demo_user_02', demoName: 'Alex Chen',
      messages: [
        { senderId: 'demo_user_02', senderName: 'Alex Chen', text: 'Bali coworking spots are amazing right now 🌴', minsBack: 1440 },
        { senderId: uid, senderName: 'Me', text: 'Which ones are you working from? Dojo or Outpost?', minsBack: 1430 },
        { senderId: 'demo_user_02', senderName: 'Alex Chen', text: 'Outpost is better for focus, Dojo is more social', minsBack: 1420 },
        { senderId: uid, senderName: 'Me', text: 'What\'s the internet speed like?', minsBack: 1410 },
        { senderId: 'demo_user_02', senderName: 'Alex Chen', text: '100mbps+, very reliable. Way better than SE Asia average', minsBack: 1400 },
      ],
    },
    {
      demoUid: 'demo_user_05', demoName: 'Emma Clarke',
      messages: [
        { senderId: 'demo_user_05', senderName: 'Emma Clarke', text: 'Do you prefer hostels or guesthouses?', minsBack: 2880 },
        { senderId: uid, senderName: 'Me', text: 'Guesthouses when the price difference is small', minsBack: 2860 },
        { senderId: 'demo_user_05', senderName: 'Emma Clarke', text: 'Same! For Vietnam I\'ve been using Booking.com for smaller places', minsBack: 2840 },
        { senderId: uid, senderName: 'Me', text: 'Any hostel recommendations in Hanoi?', minsBack: 2820 },
        { senderId: 'demo_user_05', senderName: 'Emma Clarke', text: 'Old Quarter Hostel is solid. Central, clean, nice roof bar', minsBack: 2800 },
      ],
    },
    {
      demoUid: 'demo_user_06', demoName: 'Carlos Ruiz',
      messages: [
        { senderId: 'demo_user_06', senderName: 'Carlos Ruiz', text: 'Let\'s compare camera gear before Patagonia! What are you bringing?', minsBack: 4320 },
        { senderId: uid, senderName: 'Me', text: 'Sony A7IV + 16-35 and 70-200. Thinking about renting a drone there', minsBack: 4300 },
        { senderId: 'demo_user_06', senderName: 'Carlos Ruiz', text: 'Smart. I\'m bringing the same plus a tilt-shift for landscape work', minsBack: 4280 },
        { senderId: uid, senderName: 'Me', text: 'Have you done the W Circuit before?', minsBack: 4260 },
        { senderId: 'demo_user_06', senderName: 'Carlos Ruiz', text: 'Twice. Weather is everything — pack for all seasons in one day 😂', minsBack: 4240 },
        { senderId: uid, senderName: 'Me', text: 'How many days minimum for the full W?', minsBack: 4220 },
      ],
    },
  ];

  for (const conv of DIRECT_CONVERSATIONS) {
    const cid = chatId(uid, conv.demoUid);
    const lastMsg = conv.messages[conv.messages.length - 1];
    const lastMsgTs = minsAgo(lastMsg.minsBack);

    // Create direct_chat doc
    await db.collection('direct_chats').doc(cid).set({
      participants: [uid, conv.demoUid].sort(),
      participantInfo: {
        [uid]: { name: 'Me', initials: 'ME' },
        [conv.demoUid]: { name: conv.demoName, initials: initials(conv.demoName) },
      },
      lastMessage: { text: lastMsg.text, senderId: lastMsg.senderId, sentAt: lastMsgTs },
      updatedAt: lastMsgTs,
      unreadCounts: { [uid]: lastMsg.senderId !== uid ? 1 : 0, [conv.demoUid]: 0 },
      demo: true,
    });

    // Create messages subcollection
    const msgBatch = db.batch();
    conv.messages.forEach((m, idx) => {
      const msgRef = db.collection('direct_chats').doc(cid).collection('messages').doc(`demo_msg_${idx}`);
      msgBatch.set(msgRef, {
        senderId: m.senderId,
        text: m.text,
        sentAt: minsAgo(m.minsBack),
        clientId: `demo_msg_${idx}`,
        demo: true,
      });
    });
    await msgBatch.commit();
  }
  console.log(`  ✓ direct_chats: ${DIRECT_CONVERSATIONS.length} (with messages)`);

  // ── 3 group chats ──────────────────────────────────────────────────

  const GROUP_CHATS = [
    {
      groupId: 'demo_chat_group_01',
      name: 'Japan 2027 Travelers',
      createdBy: 'demo_user_08',
      members: [uid, 'demo_user_08', 'demo_user_01', 'demo_user_10'],
      memberNames: { [uid]: 'Me', 'demo_user_08': 'Ryan Torres', 'demo_user_01': 'Sarah Johnson', 'demo_user_10': 'Sofia Rossi' },
      messages: [
        { senderId: 'demo_user_08', senderName: 'Ryan Torres', text: 'Anyone know if the JR Pass is worth it for 2027?', minsBack: 720 },
        { senderId: 'demo_user_10', senderName: 'Sofia Rossi', text: 'Depends on itinerary — for Tokyo-Kyoto-Osaka, definitely yes', minsBack: 700 },
        { senderId: 'demo_user_01', senderName: 'Sarah Johnson', text: 'I did it last year, saved a lot on Shinkansen 🚅', minsBack: 680 },
        { senderId: uid, senderName: 'Me', text: 'What about the regional Kansai pass?', minsBack: 660 },
        { senderId: 'demo_user_08', senderName: 'Ryan Torres', text: 'Kansai pass is better if you\'re only in that region — much cheaper', minsBack: 640 },
      ],
    },
    {
      groupId: 'demo_chat_group_02',
      name: 'Bali Digital Nomads',
      createdBy: 'demo_user_09',
      members: [uid, 'demo_user_09', 'demo_user_02'],
      memberNames: { [uid]: 'Me', 'demo_user_09': 'Mei Tan', 'demo_user_02': 'Alex Chen' },
      messages: [
        { senderId: 'demo_user_09', senderName: 'Mei Tan', text: 'Anyone know the current coworking situation in Canggu? 🏄', minsBack: 1200 },
        { senderId: 'demo_user_02', senderName: 'Alex Chen', text: 'Outpost just reopened their rooftop. Really good vibes', minsBack: 1180 },
        { senderId: uid, senderName: 'Me', text: 'What\'s a realistic 3-month villa share budget per room?', minsBack: 1160 },
        { senderId: 'demo_user_09', senderName: 'Mei Tan', text: '$600–800/month for a room in a 4-bed villa split', minsBack: 1140 },
      ],
    },
    {
      groupId: 'demo_chat_group_03',
      name: 'USA National Parks Crew',
      createdBy: 'demo_user_04',
      members: [uid, 'demo_user_04', 'demo_user_01'],
      memberNames: { [uid]: 'Me', 'demo_user_04': 'David Walsh', 'demo_user_01': 'Sarah Johnson' },
      messages: [
        { senderId: 'demo_user_04', senderName: 'David Walsh', text: 'Anyone going to Arches in September? Permit system is brutal', minsBack: 2000 },
        { senderId: uid, senderName: 'Me', text: 'Got a sunrise slot! Book exactly 3 months ahead', minsBack: 1980 },
        { senderId: 'demo_user_01', senderName: 'Sarah Johnson', text: 'Angel\'s Landing at Zion is the same — need to plan ahead', minsBack: 1960 },
        { senderId: 'demo_user_04', senderName: 'David Walsh', text: 'Worth it for both. Nothing beats Delicate Arch at golden hour 🌅', minsBack: 1940 },
        { senderId: uid, senderName: 'Me', text: 'Are we sharing the 4WD? Would cut costs massively', minsBack: 1920 },
      ],
    },
  ];

  for (const g of GROUP_CHATS) {
    const lastMsg = g.messages[g.messages.length - 1];
    const lastTs = minsAgo(lastMsg.minsBack);
    const memberInfo: Record<string, { name: string; initials: string }> = {};
    for (const [mid, name] of Object.entries(g.memberNames)) {
      memberInfo[mid] = { name, initials: initials(name) };
    }

    await db.collection('groups').doc(g.groupId).set({
      name: g.name,
      createdBy: g.createdBy,
      members: g.members,
      memberInfo,
      tripId: null,
      lastMessage: { text: lastMsg.text, senderId: lastMsg.senderId, senderName: lastMsg.senderName, sentAt: lastTs },
      updatedAt: lastTs,
      unreadCounts: Object.fromEntries(g.members.map((m) => [m, m === uid && lastMsg.senderId !== uid ? 1 : 0])),
      createdAt: minsAgo(lastMsg.minsBack + 30),
      demo: true,
    });

    const msgBatch = db.batch();
    g.messages.forEach((m, idx) => {
      const msgRef = db.collection('groups').doc(g.groupId).collection('messages').doc(`demo_gmsg_${idx}`);
      msgBatch.set(msgRef, {
        senderId: m.senderId,
        senderName: m.senderName,
        text: m.text,
        type: 'user',
        sentAt: minsAgo(m.minsBack),
        clientId: `demo_gmsg_${idx}`,
        demo: true,
      });
    });
    await msgBatch.commit();
  }
  console.log(`  ✓ group chats (groups): ${GROUP_CHATS.length} (with messages)`);

  // ── Pending requests owned by current user ─────────────────────────

  const MY_TRIP_REQUESTS = [
    { requestId: `demo_mytripA_demo_user_01`, tripId: 'demo_mytripA', tripTitle: 'Iceland Ring Road (My Trip)', tripDestination: 'Iceland', ownerUid: uid, requestorUid: 'demo_user_01', requestorName: 'Sarah Johnson', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_01', requestorBio: 'Solo female traveler. 34 countries. Sunrise hiker.', message: 'I\'m a landscape photographer heading to Iceland! Would love to join your crew.', status: 'pending', createdAt: hoursAgo(2) },
    { requestId: `demo_mytripA_demo_user_03`, tripId: 'demo_mytripA', tripTitle: 'Iceland Ring Road (My Trip)', tripDestination: 'Iceland', ownerUid: uid, requestorUid: 'demo_user_03', requestorName: 'Priya Sharma', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_03', requestorBio: 'Adventure traveler, Everest Base Camp veteran.', message: 'I have my own camping gear and can share driving duties!', status: 'pending', createdAt: hoursAgo(6) },
  ];

  const MY_GROUP_REQUESTS = [
    { requestId: `demo_mygroupA_demo_user_07`, groupId: 'demo_mygroupA', groupName: 'My Adventure Group', ownerUid: uid, requestorUid: 'demo_user_07', requestorName: 'Lisa Hoffmann', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_07', message: 'Ultra-trail runner from Munich. I\'d add value to any serious hiking group.', status: 'pending', createdAt: hoursAgo(4) },
    { requestId: `demo_mygroupA_demo_user_04`, groupId: 'demo_mygroupA', groupName: 'My Adventure Group', ownerUid: uid, requestorUid: 'demo_user_04', requestorName: 'David Walsh', requestorPhotoURL: 'https://i.pravatar.cc/150?u=demo_user_04', message: 'Van-lifer and road trip veteran. Looking for a group to explore National Parks with.', status: 'pending', createdAt: daysAgo(1) },
  ];

  const b7 = db.batch();
  for (const r of MY_TRIP_REQUESTS) {
    b7.set(db.collection('tripJoinRequests').doc(r.requestId), { ...r, updatedAt: r.createdAt, demo: true });
  }
  for (const r of MY_GROUP_REQUESTS) {
    b7.set(db.collection('groupJoinRequests').doc(r.requestId), { ...r, updatedAt: r.createdAt, demo: true });
  }
  await b7.commit();
  console.log(`  ✓ pending trip requests for YOU: ${MY_TRIP_REQUESTS.length}`);
  console.log(`  ✓ pending group requests for YOU: ${MY_GROUP_REQUESTS.length}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n[seed] Starting community demo seed...');
  console.log(`  DEMO_CURRENT_UID: ${CURRENT_UID ? CURRENT_UID : 'not set (chats will be skipped)'}\n`);

  await seedCommunity();

  if (CURRENT_UID) {
    await seedChatsForCurrentUser(CURRENT_UID);
  } else {
    console.log('\n  ⚠ Chats not seeded. Set DEMO_CURRENT_UID to seed direct/group chats for your account.');
  }

  console.log('\n[seed] ✅ Complete!\n');
  console.log('Collections written:');
  console.log(`  publicProfiles   — ${USERS.length} travelers`);
  console.log(`  publicTrips      — ${TRIPS.length} trips`);
  console.log(`  travelGroups     — ${GROUPS.length} groups`);
  console.log(`  activityFeed     — ${FEED.length} items`);
  console.log(`  nearbyTravelers  — ${NEARBY.length} travelers`);
  console.log(`  tripJoinRequests — ${TRIP_JOIN_REQUESTS.length} pending (demo users)`);
  console.log(`  groupJoinRequests— ${GROUP_JOIN_REQUESTS.length} pending (demo users)`);
  if (CURRENT_UID) {
    console.log(`  direct_chats     — 5 (for ${CURRENT_UID.slice(0, 8)}...)`);
    console.log(`  groups           — 3 chat groups`);
    console.log(`  tripJoinRequests — 2 pending for your account`);
    console.log(`  groupJoinRequests— 2 pending for your account`);
  }
  console.log('\nAll docs carry demo:true — run cleanupCommunityDemo.ts to remove.\n');
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});

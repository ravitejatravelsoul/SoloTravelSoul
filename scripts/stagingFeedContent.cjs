// Content for the staging demo feed (scripts/seedStagingFeed.cjs). STAGING ONLY.
//
// Every traveler is fictional and named "(Demo)"; every post and journal carries the
// #demo hashtag. Photos are generated locally by scripts/stagingFeedImages.py (no
// third-party photos). No business is named or rated: these are not reviews.
// Keys are stable: changing a key creates new content on the next run. Journal text
// (body, read time) is synced in place on the next run; other text of existing content is not.
// Journal bodies are plain text: the app shows them as written (no Markdown rendering).

const SEED_ID = 'sts-demo-feed-v1';

const TRAVELERS = [
  { key: 't1', name: 'Maya Okafor (Demo)', city: 'Lisbon', country: 'Portugal', styles: ['budget', 'food'], interests: ['food', 'photography', 'languages'],
    visited: ['Portugal', 'Spain', 'Morocco', 'Georgia'], bio: 'Demo profile (fictional). Slow travel on a small budget, always looking for the next viewpoint and the best-value lunch.' },
  { key: 't2', name: 'Tomas Lindqvist (Demo)', city: 'Reykjavik', country: 'Iceland', styles: ['adventure', 'eco'], interests: ['hiking', 'photography'],
    visited: ['Iceland', 'Norway', 'New Zealand', 'Canada'], bio: 'Demo profile (fictional). Long walks, cold water, and early starts for the light.' },
  { key: 't3', name: 'Priya Raman (Demo)', city: 'Kyoto', country: 'Japan', styles: ['cultural', 'solo'], interests: ['history', 'art', 'yoga'],
    visited: ['Japan', 'Vietnam', 'India', 'Portugal'], bio: 'Demo profile (fictional). Temples at opening time, tea in the afternoon, sketchbook always in the bag.' },
  { key: 't4', name: 'Diego Fuentes (Demo)', city: 'Cusco', country: 'Peru', styles: ['adventure', 'budget'], interests: ['hiking', 'history', 'music'],
    visited: ['Peru', 'Mexico', 'Chile', 'Iceland'], bio: 'Demo profile (fictional). High passes, slow buses and a guitar that has seen eleven countries.' },
  { key: 't5', name: 'Amara Haddad (Demo)', city: 'Marrakech', country: 'Morocco', styles: ['cultural', 'food'], interests: ['art', 'food', 'photography'],
    visited: ['Morocco', 'Portugal', 'South Africa', 'Georgia'], bio: 'Demo profile (fictional). Colour, crafts and courtyards. I travel for the markets.' },
  { key: 't6', name: 'Kenji Mori (Demo)', city: 'Hanoi', country: 'Vietnam', styles: ['digital-nomad', 'food'], interests: ['food', 'nightlife', 'languages'],
    visited: ['Vietnam', 'Japan', 'Mexico', 'Peru'], bio: 'Demo profile (fictional). Working remotely from a different street-food city every month.' },
  { key: 't7', name: 'Lena Kowalska (Demo)', city: 'Tbilisi', country: 'Georgia', styles: ['eco', 'solo'], interests: ['hiking', 'volunteering', 'history'],
    visited: ['Georgia', 'Iceland', 'Japan', 'Canada'], bio: 'Demo profile (fictional). Overland where possible, mountains where available.' },
  { key: 't8', name: 'Sofia Marchetti (Demo)', city: 'Cape Town', country: 'South Africa', styles: ['solo', 'adventure'], interests: ['beach', 'photography', 'sports'],
    visited: ['South Africa', 'New Zealand', 'Portugal', 'Mexico'], bio: 'Demo profile (fictional). Ocean mornings, mountain afternoons, sunsets wherever I end up.' },
];

// scene → generator style in stagingFeedImages.py
const POSTS = [
  { key: 'p01', by: 't1', loc: 'Lisbon', country: 'Portugal', type: 'photo', scenes: ['city'], tags: ['lisbon', 'viewpoints'],
    caption: 'Golden hour over the rooftops after climbing every hill in Alfama. My legs disagree, my camera roll does not.' },
  { key: 'p02', by: 't1', loc: 'Porto', country: 'Portugal', type: 'carousel', scenes: ['harbor', 'street'], tags: ['porto', 'riverside'],
    caption: 'Two days in Porto: river walks at sunrise and tiled streets in the afternoon. Swipe for the quiet side of town.' },
  { key: 'p03', by: 't1', loc: 'Sintra', country: 'Portugal', type: 'hidden_gem', scenes: ['forest'], tags: ['daytrip', 'hiking'],
    caption: 'Skipped the queue and took the forest trail instead. Mist, moss and not another person for an hour.' },
  { key: 'p04', by: 't2', loc: 'Reykjavik', country: 'Iceland', type: 'photo', scenes: ['aurora'], tags: ['aurora', 'nightsky'],
    caption: 'Third night of waiting, finally a sky worth staying up for. Dress warmer than you think you need to.' },
  { key: 'p05', by: 't2', loc: 'Vik', country: 'Iceland', type: 'photo', scenes: ['beach_dark'], tags: ['coast', 'roadtrip'],
    caption: 'Black sand, loud waves and a wind that rearranges your plans. Stay well back from the water here.' },
  { key: 'p06', by: 't2', loc: 'Queenstown', country: 'New Zealand', type: 'carousel', scenes: ['mountain', 'lake'], tags: ['hiking', 'lakes'],
    caption: 'A ridge walk above the lake, then a very cold swim. Both worth it.' },
  { key: 'p07', by: 't3', loc: 'Kyoto', country: 'Japan', type: 'photo', scenes: ['temple'], tags: ['kyoto', 'temples'],
    caption: 'Arrived at opening time and had the garden almost to myself. The early start is the whole trick.' },
  { key: 'p08', by: 't3', loc: 'Nara', country: 'Japan', type: 'memory', scenes: ['forest'], tags: ['daytrip', 'parks'],
    caption: 'An easy day trip: shaded paths, old lanterns and a long, slow lunch.' },
  { key: 'p09', by: 't3', loc: 'Hoi An', country: 'Vietnam', type: 'photo', scenes: ['lanterns'], tags: ['lanterns', 'nightwalk'],
    caption: 'The old town after dark is pure lantern light. Walk it twice: once at dusk, once late.' },
  { key: 'p10', by: 't4', loc: 'Cusco', country: 'Peru', type: 'photo', scenes: ['terraces'], tags: ['andes', 'altitude'],
    caption: 'Acclimatising properly this time: two slow days in Cusco before any trail. Coca tea and patience.' },
  { key: 'p11', by: 't4', loc: 'Sacred Valley', country: 'Peru', type: 'carousel', scenes: ['mountain', 'terraces'], tags: ['hiking', 'andes'],
    caption: 'Valley views from the terraces. Swipe for the pass we crossed the next morning.' },
  { key: 'p12', by: 't4', loc: 'Oaxaca', country: 'Mexico', type: 'food', scenes: ['market'], tags: ['streetfood', 'markets'],
    caption: 'Market breakfast, three kinds of salsa and a seat at the shared table. Best way to start a day here.' },
  { key: 'p13', by: 't5', loc: 'Marrakech', country: 'Morocco', type: 'photo', scenes: ['market'], tags: ['souks', 'colour'],
    caption: 'Lost in the souks on purpose. Every turn is a different colour.' },
  { key: 'p14', by: 't5', loc: 'Merzouga', country: 'Morocco', type: 'photo', scenes: ['desert'], tags: ['desert', 'sunrise'],
    caption: 'Up at 5 for sunrise over the dunes. The sand is cold and the silence is total.' },
  { key: 'p15', by: 't5', loc: 'Chefchaouen', country: 'Morocco', type: 'hidden_gem', scenes: ['street'], tags: ['bluecity', 'walking'],
    caption: 'Blue walls, steep stairs and cats on every step. Go early before the day-trippers arrive.' },
  { key: 'p16', by: 't6', loc: 'Hanoi', country: 'Vietnam', type: 'food', scenes: ['street'], tags: ['streetfood', 'hanoi'],
    caption: 'Plastic stools, a steaming bowl and traffic flowing around everything. My office for the month is two blocks away.' },
  { key: 'p17', by: 't6', loc: 'Ha Long Bay', country: 'Vietnam', type: 'photo', scenes: ['karst'], tags: ['islands', 'boats'],
    caption: 'Kayaked between the karsts at sunrise. Laptop stayed on the boat for once.' },
  { key: 'p18', by: 't6', loc: 'Mexico City', country: 'Mexico', type: 'photo', scenes: ['city'], tags: ['nomad', 'citylife'],
    caption: 'Rooftop co-working with a view of the whole city. Afternoon storms right on schedule.' },
  { key: 'p19', by: 't7', loc: 'Tbilisi', country: 'Georgia', type: 'photo', scenes: ['city'], tags: ['oldtown', 'balconies'],
    caption: 'Wooden balconies and sulphur-bath domes in the old town. Easy to spend a week here.' },
  { key: 'p20', by: 't7', loc: 'Kazbegi', country: 'Georgia', type: 'carousel', scenes: ['mountain', 'church'], tags: ['caucasus', 'hiking'],
    caption: 'The hilltop church under a mountain that hides in cloud most days. We got lucky for ten minutes.' },
  { key: 'p21', by: 't7', loc: 'Banff', country: 'Canada', type: 'photo', scenes: ['lake'], tags: ['lakes', 'reflections'],
    caption: 'Paddled out before the wind picked up. Mirror-flat water for about twenty minutes.' },
  { key: 'p22', by: 't8', loc: 'Cape Town', country: 'South Africa', type: 'photo', scenes: ['mountain_sea'], tags: ['tablemountain', 'sunset'],
    caption: 'Sunset from the ridge with the whole bay below. Bring a headlamp for the walk down.' },
  { key: 'p23', by: 't8', loc: 'Cape Peninsula', country: 'South Africa', type: 'photo', scenes: ['beach'], tags: ['coast', 'roadtrip'],
    caption: 'Coastal road trip day: four beaches, one flat tyre and plenty of time to watch the surf.' },
  { key: 'p24', by: 't8', loc: 'Wanaka', country: 'New Zealand', type: 'photo', scenes: ['lake'], tags: ['lakes', 'calm'],
    caption: 'One tree, one lake, a lot of patience waiting for the light. Worth the early alarm.' },
];

const JOURNALS = [
  { key: 'j1', by: 't1', loc: 'Lisbon', country: 'Portugal', title: 'Seven days in Lisbon on a small budget', subtitle: 'Demo journal: viewpoints, trams and cheap lunches',
    scenes: ['city', 'harbor', 'street'], tags: ['lisbon', 'budget'],
    body: `Why Lisbon
I wanted a city I could walk, eat well in, and not overspend. Lisbon was all three.

Getting around
I walked almost everywhere and used the metro for the longer hops. The hills are steep, so plan routes that go downhill in the afternoon.

Where the days went
• Mornings at viewpoints before the crowds
• Long lunches at small neighbourhood places with a fixed daily menu
• Evenings by the river watching the light change

What I would do differently
Stay longer. A week is enough to see the city, not enough to settle into it.

This is a demo journal written for testing the app. The traveler is fictional.` },
  { key: 'j2', by: 't2', loc: 'South Coast', country: 'Iceland', title: 'Chasing light along the south coast', subtitle: 'Demo journal: five days, one small car, a lot of weather',
    scenes: ['beach_dark', 'aurora', 'mountain'], tags: ['iceland', 'roadtrip'],
    body: `The plan
Five days driving east from the capital, stopping wherever the light looked good.

Weather rules everything
Check the road and weather reports every morning. Twice I changed the whole day's plan before breakfast.

Highlights
• Waterfalls that you hear long before you see them
• A black-sand beach in a gale
• One clear night with the aurora overhead

Practical notes
Fuel up whenever you can, pack layers, and never turn your back on the sea.

This is a demo journal written for testing the app. The traveler is fictional.` },
  { key: 'j3', by: 't3', loc: 'Kyoto', country: 'Japan', title: 'Kyoto at opening time', subtitle: 'Demo journal: a slow week of temples and gardens',
    scenes: ['temple', 'forest', 'lanterns'], tags: ['kyoto', 'slowtravel'],
    body: `The early start
Most temples open early and fill up by mid-morning. I set my alarm for six every day and had the gardens almost to myself.

A loose daily rhythm
• One major sight at opening time
• A long walk through a quieter neighbourhood
• Tea, sketching and an early night

Small things that helped
A transport card, comfortable shoes you can slip off quickly, and a small notebook for the names of places I wanted to remember.

This is a demo journal written for testing the app. The traveler is fictional.` },
  { key: 'j4', by: 't7', loc: 'Caucasus', country: 'Georgia', title: 'Overland through the Caucasus', subtitle: 'Demo journal: shared minibuses and mountain villages',
    scenes: ['mountain', 'church', 'city'], tags: ['georgia', 'overland'],
    body: `Leaving the city
From Tbilisi I took shared minibuses north. They leave when they are full, so bring patience and snacks.

Mountain villages
Guesthouses were simple, warm and generous with dinner. Most trails start right from the village.

Hiking notes
• Start early; clouds build after midday
• Carry water and a warm layer even in summer
• Ask locally about trail conditions

Back to the city
Two weeks felt short. I am already planning the next route.

This is a demo journal written for testing the app. The traveler is fictional.` },
];

// Follows: [follower, following]
const FOLLOWS = [
  ['t1', 't3'], ['t1', 't5'], ['t1', 't8'], ['t1', 't7'],
  ['t2', 't4'], ['t2', 't7'], ['t2', 't8'],
  ['t3', 't1'], ['t3', 't6'], ['t3', 't5'],
  ['t4', 't2'], ['t4', 't6'], ['t4', 't1'],
  ['t5', 't1'], ['t5', 't3'], ['t5', 't8'], ['t5', 't6'],
  ['t6', 't3'], ['t6', 't4'], ['t6', 't1'],
  ['t7', 't2'], ['t7', 't1'], ['t7', 't4'],
  ['t8', 't1'], ['t8', 't2'], ['t8', 't5'], ['t8', 't7'],
];

// Likes: deterministic spread, 1–6 per post, never by the author.
function likesFor(post, index) {
  const others = TRAVELERS.map((t) => t.key).filter((k) => k !== post.by);
  const n = 1 + ((index * 5 + 3) % 6);
  return Array.from({ length: n }, (_, i) => others[(index * 3 + i * 2) % others.length]).filter((k, i, a) => a.indexOf(k) === i);
}
const JOURNAL_LIKES = { j1: ['t3', 't5', 't8'], j2: ['t4', 't7', 't8', 't1'], j3: ['t1', 't6'], j4: ['t2', 't4', 't1'] };

// Comments: [postKey, commentKey, author, text, replyTo?]
const COMMENTS = [
  ['p01', 'c01', 't3', 'That light! Which viewpoint is this?'],
  ['p01', 'c02', 't1', 'The one at the very top of the hill, right after the tram stop. Worth the climb.', 'c01'],
  ['p01', 'c03', 't5', 'Saving this for my spring trip.'],
  ['p04', 'c04', 't8', 'Three nights of waiting is dedication. Worth it though.'],
  ['p04', 'c05', 't2', 'Thanks! The forecast apps helped, but mostly it was luck.', 'c04'],
  ['p06', 'c06', 't7', 'How cold was the swim, honestly?'],
  ['p06', 'c07', 't2', 'Breath-taking, in the literal sense.', 'c06'],
  ['p07', 'c08', 't6', 'Opening time is the secret for everything in Kyoto.'],
  ['p09', 'c09', 't1', 'Adding Hoi An to the list right now.'],
  ['p10', 'c10', 't2', 'Good call on acclimatising first. How did you feel on day three?'],
  ['p10', 'c11', 't4', 'Much better. Slow walking and lots of water.', 'c10'],
  ['p12', 'c12', 't6', 'Shared tables are the best part of market breakfasts.'],
  ['p13', 'c13', 't1', 'The colours are unreal. Did you get properly lost?'],
  ['p13', 'c14', 't5', 'Every single day, on purpose.', 'c13'],
  ['p14', 'c15', 't8', 'Desert sunrise is on my list. How cold did it get?'],
  ['p16', 'c16', 't3', 'This is exactly how I picture a perfect work lunch.'],
  ['p16', 'c17', 't4', 'Which month were you there? Thinking about going.'],
  ['p16', 'c18', 't6', 'October. Cooler evenings and not too much rain.', 'c17'],
  ['p17', 'c19', 't2', 'Kayaking is the right way to see it.'],
  ['p20', 'c20', 't4', 'Ten minutes of clear sky is more than most people get.'],
  ['p20', 'c21', 't1', 'Adding this hike to my Georgia plans.'],
  ['p21', 'c22', 't8', 'Mirror-flat water is worth any early alarm.'],
  ['p22', 'c23', 't7', 'Great tip about the headlamp.'],
  ['p22', 'c24', 't1', 'One day! This view is on my list.'],
  ['p24', 'c25', 't3', 'Patience paid off. Beautiful.'],
];
const JOURNAL_COMMENTS = [];

module.exports = { SEED_ID, TRAVELERS, POSTS, JOURNALS, FOLLOWS, COMMENTS, JOURNAL_COMMENTS, likesFor, JOURNAL_LIKES };

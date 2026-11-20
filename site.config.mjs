// Site settings and the hand-written content Hostfully doesn't hold.
// Facts about each home (beds, baths, photos, amenities, rates) come from Hostfully at build time.

export const site = {
  name: '12 Point Getaways',
  domain: 'https://12pointgetaways.com',
  city: 'Oklahoma City',
  region: 'OK',
  // Shown in the footer and in schema.org data. Fill in before launch.
  phone: '',
  email: '',
  googleBusinessProfileUrl: '', // the management company's GBP link
  sameAs: [], // Airbnb / Vrbo / Instagram profile URLs
  ghlFormAction: '', // 12 Point Homes GHL form endpoint for email signups
  cancellation: 'Full refund if you cancel 14 or more days before check-in. 50% refund inside 14 days.',
};

// The six homes on the site, in the order shown. Anything not listed here stays off the site.
// intro = the first paragraph on the page: a short, factual answer written for Google and AI assistants.
export const homes = [
  {
    uid: '7dff159e-986d-409f-9c42-7a992909525a',
    slug: 'sunset-at-65th-whole-house',
    seoTitle: 'Sunset at 65th: 4BR OKC Rental, Hot Tub, Sleeps 12',
    name: 'Sunset at 65th: Whole House',
    headline: '4-bedroom home with hot tub and firepit near Lake Hefner, sleeps 12',
    area: 'NW 65th St, near Lake Hefner',
    tag: 'Hot tub · 2 kitchens',
    intro: 'Sunset at 65th is a single-level, 4-bedroom home in northwest Oklahoma City that sleeps 12. It has a private hot tub, a firepit, a game room with shuffleboard and two full kitchens, and sits 8 blocks south of Lake Hefner.',
    goodFor: ['groups', 'families', 'events'],
    guides: ['lake-hefner'],
  },
  {
    uid: '788edebe-714a-4bd0-aec2-7d03ab65849a',
    slug: 'stratford-4br-hot-tub-pool-table',
    seoTitle: 'Stratford: 4BR OKC Rental with Hot Tub & Pool Table',
    name: 'Stratford',
    headline: '4-bedroom home with hot tub and pool table in NW Oklahoma City',
    area: 'Stratford Dr, NW Oklahoma City',
    tag: 'Hot tub · pool table',
    intro: 'Stratford is a single-level, 4-bedroom home in northwest Oklahoma City that sleeps 10. It has 2.5 baths, a private hot tub, a game room with a full-size pool table, and king beds with Purple mattresses.',
    goodFor: ['groups', 'families', 'events'],
    guides: [],
  },
  {
    uid: '2e9a42f7-eeed-4cf3-b8d3-19f0b2da3eb6',
    slug: 'sunset-at-65th-unit-a',
    seoTitle: 'Sunset at 65th Unit A: 3BR OKC Duplex with Hot Tub',
    name: 'Sunset at 65th: Unit A',
    headline: '3-bedroom duplex with hot tub and firepit near Lake Hefner',
    area: 'NW 65th St, near Lake Hefner',
    tag: 'Hot tub · shuffleboard',
    intro: 'Unit A at Sunset at 65th is a 3-bedroom, 2-bath duplex in northwest Oklahoma City that sleeps 8. It has a private hot tub, a firepit and a shuffleboard game room, minutes from Baptist Hospital and 8 blocks south of Lake Hefner.',
    goodFor: ['groups', 'families'],
    guides: ['lake-hefner'],
  },
  {
    uid: 'e30b60b5-94cc-48e2-877e-fa0512e77895',
    slug: 'cozy-nest-3br-theater-gaming',
    seoTitle: 'Cozy Nest: 3BR OKC Rental near Chisholm Creek',
    name: 'Cozy Nest',
    headline: '3-bedroom home with theater room and gaming near Chisholm Creek',
    area: 'NW 120th St, near Chisholm Creek',
    tag: 'Theater · gaming',
    intro: 'Cozy Nest is a single-level, 3-bedroom home in north Oklahoma City that sleeps 7. It has a theater-style living room and a PlayStation, and it is a couple of minutes from Chisholm Creek, home to Topgolf, iFLY, Main Event and Costco.',
    goodFor: ['families', 'groups'],
    guides: ['chisholm-creek'],
  },
  {
    uid: 'b502d577-0668-482d-abeb-9c7eab811132',
    slug: 'the-arches-2br-western-ave',
    seoTitle: 'The Arches: 2BR Historic Home near Western Ave, OKC',
    name: 'The Arches',
    headline: 'Restored 100-year-old 2-bedroom home near the Western Ave District',
    area: 'NW 41st St, near Western Ave',
    tag: 'Historic · firepit',
    intro: 'The Arches is a restored, 100-year-old 2-bedroom, 2-bath home in Oklahoma City that sleeps 6. It is about 13 minutes from downtown, close to the Western Avenue District, and set up for couples, small families and monthly stays.',
    goodFor: ['nurses', 'families'],
    guides: [],
  },
  {
    uid: 'a0333464-42f6-4bb5-90e7-23a30515ed2f',
    slug: 'sunset-at-65th-unit-b',
    seoTitle: 'Unit B: 1BR OKC Rental 5 Min from Baptist Hospital',
    name: 'Sunset at 65th: Unit B',
    headline: '1-bedroom duplex 5 minutes from Baptist Hospital',
    area: 'NW 65th St, near Baptist Hospital',
    tag: '5 min to Baptist Hospital',
    intro: 'Unit B at Sunset at 65th is a 1-bedroom duplex in northwest Oklahoma City that sleeps 4, about 5 minutes from Baptist Hospital and 15 minutes from OU Medical. It has a king Purple mattress, a full kitchen and a washer and dryer, and suits nurses on contract.',
    goodFor: ['nurses'],
    guides: ['lake-hefner'],
  },
];

// Local guides. Only guides with status 'published' are built. Every fact here must be checked;
// anything unconfirmed stays out rather than going in as a guess.
export const guides = [
  {
    slug: 'lake-hefner',
    status: 'published',
    title: 'Where to stay near Lake Hefner, Oklahoma City',
    place: 'Lake Hefner',
    answer: 'Our closest homes to Lake Hefner are at Sunset at 65th, 8 blocks south of the lake and its 15-mile walking and running path. You can book the whole 4-bedroom house for up to 12 guests, the 3-bedroom Unit A for 8, or the 1-bedroom Unit B for 4.',
    homes: ['sunset-at-65th-whole-house', 'sunset-at-65th-unit-a', 'sunset-at-65th-unit-b'],
    sections: [
      { h: 'Why stay near Lake Hefner', p: 'The 15-mile path around the lake is a favorite for morning runs, walks and bike rides. From Sunset at 65th you can be on it in a few minutes, and Baptist Hospital and Hwy 74 are close by too.' },
    ],
    faq: [
      { q: 'How far is Sunset at 65th from Lake Hefner?', a: 'About 8 blocks south of the lake.' },
      { q: 'Which rental near Lake Hefner fits a big group?', a: 'The Sunset at 65th whole house sleeps up to 12, with a hot tub, firepit and two kitchens.' },
      { q: 'Is there a place near Lake Hefner for a traveling nurse?', a: 'Unit B is a 1-bedroom about 5 minutes from Baptist Hospital, with a full kitchen and a washer and dryer.' },
    ],
  },
  {
    slug: 'chisholm-creek',
    status: 'published',
    title: 'Where to stay near Chisholm Creek and Topgolf OKC',
    place: 'Chisholm Creek',
    answer: 'Cozy Nest, our 3-bedroom home on NW 120th St, is a couple of minutes from Chisholm Creek, where you will find Topgolf, iFLY, Main Event and Costco. It sleeps 7 and has a theater-style living room and a PlayStation.',
    homes: ['cozy-nest-3br-theater-gaming'],
    sections: [
      { h: 'Why stay near Chisholm Creek', p: 'Chisholm Creek packs Topgolf, iFLY indoor skydiving and Main Event into one shopping and dining area, which makes it an easy base for families and groups. Cozy Nest is 1 mile west of the Broadway Extension (Hwy 77).' },
    ],
    faq: [
      { q: 'How close is Cozy Nest to Topgolf OKC?', a: 'Topgolf is in the Chisholm Creek area, a couple of minutes from Cozy Nest.' },
      { q: 'How many people does Cozy Nest sleep?', a: 'Up to 7, across a king, a queen, two full beds and a foldable foam mattress.' },
    ],
  },
  // Drafts: written and fact-checked by the content agent before publishing.
  { slug: 'edmond', status: 'draft' },
  { slug: 'midtown-okc', status: 'draft' },
  { slug: 'asian-district', status: 'draft' },
  { slug: 'classen-curve', status: 'draft' },
  { slug: 'penn-square-mall', status: 'draft' },
  { slug: 'the-oak', status: 'draft' },
];

// Friendly labels for the Hostfully amenity codes we show. Codes not listed are counted but not named.
export const amenityLabels = {
  HAS_HOT_TUB: 'Private hot tub', HAS_FIRE_PIT: 'Firepit', HAS_POOL_TABLE: 'Pool table',
  HAS_GAME_CONSOLE: 'Game console', HAS_INDOOR_FIREPLACE: 'Indoor fireplace', HAS_RECORD_PLAYER: 'Record player',
  HAS_BOARD_GAMES: 'Board games', HAS_OFFICE: 'Dedicated workspace', HAS_WIFI_SPEED_500: 'Wi-Fi, 500 Mbps',
  HAS_WIFI_SPEED_250: 'Wi-Fi, 250 Mbps', HAS_INTERNET_WIFI: 'Wi-Fi', HAS_FREE_PARKING: 'Free parking',
  HAS_WASHER: 'Washer', HAS_DRYER: 'Dryer', HAS_PACK_N_PLAY_TRAVEL_CRIB: "Pack 'n play",
  HAS_BABY_HIGH_CHAIR: 'High chair', HAS_CHILDRENS_BOOKS_AND_TOYS: "Kids' books and toys",
  HAS_OUTDOOR_PLAY_AREA: 'Outdoor play area', HAS_FENCED_YARD: 'Fenced yard', HAS_DECK_PATIO: 'Patio',
  HAS_SINGLE_LEVEL: 'Single level, no stairs', HAS_SMART_TV: 'Smart TV', HAS_TV: 'TV', HAS_KITCHEN: 'Full kitchen',
  HAS_AIR_CONDITIONING: 'Air conditioning', HAS_RAIN_SHOWER: 'Rain shower', HAS_ROOM_DARKENING_SHADES: 'Blackout shades',
  HAS_SMOKE_DETECTOR: 'Smoke detector', HAS_CARBON_MONOXIDE_DETECTOR: 'Carbon monoxide detector',
};

// Shown first, in this order, when a home has them.
export const highlightOrder = ['HAS_HOT_TUB', 'HAS_POOL_TABLE', 'HAS_FIRE_PIT', 'HAS_GAME_CONSOLE', 'HAS_INDOOR_FIREPLACE',
  'HAS_RECORD_PLAYER', 'HAS_OFFICE', 'HAS_WIFI_SPEED_500', 'HAS_WIFI_SPEED_250', 'HAS_FENCED_YARD', 'HAS_SINGLE_LEVEL',
  'HAS_PACK_N_PLAY_TRAVEL_CRIB', 'HAS_FREE_PARKING', 'HAS_WASHER'];

export const stayTypes = {
  groups: { label: 'Groups and celebrations', blurb: 'Hot tubs, firepits, pool table and shuffleboard. Sleeps up to 12.' },
  nurses: { label: 'Nurses and medical stays', blurb: '5 minutes from Baptist Hospital. Monthly stays welcome.' },
  events: { label: 'Game days and events', blurb: 'OU and OSU weekends, WCWS, Thunder games, concerts.' },
  families: { label: 'Families', blurb: "Pack 'n play, high chairs, board games and full kitchens." },
};

/**
 * Curated "complete looks" — Glow sells outcomes, not services.
 *
 * Editorial content layer: every look maps to a bookable serviceType so a tap
 * always ends in the booking flow. Prices shown in UI prefer the live catalog
 * basePrice for the mapped service; `fromPrice` is the editorial fallback.
 * Gradient pairs are placeholder art until designer photography drops into
 * `photo` (slot already read by the cards when present).
 */

export type LookCollection =
  | 'Trending'
  | 'Bridal'
  | 'Date Night'
  | 'Festival'
  | 'Natural'
  | 'Luxury'
  | 'Minimal';

export interface Look {
  id: string;
  name: string;
  vibe: string;               // one-line editorial description
  collection: LookCollection;
  occasion: string;           // moodboard grouping (Wedding, Party, Everyday…)
  serviceType: string;        // bookable service this look maps to
  includes: string[];         // what the outcome bundles
  durationMin: number;
  fromPrice: number;          // editorial fallback when catalog has no price
  products: string[];         // beauty brands typically used for this look
  from: string;               // gradient start (placeholder art)
  to: string;                 // gradient end
  photo?: string;             // designer photography slot
  coverVideo?: string;        // short looping clip, shown instead of `photo` when present
  tall?: boolean;             // masonry height variance
  // ISO 3166-1 alpha-2 countries this look is culturally specific to (e.g.
  // ['NP'] for a Nepali festival look). Omitted/undefined = universal, shown
  // to everyone. Read via mobile/src/utils/region.ts's getCountryCode() to
  // surface locally-relevant looks first on Home instead of a one-size-fits
  // -all list that skews toward whichever market it was originally written for.
  regions?: string[];
}

export const LOOKS: Look[] = [
  {
    id: 'soft-glam',
    name: 'Soft Glam',
    vibe: 'Diffused shimmer, sculpted warmth',
    collection: 'Trending',
    occasion: 'Party/Glam',
    serviceType: 'Party Makeup',
    includes: ['Makeup', 'Lashes', 'Touch-up kit'],
    durationMin: 75,
    fromPrice: 85,
    products: ['Charlotte Tilbury', 'NARS', 'Huda Beauty'],
    from: '#E9A0B1', to: '#A34D63',
    photo: 'https://images.pexels.com/photos/17566310/pexels-photo-17566310.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    coverVideo: 'https://videos.pexels.com/video-files/7585489/7585489-hd_1080_2048_25fps.mp4',
    tall: true,
  },
  {
    id: 'natural-glow',
    name: 'Natural Glow',
    vibe: 'Your skin, but rested',
    collection: 'Natural',
    occasion: 'Everyday',
    serviceType: 'Makeup',
    includes: ['Skin prep', 'Makeup', 'Brow shaping'],
    durationMin: 60,
    fromPrice: 65,
    products: ['Rare Beauty', 'Glossier', 'Ilia'],
    from: '#F0C9B4', to: '#C08A6E',
    photo: 'https://images.pexels.com/photos/2949157/pexels-photo-2949157.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'luxury-bridal',
    name: 'Luxury Bridal',
    vibe: 'The aisle deserves nothing less',
    collection: 'Bridal',
    occasion: 'Bridal',
    serviceType: 'Bridal Makeup',
    includes: ['Makeup', 'Hair', 'Lashes', 'Saree/veil setting', 'Touch-up'],
    durationMin: 180,
    fromPrice: 240,
    products: ['Dior Beauty', 'Charlotte Tilbury', 'MAC'],
    from: '#D4AF37', to: '#8E6F1E',
    photo: 'https://images.pexels.com/photos/35341784/pexels-photo-35341784.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    coverVideo: 'https://videos.pexels.com/video-files/16268879/16268879-hd_1080_1920_25fps.mp4',
    tall: true,
  },
  {
    id: 'glass-skin',
    name: 'Glass Skin',
    vibe: 'Lit from within, K-beauty finish',
    collection: 'Natural',
    occasion: 'Everyday',
    serviceType: 'Facial',
    includes: ['Deep-cleanse facial', 'Hydration mask', 'Gua sha'],
    durationMin: 70,
    fromPrice: 75,
    products: ['Laneige', 'COSRX', 'Sulwhasoo'],
    from: '#C9DCE4', to: '#7FA6B5',
    photo: 'https://images.pexels.com/photos/6811012/pexels-photo-6811012.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'korean-beauty',
    name: 'Korean Beauty',
    vibe: 'Gradient lips, dewy everything',
    collection: 'Trending',
    occasion: 'Date Night',
    serviceType: 'Makeup',
    includes: ['Skin prep', 'Makeup', 'Gradient lip'],
    durationMin: 65,
    fromPrice: 70,
    products: ['Etude', 'Rom&nd', 'Peripera'],
    from: '#F3B8C3', to: '#C4667E',
    photo: 'https://images.pexels.com/photos/6491795/pexels-photo-6491795.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'arabic-glam',
    name: 'Arabic Glam',
    vibe: 'Bold liner, unapologetic drama',
    collection: 'Luxury',
    occasion: 'Party/Glam',
    serviceType: 'Party Makeup',
    includes: ['Full glam makeup', 'Dramatic lashes', 'Contour & liner'],
    durationMin: 90,
    fromPrice: 110,
    products: ['Huda Beauty', 'MAC', 'Anastasia'],
    from: '#8E4257', to: '#3B1520',
    photo: 'https://images.pexels.com/photos/14575974/pexels-photo-14575974.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    coverVideo: 'https://videos.pexels.com/video-files/16268877/16268877-hd_1080_1920_25fps.mp4',
    tall: true,
  },
  {
    id: 'festival-glow',
    name: 'Festival Glow',
    vibe: 'Mehendi, shimmer & marigold energy',
    collection: 'Festival',
    occasion: 'Festival',
    serviceType: 'Mehendi',
    includes: ['Mehendi (both hands)', 'Festive makeup', 'Hair styling'],
    durationMin: 120,
    fromPrice: 95,
    products: ['MAC', 'Lakmé', 'Kama Ayurveda'],
    from: '#D99A6C', to: '#A3541E',
    photo: 'https://images.pexels.com/photos/14825258/pexels-photo-14825258.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'traditional-bridal',
    name: 'Traditional Bridal',
    vibe: 'Heritage red, gold-kissed',
    collection: 'Bridal',
    occasion: 'Bridal',
    serviceType: 'Bridal Makeup',
    includes: ['Bridal makeup', 'Hair & dupatta setting', 'Mehendi touch'],
    durationMin: 200,
    fromPrice: 260,
    products: ['MAC', 'Lakmé', 'Huda Beauty'],
    from: '#B03A3A', to: '#5E1414',
    photo: 'https://images.pexels.com/photos/14847827/pexels-photo-14847827.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    coverVideo: 'https://videos.pexels.com/video-files/8751964/8751964-hd_1080_2048_24fps.mp4',
    tall: true,
  },
  {
    id: 'date-night-soft',
    name: 'Soft & Radiant',
    vibe: 'Candlelight-proof glow',
    collection: 'Date Night',
    occasion: 'Date Night',
    serviceType: 'Makeup',
    includes: ['Makeup', 'Soft waves', 'Lash lift effect'],
    durationMin: 70,
    fromPrice: 80,
    products: ['Rare Beauty', 'NARS', 'Charlotte Tilbury'],
    from: '#D97A91', to: '#7E3B4D',
    photo: 'https://images.pexels.com/photos/33497564/pexels-photo-33497564.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'effortless-waves',
    name: 'Effortless Waves',
    vibe: 'Undone, expensive-looking hair',
    collection: 'Minimal',
    occasion: 'Everyday',
    serviceType: 'Hair Styling',
    includes: ['Wash & prep', 'Heat styling', 'Finishing serum'],
    durationMin: 55,
    fromPrice: 55,
    products: ['Olaplex', 'Oribe', 'Moroccanoil'],
    from: '#C08A6E', to: '#6E4A35',
    photo: 'https://images.pexels.com/photos/28833615/pexels-photo-28833615.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'monsoon-makeup',
    name: 'Monsoon Makeup',
    vibe: 'Humidity-proof, all-day set',
    collection: 'Trending',
    occasion: 'Office',
    serviceType: 'Makeup',
    includes: ['Waterproof base', 'Setting ritual', 'Smudge-proof liner'],
    durationMin: 60,
    fromPrice: 70,
    products: ['Estée Lauder', 'MAC', 'Urban Decay'],
    from: '#7FA6B5', to: '#3E5866',
    photo: 'https://images.pexels.com/photos/13018457/pexels-photo-13018457.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'reception-glam',
    name: 'Reception Glam',
    vibe: 'Second-look sparkle for the big night',
    collection: 'Bridal',
    occasion: 'Bridal',
    serviceType: 'Party Makeup',
    includes: ['Glam makeup', 'Updo or waves', 'Lashes'],
    durationMin: 110,
    fromPrice: 140,
    products: ['Dior Beauty', 'Charlotte Tilbury', 'NARS'],
    from: '#A78BFA', to: '#5B3E9E',
    photo: 'https://images.pexels.com/photos/30276787/pexels-photo-30276787.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'polished-nails',
    name: 'Polished',
    vibe: 'Glass-finish manicure moment',
    collection: 'Minimal',
    occasion: 'Everyday',
    serviceType: 'Nails',
    includes: ['Manicure', 'Cuticle care', 'Gel finish'],
    durationMin: 50,
    fromPrice: 40,
    products: ['OPI', 'Essie', 'CND'],
    from: '#E9A0B1', to: '#C4667E',
    photo: 'https://images.pexels.com/photos/3997384/pexels-photo-3997384.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'me-time-ritual',
    name: 'Me-Time Ritual',
    vibe: 'Massage, mask, exhale',
    collection: 'Luxury',
    occasion: 'Everyday',
    serviceType: 'Massage',
    includes: ['Full-body massage', 'Aromatherapy', 'Express facial'],
    durationMin: 90,
    fromPrice: 95,
    products: ['Forest Essentials', 'Kama Ayurveda', 'L’Occitane'],
    from: '#5EAAA8', to: '#2E5F5E',
    photo: 'https://images.pexels.com/photos/9146372/pexels-photo-9146372.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    coverVideo: 'https://videos.pexels.com/video-files/9335870/9335870-hd_1080_1920_25fps.mp4',
    tall: true,
  },
  {
    id: 'brow-threading',
    name: 'Brow Threading',
    vibe: 'Sharp, clean shape in minutes',
    collection: 'Minimal',
    occasion: 'Threading & Brows',
    serviceType: 'Threading',
    includes: ['Brow shaping', 'Clean-up'],
    durationMin: 20,
    fromPrice: 10,
    products: ['Anastasia Beverly Hills'],
    from: '#F0C9B4', to: '#C08A6E',
    photo: 'https://images.pexels.com/photos/29588096/pexels-photo-29588096.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'full-face-threading',
    name: 'Full Face Threading',
    vibe: 'Brows, lip, chin — all done',
    collection: 'Minimal',
    occasion: 'Threading & Brows',
    serviceType: 'Threading',
    includes: ['Brow shaping', 'Lip', 'Chin'],
    durationMin: 35,
    fromPrice: 18,
    products: [],
    from: '#E9A0B1', to: '#A34D63',
    photo: 'https://images.pexels.com/photos/15866041/pexels-photo-15866041.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },

  // ── Regional looks — culturally specific to one market, surfaced first for
  //    users detected there (see getCountryCode() in utils/region.ts) rather
  //    than competing for space in the universal list everyone sees. ──
  {
    id: 'newari-bridal',
    name: 'Newari Bridal',
    vibe: 'Heritage red-and-gold, Kathmandu Valley tradition',
    collection: 'Bridal',
    occasion: 'Bridal',
    serviceType: 'Bridal Makeup',
    includes: ['Bridal makeup', 'Haku patasi draping', 'Tilhari & jewelry setting', 'Touch-up'],
    durationMin: 180,
    fromPrice: 220,
    products: ['MAC', 'Lakmé', 'Kama Ayurveda'],
    from: '#B03A3A', to: '#5E1414',
    photo: 'https://images.pexels.com/photos/30497752/pexels-photo-30497752.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    coverVideo: 'https://videos.pexels.com/video-files/8935727/8935727-hd_1080_1920_25fps.mp4',
    tall: true,
    regions: ['NP'],
  },
  {
    id: 'teej-radiance',
    name: 'Teej Radiance',
    vibe: 'Red saree glam for the festival of fasting and dance',
    collection: 'Festival',
    occasion: 'Festival',
    serviceType: 'Makeup',
    includes: ['Festive makeup', 'Bindi & sindoor styling', 'Hair styling'],
    durationMin: 75,
    fromPrice: 65,
    products: ['Lakmé', 'MAC', 'Kama Ayurveda'],
    from: '#D99A6C', to: '#A3541E',
    photo: 'https://images.pexels.com/photos/18700114/pexels-photo-18700114.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    regions: ['NP'],
  },
  {
    id: 'tihar-tika-glow',
    name: 'Tihar Tika Glow',
    vibe: 'Marigold-bright, ready for the tika ceremony',
    collection: 'Festival',
    occasion: 'Festival',
    serviceType: 'Makeup',
    includes: ['Festive makeup', 'Tika-ready finish', 'Brow shaping'],
    durationMin: 60,
    fromPrice: 55,
    products: ['Lakmé', 'Kama Ayurveda'],
    from: '#E3B04B', to: '#8E6F1E',
    photo: 'https://images.pexels.com/photos/20268982/pexels-photo-20268982.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    regions: ['NP'],
  },
  {
    id: 'parisian-minimalism',
    name: 'Parisian Minimalism',
    vibe: '"No-makeup" makeup — skin, brows, done',
    collection: 'Natural',
    occasion: 'Everyday',
    serviceType: 'Makeup',
    includes: ['Skin prep', 'Sheer base', 'Brow shaping'],
    durationMin: 45,
    fromPrice: 60,
    products: ['Chanel', 'Nuxe', 'Bioderma'],
    from: '#EFE6DD', to: '#B9A88F',
    photo: 'https://images.pexels.com/photos/8062997/pexels-photo-8062997.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    regions: ['FR'],
  },
  {
    id: 'chic-chignon',
    name: 'Chic Chignon',
    vibe: 'The effortless French twist',
    collection: 'Minimal',
    occasion: 'Everyday',
    serviceType: 'Hair Styling',
    includes: ['Wash & prep', 'Low chignon updo', 'Finishing shine spray'],
    durationMin: 50,
    fromPrice: 50,
    products: ['Kérastase', 'Leonor Greyl'],
    from: '#C9B8A8', to: '#7A6653',
    photo: 'https://images.pexels.com/photos/31065906/pexels-photo-31065906.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    regions: ['FR'],
  },
  {
    id: 'rajasthani-bridal',
    name: 'Rajasthani Bridal',
    vibe: 'Mirror-work jewel tones, desert-royal drama',
    collection: 'Bridal',
    occasion: 'Bridal',
    serviceType: 'Bridal Makeup',
    includes: ['Bridal makeup', 'Mehendi (both hands)', 'Dupatta & jewelry setting'],
    durationMin: 210,
    fromPrice: 250,
    products: ['Lakmé', 'MAC', 'Huda Beauty'],
    from: '#8E4257', to: '#3B1520',
    photo: 'https://images.pexels.com/photos/12962719/pexels-photo-12962719.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    coverVideo: 'https://videos.pexels.com/video-files/27088082/12068266_1080_1920_50fps.mp4',
    tall: true,
    regions: ['IN'],
  },
];

export const LOOK_COLLECTIONS: LookCollection[] = [
  'Trending', 'Bridal', 'Date Night', 'Festival', 'Natural', 'Luxury', 'Minimal',
];

// Occasion/need-based grouping — this is what drives the Explore chips.
// Matches how people actually search ("bridal makeup", "threading near me")
// rather than abstract style collections.
export const LOOK_OCCASIONS = [
  'Bridal',
  'Party/Glam',
  'Everyday',
  'Date Night',
  'Festival',
  'Office',
  'Threading & Brows',
] as const;

export function lookById(id: string): Look | undefined {
  return LOOKS.find(l => l.id === id);
}

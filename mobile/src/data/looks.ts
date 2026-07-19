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
  tall?: boolean;             // masonry height variance
}

export const LOOKS: Look[] = [
  {
    id: 'soft-glam',
    name: 'Soft Glam',
    vibe: 'Diffused shimmer, sculpted warmth',
    collection: 'Trending',
    occasion: 'Party',
    serviceType: 'Party Makeup',
    includes: ['Makeup', 'Lashes', 'Touch-up kit'],
    durationMin: 75,
    fromPrice: 85,
    products: ['Charlotte Tilbury', 'NARS', 'Huda Beauty'],
    from: '#E9A0B1', to: '#A34D63',
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
  },
  {
    id: 'luxury-bridal',
    name: 'Luxury Bridal',
    vibe: 'The aisle deserves nothing less',
    collection: 'Bridal',
    occasion: 'Wedding',
    serviceType: 'Bridal Makeup',
    includes: ['Makeup', 'Hair', 'Lashes', 'Saree/veil setting', 'Touch-up'],
    durationMin: 180,
    fromPrice: 240,
    products: ['Dior Beauty', 'Charlotte Tilbury', 'MAC'],
    from: '#D4AF37', to: '#8E6F1E',
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
  },
  {
    id: 'arabic-glam',
    name: 'Arabic Glam',
    vibe: 'Bold liner, unapologetic drama',
    collection: 'Luxury',
    occasion: 'Party',
    serviceType: 'Party Makeup',
    includes: ['Full glam makeup', 'Dramatic lashes', 'Contour & liner'],
    durationMin: 90,
    fromPrice: 110,
    products: ['Huda Beauty', 'MAC', 'Anastasia'],
    from: '#8E4257', to: '#3B1520',
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
  },
  {
    id: 'traditional-bridal',
    name: 'Traditional Bridal',
    vibe: 'Heritage red, gold-kissed',
    collection: 'Bridal',
    occasion: 'Wedding',
    serviceType: 'Bridal Makeup',
    includes: ['Bridal makeup', 'Hair & dupatta setting', 'Mehendi touch'],
    durationMin: 200,
    fromPrice: 260,
    products: ['MAC', 'Lakmé', 'Huda Beauty'],
    from: '#B03A3A', to: '#5E1414',
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
  },
  {
    id: 'reception-glam',
    name: 'Reception Glam',
    vibe: 'Second-look sparkle for the big night',
    collection: 'Bridal',
    occasion: 'Wedding',
    serviceType: 'Party Makeup',
    includes: ['Glam makeup', 'Updo or waves', 'Lashes'],
    durationMin: 110,
    fromPrice: 140,
    products: ['Dior Beauty', 'Charlotte Tilbury', 'NARS'],
    from: '#A78BFA', to: '#5B3E9E',
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
    tall: true,
  },
];

export const LOOK_COLLECTIONS: LookCollection[] = [
  'Trending', 'Bridal', 'Date Night', 'Festival', 'Natural', 'Luxury', 'Minimal',
];

export function lookById(id: string): Look | undefined {
  return LOOKS.find(l => l.id === id);
}

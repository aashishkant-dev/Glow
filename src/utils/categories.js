// src/utils/categories.js
'use strict';

// The 9 specialty categories used across the app's Home grid, Glow Match,
// and post/look category tagging. Single source of truth — posts.js and
// provider.js both used to keep their own copy of this list, and they
// silently drifted once (posts.js had bare 'Waxing' while the mobile client
// sent 'Waxing & Hair Removal', so every post tagged with that category was
// rejected with a 400). Must stay in sync with mobile/src/data/categories.ts's
// CATEGORIES[].name.
const CATEGORIES = [
  'Hair', 'Nails', 'Brows & Lashes', 'Waxing & Hair Removal', 'Makeup',
  'Facials & Skin', 'Bridal', 'Henna', 'Spa & Massage',
];

module.exports = { CATEGORIES };

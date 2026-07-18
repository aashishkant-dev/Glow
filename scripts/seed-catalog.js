// scripts/seed-catalog.js
// Seeds the Beauty service category + catalog items for Glow.
// Idempotent: upserts by name, safe to run on every deploy.
// Usage: node scripts/seed-catalog.js
'use strict';

require('dotenv').config();
const prisma = require('../src/lib/prisma');

// Base prices are suggested defaults shown before a provider is chosen; each
// provider sets their own price via PUT /provider/services.
const BEAUTY_SERVICES = [
  { name: 'Makeup',        description: 'Professional makeup for any occasion',      basePrice: 60,  durationMin: 60,  popular: true,  sortOrder: 1,  icon: 'makeup' },
  { name: 'Bridal Makeup', description: 'Complete bridal look with trial',           basePrice: 250, durationMin: 180, popular: true,  sortOrder: 2,  icon: 'bridal' },
  { name: 'Party Makeup',  description: 'Glam look for parties and events',          basePrice: 80,  durationMin: 90,  popular: true,  sortOrder: 3,  icon: 'party' },
  { name: 'Threading',     description: 'Eyebrow and facial threading',              basePrice: 10,  durationMin: 20,  popular: true,  sortOrder: 4,  icon: 'threading' },
  { name: 'Hair Styling',  description: 'Blowout, curls, updos and styling',         basePrice: 45,  durationMin: 60,  popular: true,  sortOrder: 5,  icon: 'hair' },
  { name: 'Hair Coloring', description: 'Full color, highlights or balayage',        basePrice: 90,  durationMin: 120, popular: false, sortOrder: 6,  icon: 'color' },
  { name: 'Facial',        description: 'Deep-cleansing and glow facials',           basePrice: 55,  durationMin: 60,  popular: true,  sortOrder: 7,  icon: 'facial' },
  { name: 'Waxing',        description: 'Full body and face waxing',                 basePrice: 40,  durationMin: 45,  popular: false, sortOrder: 8,  icon: 'waxing' },
  { name: 'Nails',         description: 'Manicure, pedicure and nail art',           basePrice: 35,  durationMin: 60,  popular: true,  sortOrder: 9,  icon: 'nails' },
  { name: 'Mehendi',       description: 'Bridal and party henna designs',            basePrice: 50,  durationMin: 90,  popular: false, sortOrder: 10, icon: 'mehendi' },
  { name: 'Massage',       description: 'Relaxing head, neck or full-body massage',  basePrice: 65,  durationMin: 60,  popular: false, sortOrder: 11, icon: 'massage' },
];

async function main() {
  const beauty = await prisma.serviceCategory.upsert({
    where:  { slug: 'beauty' },
    update: { name: 'Beauty', active: true },
    create: { name: 'Beauty', slug: 'beauty', icon: 'sparkles', sortOrder: 1 },
  });

  for (const s of BEAUTY_SERVICES) {
    await prisma.serviceItem.upsert({
      where:  { categoryId_name: { categoryId: beauty.id, name: s.name } },
      update: { description: s.description, basePrice: s.basePrice, durationMin: s.durationMin, popular: s.popular, sortOrder: s.sortOrder, icon: s.icon, active: true },
      create: { ...s, categoryId: beauty.id },
    });
  }

  const count = await prisma.serviceItem.count({ where: { categoryId: beauty.id } });
  console.log(`Seeded category "Beauty" with ${count} services.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

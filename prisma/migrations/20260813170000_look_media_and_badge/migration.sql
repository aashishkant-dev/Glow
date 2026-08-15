-- ProviderLook.photos (String[]) -> ProviderLook.media (Json[] of
-- { type: 'photo' | 'video', url }) so a look's gallery can mix short video
-- clips in with photos. Also adds `badge`, a short promotional label.
ALTER TABLE "ProviderLook" ADD COLUMN     "media" JSONB[] DEFAULT ARRAY[]::JSONB[];
ALTER TABLE "ProviderLook" ADD COLUMN     "badge" VARCHAR(24);

UPDATE "ProviderLook"
SET "media" = COALESCE(
  (SELECT array_agg(jsonb_build_object('type', 'photo', 'url', p))
   FROM unnest("photos") AS p),
  ARRAY[]::JSONB[]
)
WHERE "photos" IS NOT NULL AND array_length("photos", 1) > 0;

ALTER TABLE "ProviderLook" DROP COLUMN "photos";

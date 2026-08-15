-- Post.photoUrl becomes optional, Post.videoUrl added — a post is now
-- either a photo or a short in-app-camera video, never both.
ALTER TABLE "Post" ALTER COLUMN "photoUrl" DROP NOT NULL;
ALTER TABLE "Post" ADD COLUMN     "videoUrl" TEXT;

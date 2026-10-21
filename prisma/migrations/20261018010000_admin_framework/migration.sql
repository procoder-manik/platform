-- Phase 1: media caption and change time.

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

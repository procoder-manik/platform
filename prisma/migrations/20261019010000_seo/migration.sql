-- Phase 4: the 404 log gets its own id so the admin list can manage it like other lists.

-- DropTable
DROP TABLE "NotFoundHit";

-- CreateTable
CREATE TABLE "NotFoundHit" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrer" TEXT,

    CONSTRAINT "NotFoundHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotFoundHit_path_key" ON "NotFoundHit"("path");

-- CreateIndex
CREATE INDEX "NotFoundHit_lastAt_idx" ON "NotFoundHit"("lastAt");

-- CreateIndex
CREATE INDEX "NotFoundHit_hits_idx" ON "NotFoundHit"("hits");

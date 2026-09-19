-- CreateTable
CREATE TABLE "DubbingSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "subtitleSetId" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceLanguage" TEXT NOT NULL DEFAULT 'en',
    "targetLanguage" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "mixMode" TEXT NOT NULL DEFAULT 'mix',
    "dialogueVolume" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "backgroundVolume" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "speakers" JSONB NOT NULL,
    "voiceAssignments" JSONB NOT NULL,
    "segments" JSONB NOT NULL,
    "tracks" JSONB NOT NULL,
    "separation" JSONB,
    "mix" JSONB,
    "extractedAudioMediaId" TEXT,
    "mixedVideoMediaId" TEXT,
    "warnings" JSONB NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DubbingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DubbingSession_projectId_updatedAt_idx" ON "DubbingSession"("projectId", "updatedAt");

-- AddForeignKey
ALTER TABLE "DubbingSession" ADD CONSTRAINT "DubbingSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

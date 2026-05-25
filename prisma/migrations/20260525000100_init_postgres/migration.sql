-- Initial PostgreSQL schema for the food calorie dashboard.

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealEntry" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "imageUrl" TEXT,
    "compressedImageUrl" TEXT,
    "userDescription" TEXT,
    "originalBytes" INTEGER,
    "compressedBytes" INTEGER,
    "finalKcal" INTEGER,
    "modelKcal" INTEGER,
    "confidence" DOUBLE PRECISION,
    "uncertainty" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealItem" (
    "id" TEXT NOT NULL,
    "mealEntryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portion" TEXT,
    "kcal" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyBurn" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "ouraRestingKcal" INTEGER,
    "ouraActiveKcal" INTEGER,
    "ouraTotalKcal" INTEGER,
    "intervalsTrainingKcal" INTEGER,
    "totalBurnKcal" INTEGER,
    "sourceStatus" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyBurn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingActivity" (
    "id" TEXT NOT NULL,
    "intervalsId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "durationSec" INTEGER,
    "calories" INTEGER,
    "startedAt" TIMESTAMP(3),
    "raw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Connection_provider_key" ON "Connection"("provider");
CREATE INDEX "MealEntry_dateKey_status_idx" ON "MealEntry"("dateKey", "status");
CREATE UNIQUE INDEX "DailyBurn_dateKey_key" ON "DailyBurn"("dateKey");
CREATE UNIQUE INDEX "WeightEntry_dateKey_key" ON "WeightEntry"("dateKey");
CREATE UNIQUE INDEX "TrainingActivity_intervalsId_key" ON "TrainingActivity"("intervalsId");
CREATE INDEX "TrainingActivity_dateKey_idx" ON "TrainingActivity"("dateKey");

ALTER TABLE "MealItem"
ADD CONSTRAINT "MealItem_mealEntryId_fkey"
FOREIGN KEY ("mealEntryId") REFERENCES "MealEntry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

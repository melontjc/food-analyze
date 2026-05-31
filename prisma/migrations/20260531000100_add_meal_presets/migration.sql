CREATE TABLE "MealPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "description" TEXT,
    "baseKcal" INTEGER NOT NULL,
    "sourceMealEntryId" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPreset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealPresetItem" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portion" TEXT,
    "kcal" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPresetItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MealPreset_sourceMealEntryId_key" ON "MealPreset"("sourceMealEntryId");

ALTER TABLE "MealPresetItem"
ADD CONSTRAINT "MealPresetItem_presetId_fkey"
FOREIGN KEY ("presetId") REFERENCES "MealPreset"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

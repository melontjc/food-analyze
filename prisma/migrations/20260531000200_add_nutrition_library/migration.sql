CREATE TABLE "NutritionSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "kcalPer100g" DOUBLE PRECISION NOT NULL,
    "proteinPer100g" DOUBLE PRECISION,
    "fatPer100g" DOUBLE PRECISION,
    "carbsPer100g" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionSource_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MealItem"
ADD COLUMN "grams" DOUBLE PRECISION,
ADD COLUMN "calculationSource" TEXT,
ADD COLUMN "nutritionSourceId" TEXT;

ALTER TABLE "MealPresetItem"
ADD COLUMN "defaultGrams" DOUBLE PRECISION,
ADD COLUMN "calculationSource" TEXT,
ADD COLUMN "nutritionSourceId" TEXT;

ALTER TABLE "MealItem"
ADD CONSTRAINT "MealItem_nutritionSourceId_fkey"
FOREIGN KEY ("nutritionSourceId") REFERENCES "NutritionSource"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MealPresetItem"
ADD CONSTRAINT "MealPresetItem_nutritionSourceId_fkey"
FOREIGN KEY ("nutritionSourceId") REFERENCES "NutritionSource"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

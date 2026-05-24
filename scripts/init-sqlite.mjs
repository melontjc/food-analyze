import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const prismaDir = path.resolve(process.cwd(), "prisma");
fs.mkdirSync(prismaDir, { recursive: true });

const db = new DatabaseSync(path.join(prismaDir, "dev.db"));

db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS Connection (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL UNIQUE,
  encryptedData TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS MealEntry (
  id TEXT PRIMARY KEY NOT NULL,
  dateKey TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  imageUrl TEXT,
  compressedImageUrl TEXT,
  userDescription TEXT,
  originalBytes INTEGER,
  compressedBytes INTEGER,
  finalKcal INTEGER,
  modelKcal INTEGER,
  confidence REAL,
  uncertainty TEXT,
  notes TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS MealEntry_dateKey_status_idx ON MealEntry(dateKey, status);

CREATE TABLE IF NOT EXISTS MealItem (
  id TEXT PRIMARY KEY NOT NULL,
  mealEntryId TEXT NOT NULL,
  name TEXT NOT NULL,
  portion TEXT,
  kcal INTEGER NOT NULL,
  confidence REAL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT MealItem_mealEntryId_fkey FOREIGN KEY (mealEntryId) REFERENCES MealEntry(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS DailyBurn (
  id TEXT PRIMARY KEY NOT NULL,
  dateKey TEXT NOT NULL UNIQUE,
  ouraRestingKcal INTEGER,
  ouraActiveKcal INTEGER,
  ouraTotalKcal INTEGER,
  intervalsTrainingKcal INTEGER,
  totalBurnKcal INTEGER,
  sourceStatus TEXT,
  syncedAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS WeightEntry (
  id TEXT PRIMARY KEY NOT NULL,
  dateKey TEXT NOT NULL UNIQUE,
  weightKg REAL NOT NULL,
  note TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS TrainingActivity (
  id TEXT PRIMARY KEY NOT NULL,
  intervalsId TEXT NOT NULL UNIQUE,
  dateKey TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  durationSec INTEGER,
  calories INTEGER,
  startedAt DATETIME,
  raw TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS TrainingActivity_dateKey_idx ON TrainingActivity(dateKey);

CREATE TABLE IF NOT EXISTS SyncRun (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  startedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  endedAt DATETIME
);
`);

db.close();
console.log(`SQLite database initialized at ${path.join(prismaDir, "dev.db")}`);

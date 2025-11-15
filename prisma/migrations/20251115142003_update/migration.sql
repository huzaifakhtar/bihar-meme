-- CreateTable
CREATE TABLE "GlobalStat" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SlapEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "ipHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlapEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SlapEvent" ("amount", "createdAt", "id", "ipHash", "personId") SELECT "amount", "createdAt", "id", "ipHash", "personId" FROM "SlapEvent";
DROP TABLE "SlapEvent";
ALTER TABLE "new_SlapEvent" RENAME TO "SlapEvent";
CREATE INDEX "SlapEvent_personId_ipHash_idx" ON "SlapEvent"("personId", "ipHash");
CREATE INDEX "SlapEvent_createdAt_idx" ON "SlapEvent"("createdAt");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

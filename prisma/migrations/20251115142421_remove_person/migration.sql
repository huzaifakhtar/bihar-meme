/*
  Warnings:

  - You are about to drop the `Person` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `personId` on the `SlapEvent` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Person_slug_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Person";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SlapEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "ipHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SlapEvent" ("amount", "createdAt", "id", "ipHash") SELECT "amount", "createdAt", "id", "ipHash" FROM "SlapEvent";
DROP TABLE "SlapEvent";
ALTER TABLE "new_SlapEvent" RENAME TO "SlapEvent";
CREATE INDEX "SlapEvent_createdAt_idx" ON "SlapEvent"("createdAt");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

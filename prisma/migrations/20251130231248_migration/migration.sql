-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflowId" INTEGER NOT NULL,
    "templateStepId" INTEGER NOT NULL,
    "nextStepOrder" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "triggeredByResponseId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "history_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "history_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "template_steps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "history_triggeredByResponseId_fkey" FOREIGN KEY ("triggeredByResponseId") REFERENCES "responses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_history" ("eventType", "id", "nextStepOrder", "templateStepId", "triggeredByResponseId", "workflowId") SELECT "eventType", "id", "nextStepOrder", "templateStepId", "triggeredByResponseId", "workflowId" FROM "history";
DROP TABLE "history";
ALTER TABLE "new_history" RENAME TO "history";
CREATE UNIQUE INDEX "history_triggeredByResponseId_key" ON "history"("triggeredByResponseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

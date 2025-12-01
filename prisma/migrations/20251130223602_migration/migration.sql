/*
  Warnings:

  - You are about to drop the `Post` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Post";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "template_steps" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflowTemplateId" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "metadata" JSONB,
    "completionRuleType" TEXT NOT NULL,
    "kValue" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "template_steps_workflowTemplateId_fkey" FOREIGN KEY ("workflowTemplateId") REFERENCES "WorkflowTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "template_step_assignees" (
    "templateStepId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("templateStepId", "userId"),
    CONSTRAINT "template_step_assignees_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "template_steps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "template_step_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflowTemplateId" INTEGER NOT NULL,
    "currentStepOrder" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflows_workflowTemplateId_fkey" FOREIGN KEY ("workflowTemplateId") REFERENCES "WorkflowTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workflow_assignees" (
    "workflowId" INTEGER NOT NULL,
    "templateStepId" INTEGER NOT NULL,
    "assigneeUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("workflowId", "templateStepId", "assigneeUserId"),
    CONSTRAINT "workflow_assignees_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "workflow_assignees_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "template_steps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "workflow_assignees_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "responses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflowId" INTEGER NOT NULL,
    "templateStepId" INTEGER NOT NULL,
    "responderId" INTEGER NOT NULL,
    "responseType" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responses_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "responses_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "template_steps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "responses_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflowId" INTEGER NOT NULL,
    "templateStepId" INTEGER NOT NULL,
    "nextStepOrder" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "triggeredByResponseId" INTEGER,
    CONSTRAINT "history_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "history_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "template_steps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "history_triggeredByResponseId_fkey" FOREIGN KEY ("triggeredByResponseId") REFERENCES "responses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "response_attachments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "responseId" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "response_attachments_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "responses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "template_steps_workflowTemplateId_stepOrder_key" ON "template_steps"("workflowTemplateId", "stepOrder");

-- CreateIndex
CREATE INDEX "workflow_assignees_workflowId_templateStepId_idx" ON "workflow_assignees"("workflowId", "templateStepId");

-- CreateIndex
CREATE INDEX "responses_workflowId_templateStepId_idx" ON "responses"("workflowId", "templateStepId");

-- CreateIndex
CREATE UNIQUE INDEX "history_triggeredByResponseId_key" ON "history"("triggeredByResponseId");

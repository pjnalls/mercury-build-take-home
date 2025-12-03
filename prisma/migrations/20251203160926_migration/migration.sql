/*
  Warnings:

  - You are about to drop the `Post` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Post";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "workflow_template_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflow_template_id" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_template_versions_workflow_template_id_fkey" FOREIGN KEY ("workflow_template_id") REFERENCES "workflow_templates" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "template_steps" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflow_template_version_id" INTEGER NOT NULL,
    "step_name" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "metadata" JSONB,
    "completion_rule_type" TEXT NOT NULL,
    "k_value" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "template_steps_workflow_template_version_id_fkey" FOREIGN KEY ("workflow_template_version_id") REFERENCES "workflow_template_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "template_step_assignees" (
    "template_step_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("template_step_id", "user_id"),
    CONSTRAINT "template_step_assignees_template_step_id_fkey" FOREIGN KEY ("template_step_id") REFERENCES "template_steps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "template_step_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflow_template_version_id" INTEGER NOT NULL,
    "current_step_order" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflows_workflow_template_version_id_fkey" FOREIGN KEY ("workflow_template_version_id") REFERENCES "workflow_template_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "responses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflow_id" INTEGER NOT NULL,
    "template_step_id" INTEGER NOT NULL,
    "revision_number" INTEGER NOT NULL DEFAULT 1,
    "responder_id" INTEGER NOT NULL,
    "response_type" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responses_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "responses_template_step_id_fkey" FOREIGN KEY ("template_step_id") REFERENCES "template_steps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "responses_responder_id_fkey" FOREIGN KEY ("responder_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workflow_assignees" (
    "workflow_id" INTEGER NOT NULL,
    "template_step_id" INTEGER NOT NULL,
    "assignee_user_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("workflow_id", "template_step_id", "assignee_user_id"),
    CONSTRAINT "workflow_assignees_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "workflow_assignees_template_step_id_fkey" FOREIGN KEY ("template_step_id") REFERENCES "template_steps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "workflow_assignees_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflow_id" INTEGER NOT NULL,
    "template_step_id" INTEGER NOT NULL,
    "next_step_order" INTEGER,
    "event_type" TEXT NOT NULL,
    "triggered_by_response_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "history_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "history_template_step_id_fkey" FOREIGN KEY ("template_step_id") REFERENCES "template_steps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "history_triggered_by_response_id_fkey" FOREIGN KEY ("triggered_by_response_id") REFERENCES "responses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "response_attachments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "response_id" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "response_attachments_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "responses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_versions_workflow_template_id_version_number_key" ON "workflow_template_versions"("workflow_template_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "template_steps_workflow_template_version_id_step_order_key" ON "template_steps"("workflow_template_version_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "responses_workflow_id_template_step_id_revision_number_key" ON "responses"("workflow_id", "template_step_id", "revision_number");

-- CreateIndex
CREATE INDEX "workflow_assignees_workflow_id_template_step_id_idx" ON "workflow_assignees"("workflow_id", "template_step_id");

import { PrismaClient } from '@prisma/client';
// import { RuleEnum, WorkflowStatusEnum } from './types'; // Assuming you reuse local enums or import from @prisma/client

// Defines the completion rule type for a step
export enum RuleEnum {
  ALL = 'ALL',
  ANY = 'ANY',
  K_OF_N = 'K_OF_N',
}

// Defines the type of response given by a user
export enum ResponseEnum {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
}

// Defines the overall status of a workflow instance
export enum WorkflowStatusEnum {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED',
}

// Defines the type of event logged in the history table
export enum HistoryEventEnum {
  WORKFLOW_STARTED = 'WORKFLOW_STARTED',
  STEP_ADVANCED = 'STEP_ADVANCED',
  STEP_SENT_BACK = 'STEP_SENT_BACK',
  WORKFLOW_COMPLETED = 'WORKFLOW_COMPLETED',
}

// 1. Instantiate PrismaClient directly in the seed script
const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // ------------------------------------------------------------------
  // A. Create necessary users
  // ------------------------------------------------------------------
  const user1 = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      name: 'Alice Manager',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      name: 'Bob Reviewer',
    },
  });

  console.log(`Created users: ${user1.name}, ${user2.name}`);

  // ------------------------------------------------------------------
  // B. Create a Workflow Template
  // ------------------------------------------------------------------
  const template = await prisma.workflowTemplate.upsert({
    // TODO: Update to name or other fields as needed
    where: { id: 1 },
    update: {},
    create: {
      name: 'Simple Expense Approval',
      description: 'A two-step approval process.',
    },
  });

  console.log(`Created template: ${template.name}`);

  // ------------------------------------------------------------------
  // C. Add Steps to the Template
  // ------------------------------------------------------------------
  const step1 = await prisma.templateStep.upsert({
    where: {
      workflowTemplateId_stepOrder: {
        workflowTemplateId: template.id,
        stepOrder: 1,
      },
    },
    update: {},
    create: {
      workflowTemplateId: template.id,
      stepOrder: 1,
      stepName: 'Submitter Review',
      completionRuleType: RuleEnum.ALL,
      metadata: { instruction: 'Confirm all fields are correct.' },
    },
  });

  const step2 = await prisma.templateStep.upsert({
    where: {
      workflowTemplateId_stepOrder: {
        workflowTemplateId: template.id,
        stepOrder: 2,
      },
    },
    update: {},
    create: {
      workflowTemplateId: template.id,
      stepOrder: 2,
      stepName: 'Manager Approval',
      completionRuleType: RuleEnum.ANY,
      metadata: { instruction: 'Approve or reject the expense.' },
    },
  });

  console.log(`Created steps: ${step1.stepName}, ${step2.stepName}`);

  // D. Assign users to the template steps (TemplateStepAssignee)
  // ------------------------------------------------------------------
  // FIX: Use upsert because skipDuplicates is not available for SQLite.

  // Assign Alice (user1) to step 2 (Manager Approval)
  await prisma.templateStepAssignee.upsert({
    // The 'where' clause MUST specify the composite unique key
    where: {
      templateStepId_userId: {
        templateStepId: step2.id,
        userId: user1.id,
      },
    },
    update: {}, // Nothing needs to be updated if the record exists
    create: {
      templateStepId: step2.id,
      userId: user1.id,
    },
  });

  // Assign Bob (user2) to step 1 (Submitter Review)
  await prisma.templateStepAssignee.upsert({
    // The 'where' clause MUST specify the composite unique key
    where: {
      templateStepId_userId: {
        templateStepId: step1.id,
        userId: user2.id,
      },
    },
    update: {}, // Nothing needs to be updated if the record exists
    create: {
      templateStepId: step1.id,
      userId: user2.id,
    },
  });

  console.log(`Assigned users to template steps.`);

  // ------------------------------------------------------------------
  // E. Create an initial Workflow Instance
  // ------------------------------------------------------------------
  await prisma.workflow.create({
    data: {
      workflowTemplateId: template.id,
      currentStepOrder: step1.stepOrder, // Start at step 1
      status: WorkflowStatusEnum.IN_PROGRESS,
    },
  });

  console.log(`Created an initial workflow instance.`);
  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // 2. Disconnect the client when the script is done
    await prisma.$disconnect();
  });

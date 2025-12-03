import { PrismaClient, RuleEnum, ResponseEnum, WorkflowStatusEnum, HistoryEventEnum } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Starting Seeding Process ---')

  // 1. Create Users (for assignees, responders, etc.)
  const [userAlice, userBob, userCharlie] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'alice.johnson@example.com' },
      update: {},
      create: { name: 'Alice Johnson (Manager)', email: 'alice.johnson@example.com' },
    }),
    prisma.user.upsert({
      where: { email: 'bob.smith@example.com' },
      update: {},
      create: { name: 'Bob Smith (Reviewer)', email: 'bob.smith@example.com' },
    }),
    prisma.user.upsert({
      where: { email: 'charlie.brown@example.com' },
      update: {},
      create: { name: 'Charlie Brown (Initiator)', email: 'charlie.brown@example.com' },
    }),
  ]);
  console.log(`Created user: ${userAlice.name}, ${userBob.name}, ${userCharlie.name}`);

  // 2. Create Workflow Template and Version (Nested Write)
  const templateName = 'Vacation Request Approval';
  const newTemplate = await prisma.workflowTemplate.upsert({
    where: { name: templateName, id: 1 }, // Dummy unique constraint for upsert
    update: {},
    create: {
      name: templateName,
      description: 'Standard workflow for submitting and approving paid time off (PTO).',
      versions: {
        create: {
          versionNumber: 1,
          isActive: true,
          // 3. Create Template Steps (Nested Write)
          templateSteps: {
            create: [
              {
                stepOrder: 1,
                stepName: 'Submit Request',
                completionRuleType: RuleEnum.ALL, // Initiator just needs to complete the form
                metadata: { formId: 'PTO-101' },
                // 4. Define Template Step Assignees (Nested Write - Assign to Initiator)
                templateStepAssignees: {
                  create: [
                    { userId: userCharlie.id },
                  ]
                }
              },
              {
                stepOrder: 2,
                stepName: 'Manager Approval',
                completionRuleType: RuleEnum.ANY, // Only Alice needs to approve (even if Bob is assigned as backup)
                kValue: 1,
                metadata: { deadline: '48h' },
                // 4. Define Template Step Assignees (Nested Write - Assign to Manager/Reviewer)
                templateStepAssignees: {
                  create: [
                    { userId: userAlice.id },
                    { userId: userBob.id }, // Bob is backup
                  ]
                }
              },
            ],
          },
        },
      },
    },
    include: {
      versions: {
        include: {
          templateSteps: true
        }
      }
    }
  });

  const templateVersion = newTemplate.versions[0];
  const stepOne = templateVersion.templateSteps.find(s => s.stepOrder === 1);
  const stepTwo = templateVersion.templateSteps.find(s => s.stepOrder === 2);
  console.log(`Created Template: ${newTemplate.name} (v${templateVersion.versionNumber})`);
  console.log(`  Step 1: ${stepOne?.stepName} (ID: ${stepOne?.id})`);
  console.log(`  Step 2: ${stepTwo?.stepName} (ID: ${stepTwo?.id})`);

  // 5. Create an Active Workflow Instance (Vacation Request for Charlie)
  const activeWorkflow = await prisma.workflow.create({
    data: {
      workflowTemplateVersionId: templateVersion.id,
      status: WorkflowStatusEnum.IN_PROGRESS,
      currentStepOrder: stepTwo?.stepOrder || 2, // Start past the first step for a more complex example
    }
  });
  console.log(`Created Active Workflow ID: ${activeWorkflow.id} (Status: ${activeWorkflow.status})`);

  // 6. Log Initial Workflow History
  const historyEvent = await prisma.history.create({
    data: {
      workflowId: activeWorkflow.id,
      templateStepId: stepOne!.id, // Reference the first step
      eventType: HistoryEventEnum.WORKFLOW_STARTED,
      nextStepOrder: activeWorkflow.currentStepOrder,
    }
  });
  console.log(`Logged history event ID: ${historyEvent.id}`);

  // 7. Define Current Step Assignees (Step 2)
  await prisma.workflowAssignee.createMany({
    data: [
      {
        workflowId: activeWorkflow.id,
        templateStepId: stepTwo!.id,
        assigneeUserId: userAlice.id,
      },
      {
        workflowId: activeWorkflow.id,
        templateStepId: stepTwo!.id,
        assigneeUserId: userBob.id,
      },
    ]
  });
  console.log(`Defined assignees for Workflow ${activeWorkflow.id} / Step ${stepTwo?.id}`);

  // 8. Log a Response (Alice Approves Step 2)
  const approvalResponse = await prisma.response.create({
    data: {
      workflowId: activeWorkflow.id,
      templateStepId: stepTwo!.id,
      responderId: userAlice.id,
      responseType: ResponseEnum.POSITIVE,
      description: 'Approved. Alice is available to cover.',
      revisionNumber: 1,
      // 9. Add an attachment to the response (Nested Write)
      attachments: {
        create: {
          fileUrl: 'https://docs.example.com/alice-approval-memo.pdf',
          fileName: 'Approval Memo',
        }
      }
    },
    include: {
      attachments: true,
    }
  });
  console.log(`Logged response ID: ${approvalResponse.id} by ${userAlice.name} with ${approvalResponse.attachments.length} attachment(s).`);

  console.log('--- Seeding Complete ---')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

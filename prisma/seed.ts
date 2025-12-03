import { PrismaClient, rule_enum, response_enum, workflow_status_enum, history_event_enum } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Starting Seeding Process ---')

  // 1. Create Users (for assignees, responders, etc.)
  const [userAlice, userBob, userCharlie] = await Promise.all([
    prisma.users.upsert({
      where: { email: 'alice.johnson@example.com' },
      update: {},
      create: { name: 'Alice Johnson (Manager)', email: 'alice.johnson@example.com' },
    }),
    prisma.users.upsert({
      where: { email: 'bob.smith@example.com' },
      update: {},
      create: { name: 'Bob Smith (Reviewer)', email: 'bob.smith@example.com' },
    }),
    prisma.users.upsert({
      where: { email: 'charlie.brown@example.com' },
      update: {},
      create: { name: 'Charlie Brown (Initiator)', email: 'charlie.brown@example.com' },
    }),
  ]);
  console.log(`Created users: ${userAlice.name}, ${userBob.name}, ${userCharlie.name}`);

  // 2. Create Workflow Template and Version (Nested Write)
  const templateName = 'Vacation Request Approval';
  const newTemplate = await prisma.workflow_templates.upsert({
    where: { name: templateName, id: 1 }, // Dummy unique constraint for upsert
    update: {},
    create: {
      name: templateName,
      description: 'Standard workflow for submitting and approving paid time off (PTO).',
      versions: {
        create: {
          version_number: 1,
          is_active: true,
          // 3. Create Template Steps (Nested Write)
          template_steps: {
            create: [
              {
                step_order: 1,
                step_name: 'Submit Request',
                completion_rule_type: rule_enum.ALL, // Initiator just needs to complete the form
                metadata: { formId: 'PTO-101' },
                // 4. Define Template Step Assignees (Nested Write - Assign to Initiator)
                template_step_assignees: {
                  create: [
                    { user_id: userCharlie.id },
                  ]
                }
              },
              {
                step_order: 2,
                step_name: 'Manager Approval',
                completion_rule_type: rule_enum.ANY, // Only Alice needs to approve (even if Bob is assigned as backup)
                k_value: 1,
                metadata: { deadline: '48h' },
                // 4. Define Template Step Assignees (Nested Write - Assign to Manager/Reviewer)
                template_step_assignees: {
                  create: [
                    { user_id: userAlice.id },
                    { user_id: userBob.id }, // Bob is backup
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
          template_steps: true
        }
      }
    }
  });

  const templateVersion = newTemplate.versions[0];
  const stepOne = templateVersion.template_steps.find(s => s.step_order === 1);
  const stepTwo = templateVersion.template_steps.find(s => s.step_order === 2);
  console.log(`Created Template: ${newTemplate.name} (v${templateVersion.version_number})`);
  console.log(`  Step 1: ${stepOne?.step_name} (ID: ${stepOne?.id})`);
  console.log(`  Step 2: ${stepTwo?.step_name} (ID: ${stepTwo?.id})`);

  // 5. Create an Active Workflow Instance (Vacation Request for Charlie)
  const activeWorkflow = await prisma.workflows.create({
    data: {
      workflow_template_version_id: templateVersion.id,
      status: workflow_status_enum.IN_PROGRESS,
      current_step_order: stepTwo?.step_order || 2, // Start past the first step for a more complex example
    }
  });
  console.log(`Created Active Workflow ID: ${activeWorkflow.id} (Status: ${activeWorkflow.status})`);

  // 6. Log Initial Workflow History
  const historyEvent = await prisma.history.create({
    data: {
      workflow_id: activeWorkflow.id,
      template_step_id: stepOne!.id, // Reference the first step
      event_type: history_event_enum.WORKFLOW_STARTED,
      next_step_order: activeWorkflow.current_step_order,
    }
  });
  console.log(`Logged history event ID: ${historyEvent.id}`);

  // 7. Define Current Step Assignees (Step 2)
  await prisma.workflow_assignees.createMany({
    data: [
      {
        workflow_id: activeWorkflow.id,
        template_step_id: stepTwo!.id,
        assignee_user_id: userAlice.id,
      },
      {
        workflow_id: activeWorkflow.id,
        template_step_id: stepTwo!.id,
        assignee_user_id: userBob.id,
      },
    ]
  });
  console.log(`Defined assignees for Workflow ${activeWorkflow.id} / Step ${stepTwo?.id}`);

  // 8. Log a Response (Alice Approves Step 2)
  const approvalResponse = await prisma.responses.create({
    data: {
      workflow_id: activeWorkflow.id,
      template_step_id: stepTwo!.id,
      responder_id: userAlice.id,
      response_type: response_enum.POSITIVE,
      description: 'Approved. Alice is available to cover.',
      revision_number: 1,
      // 9. Add an attachment to the response (Nested Write)
      attachments: {
        create: {
          file_url: 'https://docs.example.com/alice-approval-memo.pdf',
          file_name: 'Approval Memo',
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

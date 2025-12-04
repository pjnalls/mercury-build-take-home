/**
 * Integration test example for the `workflow` router
 */
import type { inferProcedureInput } from '@trpc/server';
import { createContextInner } from '../context';
import type { AppRouter } from './_app';
import { createCaller } from './_app';
import { ResponseEnum, RuleEnum } from '@prisma/client';
import { prisma } from '~/server/prisma';

test('add and get workflow template', async () => {
  const ctx = await createContextInner({});
  const caller = createCaller(ctx);

  const input: inferProcedureInput<
    AppRouter['workflow']['createWorkflowTemplate']
  > = {
    name: 'Test Workflow Template',
    description: 'A template for testing purposes',
  };

  const workflowTemplate = await caller.workflow.createWorkflowTemplate(input);
  const byId = await caller.workflow.queryWorkflowTemplateDetails({
    workflowId: workflowTemplate.templateId,
  });

  expect(byId).toMatchObject(input);
});

test('complete and get workflow instance', async () => {
  const ctx = await createContextInner({});
  const caller = createCaller(ctx);

  const templateInput: inferProcedureInput<
    AppRouter['workflow']['createWorkflowTemplate']
  > = {
    name: 'Instance Test Template',
    description: 'A template to test workflow instances',
  };

  const workflowTemplate =
    await caller.workflow.createWorkflowTemplate(templateInput);

  const stepInput: inferProcedureInput<
    AppRouter['workflow']['addStepToTemplateVersion']
  > = {
    workflowTemplateVersionId: workflowTemplate.versionId,
    stepName: 'Test Step',
    stepOrder: 1,
    kValue: 1,
    completionRuleType: RuleEnum.K_OF_N,
  };

  const step = await caller.workflow.addStepToTemplateVersion(stepInput);

  const instanceInput: inferProcedureInput<
    AppRouter['workflow']['createWorkflow']
  > = {
    workflowTemplateVersionId: workflowTemplate.versionId,
  };

  const [userAlice, userBob] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'alice.johnson@example.com' },
      update: {},
      create: {
        name: 'Alice Johnson (Manager)',
        email: 'alice.johnson@example.com',
      },
    }),
    prisma.user.upsert({
      where: { email: 'bob.smith@example.com' },
      update: {},
      create: { name: 'Bob Smith (Reviewer)', email: 'bob.smith@example.com' },
    }),
  ]);

  const assignInput: inferProcedureInput<
    AppRouter['workflow']['assignUsersAndSpecifyRule']
  > = {
    templateStepId: step.stepId,
    userIds: [userAlice.id, userBob.id],
    completionRuleType: RuleEnum.K_OF_N,
  };

  await caller.workflow.assignUsersAndSpecifyRule(assignInput);

  const workflow = await caller.workflow.createWorkflow(instanceInput);

  await caller.workflow.submitResponse({
    workflowId: workflow.workflowId,
    responderId: userAlice.id,
    responseType: ResponseEnum.POSITIVE,
  });
  // await caller.workflow.submitResponse({
  //   workflowId: workflow.workflowId,
  //   responderId: userBob.id,
  //   responseType: ResponseEnum.POSITIVE,
  // });

  const workflowStatus =
    await caller.workflow.queryCurrentWorkflowStatusAndHistory({
      workflowId: workflow.workflowId,
    });
  console.log(workflowStatus.status);
});

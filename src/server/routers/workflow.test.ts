/**
 * Integration test example for the `post` router
 */
import type { inferProcedureInput } from '@trpc/server';
import { createContextInner } from '../context';
import type { AppRouter } from './_app';
import { createCaller } from './_app';

test('add and get workflow template', async () => {
  const ctx = await createContextInner({});
  const caller = createCaller(ctx);

  const input: inferProcedureInput<AppRouter['workflow']['createWorkflowTemplate']> = {
    name: 'Test Workflow Template',
    description: 'A template for testing purposes',
  };

  const workflowTemplate = await caller.workflow.createWorkflowTemplate(input);
  const byId = await caller.workflow.getWorkflowTemplateDetails({ workflowId: workflowTemplate.templateId });

  expect(byId).toMatchObject(input);
});

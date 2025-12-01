// /**
//  *
//  * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
//  */
// import { router, publicProcedure } from '../trpc';
// import type { Prisma } from '@prisma/client';
// import { TRPCError } from '@trpc/server';
// import { z } from 'zod';
// import { prisma } from '~/server/prisma';

// /**
//  * Default selector for Post.
//  * It's important to always explicitly say which fields you want to return in order to not leak extra information
//  * @see https://github.com/prisma/prisma/issues/9353
//  */
// const defaultPostSelect = {
//   id: true,
//   title: true,
//   text: true,
//   createdAt: true,
//   updatedAt: true,
// } satisfies Prisma.PostSelect;

// export const postRouter = router({
//   list: publicProcedure
//     .input(
//       z.object({
//         limit: z.number().min(1).max(100).nullish(),
//         cursor: z.string().nullish(),
//       }),
//     )
//     .query(async ({ input }) => {
//       /**
//        * For pagination docs you can have a look here
//        * @see https://trpc.io/docs/v11/useInfiniteQuery
//        * @see https://www.prisma.io/docs/concepts/components/prisma-client/pagination
//        */

//       const limit = input.limit ?? 50;
//       const { cursor } = input;

//       const items = await prisma.post.findMany({
//         select: defaultPostSelect,
//         // get an extra item at the end which we'll use as next cursor
//         take: limit + 1,
//         where: {},
//         cursor: cursor
//           ? {
//               id: cursor,
//             }
//           : undefined,
//         orderBy: {
//           createdAt: 'desc',
//         },
//       });
//       let nextCursor: typeof cursor | undefined = undefined;
//       if (items.length > limit) {
//         // Remove the last item and use it as next cursor

//         const nextItem = items.pop()!;
//         nextCursor = nextItem.id;
//       }

//       return {
//         items: items.reverse(),
//         nextCursor,
//       };
//     }),
//   byId: publicProcedure
//     .input(
//       z.object({
//         id: z.string(),
//       }),
//     )
//     .query(async ({ input }) => {
//       const { id } = input;
//       const post = await prisma.post.findUnique({
//         where: { id },
//         select: defaultPostSelect,
//       });
//       if (!post) {
//         throw new TRPCError({
//           code: 'NOT_FOUND',
//           message: `No post with id '${id}'`,
//         });
//       }
//       return post;
//     }),
//   add: publicProcedure
//     .input(
//       z.object({
//         id: z.string().uuid().optional(),
//         title: z.string().min(1).max(32),
//         text: z.string().min(1),
//       }),
//     )
//     .mutation(async ({ input }) => {
//       const post = await prisma.post.create({
//         data: input,
//         select: defaultPostSelect,
//       });
//       return post;
//     }),
// });

import { z } from 'zod';
import { t } from '../trpc'; // Assuming your tRPC instance is exported from './trpc'
import { prisma } from '../prisma'; // Assuming your Prisma client is exported from './prisma'
// import { RuleEnum, WorkflowStatusEnum, ResponseEnum, HistoryEventEnum } from '@prisma/client'; // Import enums from Prisma client
// --- Enums defined in the Prisma Schema ---

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

// --- 1. Zod Schemas for Input Validation ---

// Schema for adding a single step
const StepInputSchema = z.object({
  stepName: z.string().min(1, "Step name is required."),
  completionRuleType: z.nativeEnum(RuleEnum),
  kValue: z.number().int().optional(),
  metadata: z.record(z.any()).optional(), // Simple object for JSON metadata
  // Assignees are handled in a separate procedure for simplicity, but could be merged here
});

// Schema for assigning users to an existing step template
const AssigneeInputSchema = z.object({
  templateStepId: z.number().int(),
  userIds: z.array(z.number().int()).min(1, "At least one assignee is required."),
});

// Schema for submitting a response to an active workflow step
const ResponseInputSchema = z.object({
  workflowId: z.number().int(),
  templateStepId: z.number().int(), // The step being responded to
  responseType: z.nativeEnum(ResponseEnum),
  description: z.string().optional(),
});


// --- 2. The Router ---

export const workflowRouter = t.router({
  // ---------------------------------------------------------------------
  // 1. Create Workflow Template (Initial Setup)
  // ---------------------------------------------------------------------
  createTemplate: t.procedure
    .input(z.object({
      name: z.string().min(3),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return prisma.workflowTemplate.create({
        data: {
          name: input.name,
          description: input.description,
        },
      });
    }),

  // ---------------------------------------------------------------------
  // 2. Add Steps (in order)
  // ---------------------------------------------------------------------
  addTemplateStep: t.procedure
    .input(z.object({
      workflowTemplateId: z.number().int(),
      step: StepInputSchema.extend({
        stepOrder: z.number().int().min(1, "Step order must be 1 or greater."),
      }),
    }))
    .mutation(async ({ input }) => {
      // Note: The unique index [workflowTemplateId, stepOrder] in the Prisma schema
      // handles preventing duplicate step orders for the same template.
      return prisma.templateStep.create({
        data: {
          workflowTemplateId: input.workflowTemplateId,
          stepName: input.step.stepName,
          stepOrder: input.step.stepOrder,
          completionRuleType: input.step.completionRuleType,
          kValue: input.step.kValue,
          metadata: input.step.metadata,
        },
      });
    }),

  // ---------------------------------------------------------------------
  // 3. Assign People to Steps and Specify the Completion Rule (Template Assignees)
  // ---------------------------------------------------------------------
  assignTemplateStepUsers: t.procedure
    .input(AssigneeInputSchema)
    .mutation(async ({ input }) => {
      const data = input.userIds.map(userId => ({
        templateStepId: input.templateStepId,
        userId: userId,
      }));

      // Prisma's createMany is much more efficient for bulk insertions
      await prisma.templateStepAssignee.createMany({
        data
      });

      return { success: true, count: data.length };
    }),

  // ---------------------------------------------------------------------
  // 4. Submit Responses (and potentially advance the workflow)
  // ---------------------------------------------------------------------
  submitResponse: t.procedure
    .input(ResponseInputSchema)
    .mutation(async ({ input, ctx }) => {
      // 1. Check if the current user (ctx.userId) is an authorized assignee for this step instance.
      // This is a simplified check; a real app would use the 'workflow_assignees' table for the active step.
      const activeWorkflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: input.workflowId },
        include: { workflowTemplate: { include: { templateSteps: { where: { stepOrder: input.templateStepId } } } } }
      });
      
      const currentStep = activeWorkflow.workflowTemplate.templateSteps.find(s => s.stepOrder === activeWorkflow.currentStepOrder);
      if (!currentStep || currentStep.id !== input.templateStepId) {
          throw new Error("Invalid step ID submitted or step is not the current active step.");
      }

      // 2. Create the Response
      const response = await prisma.response.create({
        data: {
          workflowId: input.workflowId,
          templateStepId: input.templateStepId,
          responderId: ctx.userId!, // Assuming ctx.userId is validated and present
          responseType: input.responseType,
          description: input.description,
        },
      });

      // 3. *Simplified* Logic to Determine Advancement (Placeholder - requires complex transaction logic)
      let eventType = HistoryEventEnum.WORKFLOW_STARTED; // Default, will be updated

      if (input.responseType === ResponseEnum.POSITIVE) {
          // *** REAL LOGIC: Check Completion Rule (ALL, ANY, K_OF_N) for this step ***
          // Since this is a massive operation (check all previous responses, apply rule, decide state),
          // we use a simplified advance for demonstration.
          
          const nextStepOrder = activeWorkflow.currentStepOrder + 1;
          
          await prisma.workflow.update({
            where: { id: input.workflowId },
            data: { 
              currentStepOrder: nextStepOrder,
              status: nextStepOrder > currentStep.stepOrder ? WorkflowStatusEnum.IN_PROGRESS : WorkflowStatusEnum.COMPLETED,
            },
          });
          
          eventType = HistoryEventEnum.STEP_ADVANCED;
          
      } else if (input.responseType === ResponseEnum.NEGATIVE) {
          eventType = HistoryEventEnum.STEP_SENT_BACK;
          // Logic for sending back (e.g., set currentStepOrder to a previous step)
      }

      // 4. Log History (Triggered by the response)
      await prisma.history.create({
          data: {
              workflowId: input.workflowId,
              templateStepId: input.templateStepId,
              nextStepOrder: activeWorkflow.currentStepOrder, // The order BEFORE the transition was processed
              eventType: eventType,
              triggeredByResponseId: response.id,
          },
      });

      return { success: true, responseId: response.id, nextStatus: eventType };
    }),

  // ---------------------------------------------------------------------
  // 5. Query Current Workflow State and History
  // ---------------------------------------------------------------------
  getWorkflowState: t.procedure
    .input(z.object({ workflowId: z.number().int() }))
    .query(async ({ input }) => {
      const workflow = await prisma.workflow.findUnique({
        where: { id: input.workflowId },
        select: {
          id: true,
          status: true,
          currentStepOrder: true,
          startedAt: true,
          completedAt: true,
          workflowTemplate: {
            select: { id: true, name: true }
          },
          // Pull all assignees for the *current* step definition (template_steps_assignees)
          workflowAssignees: {
            where: {
                // Fetch the actual templateStepId that corresponds to the currentStepOrder
                // This requires finding the step first, making this query complex.
                // A simpler, initial query is just to pull ALL related assignees:
            },
            select: {
              assigneeUser: { select: { id: true, name: true } },
              templateStep: { select: { stepName: true, stepOrder: true } }
            }
          },
          history: {
            orderBy: { createdAt: 'desc' },
            select: {
              createdAt: true,
              eventType: true,
              nextStepOrder: true,
              templateStep: { select: { stepName: true, stepOrder: true } },
              triggeredByResponse: {
                select: {
                  responseType: true,
                  responder: { select: { name: true } }
                }
              }
            },
          },
        },
      });

      if (!workflow) {
        throw new Error('Workflow not found.');
      }

      // Find the *actual* current step from the template steps
      const templateSteps = await prisma.templateStep.findMany({
        where: { workflowTemplateId: workflow.workflowTemplate.id },
        orderBy: { stepOrder: 'asc' }
      });
      const currentStepDetails = templateSteps.find(s => s.stepOrder === workflow.currentStepOrder);

      return {
        ...workflow,
        currentStepDetails: currentStepDetails,
      };
    }),
});
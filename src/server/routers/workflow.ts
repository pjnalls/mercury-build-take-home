import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import {
  RuleEnum,
  ResponseEnum,
  WorkflowStatusEnum,
  HistoryEventEnum,
} from '@prisma/client';
import { prisma } from '~/server/prisma';

// // Mock authenticated procedure. Assumes userId exists in context.
// // In a real app, this would check session/token and handle unauthorized errors.
// const protectedProcedure = t.procedure.use(async (opts) => {
//   // Mock authentication check
//   if (opts.ctx.userId === 0) {
//     throw new Error('UNAUTHORIZED: user not logged in.');
//   }
//   return opts.next({
//     ...opts.ctx,
//     ctx: {
//       // Context with validated user ID
//       userId: opts.ctx.userId,
//     },
//   });
// });

// --- 2. ZOD INPUT SCHEMAS ---

// Zod Enums for validation
const ZodRuleEnum = z.nativeEnum(RuleEnum);
const ZodResponseEnum = z.nativeEnum(ResponseEnum);

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required.'),
  description: z.string().optional(),
});

const addStepSchema = z.object({
  workflowTemplateVersionId: z.number().int().positive(),
  stepName: z.string().min(1, 'Step name is required.'),
  stepOrder: z.number().int().positive(),
  completionRuleType: ZodRuleEnum,
  kValue: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const assignUsersSchema = z.object({
  templateStepId: z.number().int().positive(),
  userIds: z
    .array(z.number().int().positive())
    .min(1, 'At least one assignee is required.'),
});

const startWorkflowSchema = z.object({
  workflowTemplateVersionId: z.number().int().positive(),
});

const submitResponseSchema = z.object({
  workflowId: z.number().int().positive(),
  responderId: z.number().int().positive(),
  responseType: ZodResponseEnum,
  description: z.string().optional(),
  // For simplicity, attachments are handled separately, but included in the payload
  fileUrl: z.string().url().optional(),
  fileName: z.string().optional(),
});

// --- 3. BUSINESS LOGIC HELPERS ---

/**
 * Checks if the responses for a given step/revision satisfy the completion rule.
 * This is the core workflow engine logic.
 */
async function checkStepCompletion(
  workflowId: number,
  templateStepId: number,
  revisionNumber: number,
  stepRule: RuleEnum,
  kValue: number | null,
): Promise<boolean> {
  const responses = await prisma.response.findMany({
    where: {
      workflowId: workflowId,
      templateStepId: templateStepId,
      revisionNumber: revisionNumber,
    },
  });

  const assigneesCount = await prisma.workflowAssignee.count({
    where: {
      workflowId: workflowId,
      templateStepId: templateStepId,
    },
  });

  const positiveCount = responses.filter(
    (r) => r.responseType === ResponseEnum.POSITIVE,
  ).length;
  const negativeCount = responses.filter(
    (r) => r.responseType === ResponseEnum.NEGATIVE,
  ).length;
  const submittedCount = positiveCount + negativeCount;

  switch (stepRule) {
    case RuleEnum.ALL:
      // All assignees must submit a POSITIVE response
      return (
        submittedCount === assigneesCount && positiveCount === assigneesCount
      );

    case RuleEnum.ANY:
      // Any single assignee submits a POSITIVE response
      return positiveCount > 0;

    case RuleEnum.K_OF_N:
      // K positive responses are required
      return positiveCount >= (kValue ?? Infinity);

    default:
      return false;
  }
}

// --- 4. WORKFLOW ROUTER ---

export const workflowRouter = router({
  // ------------------
  // TEMPLATE MANAGEMENT
  // ------------------

  /** Create a new Workflow Template and its initial Version (v1) */
  createWorkflowTemplate: publicProcedure
    .input(createTemplateSchema)
    .mutation(async ({ input }) => {
      const newTemplate = await prisma.workflowTemplate.create({
        data: {
          name: input.name,
          description: input.description,
          versions: {
            create: {
              versionNumber: 1,
              isActive: true,
            },
          },
        },
        select: {
          id: true,
          name: true,
          versions: { select: { id: true, versionNumber: true } },
        },
      });
      return {
        message: `Template "${newTemplate.name}" created successfully.`,
        templateId: newTemplate.id,
        versionId: newTemplate.versions[0].id,
      };
    }),

  /** Add an Ordered Step to a specific Template Version */
  addStepToTemplateVersion: publicProcedure
    .input(addStepSchema)
    .mutation(async ({ input }) => {
      const newStep = await prisma.templateStep.create({
        data: {
          workflowTemplateVersionId: input.workflowTemplateVersionId,
          stepName: input.stepName,
          stepOrder: input.stepOrder,
          completionRuleType: input.completionRuleType,
          kValue: input.kValue,
          metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
        },
      });
      return {
        message: `Step "${newStep.stepName}" added to version ${input.workflowTemplateVersionId}.`,
        stepId: newStep.id,
      };
    }),

  /** Assign Users to a Step within a Template Version */
  assignUsersToStep: publicProcedure
    .input(assignUsersSchema)
    .mutation(async ({ input }) => {
      const data = input.userIds.map((userId) => ({
        templateStepId: input.templateStepId,
        userId: userId,
      }));

      await prisma.templateStepAssignee.createMany({
        data: data,
      });
      return {
        message: `${input.userIds.length} user(s) assigned to step ${input.templateStepId}.`,
      };
    }),

  /** List all available Workflow Templates */
  listWorkflowTemplates: publicProcedure.input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.string().nullish(),
      }),
    ).query(async ({ input }) => {
    /**
       * For pagination docs you can have a look here
       * @see https://trpc.io/docs/v11/useInfiniteQuery
       * @see https://www.prisma.io/docs/concepts/components/prisma-client/pagination
       */

      const limit = input.limit ?? 50;
      const { cursor } = input;

      const items = await prisma.workflowTemplate.findMany({
        select: {
        id: true,
        name: true,
        description: true,
        versions: {
          where: { isActive: true },
          select: { id: true, versionNumber: true },
        },
      },
        // get an extra item at the end which we'll use as next cursor
        take: limit + 1,
        where: {},
        cursor: cursor
          ? {
              id: cursor as unknown as number,
            }
          : undefined,
        orderBy: {
          createdAt: 'desc',
        },
      });
      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        // Remove the last item and use it as next cursor

        const nextItem = items.pop()!;
        nextCursor = nextItem.id as unknown as typeof cursor;
      }

      return {
        items: items.reverse(),
        nextCursor,
      }
    
  }),

  // ------------------
  // WORKFLOW INSTANCES
  // ------------------

  /** Start a new Workflow Instance from a specific Template Version */
  // TODO: protect this procedure with authentication middleware
  startWorkflow: publicProcedure
    .input(startWorkflowSchema)
    .mutation(async ({ input }) => {
      const version = await prisma.workflowTemplateVersion.findUnique({
        where: { id: input.workflowTemplateVersionId },
        include: {
          templateSteps: {
            where: { stepOrder: 1 },
            include: { templateStepAssignees: true },
          },
        },
      });

      if (!version || !version.templateSteps[0]) {
        throw new Error('Template version or initial step not found.');
      }

      const firstStep = version.templateSteps[0];

      // 1. Create the workflow instance
      const newWorkflow = await prisma.workflow.create({
        data: {
          workflowTemplateVersionId: version.id,
          currentStepOrder: firstStep.stepOrder,
          status: WorkflowStatusEnum.IN_PROGRESS,
        },
      });

      // 2. Define runtime assignees for the first step
      const assigneeData = firstStep.templateStepAssignees.map((a) => ({
        workflowId: newWorkflow.id,
        templateStepId: firstStep.id,
        assigneeUserId: a.userId,
      }));
      await prisma.workflowAssignee.createMany({ data: assigneeData });

      // 3. Log history
      await prisma.history.create({
        data: {
          workflowId: newWorkflow.id,
          templateStepId: firstStep.id,
          eventType: HistoryEventEnum.WORKFLOW_STARTED,
        },
      });

      return {
        message: `Workflow ${newWorkflow.id} started successfully.`,
        workflowId: newWorkflow.id,
      };
    }),

  /** Submit a Response for the current step of a Workflow */
  // TODO: protectedProcedure to be implemented in a real app
  submitResponse: publicProcedure
    .input(submitResponseSchema)
    .mutation(async ({ input }) => {
      const {
        workflowId,
        responderId,
        responseType,
        description,
        fileUrl,
        fileName,
      } = input;

      const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
        include: {
          workflowTemplateVersion: {
            include: {
              templateSteps: {
                orderBy: { stepOrder: 'asc' },
              },
            },
          },
        },
      });

      if (!workflow || workflow.status !== WorkflowStatusEnum.IN_PROGRESS) {
        throw new Error('Workflow not found or is not in progress.');
      }

      const currentStep = workflow.workflowTemplateVersion.templateSteps.find(
        (s) => s.stepOrder === workflow.currentStepOrder,
      );

      if (!currentStep) {
        throw new Error(
          'Current step definition not found in template version.',
        );
      }

      // Check if the responder is a valid assignee for the current step/workflow instance
      const isAssignee = await prisma.workflowAssignee.findUnique({
        where: {
          workflowId_templateStepId_assigneeUserId: {
            workflowId: workflowId,
            templateStepId: currentStep.id,
            assigneeUserId: responderId,
          },
        },
      });

      if (!isAssignee) {
        throw new Error('user is not authorized to respond to this step.');
      }

      // 1. Determine the current revision number (or 1 if no responses yet)
      const latestResponse = await prisma.response.findFirst({
        where: { workflowId: workflowId, templateStepId: currentStep.id },
        orderBy: { revisionNumber: 'desc' },
      });
      const revisionNumber = (latestResponse?.revisionNumber || 0) + 1;

      // 2. Create the response record
      const newResponse = await prisma.response.create({
        data: {
          workflowId: workflowId,
          templateStepId: currentStep.id,
          responderId: responderId,
          responseType: responseType,
          description: description,
          revisionNumber: revisionNumber,
          attachments:
            fileUrl && fileName
              ? {
                  create: { fileUrl: fileUrl, fileName: fileName },
                }
              : undefined,
        },
      });

      // 3. Check for step completion (Core Workflow Engine Logic)
      const isCompleted = await checkStepCompletion(
        workflowId,
        currentStep.id,
        revisionNumber,
        currentStep.completionRuleType,
        currentStep.kValue,
      );

      let nextStepOrder: number | null = null;
      let historyEventType: HistoryEventEnum | null = null;
      let workflowStatus: WorkflowStatusEnum | undefined = undefined;

      if (isCompleted) {
        const allSteps = workflow.workflowTemplateVersion.templateSteps;
        const currentStepIndex = allSteps.findIndex(
          (s) => s.stepOrder === currentStep.stepOrder,
        );
        const nextStep = allSteps[currentStepIndex + 1];

        if (nextStep) {
          // Advance to the next step
          nextStepOrder = nextStep.stepOrder;
          historyEventType = HistoryEventEnum.STEP_ADVANCED;
        } else {
          // Workflow finished
          nextStepOrder = null;
          historyEventType = HistoryEventEnum.WORKFLOW_COMPLETED;
          workflowStatus = WorkflowStatusEnum.COMPLETED;
        }

        // Use transaction to ensure state update and history log are atomic
        await prisma.$transaction([
          // Update Workflow State
          prisma.workflow.update({
            where: { id: workflowId },
            data: {
              currentStepOrder: nextStepOrder ?? currentStep.stepOrder, // Keep current order if completed
              status: workflowStatus,
              completedAt:
                workflowStatus === WorkflowStatusEnum.COMPLETED
                  ? new Date()
                  : undefined,
            },
          }),
          // Log History
          prisma.history.create({
            data: {
              workflowId: workflowId,
              templateStepId: currentStep.id,
              eventType: historyEventType,
              triggeredByResponseId: newResponse.id,
              nextStepOrder: nextStepOrder,
            },
          }),
          // Note: In a real app, you would also define new workflowAssignee for the next step here
        ]);
      }

      return {
        message: isCompleted
          ? `Response submitted. Workflow advanced to step ${nextStepOrder ?? 'Completed'}.`
          : `Response submitted. Waiting for more responses to meet the ${currentStep.completionRuleType} rule.`,
        responseId: newResponse.id,
      };
    }),

  /** Query the Current State and History of a specific Workflow Instance */
  getWorkflowDetails: publicProcedure
    .input(z.object({ workflowId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const workflow = await prisma.workflow.findUnique({
        where: { id: input.workflowId },
        include: {
          workflowTemplateVersion: {
            select: {
              versionNumber: true,
              workflowTemplate: { select: { name: true } },
              templateSteps: {
                orderBy: { stepOrder: 'asc' },
                include: {
                  templateStepAssignees: {
                    include: { user: { select: { name: true, email: true } } },
                  },
                },
              },
            },
          },
          workflowAssignees: {
            include: { assignee: { select: { name: true } } },
          },
          responses: {
            orderBy: { createdAt: 'desc' },
            include: {
              responder: { select: { name: true } },
              attachments: true,
            },
          },
          history: {
            orderBy: { createdAt: 'asc' },
            include: {
              templateStep: { select: { stepName: true } },
              triggeredByResponse: {
                select: { responder: { select: { name: true } } },
              },
            },
          },
        },
      });

      if (!workflow) {
        throw new Error('Workflow not found.');
      }

      // Map data to a cleaner format for the client
      const steps = workflow.workflowTemplateVersion.templateSteps.map(
        (step) => ({
          id: step.id,
          order: step.stepOrder,
          name: step.stepName,
          rule: step.completionRuleType,
          kValue: step.kValue,
          isCurrent: step.stepOrder === workflow.currentStepOrder,
          templateAssignees: step.templateStepAssignees.map((a) => a.user.name),
        }),
      );

      const currentStep = steps.find((s) => s.isCurrent);

      return {
        id: workflow.id,
        status: workflow.status,
        templateName: workflow.workflowTemplateVersion.workflowTemplate.name,
        version: workflow.workflowTemplateVersion.versionNumber,
        currentStep: currentStep,
        steps: steps,
        activeAssignees: workflow.workflowAssignees.map((a) => a.assignee.name),
        history: workflow.history.map((h) => ({
          event: h.eventType,
          step: h.templateStep.stepName,
          triggeredBy: h.triggeredByResponse?.responder.name ?? 'System',
          timestamp: h.createdAt,
        })),
        responses: workflow.responses,
      };
    }),
  /** Query the Current State and History of a specific Workflow Instance */
  getWorkflowTemplateDetails: publicProcedure
    .input(z.object({ workflowId: z.number().int().positive() }))
    .query(async ({ input }) =>
      prisma.workflowTemplate.findUnique({
        where: { id: input.workflowId },
        include: {
          versions: {
            include: {
              templateSteps: {
                orderBy: { stepOrder: 'asc' },
                include: {
                  templateStepAssignees: {
                    include: { user: { select: { name: true, email: true } } },
                  },
                },
              },
            },
          },
        },
      }),
    ),
});

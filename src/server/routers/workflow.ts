import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import {
  PrismaClient,
  rule_enum,
  response_enum,
  workflow_status_enum,
  history_event_enum,
} from '@prisma/client';

// --- 1. PRISMA AND CONTEXT SETUP ---

// Mock Context for demonstration. In a real app, this would use Express/Next.js context.
const prisma = new PrismaClient();

// Define the structure of the context passed to all procedures
interface Context {
  prisma: PrismaClient;
  // Mock user for authentication, replace with actual auth logic
  userId: number;
}

// Initialize tRPC
const t = initTRPC.context<Context>().create();

// Define reusable procedure builders
const publicProcedure = t.procedure;
// Mock authenticated procedure. Assumes userId exists in context.
// In a real app, this would check session/token and handle unauthorized errors.
const protectedProcedure = t.procedure.use(async (opts) => {
  // Mock authentication check
  if (opts.ctx.userId === 0) {
    throw new Error('UNAUTHORIZED: User not logged in.');
  }
  return opts.next({
    ctx: {
      // Context with validated user ID
      userId: opts.ctx.userId,
    },
  });
});

// --- 2. ZOD INPUT SCHEMAS ---

// Zod Enums for validation
const ZodRuleEnum = z.nativeEnum(rule_enum);
const ZodResponseEnum = z.nativeEnum(response_enum);

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
  stepRule: rule_enum,
  kValue: number | null,
): Promise<boolean> {
  const responses = await prisma.responses.findMany({
    where: {
      workflow_id: workflowId,
      template_step_id: templateStepId,
      revision_number: revisionNumber,
    },
  });

  const assigneesCount = await prisma.workflow_assignees.count({
    where: {
      workflow_id: workflowId,
      template_step_id: templateStepId,
    },
  });

  const positiveCount = responses.filter(
    (r) => r.response_type === response_enum.POSITIVE,
  ).length;
  const negativeCount = responses.filter(
    (r) => r.response_type === response_enum.NEGATIVE,
  ).length;
  const submittedCount = positiveCount + negativeCount;

  switch (stepRule) {
    case rule_enum.ALL:
      // All assignees must submit a POSITIVE response
      return (
        submittedCount === assigneesCount && positiveCount === assigneesCount
      );

    case rule_enum.ANY:
      // Any single assignee submits a POSITIVE response
      return positiveCount > 0;

    case rule_enum.K_OF_N:
      // K positive responses are required
      return positiveCount >= (kValue ?? Infinity);

    default:
      return false;
  }
}

// --- 4. WORKFLOW ROUTER ---

export const workflowRouter = t.router({
  // ------------------
  // TEMPLATE MANAGEMENT
  // ------------------

  /** Create a new Workflow Template and its initial Version (v1) */
  createWorkflowTemplate: publicProcedure
    .input(createTemplateSchema)
    .mutation(async ({ input, ctx }) => {
      const newTemplate = await ctx.prisma.workflow_templates.create({
        data: {
          name: input.name,
          description: input.description,
          versions: {
            create: {
              version_number: 1,
              is_active: true,
            },
          },
        },
        select: {
          id: true,
          name: true,
          versions: { select: { id: true, version_number: true } },
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
    .mutation(async ({ input, ctx }) => {
      const newStep = await ctx.prisma.template_steps.create({
        data: {
          workflow_template_version_id: input.workflowTemplateVersionId,
          step_name: input.stepName,
          step_order: input.stepOrder,
          completion_rule_type: input.completionRuleType,
          k_value: input.kValue,
          metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
        },
      });
      return {
        message: `Step "${newStep.step_name}" added to version ${input.workflowTemplateVersionId}.`,
        stepId: newStep.id,
      };
    }),

  /** Assign Users to a Step within a Template Version */
  assignUsersToStep: publicProcedure
    .input(assignUsersSchema)
    .mutation(async ({ input, ctx }) => {
      const data = input.userIds.map((userId) => ({
        template_step_id: input.templateStepId,
        user_id: userId,
      }));

      await ctx.prisma.template_step_assignees.createMany({
        data: data,
      });
      return {
        message: `${input.userIds.length} user(s) assigned to step ${input.templateStepId}.`,
      };
    }),

  /** List all available Workflow Templates */
  listWorkflowTemplates: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.workflow_templates.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        versions: {
          where: { is_active: true },
          select: { id: true, version_number: true },
        },
      },
      orderBy: { id: 'asc' },
    });
  }),

  // ------------------
  // WORKFLOW INSTANCES
  // ------------------

  /** Start a new Workflow Instance from a specific Template Version */
  startWorkflow: protectedProcedure
    .input(startWorkflowSchema)
    .mutation(async ({ input, ctx }) => {
      const version = await ctx.prisma.workflow_template_versions.findUnique({
        where: { id: input.workflowTemplateVersionId },
        include: {
          template_steps: {
            where: { step_order: 1 },
            include: { template_step_assignees: true },
          },
        },
      });

      if (!version || !version.template_steps[0]) {
        throw new Error('Template version or initial step not found.');
      }

      const firstStep = version.template_steps[0];

      // 1. Create the workflow instance
      const newWorkflow = await ctx.prisma.workflows.create({
        data: {
          workflow_template_version_id: version.id,
          current_step_order: firstStep.step_order,
          status: workflow_status_enum.IN_PROGRESS,
        },
      });

      // 2. Define runtime assignees for the first step
      const assigneeData = firstStep.template_step_assignees.map((a) => ({
        workflow_id: newWorkflow.id,
        template_step_id: firstStep.id,
        assignee_user_id: a.user_id,
      }));
      await ctx.prisma.workflow_assignees.createMany({ data: assigneeData });

      // 3. Log history
      await ctx.prisma.history.create({
        data: {
          workflow_id: newWorkflow.id,
          template_step_id: firstStep.id,
          event_type: history_event_enum.WORKFLOW_STARTED,
        },
      });

      return {
        message: `Workflow ${newWorkflow.id} started successfully.`,
        workflowId: newWorkflow.id,
      };
    }),

  /** Submit a Response for the current step of a Workflow */
  submitResponse: protectedProcedure
    .input(submitResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { workflowId, responseType, description, fileUrl, fileName } =
        input;
      const responderId = ctx.userId;

      const workflow = await ctx.prisma.workflows.findUnique({
        where: { id: workflowId },
        include: {
          workflow_template_version: {
            include: {
              template_steps: {
                orderBy: { step_order: 'asc' },
              },
            },
          },
        },
      });

      if (!workflow || workflow.status !== workflow_status_enum.IN_PROGRESS) {
        throw new Error('Workflow not found or is not in progress.');
      }

      const currentStep =
        workflow.workflow_template_version.template_steps.find(
          (s) => s.step_order === workflow.current_step_order,
        );

      if (!currentStep) {
        throw new Error(
          'Current step definition not found in template version.',
        );
      }

      // Check if the responder is a valid assignee for the current step/workflow instance
      const isAssignee = await ctx.prisma.workflow_assignees.findUnique({
        where: {
          workflow_id_template_step_id_assignee_user_id: {
            workflow_id: workflowId,
            template_step_id: currentStep.id,
            assignee_user_id: responderId,
          },
        },
      });

      if (!isAssignee) {
        throw new Error('User is not authorized to respond to this step.');
      }

      // 1. Determine the current revision number (or 1 if no responses yet)
      const latestResponse = await ctx.prisma.responses.findFirst({
        where: { workflow_id: workflowId, template_step_id: currentStep.id },
        orderBy: { revision_number: 'desc' },
      });
      const revisionNumber = (latestResponse?.revision_number || 0) + 1;

      // 2. Create the response record
      const newResponse = await ctx.prisma.responses.create({
        data: {
          workflow_id: workflowId,
          template_step_id: currentStep.id,
          responder_id: responderId,
          response_type: responseType,
          description: description,
          revision_number: revisionNumber,
          attachments:
            fileUrl && fileName
              ? {
                  create: { file_url: fileUrl, file_name: fileName },
                }
              : undefined,
        },
      });

      // 3. Check for step completion (Core Workflow Engine Logic)
      const isCompleted = await checkStepCompletion(
        workflowId,
        currentStep.id,
        revisionNumber,
        currentStep.completion_rule_type,
        currentStep.k_value,
      );

      let nextStepOrder: number | null = null;
      let historyEventType: history_event_enum | null = null;
      let workflowStatus: workflow_status_enum | undefined = undefined;

      if (isCompleted) {
        const allSteps = workflow.workflow_template_version.template_steps;
        const currentStepIndex = allSteps.findIndex(
          (s) => s.step_order === currentStep.step_order,
        );
        const nextStep = allSteps[currentStepIndex + 1];

        if (nextStep) {
          // Advance to the next step
          nextStepOrder = nextStep.step_order;
          historyEventType = history_event_enum.STEP_ADVANCED;
        } else {
          // Workflow finished
          nextStepOrder = null;
          historyEventType = history_event_enum.WORKFLOW_COMPLETED;
          workflowStatus = workflow_status_enum.COMPLETED;
        }

        // Use transaction to ensure state update and history log are atomic
        await ctx.prisma.$transaction([
          // Update Workflow State
          ctx.prisma.workflows.update({
            where: { id: workflowId },
            data: {
              current_step_order: nextStepOrder ?? currentStep.step_order, // Keep current order if completed
              status: workflowStatus,
              completed_at:
                workflowStatus === workflow_status_enum.COMPLETED
                  ? new Date()
                  : undefined,
            },
          }),
          // Log History
          ctx.prisma.history.create({
            data: {
              workflow_id: workflowId,
              template_step_id: currentStep.id,
              event_type: historyEventType,
              triggered_by_response_id: newResponse.id,
              next_step_order: nextStepOrder,
            },
          }),
          // Note: In a real app, you would also define new workflow_assignees for the next step here
        ]);
      }

      return {
        message: isCompleted
          ? `Response submitted. Workflow advanced to step ${nextStepOrder ?? 'Completed'}.`
          : `Response submitted. Waiting for more responses to meet the ${currentStep.completion_rule_type} rule.`,
        responseId: newResponse.id,
      };
    }),

  /** Query the Current State and History of a specific Workflow Instance */
  getWorkflowDetails: publicProcedure
    .input(z.object({ workflowId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const workflow = await ctx.prisma.workflows.findUnique({
        where: { id: input.workflowId },
        include: {
          workflow_template_version: {
            select: {
              version_number: true,
              workflow_template: { select: { name: true } },
              template_steps: {
                orderBy: { step_order: 'asc' },
                include: {
                  template_step_assignees: {
                    include: { user: { select: { name: true, email: true } } },
                  },
                },
              },
            },
          },
          workflow_assignees: {
            include: { assignee: { select: { name: true } } },
          },
          responses: {
            orderBy: { created_at: 'desc' },
            include: {
              responder: { select: { name: true } },
              attachments: true,
            },
          },
          history: {
            orderBy: { created_at: 'asc' },
            include: {
              template_step: { select: { step_name: true } },
              triggered_by_response: {
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
      const steps = workflow.workflow_template_version.template_steps.map(
        (step) => ({
          id: step.id,
          order: step.step_order,
          name: step.step_name,
          rule: step.completion_rule_type,
          kValue: step.k_value,
          isCurrent: step.step_order === workflow.current_step_order,
          templateAssignees: step.template_step_assignees.map(
            (a) => a.user.name,
          ),
        }),
      );

      const currentStep = steps.find((s) => s.isCurrent);

      return {
        id: workflow.id,
        status: workflow.status,
        templateName: workflow.workflow_template_version.workflow_template.name,
        version: workflow.workflow_template_version.version_number,
        currentStep: currentStep,
        steps: steps,
        activeAssignees: workflow.workflow_assignees.map(
          (a) => a.assignee.name,
        ),
        history: workflow.history.map((h) => ({
          event: h.event_type,
          step: h.template_step.step_name,
          triggeredBy: h.triggered_by_response?.responder.name ?? 'System',
          timestamp: h.created_at,
        })),
        responses: workflow.responses,
      };
    }),
  /** Query the Current State and History of a specific Workflow Instance */
  getWorkflowTemplateDetails: publicProcedure
    .input(z.object({ workflowId: z.number().int().positive() }))
    .query(async ({ input, ctx }) =>
      ctx.prisma.workflow_templates.findUnique({
        where: { id: input.workflowId },
        include: {
          versions: {
            include: {
              template_steps: {
                orderBy: { step_order: 'asc' },
                include: {
                  template_step_assignees: {
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

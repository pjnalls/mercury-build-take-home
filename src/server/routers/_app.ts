/**
 * This file contains the root router of your tRPC-backend
 */
import { createCallerFactory, publicProcedure, router } from '../trpc';
import { workflowRouter } from './workflow';

export const appRouter = router({
  healthcheck: publicProcedure.query(() => 'yay!'),

  workflow: workflowRouter,
});

export const createCaller = createCallerFactory(appRouter);

export type AppRouter = typeof appRouter;

/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 *
 * Learn how to create protected base procedures and other things below:
 * @see https://trpc.io/docs/v11/router
 * @see https://trpc.io/docs/v11/procedures
 */

import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

// --- 1. Define Context Interface ---
// The context is the data passed to every tRPC procedure.
// It typically includes things like the authenticated user ID and database clients.
// We assume 'prisma' is available and 'userId' is provided by a middleware/auth layer.
interface Context {
  // We expect userId to be provided by an authentication middleware.
  // We use number here to match the `User.id` type in your schema.
  userId: number | null; 
  // Add other necessary components here, but for this example, we keep it simple.
  // prisma: PrismaClient; 
}

// --- 2. Initialize tRPC ---
export const t = initTRPC.context<Context>().create({
  // SuperJSON is highly recommended for handling complex types like Date, Map, Set, and BigInt
  // when passing data between the client and server.
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

/**
 * Create an unprotected procedure
 * @see https://trpc.io/docs/v11/procedures
 **/
export const publicProcedure = t.procedure;

/**
 * Merge multiple routers together
 * @see https://trpc.io/docs/v11/merging-routers
 */
export const mergeRouters = t.mergeRouters;

/**
 * Create a server-side caller
 * @see https://trpc.io/docs/v11/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

// --- 3. Export Procedures and Router Helpers ---

// Base router and procedure helpers
export const router = t.router;
export const procedure = t.procedure;
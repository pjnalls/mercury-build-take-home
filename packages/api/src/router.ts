import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { db } from '@repo/db'; // Import your db client
import { users } from '@repo/db/schema.js'; // Import schema

export const t = initTRPC.context<any>().create({
  transformer: superjson,
});

export const appRouter = t.router({
  getUsers: t.procedure.query(async () => {
    return await db.select().from(users).all();
  }),
});

export type AppRouter = typeof appRouter;

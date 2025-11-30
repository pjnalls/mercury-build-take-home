import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import { db } from '@repo/db'; // Import your db client
import { users } from '@repo/db/schema'; // Import schema

export const t = initTRPC.context<any>().create({
  transformer: superjson,
});

// TODO: Implement actual procedures and queries as needed
// export const appRouter = t.router({
//   getUsers: t.procedure.query(async () => {
//     return await db.select().from(users).all();
//   }),
// });

export const appRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string().nullish() }).nullish())
    .query(({ input }) => {
      const name = input?.name ?? 'world';
      return { text: `Hello, ${name}!` };
    }),
});

export type AppRouter = typeof appRouter;

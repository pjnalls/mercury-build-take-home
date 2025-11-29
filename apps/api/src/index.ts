import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '@repo/api/src/router.js';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello from Express with TypeScript and pnpm!');
});

app.use(
  '/api',
  createExpressMiddleware({
    router: appRouter,
  })
);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

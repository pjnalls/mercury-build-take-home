import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './sqlite.db', // Used by drizzle-kit CLI
  },
});

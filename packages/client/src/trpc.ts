import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, loggerLink, splitLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import { ssrPrepass } from '@trpc/next/ssrPrepass';
import type { AppRouter } from '@repo/api/src/router';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from "superjson";
import { transformer } from './transformer';

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return ''; // browser should use relative url
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`; // SSR should use Vercel url
  }

  if (process.env.EXPO_URL) {
    return `https://${process.env.EXPO_URL}`; // SSR should use Expo url
  }

  return `http://localhost:${process.env.PORT ?? 3000}`; // dev SSR should use localhost
}

export const trpcNext = createTRPCNext<AppRouter>({
  config() {
    const url = getBaseUrl() + '/api/trpc';
    return {
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url,
            transformer,
          }),
          false: httpBatchLink({
            url,
            transformer,
          }),
        }),
      ],
    };
  },
  ssr: false,
  transformer,
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ...
    },
  },
});

export const trpcExpo = createTRPCOptionsProxy<AppRouter>({
  client: createTRPCClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === "development" ||
          (opts.direction === "down" && opts.result instanceof Error),
        colorMode: "ansi",
      }),
      httpBatchLink({
        transformer: superjson,
        url: `${getBaseUrl()}/api/trpc`,
        headers() {
          const headers = new Map<string, string>();
          headers.set("x-trpc-source", "expo-react");

        //   const cookies = authClient.getCookie();
        //   if (cookies) {
        //     headers.set("Cookie", cookies);
        //   }
          return headers;
        },
      }),
    ],
  }),
  queryClient,
});
import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from './auth';

/**
 * Mounts Better Auth at /api/auth/* directly on Fastify (outside Nest routing).
 * Converts the Fastify request to a Fetch Request and the Fetch Response back.
 */
export function registerAuthRoute(fastify: FastifyInstance, auth: Auth, baseUrl: string): void {
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const headers = fromNodeHeaders(request.headers);
      // The body is re-serialised below, so the original length headers no longer apply.
      headers.delete('content-length');
      headers.delete('transfer-encoding');

      const hasBody = request.method !== 'GET' && request.body !== undefined;
      const response = await auth.handler(
        new Request(new URL(request.url, baseUrl), {
          method: request.method,
          headers,
          body: hasBody ? JSON.stringify(request.body) : undefined,
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);

      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });
}

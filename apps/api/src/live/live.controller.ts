import { Controller, Get, Inject, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { LiveService } from './live.service';

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events: tells the dashboard what changed so it refetches right away (D-079).
 * Only ids and kinds are sent; the data itself comes from the normal endpoints (RLS).
 */
@Controller('live')
@UseGuards(WorkspaceGuard)
export class LiveController {
  constructor(@Inject(LiveService) private readonly live: LiveService) {}

  @Get()
  stream(@CurrentWorkspace() workspace: WorkspaceContext, @Res() reply: FastifyReply): void {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    res.write(`event: ready\ndata: {}\n\n`);

    const unsubscribe = this.live.subscribe(workspace.tenantId, (event) => {
      res.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    res.on('close', close);
    res.on('error', close);
  }
}

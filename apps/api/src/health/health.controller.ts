import { Controller, Get } from '@nestjs/common';
import { type HealthResponse, healthResponseSchema } from '@qualify/shared';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    // Parsing our own response keeps the api honest to the shared contract.
    return healthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      version: process.env.npm_package_version ?? '0.0.0',
      time: new Date().toISOString(),
    });
  }
}

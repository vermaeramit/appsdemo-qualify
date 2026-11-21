import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ApiKeysController } from './api-keys/api-keys.controller';
import type { Env } from './config/env';
import { ActivityController } from './activity/activity.controller';
import { ConversationsController } from './conversations/conversations.controller';
import { CoreModule } from './core/core.module';
import { CostsController } from './costs/costs.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { HealthController } from './health/health.controller';
import { LeadIntakeService } from './leads/lead-intake.service';
import { LeadListService } from './leads/lead-list.service';
import { LeadsController } from './leads/leads.controller';
import { MeController } from './me/me.controller';
import { FormMappingService } from './meta-leads/form-mapping.service';
import { SimulatorService } from './playbook/simulator.service';
import { MetaLeadsController } from './meta-leads/meta-leads.controller';
import { WebhooksOutController } from './webhooks-out/webhooks-out.controller';
import { WhatsAppHealthController } from './whatsapp/whatsapp-health.controller';
import { AdminController } from './admin/admin.controller';
import { AiController } from './ai/ai.controller';
import { AiService } from './ai/ai.service';
import { SupportService } from './admin/support.service';
import { LiveController } from './live/live.controller';
import { LiveService } from './live/live.service';
import { OnboardingController } from './whatsapp/onboarding.controller';
import { OnboardingService } from './whatsapp/onboarding.service';
import { TemplatesController } from './templates/templates.controller';
import { TemplatesService } from './templates/templates.service';
import { MediaController } from './media/media.controller';
import { AgentsController } from './agents/agents.controller';
import { AgentsService } from './agents/agents.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { TemplateMediaService } from './media/template-media.service';
import { WebhooksOutService } from './webhooks-out/webhooks-out.service';
import { MessageTemplateService } from './playbook/message-template.service';
import { PlaybookController } from './playbook/playbook.controller';
import { PlaybookService } from './playbook/playbook.service';
import { QueueModule } from './queue/queue.module';
import { OriginGuard } from './security/origin.guard';
import { ENV } from './tokens';
import { LeadsV1Controller } from './v1/leads-v1.controller';
import { PlaybookV1Controller } from './v1/playbook-v1.controller';
import { MetaWebhookController } from './webhooks/meta-webhook.controller';
import { WhatsAppAccessService } from './whatsapp/whatsapp-access.service';

@Module({
  imports: [
    CoreModule,
    QueueModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          // Never log credentials.
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers["x-api-key"]',
            'req.headers["x-hub-signature-256"]',
            'req.query["hub.verify_token"]',
            'res.headers["set-cookie"]',
          ],
          serializers: {
            // The query is logged separately (redacted above); keep it out of the URL.
            req: (req: { url?: string }) => {
              req.url = req.url?.split('?')[0];
              return req;
            },
          },
          autoLogging: { ignore: (req) => req.url === '/api/health' },
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
              : undefined,
        },
      }),
    }),
  ],
  controllers: [
    HealthController,
    MeController,
    ConversationsController,
    ActivityController,
    MetaWebhookController,
    LeadsV1Controller,
    PlaybookV1Controller,
    PlaybookController,
    LeadsController,
    ApiKeysController,
    DashboardController,
    CostsController,
    MetaLeadsController,
    WebhooksOutController,
    WhatsAppHealthController,
    AdminController,
    AiController,
    LiveController,
    OnboardingController,
    TemplatesController,
    MediaController,
    AgentsController,
    ReportsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    LeadIntakeService,
    LeadListService,
    PlaybookService,
    WhatsAppAccessService,
    MessageTemplateService,
    FormMappingService,
    SimulatorService,
    LiveService,
    OnboardingService,
    TemplatesService,
    TemplateMediaService,
    AgentsService,
    ReportsService,
    WebhooksOutService,
    SupportService,
    AiService,
  ],
})
export class AppModule {}

import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { completeSignupSchema, type SignupConfig, type SignupResult } from '@qualify/shared';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { OnboardingService } from './onboarding.service';

/** Embedded Signup: connect the workspace's own WhatsApp number from the dashboard (M6). */
@Controller('whatsapp/onboarding')
@UseGuards(WorkspaceGuard)
export class OnboardingController {
  constructor(@Inject(OnboardingService) private readonly onboarding: OnboardingService) {}

  @Get('config')
  config(): SignupConfig {
    return this.onboarding.config();
  }

  @Post('complete')
  @HttpCode(200)
  complete(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<SignupResult> {
    requireManager(workspace);
    return this.onboarding.complete(workspace, parseBody(completeSignupSchema, body));
  }
}

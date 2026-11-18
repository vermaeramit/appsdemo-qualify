import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type DbHandle, getMediaAsset, withTenant } from '@qualify/db';
import { MetaApiError, uploadTemplateSample } from '@qualify/integrations';
import type { TemplateHeaderMedia } from '@qualify/shared';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

/**
 * Template review needs a sample of a media header: the stored file is uploaded with Meta's
 * Resumable Upload API (the app id + the account's token) and the handle goes in the template.
 */
@Injectable()
export class TemplateMediaService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async sampleHandle(
    tenantId: string,
    media: TemplateHeaderMedia,
    accessToken: string,
  ): Promise<{ format: TemplateHeaderMedia['kind']; handle: string }> {
    if (!this.env.META_APP_ID) {
      throw new ServiceUnavailableException(
        'META_APP_ID is needed to submit templates with media.',
      );
    }
    const asset = await withTenant(this.handle.db, tenantId, (tx) =>
      getMediaAsset(tx, media.assetId),
    );
    if (!asset) throw new BadRequestException('The header file was not found. Upload it again.');
    try {
      const handle = await uploadTemplateSample({
        appId: this.env.META_APP_ID,
        accessToken,
        bytes: asset.bytes,
        mime: asset.mime,
        fileName: asset.fileName,
        ...(this.env.META_GRAPH_VERSION ? { graphVersion: this.env.META_GRAPH_VERSION } : {}),
      });
      return { format: media.kind, handle };
    } catch (error) {
      if (error instanceof MetaApiError) {
        throw new BadRequestException(`Meta did not accept the header file: ${error.message}`);
      }
      throw error;
    }
  }
}

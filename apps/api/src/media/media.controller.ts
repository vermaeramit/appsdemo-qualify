import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type DbHandle, getMediaAsset, saveMediaAsset, withTenant } from '@qualify/db';
import { MEDIA_TYPES, type MediaAsset, mediaAssetSchema, type MediaMime } from '@qualify/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { DB } from '../tokens';

const fileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((name) => name.replace(/[^\w.\- ()]+/g, '_'));

/** Files for template headers (D-084): upload as raw bytes, read back for previews. */
@Controller('media')
@UseGuards(WorkspaceGuard)
export class MediaController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Post()
  async upload(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Query('fileName') fileNameParam: string | undefined,
  ): Promise<MediaAsset> {
    requireManager(workspace);
    const mime = String(request.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim() as MediaMime;
    const type = MEDIA_TYPES[mime];
    if (!type) throw new BadRequestException('Upload a JPEG or PNG image, an MP4 video or a PDF.');
    if (!Buffer.isBuffer(body) || body.length === 0)
      throw new BadRequestException('The file is empty.');
    if (body.length > type.maxBytes) {
      throw new BadRequestException(
        `${type.label} files can be at most ${Math.round(type.maxBytes / 1024 / 1024)} MB.`,
      );
    }
    const fileName = fileNameSchema.safeParse(fileNameParam ?? 'file');
    const asset = await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      saveMediaAsset(tx, {
        tenantId: workspace.tenantId,
        kind: type.kind,
        mime,
        fileName: fileName.success ? fileName.data : 'file',
        bytes: body,
      }),
    );
    return mediaAssetSchema.parse({ ...asset, createdAt: asset.createdAt.toISOString() });
  }

  @Get(':id')
  async read(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw new BadRequestException('Invalid id');
    const asset = await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      getMediaAsset(tx, parsed.data),
    );
    if (!asset) throw new NotFoundException('File not found');
    await reply
      .header('content-type', asset.mime)
      .header('cache-control', 'private, max-age=86400')
      .header('content-disposition', `inline; filename="${asset.fileName.replace(/"/g, '')}"`)
      .send(asset.bytes);
  }
}

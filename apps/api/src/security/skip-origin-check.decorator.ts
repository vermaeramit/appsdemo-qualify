import { SetMetadata } from '@nestjs/common';

export const SKIP_ORIGIN_CHECK = 'skipOriginCheck';

/**
 * For server-to-server endpoints that authenticate another way (e.g. Meta webhooks with an
 * HMAC signature). Never use it on cookie-authenticated routes.
 */
export const SkipOriginCheck = () => SetMetadata(SKIP_ORIGIN_CHECK, true);

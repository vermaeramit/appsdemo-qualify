import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, type DbHandle } from '@qualify/db';
import { createAuth } from '../auth/auth';
import { loadEnv, type Env } from '../config/env';
import { AUTH, DB, ENV } from '../tokens';

/** Process-wide singletons: validated env, the RLS-enforced database pool, Better Auth. */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: (): Env => loadEnv() },
    {
      provide: DB,
      inject: [ENV],
      useFactory: (env: Env): DbHandle => createDb(env.APP_DATABASE_URL),
    },
    {
      provide: AUTH,
      inject: [DB, ENV],
      useFactory: (handle: DbHandle, env: Env) => createAuth(handle.db, env),
    },
  ],
  exports: [ENV, DB, AUTH],
})
export class CoreModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.pool.end();
  }
}

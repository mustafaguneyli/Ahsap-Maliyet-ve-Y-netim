import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const UNCONFIGURED_DATABASE_URL = 'postgresql://127.0.0.1:1/zirve_unconfigured';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly configured: boolean;

  constructor() {
    const url = process.env.DATABASE_URL?.trim();
    super({ datasourceUrl: url || UNCONFIGURED_DATABASE_URL });
    this.configured = Boolean(url);
  }

  async onModuleInit(): Promise<void> {
    if (process.env.DATA_STORE === 'firestore') {
      this.logger.log('DATA_STORE=firestore; Prisma $connect atlandı. Rollback kodu duruyor.');
      return;
    }
    if (!this.configured) {
      this.logger.warn(
        'DATABASE_URL yok; PostgreSQL bağlı değil. Cloud Run localhost’a erişemez.',
      );
      return;
    }
    try {
      await this.$connect();
    } catch {
      this.logger.error('PostgreSQL bağlantısı kurulamadı.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch(() => undefined);
  }
}

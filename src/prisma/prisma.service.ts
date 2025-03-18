import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    
    // For testing purposes only
    const models = Reflect.ownKeys(this).filter(key => {
      return typeof key === 'string' && !key.startsWith('_') && key !== 'schematics';
    });

    return Promise.all(
      models.map(modelKey => {
        return this[modelKey as string].deleteMany();
      }),
    );
  }
}

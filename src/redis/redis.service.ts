import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis.Redis;

  constructor(private configService: ConfigService) {
    const redisHost = this.configService.get('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get('REDIS_PORT', 6379);
    const redisPassword = this.configService.get('REDIS_PASSWORD', '');
    
    this.redisClient = new Redis.Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword || undefined,
    });
  }

  async onModuleInit() {
    try {
      await this.redisClient.ping();
      console.log('Successfully connected to Redis');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
    }
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }

  // Check if a token exists (used for replay attack prevention)
  async isTokenUsed(token: string): Promise<boolean> {
    const exists = await this.redisClient.exists(`used_token:${token}`);
    return exists === 1;
  }

  // Store token with expiration time (TTL)
  async storeToken(token: string, userId: number, ttlSeconds: number = 86400): Promise<void> {
    await this.redisClient.setex(`used_token:${token}`, ttlSeconds, userId.toString());
  }

  getClient(): Redis.Redis {
    return this.redisClient;
  }
}

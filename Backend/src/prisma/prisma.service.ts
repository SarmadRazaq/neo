import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly maxRetries = 5;
  private readonly retryDelay = 3000; // 3 seconds

  constructor(private configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.get<string>('database.url'),
        },
      },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  private async connectWithRetry(attempt = 1): Promise<void> {
    try {
      this.logger.log(
        `Attempting database connection (attempt ${attempt}/${this.maxRetries})...`,
      );
      await this.$connect();
      this.logger.log('✅ Database connected successfully');
    } catch (error) {
      this.logger.error(
        `❌ Database connection failed (attempt ${attempt}/${this.maxRetries}): ${error.message}`,
      );

      if (attempt < this.maxRetries) {
        this.logger.log(`Retrying in ${this.retryDelay / 1000} seconds...`);
        await this.sleep(this.retryDelay);
        return this.connectWithRetry(attempt + 1);
      }

      this.logger.error(
        'Max retries reached. Unable to connect to database.',
      );
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

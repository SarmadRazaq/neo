import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { PrismaService } from '../../prisma';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const isHealthy = await this.prisma.isHealthy();

    const result = this.getStatus(key, isHealthy, {
      message: isHealthy ? 'Database connection is healthy' : 'Database connection failed',
    });

    if (isHealthy) {
      return result;
    }

    throw new HealthCheckError('Prisma health check failed', result);
  }
}

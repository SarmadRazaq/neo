import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import helmet from 'helmet';

// Fix database URL protocol before Prisma initializes
// Doppler uses psql:// but Prisma requires postgresql://
function fixDatabaseUrl() {
  const dbUrl = process.env.DB_URL || process.env.DATABASE_URL;
  if (dbUrl && dbUrl.startsWith('psql://')) {
    const fixedUrl = dbUrl.replace('psql://', 'postgresql://');
    process.env.DB_URL = fixedUrl;
    process.env.DATABASE_URL = fixedUrl;
    console.log('✅ Converted psql:// to postgresql:// in database URL');
  } else if (dbUrl) {
    // Ensure DATABASE_URL is also set for Prisma compatibility
    process.env.DATABASE_URL = dbUrl;
  }
}

// Run before anything else
fixDatabaseUrl();

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const isDev = configService.get<string>('app.nodeEnv') !== 'production';

  // CORS - must be enabled BEFORE helmet
  // In development, allow all localhost origins
  if (isDev) {
    app.enableCors({
      origin: true,  // Allow all origins in development
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    });
  } else {
    const corsOrigins = configService.get<string[]>('corsOrigins') || ['http://localhost:3000'];
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    });
  }

  // Security - helmet after CORS
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  const apiPrefix = configService.get<string>('app.apiPrefix') || '/api';
  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      'health', 
      'health/liveness', 
      'health/readiness',
      // Auth endpoints don't use /api prefix for SuperTokens compatibility
      'auth/(.*)',
    ],
  });

  // Start server
  const port = configService.get<number>('app.port') || 3000;
  await app.listen(port);

  logger.log(`🚀 NEO Backend running on port ${port}`);
  logger.log(`📖 API available at http://localhost:${port}${apiPrefix}`);
  logger.log(`❤️  Health check at http://localhost:${port}/health`);
  logger.log(`🌍 Environment: ${configService.get<string>('app.nodeEnv')}`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});

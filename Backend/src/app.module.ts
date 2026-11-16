import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config';
import { PrismaModule } from './prisma';
import { HealthModule } from './modules/health';
import { UsersModule } from './modules/users';
import { AuthModule } from './modules/auth';
import { LiveKitModule } from './modules/livekit';
import { AppController } from './app.controller';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    PrismaModule,

    // Feature Modules
    HealthModule,
    UsersModule,
    AuthModule,
    LiveKitModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

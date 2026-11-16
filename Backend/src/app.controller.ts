import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(private configService: ConfigService) {}

  @Get()
  getRoot(): { name: string; version: string; environment: string } {
    return {
      name: 'NEO Backend API',
      version: '1.0.0',
      environment: this.configService.get<string>('app.nodeEnv') || 'development',
    };
  }
}

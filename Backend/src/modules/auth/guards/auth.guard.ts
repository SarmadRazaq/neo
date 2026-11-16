import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const result = await this.authService.verifyToken(token);

      if (!result.valid || !result.user) {
        throw new UnauthorizedException(result.error || 'Invalid token');
      }

      // Attach user to request for use in controllers
      (request as any).user = result.user;
      (request as any).userId = result.user.id;

      return true;
    } catch (error) {
      this.logger.error(`Auth guard error: ${error.message}`);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}

// Export as default name for backward compatibility
export { SupabaseAuthGuard as AuthGuard };

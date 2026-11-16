import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract the current authenticated user from the request.
 * The user is attached by SupabaseAuthGuard after token verification.
 * 
 * Usage:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: SupabaseUser) { ... }
 * 
 *   @Get('profile')
 *   getProfile(@CurrentUser('id') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      return null;
    }

    // If a specific property is requested, return just that
    if (data) {
      return user[data];
    }

    return user;
  },
);

import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

interface SendCodeBody {
  email: string;
}

interface VerifyCodeBody {
  email: string;
  token: string;
  type?: 'email' | 'magiclink';
}

interface RefreshTokenBody {
  refreshToken: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Send a magic link / OTP code to the user's email
   */
  @Post('signinup/code')
  @HttpCode(HttpStatus.OK)
  async sendCode(@Body() body: SendCodeBody) {
    const { email } = body;

    if (!email || !email.includes('@')) {
      return {
        status: 'GENERAL_ERROR',
        message: 'Invalid email address',
      };
    }

    this.logger.log(`Sending magic link to: ${email}`);

    const result = await this.authService.sendMagicLink(email);

    if (result.success) {
      // Bypass mode returns session directly for auto-authentication
      if (result.bypassSession) {
        this.logger.warn(`[BYPASS] Auto-authenticated: ${email}`);
        return {
          status: 'OK',
          bypass: true,
          user: result.bypassSession.user,
          session: {
            accessToken: result.bypassSession.accessToken,
            refreshToken: result.bypassSession.refreshToken,
          },
        };
      }

      this.logger.log(`Magic link sent successfully to: ${email}`);
      return {
        status: 'OK',
        message: 'Magic link sent. Please check your email.',
      };
    }

    this.logger.error(`Failed to send magic link: ${result.error}`);
    return {
      status: 'GENERAL_ERROR',
      message: result.error || 'Failed to send magic link. Please try again.',
    };
  }

  /**
   * Resend the magic link / OTP code
   */
  @Post('signinup/code/resend')
  @HttpCode(HttpStatus.OK)
  async resendCode(@Body() body: SendCodeBody) {
    const { email } = body;

    if (!email) {
      return {
        status: 'GENERAL_ERROR',
        message: 'Email is required to resend code',
      };
    }

    this.logger.log(`Resending magic link to: ${email}`);

    const result = await this.authService.sendMagicLink(email);

    if (result.success) {
      this.logger.log('Magic link resent successfully');
      return {
        status: 'OK',
        message: 'Magic link resent. Please check your email.',
      };
    }

    return {
      status: 'GENERAL_ERROR',
      message: result.error || 'Failed to resend magic link. Please try again.',
    };
  }

  /**
   * Verify the OTP code / magic link token
   */
  @Post('signinup/code/verify')
  @HttpCode(HttpStatus.OK)
  async verifyCode(@Body() body: VerifyCodeBody) {
    const { email, token, type = 'magiclink' } = body;

    if (!email || !token) {
      return {
        status: 'GENERAL_ERROR',
        message: 'Email and token are required',
      };
    }

    this.logger.log(`Verifying code for: ${email}`);

    const result = await this.authService.verifyOtp(email, token, type);

    if (result.success) {
      this.logger.log(`User authenticated: ${email}`);
      return {
        status: 'OK',
        user: result.user ? {
          id: result.user.id,
          email: result.user.email,
          createdAt: result.user.created_at,
        } : null,
        session: result.session ? {
          accessToken: result.session.access_token,
          refreshToken: result.session.refresh_token,
          expiresIn: result.session.expires_in,
          expiresAt: result.session.expires_at,
        } : null,
      };
    }

    return {
      status: 'INVALID_CODE',
      message: result.error || 'Invalid or expired code. Please try again.',
    };
  }

  /**
   * Verify the current session / access token
   */
  @Get('session/verify')
  async verifySession(@Headers('authorization') authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        status: 'NO_SESSION',
        message: 'No authorization header',
      };
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const result = await this.authService.verifyToken(token);

    if (result.valid && result.user) {
      return {
        status: 'OK',
        session: {
          userId: result.user.id,
          email: result.user.email,
        },
      };
    }

    return {
      status: 'NO_SESSION',
      message: result.error || 'Invalid or expired session',
    };
  }

  /**
   * Refresh the access token
   */
  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() body: RefreshTokenBody) {
    const { refreshToken } = body;

    if (!refreshToken) {
      return {
        status: 'GENERAL_ERROR',
        message: 'Refresh token is required',
      };
    }

    const result = await this.authService.refreshToken(refreshToken);

    if (result.success) {
      return {
        status: 'OK',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    }

    return {
      status: 'INVALID_TOKEN',
      message: result.error || 'Failed to refresh token',
    };
  }

  /**
   * Sign out the user
   */
  @Post('signout')
  @HttpCode(HttpStatus.OK)
  async signOut(@Headers('authorization') authHeader: string) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await this.authService.signOut(token);
    }

    this.logger.log('User signed out');
    return { status: 'OK' };
  }
}

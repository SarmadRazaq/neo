import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UsersService } from '../users';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private supabase: SupabaseClient | null = null;
  private supabaseAdmin: SupabaseClient | null = null;
  private bypassAuth = false;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('supabase.url');
    const anonKey = this.configService.get<string>('supabase.anonKey');
    const serviceRoleKey = this.configService.get<string>('supabase.serviceRoleKey');
    const nodeEnv = this.configService.get<string>('app.nodeEnv');
    const bypassAuthEnv = process.env.BYPASS_AUTH;

    // Check for explicit bypass flag (development only)
    if (bypassAuthEnv === 'true' && nodeEnv === 'development') {
      this.logger.warn('⚠️ BYPASS_AUTH=true - running in BYPASS AUTH mode (development only)');
      this.bypassAuth = true;
      return;
    }

    if (!supabaseUrl || !anonKey) {
      if (nodeEnv === 'development') {
        this.logger.warn('⚠️ Supabase not configured - running in BYPASS AUTH mode (development only)');
        this.bypassAuth = true;
        return;
      }
      throw new Error('Supabase URL or anon key not configured');
    }

    this.logger.log(`Initializing Supabase with URL: ${supabaseUrl}`);

    // Client for public operations
    this.supabase = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Admin client for server-side operations (user management, etc.)
    if (serviceRoleKey) {
      this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      this.logger.log('✅ Supabase admin client initialized');
    }

    this.logger.log('✅ Supabase initialized');
  }

  /**
   * Check if running in bypass auth mode
   */
  isAuthBypassed(): boolean {
    return this.bypassAuth;
  }

  /**
   * Get the Supabase client (public)
   */
  getClient(): SupabaseClient | null {
    return this.supabase;
  }

  /**
   * Get the Supabase admin client (service role)
   */
  getAdminClient(): SupabaseClient | null {
    return this.supabaseAdmin;
  }

  /**
   * Send a magic link (OTP via email)
   */
  async sendMagicLink(email: string): Promise<{ 
    success: boolean; 
    error?: string;
    // Bypass mode returns session directly
    bypassSession?: {
      user: { id: string; email: string };
      accessToken: string;
      refreshToken: string;
    };
  }> {
    // Bypass mode for local development - auto-authenticate without database
    if (this.bypassAuth) {
      this.logger.warn(`[BYPASS] Auto-authenticating: ${email}`);
      // Generate a deterministic fake user ID from email (no database needed)
      const fakeUserId = `bypass-${Buffer.from(email).toString('base64').slice(0, 20)}`;
      return { 
        success: true,
        bypassSession: {
          user: { id: fakeUserId, email },
          accessToken: `bypass-token-${fakeUserId}`,
          refreshToken: `bypass-refresh-${fakeUserId}`,
        }
      };
    }

    if (!this.supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    try {
      const { error } = await this.supabase.auth.signInWithOtp({
        email,
        options: {
          // For magic link flow
          shouldCreateUser: true,
        },
      });

      if (error) {
        this.logger.error(`Failed to send magic link: ${error.message}`);
        return { success: false, error: error.message };
      }

      this.logger.log(`Magic link sent to: ${email}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send magic link: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify OTP code (from magic link or email code)
   */
  async verifyOtp(
    email: string,
    token: string,
    type: 'email' | 'magiclink' = 'magiclink',
  ): Promise<{ success: boolean; user?: User; session?: any; error?: string }> {
    // Bypass mode for local development - no database needed
    if (this.bypassAuth) {
      if (token === '123456') {
        this.logger.warn(`[BYPASS] OTP verified for: ${email}`);
        // Generate a deterministic fake user ID from email (no database needed)
        const fakeUserId = `bypass-${Buffer.from(email).toString('base64').slice(0, 20)}`;
        return {
          success: true,
          user: { id: fakeUserId, email } as User,
          session: {
            access_token: `bypass-token-${fakeUserId}`,
            refresh_token: `bypass-refresh-${fakeUserId}`,
          },
        };
      }
      return { success: false, error: 'Invalid code. Use "123456" in bypass mode.' };
    }

    if (!this.supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    try {
      const { data, error } = await this.supabase.auth.verifyOtp({
        email,
        token,
        type,
      });

      if (error) {
        this.logger.error(`OTP verification failed: ${error.message}`);
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Sync user to our database
        try {
          await this.usersService.getOrCreateUser(
            data.user.email!,
            data.user.id,
          );
          this.logger.log(`User synced: ${data.user.email}`);
        } catch (syncError) {
          this.logger.error(`Failed to sync user: ${syncError.message}`);
        }
      }

      return {
        success: true,
        user: data.user ?? undefined,
        session: data.session,
      };
    } catch (error) {
      this.logger.error(`OTP verification failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify a JWT access token
   */
  async verifyToken(token: string): Promise<{ valid: boolean; user?: User; error?: string }> {
    // Bypass mode for local development
    if (this.bypassAuth && token.startsWith('bypass-token-')) {
      const userId = token.replace('bypass-token-', '');
      this.logger.warn(`[BYPASS] Token verified for user: ${userId}`);
      return { 
        valid: true, 
        user: { id: userId, email: 'bypass@local.dev' } as User 
      };
    }

    if (!this.supabase) {
      return { valid: false, error: 'Supabase not initialized' };
    }

    try {
      const { data, error } = await this.supabase.auth.getUser(token);

      if (error) {
        return { valid: false, error: error.message };
      }

      return { valid: true, user: data.user };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get user by ID (admin operation)
   */
  async getUserById(userId: string): Promise<User | null> {
    if (!this.supabaseAdmin) {
      this.logger.warn('Admin client not available');
      return null;
    }

    try {
      const { data, error } = await this.supabaseAdmin.auth.admin.getUserById(userId);

      if (error) {
        this.logger.error(`Failed to get user: ${error.message}`);
        return null;
      }

      return data.user;
    } catch (error) {
      this.logger.error(`Failed to get user: ${error.message}`);
      return null;
    }
  }

  /**
   * Sign out a user (invalidate session)
   */
  async signOut(token: string): Promise<{ success: boolean; error?: string }> {
    try {
      // For admin sign out, we need to use the admin client
      // But for regular sign out, just acknowledge it
      // Supabase handles session invalidation on the client side
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Refresh an access token
   */
  async refreshToken(refreshToken: string): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    error?: string;
  }> {
    // Bypass mode for local development
    if (this.bypassAuth && refreshToken.startsWith('bypass-refresh-')) {
      const userId = refreshToken.replace('bypass-refresh-', '');
      return {
        success: true,
        accessToken: `bypass-token-${userId}`,
        refreshToken: `bypass-refresh-${userId}`,
      };
    }

    if (!this.supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        accessToken: data.session?.access_token,
        refreshToken: data.session?.refresh_token,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

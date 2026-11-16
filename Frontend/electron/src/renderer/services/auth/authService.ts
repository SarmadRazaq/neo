/**
 * Auth Service
 * Handles authentication with SuperTokens passwordless (magic link) flow
 */

export interface AuthState {
  isAuthenticated: boolean;
  userId?: string;
  email?: string;
}

export interface SendMagicLinkResult {
  success: boolean;
  deviceId?: string;
  preAuthSessionId?: string;
  error?: string;
  // Bypass mode (development) returns session directly
  bypass?: boolean;
  user?: { id: string; email: string };
  session?: { accessToken: string; refreshToken: string };
}

export interface CheckAuthStatusResult {
  status: 'OK' | 'RESTART_FLOW_ERROR' | 'INCORRECT_CODE' | 'EXPIRED' | 'PENDING';
  userId?: string;
  email?: string;
  error?: string;
}

export class AuthService {
  private backendUrl: string;
  private deviceId: string | null = null;
  private preAuthSessionId: string | null = null;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(backendUrl: string) {
    this.backendUrl = backendUrl;
  }

  /**
   * Send a magic link email to the user
   */
  async sendMagicLink(email: string): Promise<SendMagicLinkResult> {
    try {
      const response = await fetch(`${this.backendUrl}/auth/signinup/code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      
      if (data.status === 'OK') {
        // Check for bypass mode (development) - returns session directly
        if (data.bypass && data.session) {
          console.log('[BYPASS] Auto-authenticated:', data.user?.email);
          return {
            success: true,
            bypass: true,
            user: data.user,
            session: data.session,
          };
        }

        this.deviceId = data.deviceId;
        this.preAuthSessionId = data.preAuthSessionId;
        return {
          success: true,
          deviceId: data.deviceId,
          preAuthSessionId: data.preAuthSessionId,
        };
      }

      return {
        success: false,
        error: data.message || 'Failed to send magic link',
      };
    } catch (error) {
      console.error('Failed to send magic link:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Resend the magic link email
   */
  async resendMagicLink(email: string): Promise<SendMagicLinkResult> {
    try {
      const response = await fetch(`${this.backendUrl}/auth/signinup/code/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      if (!response.ok) {
        // If resend fails, try sending a new link
        return this.sendMagicLink(email);
      }

      const data = await response.json();
      
      if (data.status === 'OK') {
        // Update stored session info
        this.deviceId = data.deviceId;
        this.preAuthSessionId = data.preAuthSessionId;
        return {
          success: true,
          deviceId: data.deviceId,
          preAuthSessionId: data.preAuthSessionId,
        };
      }

      // Fallback to new link
      return this.sendMagicLink(email);
    } catch (error) {
      console.error('Failed to resend magic link:', error);
      return this.sendMagicLink(email);
    }
  }

  /**
   * Check if the user has clicked the magic link
   * This is used for polling on the check-email screen
   */
  async checkAuthStatus(): Promise<CheckAuthStatusResult> {
    try {
      // Check if we have an active session
      const response = await fetch(`${this.backendUrl}/auth/session/verify`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK') {
          return {
            status: 'OK',
            userId: data.session?.userId,
            email: data.session?.email,
          };
        }
      }

      return { status: 'PENDING' };
    } catch (error) {
      console.error('Failed to check auth status:', error);
      return { status: 'PENDING' };
    }
  }

  /**
   * Start polling for auth status
   */
  startPolling(
    onAuthenticated: (userId: string, email?: string) => void,
    onError?: (error: string) => void,
    intervalMs: number = 3000
  ): void {
    this.stopPolling();

    this.pollInterval = setInterval(async () => {
      const result = await this.checkAuthStatus();
      
      if (result.status === 'OK' && result.userId) {
        this.stopPolling();
        onAuthenticated(result.userId, result.email);
      } else if (result.status === 'RESTART_FLOW_ERROR' || result.status === 'EXPIRED') {
        this.stopPolling();
        onError?.(result.error || 'Session expired. Please request a new link.');
      }
    }, intervalMs);
  }

  /**
   * Stop polling for auth status
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Consume a magic link code (called when user clicks the link)
   * This is typically handled by a callback URL, but can also be done manually
   */
  async consumeCode(linkCode: string): Promise<CheckAuthStatusResult> {
    if (!this.preAuthSessionId) {
      return {
        status: 'RESTART_FLOW_ERROR',
        error: 'No active session. Please request a new link.',
      };
    }

    try {
      const response = await fetch(`${this.backendUrl}/auth/signinup/code/consume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preAuthSessionId: this.preAuthSessionId,
          linkCode,
        }),
        credentials: 'include',
      });

      const data = await response.json();
      
      if (data.status === 'OK') {
        return {
          status: 'OK',
          userId: data.user?.id,
          email: data.user?.emails?.[0],
        };
      }

      return {
        status: data.status as CheckAuthStatusResult['status'],
        error: data.message || 'Invalid or expired link',
      };
    } catch (error) {
      console.error('Failed to consume code:', error);
      return {
        status: 'RESTART_FLOW_ERROR',
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    this.stopPolling();
    this.deviceId = null;
    this.preAuthSessionId = null;

    try {
      await fetch(`${this.backendUrl}/auth/signout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Failed to sign out:', error);
    }

    // Also clear local storage in Electron
    if (window.electronAPI) {
      await window.electronAPI.clearAuth();
    }
  }

  /**
   * Get current auth state
   */
  async getAuthState(): Promise<AuthState> {
    const result = await this.checkAuthStatus();
    
    return {
      isAuthenticated: result.status === 'OK',
      userId: result.userId,
      email: result.email,
    };
  }
}

// Singleton instance
let authServiceInstance: AuthService | null = null;

export async function getAuthService(): Promise<AuthService> {
  if (!authServiceInstance) {
    const backendUrl = window.electronAPI 
      ? await window.electronAPI.getBackendUrl()
      : 'http://localhost:3000';
    authServiceInstance = new AuthService(backendUrl);
  }
  return authServiceInstance;
}

export function resetAuthService(): void {
  if (authServiceInstance) {
    authServiceInstance.stopPolling();
  }
  authServiceInstance = null;
}

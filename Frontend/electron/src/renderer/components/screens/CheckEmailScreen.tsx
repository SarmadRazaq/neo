import React, { useEffect, useState } from 'react';
import { Mail, Loader2, RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react';
import { NeoBackground } from '../ui/NeoBackground';
import './CheckEmailScreen.css';

interface CheckEmailScreenProps {
  email: string;
  onResendLink: () => Promise<void>;
  onAuthenticated: () => void;
  onBack?: () => void;
  onError?: (error: string) => void;
  authService?: {
    startPolling: (
      onAuthenticated: (userId: string, email?: string) => void,
      onError?: (error: string) => void,
      intervalMs?: number
    ) => void;
    stopPolling: () => void;
  };
}

export const CheckEmailScreen: React.FC<CheckEmailScreenProps> = ({ 
  email, 
  onResendLink,
  onAuthenticated,
  onBack,
  onError,
  authService
}) => {
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Start polling for auth status when component mounts
  useEffect(() => {
    if (authService) {
      authService.startPolling(
        (_userId, _email) => {
          onAuthenticated();
        },
        (errorMsg) => {
          setError(errorMsg);
          onError?.(errorMsg);
        },
        3000 // Poll every 3 seconds
      );

      return () => {
        authService.stopPolling();
      };
    }
  }, [authService, onAuthenticated, onError]);

  // Handle cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResend = async () => {
    if (isResending || resendCooldown > 0) return;
    
    setIsResending(true);
    setError(null);
    setResendSuccess(false);
    
    try {
      await onResendLink();
      setResendSuccess(true);
      setResendCooldown(60); // 60 second cooldown
      
      // Hide success message after 3 seconds
      setTimeout(() => setResendSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend link');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <NeoBackground glowIntensity="medium" showRings={false}>
      <div className="check-email-screen" role="main" aria-label="Check your email">
        {/* Back button */}
        {onBack && (
          <button 
            className="check-email-back-btn"
            onClick={onBack}
            aria-label="Go back to login"
          >
            <ArrowLeft size={20} />
          </button>
        )}

        {/* Content */}
        <div className="check-email-content">
          {/* Icon */}
          <div className="check-email-icon-container">
            <Mail size={32} strokeWidth={1.5} />
          </div>

          {/* Text */}
          <h1 className="check-email-title">Check your email</h1>
          
          <div className="check-email-info">
            <p className="check-email-subtitle">We sent a sign-in link to:</p>
            <p className="check-email-address">{email}</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="check-email-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Success message */}
          {resendSuccess && (
            <div className="check-email-success" role="status">
              <span>✓ New link sent!</span>
            </div>
          )}

          {/* Status */}
          <div className="check-email-status" role="status" aria-live="polite">
            <Loader2 size={18} className="check-email-spinner" />
            <span>Waiting for confirmation</span>
          </div>

          {/* Instructions */}
          <p className="check-email-instructions">
            Click the link in your email to sign in. 
            The link will expire in 15 minutes.
          </p>

          {/* Resend Button */}
          <button 
            className="neo-btn-secondary check-email-resend-btn"
            onClick={handleResend}
            disabled={isResending || resendCooldown > 0}
            aria-label={
              isResending 
                ? "Resending link..." 
                : resendCooldown > 0 
                  ? `Wait ${resendCooldown}s to resend` 
                  : "Resend sign-in link"
            }
          >
            {isResending ? (
              <>
                <Loader2 size={16} className="check-email-btn-spinner" />
                <span>Sending...</span>
              </>
            ) : resendCooldown > 0 ? (
              <>
                <RefreshCw size={16} />
                <span>Resend in {resendCooldown}s</span>
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                <span>Resend link</span>
              </>
            )}
          </button>

          {/* Tip */}
          <p className="check-email-tip">
            Didn't receive the email? Check your spam folder.
          </p>
        </div>
      </div>
    </NeoBackground>
  );
};

export default CheckEmailScreen;

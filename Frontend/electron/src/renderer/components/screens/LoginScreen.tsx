import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { NeoBackground } from '../ui/NeoBackground';
import './LoginScreen.css';

interface LoginScreenProps {
  onSubmit: (email: string) => Promise<void>;
  onNeedHelp?: () => void;
  error?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ 
  onSubmit, 
  onNeedHelp,
  error 
}) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    
    const trimmedEmail = email.trim();
    
    if (!trimmedEmail) {
      setValidationError('Please enter your email address');
      return;
    }
    
    if (!validateEmail(trimmedEmail)) {
      setValidationError('Please enter a valid email address');
      return;
    }
    
    setIsLoading(true);
    try {
      await onSubmit(trimmedEmail);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSubmit(e);
    }
  };

  const displayError = validationError || error;

  return (
    <NeoBackground glowIntensity="medium" showRings={true}>
      <div className="login-screen" role="main" aria-label="Login screen">
        {/* Content */}
        <div className="login-content">
          <header className="login-header">
            <h1 className="login-title">Welcome</h1>
            <p className="login-subtitle">Sign in to continue to NEO</p>
          </header>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email" className="neo-label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className={`neo-input ${displayError ? 'neo-input-error' : ''}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setValidationError(null);
                }}
                onKeyPress={handleKeyPress}
                placeholder="name@email.com"
                aria-required="true"
                aria-describedby={displayError ? 'email-error' : 'email-hint'}
                aria-invalid={!!displayError}
                autoComplete="email"
                autoFocus
                disabled={isLoading}
              />
              
              {displayError && (
                <p id="email-error" className="login-error" role="alert">
                  {displayError}
                </p>
              )}
            </div>

            <p id="email-hint" className="login-hint">
              We'll email you a secure sign-in link.
            </p>

            <button 
              type="submit" 
              className="neo-btn-primary login-submit-btn"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="login-spinner" />
                  <span>Sending...</span>
                </>
              ) : (
                'Send sign-in link'
              )}
            </button>
          </form>

          <button 
            type="button" 
            className="neo-btn-ghost login-help-link"
            onClick={onNeedHelp}
            disabled={isLoading}
          >
            Need help signing in?
          </button>
        </div>
      </div>
    </NeoBackground>
  );
};

export default LoginScreen;

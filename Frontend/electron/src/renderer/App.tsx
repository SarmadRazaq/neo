import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Accessibility } from '../utils/accessibility';
import { getAuthService, AuthService } from './services/auth';
import { 
  LoginScreen, 
  CheckEmailScreen, 
  MicPermissionScreen, 
  AudioTestScreen,
  SplashScreen,
  VoiceState 
} from './components/screens';
import { LiveKitVoiceScreen } from './components/screens/LiveKitVoiceScreen';
import { OrbDemo } from './components/ui/OrbDemo';
import './styles/theme.css';
import './App.css';

// Types are defined in types/electron.d.ts

interface LiveKitConfig {
  url: string;
  token: string;
}

type AppScreen = 
  | 'splash'
  | 'login' 
  | 'check-email' 
  | 'mic-permission' 
  | 'audio-test' 
  | 'voice'
  | 'orb-demo';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('splash');
  const [splashComplete, setSplashComplete] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [testingMode, setTestingMode] = useState(false);
  const [email, setEmail] = useState('');
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [liveKitConfig, setLiveKitConfig] = useState<LiveKitConfig | null>(null);
  const [liveKitError, setLiveKitError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  
  // Ref to track if we've initialized
  const initializedRef = useRef(false);

  // Initialize: check testing mode, then auth (if not testing)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      // Check if we're in testing mode
      const isTesting = window.electronAPI 
        ? await window.electronAPI.isTestingMode() 
        : false;

      if (isTesting) {
        console.log('[Testing] Testing mode active — skipping auth & onboarding');
        setTestingMode(true);
        return; // Skip auth init entirely
      }

      // Normal mode: initialize auth service
      try {
        const service = await getAuthService();
        setAuthService(service);

        // Check if user is already authenticated
        const authState = await service.getAuthState();
        if (authState.isAuthenticated) {
          setIsAuthenticated(true);
          if (authState.email) {
            setEmail(authState.email);
          }
        }
      } catch (error) {
        console.error('Failed to initialize auth service:', error);
      }
    };

    init();
  }, []);

  // Handle splash screen completion
  const handleSplashComplete = useCallback(() => {
    setSplashComplete(true);

    if (testingMode) {
      // Testing mode: skip straight to voice screen
      console.log('[Testing] Splash complete — jumping to voice screen');
      setCurrentScreen('voice');
      return;
    }

    // Normal mode: check if already authenticated, otherwise go to login
    if (isAuthenticated) {
      setCurrentScreen('mic-permission');
    } else {
      setCurrentScreen('login');
    }
  }, [isAuthenticated, testingMode]);

  // Load LiveKit session from backend
  // In testing mode: start immediately (no auth needed, backend has BYPASS_AUTH)
  // In normal mode: wait until authenticated
  useEffect(() => {
    const loadLiveKitSession = async () => {
      const shouldLoad = testingMode || isAuthenticated;
      if (shouldLoad && window.electronAPI) {
        try {
          // Get session from backend (includes roomName, token, url)
          console.log(`[LiveKit] Requesting session (testing=${testingMode})...`);
          const session = await window.electronAPI.getLiveKitSession();
          
          if (session) {
            setLiveKitConfig({ url: session.url, token: session.token });
            setLiveKitError(null);
            console.log(`[LiveKit] Session ready: room=${session.roomName}`);
          } else {
            setLiveKitError('Failed to create voice session. Backend may be unavailable.');
          }
        } catch (error) {
          console.error('Failed to load LiveKit session:', error);
          setLiveKitError('Failed to connect to voice service.');
        }
      }
    };

    loadLiveKitSession();
  }, [isAuthenticated, testingMode]);

  // === Screen Handlers ===

  const handleLoginSubmit = async (submittedEmail: string) => {
    setAuthError(null);
    setEmail(submittedEmail);

    if (!authService) {
      setAuthError('Auth service not initialized. Please try again.');
      return;
    }

    const result = await authService.sendMagicLink(submittedEmail);

    if (result.success) {
      // Bypass mode (development) - auto-authenticate
      if (result.bypass && result.session) {
        console.log('[BYPASS] Auto-authenticated, skipping email check');
        // Store access token in electron if available
        if (window.electronAPI && result.session.accessToken) {
          await window.electronAPI.setAuthToken(result.session.accessToken);
        }
        setIsAuthenticated(true);
        setCurrentScreen('mic-permission');
        Accessibility.announce('Signed in successfully (development mode).');
        return;
      }

      setCurrentScreen('check-email');
      Accessibility.announce('Sign-in link sent. Please check your email.');
    } else {
      setAuthError(result.error || 'Failed to send sign-in link. Please try again.');
      Accessibility.announce('Error: ' + (result.error || 'Failed to send link'), 'assertive');
    }
  };

  const handleResendLink = async () => {
    if (!authService || !email) return;

    const result = await authService.resendMagicLink(email);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to resend link');
    }

    Accessibility.announce('Sign-in link resent');
  };

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
    setCurrentScreen('mic-permission');
    Accessibility.announce('Successfully signed in. Please allow microphone access.');
  };

  const handleAuthError = (error: string) => {
    setAuthError(error);
    setCurrentScreen('login');
    Accessibility.announce('Sign-in failed: ' + error, 'assertive');
  };

  const handleBackToLogin = () => {
    authService?.stopPolling();
    setCurrentScreen('login');
  };

  const handleAllowMicrophone = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setCurrentScreen('audio-test');
      Accessibility.announce('Microphone access granted. Please test your audio.');
    } catch (error) {
      console.error('Microphone permission denied:', error);
      Accessibility.announce('Microphone access denied', 'assertive');
    }
  };

  const handleContinueWithoutVoice = () => {
    setCurrentScreen('voice');
    Accessibility.announce('Continuing without voice. Voice features will be limited.');
  };

  const handleAudioConfirmed = () => {
    setCurrentScreen('voice');
    Accessibility.announce('Audio confirmed. Welcome to NEO.');
  };

  const handleAudioNotHeard = () => {
    Accessibility.announce('Please check your audio settings and try again.', 'assertive');
  };

  const handleLogout = async () => {
    if (authService) {
      await authService.signOut();
    }
    if (window.electronAPI) {
      await window.electronAPI.clearAuth();
    }
    setIsAuthenticated(false);
    setEmail('');
    setLiveKitConfig(null);
    setCurrentScreen('login');
    setVoiceState('idle');
    setAuthError(null);
    Accessibility.announce('Logged out successfully');
  };

  // === Render Screens ===

  // Splash screen - shows for 5 seconds on app start
  if (currentScreen === 'splash') {
    return (
      <SplashScreen 
        duration={5000}
        onComplete={handleSplashComplete}
      />
    );
  }

  // DEV: Orb demo screen - remove before production
  if (currentScreen === 'orb-demo') {
    return (
      <div style={{ position: 'relative' }}>
        <button 
          onClick={() => setCurrentScreen('login')}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            padding: '8px 16px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: 'white',
            cursor: 'pointer',
            zIndex: 100
          }}
        >
          ← Back to Login
        </button>
        <OrbDemo />
      </div>
    );
  }

  if (currentScreen === 'login') {
    return (
      <LoginScreen 
        onSubmit={handleLoginSubmit}
        onNeedHelp={() => setCurrentScreen('orb-demo')} // DEV: Shows orb demo
        error={authError}
      />
    );
  }

  if (currentScreen === 'check-email') {
    return (
      <CheckEmailScreen 
        email={email}
        onResendLink={handleResendLink}
        onAuthenticated={handleAuthSuccess}
        onBack={handleBackToLogin}
        onError={handleAuthError}
        authService={authService || undefined}
      />
    );
  }

  if (currentScreen === 'mic-permission') {
    return (
      <MicPermissionScreen 
        onAllowMicrophone={handleAllowMicrophone}
        onContinueWithoutVoice={handleContinueWithoutVoice}
      />
    );
  }

  if (currentScreen === 'audio-test') {
    return (
      <AudioTestScreen 
        onCanHear={handleAudioConfirmed}
        onCannotHear={handleAudioNotHeard}
      />
    );
  }

  // Main voice screen - now using real LiveKit connection
  if (liveKitConfig) {
    return (
      <LiveKitVoiceScreen 
        token={liveKitConfig.token}
        serverUrl={liveKitConfig.url}
        onClose={handleLogout}
        onError={(error: Error) => {
          console.error('LiveKit error:', error);
          setLiveKitError(error.message);
        }}
      />
    );
  }

  // Show error or loading state if LiveKit not ready
  return (
    <div className="neo-container" style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '1.5rem',
      color: 'white',
      textAlign: 'center',
      padding: '2rem',
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)'
    }}>
      {liveKitError ? (
        <>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Connection Error</h2>
          <p style={{ opacity: 0.7 }}>{liveKitError}</p>
          <button onClick={handleLogout} className="neo-btn-secondary">
            Go Back
          </button>
        </>
      ) : (
        <>
          <div className="voice-spinner" style={{ width: 48, height: 48 }} />
          <p style={{ fontSize: '1.125rem' }}>Connecting to NEO...</p>
          <p style={{ fontSize: '0.875rem', opacity: 0.6 }}>Please wait while we set up your session</p>
        </>
      )}
    </div>
  );
};

export default App;

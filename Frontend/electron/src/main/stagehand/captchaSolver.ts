/**
 * Captcha Detection and Solving Module
 * 
 * Detects common captcha types and solves them using third-party services.
 * Supports: reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile
 */

// Use a generic Page interface to support both Playwright and Stagehand page types
interface PageLike {
  url(): string;
  evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T>;
  $?(selector: string): Promise<any>;
  waitForTimeout?(ms: number): Promise<void>;
  waitForLoadState?(state?: string): Promise<void>;
}

// ==================== Types ====================

export interface CaptchaSolverConfig {
  apiKey: string;
  service: 'twocaptcha' | 'anticaptcha' | 'capmonster' | 'capsolver';
  /** Timeout in ms for waiting for solution (default: 120000) */
  timeout?: number;
}

export interface CaptchaDetectionResult {
  detected: boolean;
  type?: 'recaptcha-v2' | 'recaptcha-v3' | 'hcaptcha' | 'turnstile' | 'funcaptcha';
  siteKey?: string;
  pageUrl?: string;
  /** For reCAPTCHA v3 */
  action?: string;
  /** Additional data for specific captcha types */
  data?: Record<string, any>;
}

export interface CaptchaSolveResult {
  success: boolean;
  token?: string;
  error?: string;
}

// ==================== Service Endpoints ====================

const SERVICE_ENDPOINTS = {
  twocaptcha: {
    submit: 'https://2captcha.com/in.php',
    result: 'https://2captcha.com/res.php',
  },
  anticaptcha: {
    submit: 'https://api.anti-captcha.com/createTask',
    result: 'https://api.anti-captcha.com/getTaskResult',
  },
  capmonster: {
    submit: 'https://api.capmonster.cloud/createTask',
    result: 'https://api.capmonster.cloud/getTaskResult',
  },
  capsolver: {
    submit: 'https://api.capsolver.com/createTask',
    result: 'https://api.capsolver.com/getTaskResult',
  },
};

// ==================== Captcha Solver Class ====================

export class CaptchaSolver {
  private config: CaptchaSolverConfig;
  private timeout: number;

  constructor(config: CaptchaSolverConfig) {
    this.config = config;
    this.timeout = config.timeout || 120000;
    console.log(`[CaptchaSolver] Initialized with service: ${config.service}`);
  }

  // ==================== Detection ====================

  /**
   * Detect if the current page has a BLOCKING captcha
   * Only returns detected=true if the captcha is actually preventing access to content
   * 
   * NOTE: Some sites (like Reddit) show captcha as an overlay on top of content,
   * so we check for captcha iframes/elements even if the page has content.
   */
  async detectCaptcha(page: PageLike): Promise<CaptchaDetectionResult> {
    const pageUrl = page.url();
    console.log(`[CaptchaSolver] Scanning for captchas on: ${pageUrl}`);

    // First, check for visible captcha overlays/modals (these can appear on pages with content)
    const hasVisibleCaptcha = await this.hasVisibleCaptchaChallenge(page);
    if (hasVisibleCaptcha.detected) {
      console.log(`[CaptchaSolver] Found visible captcha overlay: ${hasVisibleCaptcha.type}`);
      return { ...hasVisibleCaptcha, pageUrl };
    }

    // Then check if the page has actual content (not fully blocked)
    const hasContent = await this.pageHasMainContent(page);
    if (hasContent) {
      console.log(`[CaptchaSolver] Page has main content, no blocking captcha`);
      return { detected: false };
    }

    // Check if this looks like a dedicated captcha/challenge page
    const isBlockingPage = await this.isBlockingCaptchaPage(page);
    if (!isBlockingPage) {
      console.log(`[CaptchaSolver] Page doesn't appear to be blocked by captcha`);
      return { detected: false };
    }

    // Check for reCAPTCHA v2 (checkbox)
    const recaptchaV2 = await this.detectRecaptchaV2(page);
    if (recaptchaV2.detected) {
      console.log(`[CaptchaSolver] Detected: reCAPTCHA v2 (blocking)`);
      return { ...recaptchaV2, pageUrl };
    }

    // Check for reCAPTCHA v3 (invisible) - only if blocking
    const recaptchaV3 = await this.detectRecaptchaV3(page);
    if (recaptchaV3.detected) {
      console.log(`[CaptchaSolver] Detected: reCAPTCHA v3 (blocking)`);
      return { ...recaptchaV3, pageUrl };
    }

    // Check for hCaptcha
    const hcaptcha = await this.detectHCaptcha(page);
    if (hcaptcha.detected) {
      console.log(`[CaptchaSolver] Detected: hCaptcha (blocking)`);
      return { ...hcaptcha, pageUrl };
    }

    // Check for Cloudflare Turnstile
    const turnstile = await this.detectTurnstile(page);
    if (turnstile.detected) {
      console.log(`[CaptchaSolver] Detected: Cloudflare Turnstile (blocking)`);
      return { ...turnstile, pageUrl };
    }

    // Check for Cloudflare challenge page
    const cfChallenge = await this.detectCloudflareChallenge(page);
    if (cfChallenge.detected) {
      console.log(`[CaptchaSolver] Detected: Cloudflare Challenge (blocking)`);
      return { ...cfChallenge, pageUrl };
    }

    console.log(`[CaptchaSolver] No blocking captcha detected`);
    return { detected: false };
  }

  /**
   * Check for visible captcha challenges that appear as overlays/modals
   * These can appear on pages that also have content (like Reddit's image challenge)
   */
  private async hasVisibleCaptchaChallenge(page: PageLike): Promise<CaptchaDetectionResult> {
    try {
      const result = await page.evaluate(() => {
        // Check for visible captcha iframes/modals
        const indicators = {
          // reCAPTCHA visible challenge
          recaptchaChallenge: document.querySelector('iframe[src*="recaptcha"][src*="bframe"]'),
          recaptchaVisible: document.querySelector('.g-recaptcha-bubble-arrow, .rc-imageselect'),
          // hCaptcha visible challenge  
          hcaptchaChallenge: document.querySelector('iframe[src*="hcaptcha.com/captcha"]'),
          hcaptchaVisible: document.querySelector('.h-captcha-modal, [data-hcaptcha-widget-id]'),
          // Generic visible captcha indicators
          captchaModal: document.querySelector('[class*="captcha-modal"], [id*="captcha-modal"]'),
          verifyDialog: document.querySelector('[class*="verify-dialog"], [role="dialog"][aria-label*="verify"]'),
        };
        
        // Check for reCAPTCHA image challenge specifically (the "click all squares" type)
        if (indicators.recaptchaChallenge || indicators.recaptchaVisible) {
          // Find the sitekey
          const grecaptcha = document.querySelector('.g-recaptcha');
          const siteKey = grecaptcha?.getAttribute('data-sitekey');
          
          // Check if it's actually visible (not just present in DOM)
          const iframe = document.querySelector('iframe[src*="recaptcha"]') as HTMLIFrameElement;
          if (iframe) {
            const rect = iframe.getBoundingClientRect();
            const isVisible = rect.width > 50 && rect.height > 50;
            if (isVisible) {
              return { type: 'recaptcha-v2', siteKey, visible: true };
            }
          }
        }
        
        // Check for hCaptcha visible challenge
        if (indicators.hcaptchaChallenge || indicators.hcaptchaVisible) {
          const hcaptcha = document.querySelector('.h-captcha');
          const siteKey = hcaptcha?.getAttribute('data-sitekey');
          
          const iframe = document.querySelector('iframe[src*="hcaptcha"]') as HTMLIFrameElement;
          if (iframe) {
            const rect = iframe.getBoundingClientRect();
            const isVisible = rect.width > 50 && rect.height > 50;
            if (isVisible) {
              return { type: 'hcaptcha', siteKey, visible: true };
            }
          }
        }
        
        // Check for modal/dialog with captcha-related content
        if (indicators.captchaModal || indicators.verifyDialog) {
          return { type: 'unknown', visible: true };
        }
        
        // Check for image selection challenge text
        const bodyText = document.body?.innerText?.toLowerCase() || '';
        const hasImageChallenge = bodyText.includes('select all images') || 
                                   bodyText.includes('click all') ||
                                   bodyText.includes('tap all') ||
                                   bodyText.includes('select each image');
        if (hasImageChallenge) {
          // Try to find sitekey from any reCAPTCHA element
          const grecaptcha = document.querySelector('[data-sitekey]');
          const siteKey = grecaptcha?.getAttribute('data-sitekey');
          return { type: 'recaptcha-v2', siteKey, visible: true };
        }
        
        return null;
      });
      
      if (result && result.visible) {
        return {
          detected: true,
          type: result.type as CaptchaDetectionResult['type'],
          siteKey: result.siteKey || undefined,  // Convert null to undefined
        };
      }
    } catch (e) {
      console.error('[CaptchaSolver] Error checking for visible captcha:', e);
    }
    
    return { detected: false };
  }

  /**
   * Check if the page has actual main content (not just a captcha page)
   */
  private async pageHasMainContent(page: PageLike): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        // Check for common indicators of real content
        const body = document.body;
        if (!body) return false;

        // Get text content length (excluding scripts and styles)
        const clone = body.cloneNode(true) as HTMLElement;
        const scripts = clone.querySelectorAll('script, style, noscript');
        scripts.forEach(s => s.remove());
        const textLength = (clone.textContent || '').replace(/\s+/g, ' ').trim().length;

        // If there's substantial text content, page likely has real content
        if (textLength > 1000) {
          console.log(`[CaptchaSolver] Page has ${textLength} chars of text content`);
          return true;
        }

        // Check for common content elements
        const hasArticles = document.querySelectorAll('article, [role="article"]').length > 0;
        const hasPosts = document.querySelectorAll('[data-testid*="post"], .Post, .thing, .link').length > 0;
        const hasMainContent = document.querySelectorAll('main, [role="main"], #main-content').length > 0;
        const hasFeed = document.querySelectorAll('[data-testid*="feed"], .feed, #siteTable').length > 0;

        if (hasArticles || hasPosts || (hasMainContent && textLength > 500) || hasFeed) {
          console.log('[CaptchaSolver] Page has content elements');
          return true;
        }

        return false;
      });
    } catch (e) {
      console.error('[CaptchaSolver] Error checking page content:', e);
      return false;
    }
  }

  /**
   * Check if the page appears to be a dedicated captcha/challenge blocking page
   */
  private async isBlockingCaptchaPage(page: PageLike): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() || '';
        const title = document.title?.toLowerCase() || '';

        // Common blocking page indicators
        const blockingPhrases = [
          'prove your humanity',
          'verify you are human',
          'are you a robot',
          'not a robot',
          'security check',
          'please verify',
          'complete the captcha',
          'just a moment',
          'checking your browser',
          'ddos protection',
          'access denied',
          'please wait while we verify',
        ];

        for (const phrase of blockingPhrases) {
          if (bodyText.includes(phrase) || title.includes(phrase)) {
            console.log(`[CaptchaSolver] Found blocking phrase: "${phrase}"`);
            return true;
          }
        }

        // Check if page is mostly empty with just a captcha
        const visibleElements = document.querySelectorAll('body > *:not(script):not(style):not(noscript)');
        if (visibleElements.length < 5) {
          // Very few elements - might be a challenge page
          const hasRecaptcha = !!document.querySelector('iframe[src*="recaptcha"]');
          const hasHcaptcha = !!document.querySelector('iframe[src*="hcaptcha"]');
          const hasTurnstile = !!document.querySelector('iframe[src*="challenges.cloudflare"]');
          
          if (hasRecaptcha || hasHcaptcha || hasTurnstile) {
            console.log('[CaptchaSolver] Minimal page with captcha iframe');
            return true;
          }
        }

        return false;
      });
    } catch (e) {
      console.error('[CaptchaSolver] Error checking if blocking page:', e);
      return false;
    }
  }

  private async detectRecaptchaV2(page: PageLike): Promise<CaptchaDetectionResult> {
    try {
      const result = await page.evaluate(() => {
        // Check for reCAPTCHA iframe
        const iframe = document.querySelector('iframe[src*="recaptcha"][src*="anchor"]');
        if (!iframe) return null;

        // Find sitekey from various sources
        const grecaptcha = document.querySelector('.g-recaptcha');
        let siteKey = grecaptcha?.getAttribute('data-sitekey');

        // Try to find in script tags
        if (!siteKey) {
          const scripts = Array.from(document.querySelectorAll('script[src*="recaptcha"]'));
          for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].getAttribute('src') || '';
            const match = src.match(/[?&]render=([^&]+)/);
            if (match && match[1] !== 'explicit') {
              siteKey = match[1];
              break;
            }
          }
        }

        return siteKey ? { siteKey } : null;
      });

      if (result) {
        return { detected: true, type: 'recaptcha-v2', siteKey: result.siteKey };
      }
    } catch (e) {
      console.error('[CaptchaSolver] Error detecting reCAPTCHA v2:', e);
    }
    return { detected: false };
  }

  private async detectRecaptchaV3(page: PageLike): Promise<CaptchaDetectionResult> {
    try {
      const result = await page.evaluate(() => {
        // Check for grecaptcha object with enterprise or v3
        const scripts = Array.from(document.querySelectorAll('script[src*="recaptcha"]'));
        for (let i = 0; i < scripts.length; i++) {
          const src = scripts[i].getAttribute('src') || '';
          const match = src.match(/[?&]render=([^&]+)/);
          if (match && match[1] !== 'explicit') {
            return { siteKey: match[1] };
          }
        }

        // Check for hidden input with recaptcha response
        const hidden = document.querySelector('input[name="g-recaptcha-response"]');
        if (hidden) {
          // Try to find sitekey from nearby elements
          const form = hidden.closest('form');
          const dataKey = form?.getAttribute('data-sitekey');
          if (dataKey) return { siteKey: dataKey };
        }

        return null;
      });

      if (result) {
        return { detected: true, type: 'recaptcha-v3', siteKey: result.siteKey };
      }
    } catch (e) {
      console.error('[CaptchaSolver] Error detecting reCAPTCHA v3:', e);
    }
    return { detected: false };
  }

  private async detectHCaptcha(page: PageLike): Promise<CaptchaDetectionResult> {
    try {
      const result = await page.evaluate(() => {
        // Check for hCaptcha iframe
        const iframe = document.querySelector('iframe[src*="hcaptcha"]');
        if (!iframe) return null;

        // Find sitekey
        const hcaptcha = document.querySelector('.h-captcha');
        const siteKey = hcaptcha?.getAttribute('data-sitekey');

        return siteKey ? { siteKey } : null;
      });

      if (result) {
        return { detected: true, type: 'hcaptcha', siteKey: result.siteKey };
      }
    } catch (e) {
      console.error('[CaptchaSolver] Error detecting hCaptcha:', e);
    }
    return { detected: false };
  }

  private async detectTurnstile(page: PageLike): Promise<CaptchaDetectionResult> {
    try {
      const result = await page.evaluate(() => {
        // Check for Turnstile iframe
        const iframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
        if (!iframe) return null;

        // Find sitekey
        const turnstile = document.querySelector('.cf-turnstile');
        const siteKey = turnstile?.getAttribute('data-sitekey');

        return siteKey ? { siteKey } : null;
      });

      if (result) {
        return { detected: true, type: 'turnstile', siteKey: result.siteKey };
      }
    } catch (e) {
      console.error('[CaptchaSolver] Error detecting Turnstile:', e);
    }
    return { detected: false };
  }

  private async detectCloudflareChallenge(page: PageLike): Promise<CaptchaDetectionResult> {
    try {
      const isChallenge = await page.evaluate(() => {
        // Check for Cloudflare challenge indicators
        const cfChallenge = document.querySelector('#cf-challenge-running');
        const cfBrowser = document.querySelector('.cf-browser-verification');
        const cfTitle = document.title.includes('Just a moment');
        const cfRay = document.querySelector('.ray-id');

        return !!(cfChallenge || cfBrowser || cfTitle || cfRay);
      });

      if (isChallenge) {
        return { detected: true, type: 'turnstile', data: { isChallengePage: true } };
      }
    } catch (e) {
      console.error('[CaptchaSolver] Error detecting Cloudflare challenge:', e);
    }
    return { detected: false };
  }

  // ==================== Solving ====================

  /**
   * Solve a detected captcha
   */
  async solveCaptcha(page: PageLike, detection: CaptchaDetectionResult): Promise<CaptchaSolveResult> {
    if (!detection.detected) {
      return { success: true }; // No captcha to solve
    }

    if (!detection.siteKey && !detection.data?.isChallengePage) {
      return { success: false, error: 'No sitekey found for captcha' };
    }

    console.log(`[CaptchaSolver] Solving ${detection.type} captcha...`);

    try {
      // Request solution from service
      const token = await this.requestSolution(detection);

      if (!token) {
        return { success: false, error: 'Failed to get solution from service' };
      }

      // Inject the solution
      await this.injectSolution(page, detection, token);

      console.log(`[CaptchaSolver] Captcha solved successfully`);
      return { success: true, token };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[CaptchaSolver] Failed to solve captcha: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Check for captcha and solve if found (convenience method)
   */
  async detectAndSolve(page: PageLike): Promise<CaptchaSolveResult> {
    const detection = await this.detectCaptcha(page);

    if (!detection.detected) {
      return { success: true }; // No captcha
    }

    return this.solveCaptcha(page, detection);
  }

  // ==================== Service-Specific Solving ====================

  private async requestSolution(detection: CaptchaDetectionResult): Promise<string | null> {
    const { service, apiKey } = this.config;

    switch (service) {
      case 'twocaptcha':
        return this.solveWith2Captcha(detection, apiKey);
      case 'anticaptcha':
      case 'capmonster':
      case 'capsolver':
        return this.solveWithModernAPI(detection, apiKey, service);
      default:
        throw new Error(`Unsupported service: ${service}`);
    }
  }

  private async solveWith2Captcha(detection: CaptchaDetectionResult, apiKey: string): Promise<string | null> {
    const endpoints = SERVICE_ENDPOINTS.twocaptcha;

    // Build submit URL based on captcha type
    let submitUrl = `${endpoints.submit}?key=${apiKey}&json=1`;

    switch (detection.type) {
      case 'recaptcha-v2':
        submitUrl += `&method=userrecaptcha&googlekey=${detection.siteKey}&pageurl=${detection.pageUrl}`;
        break;
      case 'recaptcha-v3':
        submitUrl += `&method=userrecaptcha&googlekey=${detection.siteKey}&pageurl=${detection.pageUrl}&version=v3&action=${detection.action || 'verify'}`;
        break;
      case 'hcaptcha':
        submitUrl += `&method=hcaptcha&sitekey=${detection.siteKey}&pageurl=${detection.pageUrl}`;
        break;
      case 'turnstile':
        submitUrl += `&method=turnstile&sitekey=${detection.siteKey}&pageurl=${detection.pageUrl}`;
        break;
      default:
        throw new Error(`Unsupported captcha type: ${detection.type}`);
    }

    // Submit task
    console.log(`[CaptchaSolver] Submitting to 2Captcha...`);
    const submitRes = await fetch(submitUrl);
    const submitData = await submitRes.json();

    if (submitData.status !== 1) {
      throw new Error(`2Captcha submit failed: ${submitData.request}`);
    }

    const taskId = submitData.request;
    console.log(`[CaptchaSolver] Task submitted, ID: ${taskId}`);

    // Poll for result
    return this.pollFor2CaptchaResult(apiKey, taskId);
  }

  private async pollFor2CaptchaResult(apiKey: string, taskId: string): Promise<string> {
    const endpoints = SERVICE_ENDPOINTS.twocaptcha;
    const startTime = Date.now();

    while (Date.now() - startTime < this.timeout) {
      await this.sleep(5000); // Wait 5 seconds between polls

      const resultUrl = `${endpoints.result}?key=${apiKey}&action=get&id=${taskId}&json=1`;
      const resultRes = await fetch(resultUrl);
      const resultData = await resultRes.json();

      if (resultData.status === 1) {
        console.log(`[CaptchaSolver] Solution received`);
        return resultData.request;
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha error: ${resultData.request}`);
      }

      console.log(`[CaptchaSolver] Waiting for solution...`);
    }

    throw new Error('Timeout waiting for captcha solution');
  }

  private async solveWithModernAPI(
    detection: CaptchaDetectionResult,
    apiKey: string,
    service: 'anticaptcha' | 'capmonster' | 'capsolver'
  ): Promise<string | null> {
    const endpoints = SERVICE_ENDPOINTS[service];

    // Build task based on captcha type
    let task: Record<string, any> = {};

    switch (detection.type) {
      case 'recaptcha-v2':
        task = {
          type: 'RecaptchaV2TaskProxyless',
          websiteURL: detection.pageUrl,
          websiteKey: detection.siteKey,
        };
        break;
      case 'recaptcha-v3':
        task = {
          type: 'RecaptchaV3TaskProxyless',
          websiteURL: detection.pageUrl,
          websiteKey: detection.siteKey,
          pageAction: detection.action || 'verify',
        };
        break;
      case 'hcaptcha':
        task = {
          type: 'HCaptchaTaskProxyless',
          websiteURL: detection.pageUrl,
          websiteKey: detection.siteKey,
        };
        break;
      case 'turnstile':
        task = {
          type: 'TurnstileTaskProxyless',
          websiteURL: detection.pageUrl,
          websiteKey: detection.siteKey,
        };
        break;
      default:
        throw new Error(`Unsupported captcha type: ${detection.type}`);
    }

    // Submit task
    console.log(`[CaptchaSolver] Submitting to ${service}...`);
    const submitRes = await fetch(endpoints.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: apiKey, task }),
    });
    const submitData = await submitRes.json();

    if (submitData.errorId && submitData.errorId !== 0) {
      throw new Error(`${service} submit failed: ${submitData.errorDescription || submitData.errorCode}`);
    }

    const taskId = submitData.taskId;
    console.log(`[CaptchaSolver] Task submitted, ID: ${taskId}`);

    // Poll for result
    return this.pollForModernAPIResult(apiKey, taskId, endpoints.result, service);
  }

  private async pollForModernAPIResult(
    apiKey: string,
    taskId: string,
    resultUrl: string,
    service: string
  ): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.timeout) {
      await this.sleep(3000); // Wait 3 seconds between polls

      const resultRes = await fetch(resultUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      });
      const resultData = await resultRes.json();

      if (resultData.errorId && resultData.errorId !== 0) {
        throw new Error(`${service} error: ${resultData.errorDescription || resultData.errorCode}`);
      }

      if (resultData.status === 'ready') {
        console.log(`[CaptchaSolver] Solution received`);
        return resultData.solution?.gRecaptchaResponse ||
               resultData.solution?.token ||
               resultData.solution?.text;
      }

      console.log(`[CaptchaSolver] Waiting for solution...`);
    }

    throw new Error('Timeout waiting for captcha solution');
  }

  // ==================== Solution Injection ====================

  private async injectSolution(page: PageLike, detection: CaptchaDetectionResult, token: string): Promise<void> {
    console.log(`[CaptchaSolver] Injecting solution for ${detection.type}...`);

    switch (detection.type) {
      case 'recaptcha-v2':
      case 'recaptcha-v3':
        await page.evaluate((token) => {
          // Set the response textarea
          const textarea = document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = token;
            textarea.style.display = 'block';
          }

          // Also set any hidden inputs
          const hiddenInputs = document.querySelectorAll('input[name="g-recaptcha-response"]');
          hiddenInputs.forEach((input) => {
            (input as HTMLInputElement).value = token;
          });

          // Try to call the callback - check multiple possible locations
          let callbackCalled = false;
          
          // Method 1: ___grecaptcha_cfg clients
          try {
            const cfg = (window as any).___grecaptcha_cfg;
            if (cfg?.clients) {
              for (const clientId in cfg.clients) {
                const client = cfg.clients[clientId];
                // Find callback in various nested locations
                const findCallback = (obj: any, depth = 0): Function | null => {
                  if (depth > 5 || !obj) return null;
                  if (typeof obj === 'function') return obj;
                  if (typeof obj.callback === 'function') return obj.callback;
                  if (typeof obj === 'object') {
                    for (const key in obj) {
                      const found = findCallback(obj[key], depth + 1);
                      if (found) return found;
                    }
                  }
                  return null;
                };
                const cb = findCallback(client);
                if (cb) {
                  console.log('[CaptchaSolver] Found callback in ___grecaptcha_cfg');
                  cb(token);
                  callbackCalled = true;
                  break;
                }
              }
            }
          } catch (e) {
            console.error('[CaptchaSolver] Error finding grecaptcha callback:', e);
          }
          
          // Method 2: grecaptcha.callback
          if (!callbackCalled && typeof (window as any).grecaptcha?.callback === 'function') {
            (window as any).grecaptcha.callback(token);
            callbackCalled = true;
          }
          
          // Method 3: Check for data-callback attribute on form elements
          if (!callbackCalled) {
            const recaptchaDiv = document.querySelector('.g-recaptcha');
            const callbackName = recaptchaDiv?.getAttribute('data-callback');
            if (callbackName && typeof (window as any)[callbackName] === 'function') {
              console.log(`[CaptchaSolver] Calling data-callback: ${callbackName}`);
              (window as any)[callbackName](token);
              callbackCalled = true;
            }
          }
          
          console.log(`[CaptchaSolver] Callback called: ${callbackCalled}`);
        }, token);
        break;

      case 'hcaptcha':
        await page.evaluate((token) => {
          // Set hCaptcha response
          const textarea = document.querySelector('[name="h-captcha-response"]') as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = token;
          }

          const iframe = document.querySelector('iframe[src*="hcaptcha"]') as HTMLIFrameElement;
          if (iframe) {
            iframe.setAttribute('data-hcaptcha-response', token);
          }

          // Try to call hcaptcha callback
          if (typeof (window as any).hcaptcha?.callback === 'function') {
            (window as any).hcaptcha.callback(token);
          }
        }, token);
        break;

      case 'turnstile':
        await page.evaluate((token) => {
          // Set Turnstile response
          const input = document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement;
          if (input) {
            input.value = token;
          }

          // Try to call turnstile callback
          if (typeof (window as any).turnstile?.callback === 'function') {
            (window as any).turnstile.callback(token);
          }
        }, token);
        break;
    }

    // Wait for callback to process
    await this.sleep(500);
    
    // Try to submit the form if callback didn't work
    const submitted = await page.evaluate(() => {
      // Try multiple methods to submit
      
      // Method 1: Find and submit the form containing the captcha
      const form = document.querySelector('form');
      if (form) {
        // Check if there's a submit button
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])') as HTMLElement;
        if (submitBtn) {
          console.log('[CaptchaSolver] Clicking submit button');
          submitBtn.click();
          return true;
        }
        
        // Try form.submit() as fallback
        try {
          console.log('[CaptchaSolver] Submitting form directly');
          form.submit();
          return true;
        } catch (e) {
          console.error('[CaptchaSolver] Form submit failed:', e);
        }
      }
      
      // Method 2: Look for any button that might submit
      const buttons = document.querySelectorAll('button, input[type="submit"]');
      for (const btn of Array.from(buttons)) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
        const value = (btn as HTMLInputElement).value?.toLowerCase() || '';
        if (text.includes('submit') || text.includes('continue') || text.includes('verify') ||
            value.includes('submit') || value.includes('continue') || value.includes('verify')) {
          console.log('[CaptchaSolver] Clicking potential submit button:', text || value);
          (btn as HTMLElement).click();
          return true;
        }
      }
      
      return false;
    });
    
    console.log(`[CaptchaSolver] Form submitted: ${submitted}`);
    
    // Wait for page to process the submission
    await this.sleep(2000);
  }

  // ==================== Utilities ====================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ==================== Factory ====================

/**
 * Create a CaptchaSolver instance from environment variables
 */
export function createCaptchaSolverFromEnv(): CaptchaSolver | null {
  const apiKey = process.env.CAPTCHA_SOLVER_API_KEY;
  const service = process.env.CAPTCHA_SOLVER_SERVICE as CaptchaSolverConfig['service'];

  if (!apiKey) {
    console.log('[CaptchaSolver] No CAPTCHA_SOLVER_API_KEY configured, captcha solving disabled');
    return null;
  }

  return new CaptchaSolver({
    apiKey,
    service: service || 'twocaptcha',
    timeout: parseInt(process.env.CAPTCHA_SOLVER_TIMEOUT || '120000', 10),
  });
}

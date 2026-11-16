/**
 * Stagehand Manager
 * Manages Stagehand browser automation for AI-powered web tasks
 * 
 * Stagehand provides high-level AI browser automation with:
 * - agent(): Execute complex multi-step tasks autonomously
 * - act(): Perform single actions with natural language
 * - extract(): Get structured data from pages
 * - observe(): Discover available elements
 * 
 * Note: Stagehand provides built-in metrics via stagehand.metrics including:
 * - Token usage (prompt, completion, reasoning) per operation
 * - Inference time per operation (act, extract, observe, agent)
 * - See: https://docs.stagehand.dev/configuration/observability
 */

import { Stagehand } from '@browserbasehq/stagehand';
import { BrowserWindow } from 'electron';
import { CaptchaSolver, createCaptchaSolverFromEnv } from './captchaSolver';

// Task result interface
export interface StagehandTaskResult {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
  actions?: any[];
  captchaSolved?: boolean; // True if a captcha was encountered and solved
}

// Task request interface  
export interface StagehandTaskRequest {
  instruction: string;
  url?: string; // Optional starting URL
  maxSteps?: number;
  extractSchema?: any; // Optional Zod schema for extraction
}

// Progress event types - structured data, NOT human-readable phrases
export type ProgressEventType = 
  | 'browser_init'
  | 'navigating'
  | 'page_loaded'
  | 'searching'          // Agent is searching/typing
  | 'interacting'        // Agent is clicking/interacting with elements
  | 'captcha_detected'
  | 'captcha_solving'
  | 'captcha_solved'
  | 'task_executing'
  | 'content_extracting'
  | 'content_chunk'      // Streaming content chunk - speak immediately
  | 'task_complete'
  | 'error';

export interface ProgressEvent {
  type: ProgressEventType;
  // Structured metadata - LLM will use this to generate speech
  data: {
    url?: string;
    domain?: string;
    captchaType?: string;
    error?: string;
    step?: number;
    totalSteps?: number;
    text?: string;  // For content_chunk events - the actual text to speak
  };
  timestamp: string;
}

// IPC channel for progress events
export const STAGEHAND_PROGRESS_CHANNEL = 'stagehand:progress';

class StagehandManager {
  private stagehand: Stagehand | null = null;
  private isInitializing: boolean = false;
  private initPromise: Promise<Stagehand> | null = null;
  private captchaSolver: CaptchaSolver | null = null;
  private captchaSolverInitialized: boolean = false;
  private currentDomain: string = ''; // Track current domain for progress events
  // Use native AbortController for task cancellation (per Stagehand docs)
  private abortController: AbortController | null = null;
  private currentTaskId: string | null = null;

  constructor() {
    // NOTE: captcha solver is lazily initialized on first use (not here)
    // because secrets from Doppler may not yet be in process.env at import time.
  }

  /**
   * Lazily initialize the captcha solver on first use.
   * This ensures Doppler secrets are available in process.env.
   */
  private ensureCaptchaSolver(): void {
    if (this.captchaSolverInitialized) return;
    this.captchaSolverInitialized = true;
    this.captchaSolver = createCaptchaSolverFromEnv();
  }

  /**
   * Cancel the currently running task using native AbortController
   * Per Stagehand docs: signal: AbortSignal can be used to cancel agent execution
   * NOTE: We do NOT send a progress event here - the abort is handled internally
   * and sending an error event would pollute the next task's progress stream
   */
  cancelCurrentTask(reason: string = 'user_interrupted'): void {
    if (this.abortController && this.currentTaskId) {
      console.log(`[StagehandManager] Aborting task ${this.currentTaskId}: ${reason}`);
      this.abortController.abort(reason);
      // Don't send progress event - the abort handles cancellation internally
      // and the catch block will return { success: false, error: 'Task cancelled by user' }
    } else {
      console.log('[StagehandManager] No task to cancel');
    }
  }

  /**
   * Check if current task is cancelled via AbortSignal
   */
  private shouldCancel(): boolean {
    return this.abortController?.signal.aborted ?? false;
  }

  /**
   * Create new AbortController for a new task
   */
  private resetCancellation(taskId: string): void {
    this.abortController = new AbortController();
    this.currentTaskId = taskId;
  }

  /**
   * Clear task state after completion
   */
  private clearTaskState(): void {
    this.currentTaskId = null;
    this.abortController = null;
  }

  /**
   * Send a structured progress event to all renderer windows
   * The AI agent's LLM will decide what to say based on this data
   */
  private sendProgress(type: ProgressEventType, data: ProgressEvent['data'] = {}): void {
    const event: ProgressEvent = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    
    console.log(`[StagehandManager] Progress: ${type}`, data);
    
    // Send to all browser windows
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send(STAGEHAND_PROGRESS_CHANNEL, event);
      }
    });
  }

  /**
   * Initialize Stagehand instance
   */
  async initialize(): Promise<Stagehand> {
    // Return existing instance if available
    if (this.stagehand) {
      return this.stagehand;
    }

    // Wait for existing initialization
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<Stagehand> {
    this.isInitializing = true;

    try {
      console.log('[StagehandManager] Initializing (LOCAL mode)...');
      this.sendProgress('browser_init', {});

      // Google Gemini configuration for optimal performance with hybrid mode
      // Using Gemini 3 Flash Preview for best speed (218 t/s) - requires GOOGLE_GENERATIVE_AI_API_KEY in Doppler
      // Per Stagehand docs: https://docs.stagehand.dev/v3/configuration/models
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      console.log(`[StagehandManager] GOOGLE_GENERATIVE_AI_API_KEY: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'NOT SET'}`);
      
      if (!apiKey) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set. Please add it to Doppler.');
      }

      this.stagehand = new Stagehand({
        env: 'LOCAL',
        // Use Gemini 3 Flash Preview for best speed with hybrid mode support
        model: 'google/gemini-3-flash-preview',
        verbose: 1, // Enable Stagehand's built-in logging
        experimental: true, // Required for hybrid mode and agent callbacks
        localBrowserLaunchOptions: {
          headless: false, // Show browser window
          viewport: { width: 1280, height: 800 },
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
      });

      await this.stagehand.init();
      console.log('[StagehandManager] Browser initialized');

      return this.stagehand;
    } catch (error) {
      console.error('[StagehandManager] Failed to initialize:', error);
      this.stagehand = null;
      this.initPromise = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Execute a high-level task using Stagehand's agent
   * Strategy: Agent FIRST (handles navigation, interaction, complex tasks)
   *           Then extract content from the resulting page
   *           If captcha encountered, solve and RETRY
   * Docs: https://docs.stagehand.dev/v3/references/stagehand
   */
  async executeTask(request: StagehandTaskRequest, retryCount: number = 0): Promise<StagehandTaskResult> {
    this.ensureCaptchaSolver();
    const MAX_RETRIES = 2; // Max retries after captcha solve
    let captchaSolved = false;
    
    // Generate a task ID and reset cancellation state
    const taskId = `task-${Date.now()}`;
    this.resetCancellation(taskId);

    console.log(`[StagehandManager] Task: "${request.instruction.substring(0, 80)}..." (retry: ${retryCount}, id: ${taskId})`);

    try {
      const stagehand = await this.initialize();

      // Get the first page from context (per official docs)
      let pages = stagehand.context.pages();
      let page = pages.length > 0 ? pages[0] : null;

      // Create a new page if none exist
      if (!page) {
        page = await stagehand.context.newPage();
      }

      // If a starting URL is provided, navigate there first
      if (request.url) {
        const normalizedUrl = request.url.startsWith('http')
          ? request.url
          : `https://${request.url}`;
        
        // Extract domain for user-friendly message and track it for subsequent events
        const domain = new URL(normalizedUrl).hostname.replace('www.', '');
        this.currentDomain = domain;
        this.sendProgress('navigating', { url: normalizedUrl, domain });
        
        console.log(`[StagehandManager] Navigating to ${normalizedUrl}`);
        await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded' });

        // Check for captcha BEFORE agent runs
        const preCaptchaResult = await this.handleCaptchaIfPresent(page);
        if (preCaptchaResult.solved) {
          captchaSolved = true;
        }
      }

      // STEP 1: Use agent with STREAMING for incremental content delivery
      // This allows speaking content as soon as it's available, rather than waiting for full extraction
      // Per Stagehand docs: https://docs.stagehand.dev/v3/basics/agent#streaming
      
      // System prompt to prevent agent from trying to solve captchas manually
      // The agent should report captchas and let our dedicated solver handle them
      const captchaInstructions = `
IMPORTANT: If you encounter a CAPTCHA, reCAPTCHA, image challenge, or any "verify you're human" prompt:
- DO NOT attempt to click on image squares or solve the challenge yourself
- DO NOT try to click "I'm not a robot" checkboxes
- STOP immediately and report that a captcha was detected
- Say something like "I encountered a security verification that needs to be solved"
The system has an automated captcha solver that will handle these challenges.
`;
      
      // Use hybrid mode for optimal speed with Gemini (combines DOM parsing + visual actions)
      // Enable streaming to get incremental text output
      const agent = stagehand.agent({
        mode: 'hybrid',
        stream: true,  // Enable streaming for incremental results
        systemPrompt: captchaInstructions,
      });
      
      // Track streamed content for final result
      let streamedContent = '';
      let chunkBuffer = '';  // Buffer small chunks to avoid choppy speech
      const MIN_CHUNK_SIZE = 80;  // Minimum chars before sending (roughly one sentence)
      
      const streamResult = await agent.execute({
        instruction: request.instruction,
        maxSteps: request.maxSteps || 20,
        // Pass AbortSignal for native cancellation support (per Stagehand docs)
        signal: this.abortController?.signal,
        callbacks: {
          // NOTE: We only use textStream for content (not onChunk) to avoid duplicate speech
          // onChunk and textStream receive the same data - using both causes duplicates
          
          // Send granular progress events for each agent step
          onStepFinish: async (event: any) => {
            if (event.toolCalls) {
              for (const tc of event.toolCalls) {
                console.log(`[StagehandManager] Tool: ${tc.toolName}`, JSON.stringify(tc).substring(0, 200));
                
                // Map tool names to progress event types
                if (tc.toolName === 'goto' || tc.toolName === 'navback') {
                  const gotoUrl = typeof tc.args === 'string' ? tc.args 
                    : (tc.args?.url || tc.result || '');
                  if (gotoUrl && typeof gotoUrl === 'string' && gotoUrl.includes('.')) {
                    try {
                      const url = gotoUrl.startsWith('http') ? gotoUrl : `https://${gotoUrl}`;
                      this.currentDomain = new URL(url).hostname.replace('www.', '');
                      console.log(`[StagehandManager] Extracted domain: ${this.currentDomain}`);
                    } catch (e) {
                      console.log(`[StagehandManager] Failed to extract domain from: ${gotoUrl}`);
                    }
                  }
                  this.sendProgress('navigating', { domain: this.currentDomain });
                  
                  // Check for captcha after navigation
                  if (this.captchaSolver) {
                    try {
                      const midCaptcha = await this.handleCaptchaIfPresent(page);
                      if (midCaptcha.solved) {
                        captchaSolved = true;
                        console.log('[StagehandManager] Solved captcha during navigation step');
                      }
                    } catch (e) {
                      console.warn('[StagehandManager] Mid-nav captcha check failed:', e);
                    }
                  }
                } else if (tc.toolName === 'act' || tc.toolName === 'fillForm' || tc.toolName === 'click' || tc.toolName === 'type') {
                  this.sendProgress('interacting', { domain: this.currentDomain });
                  
                  // Check for captcha after interactions (captcha may appear after form submit, etc.)
                  if (this.captchaSolver) {
                    try {
                      const midCaptcha = await this.handleCaptchaIfPresent(page);
                      if (midCaptcha.solved) {
                        captchaSolved = true;
                        console.log('[StagehandManager] Solved captcha during interaction step');
                      }
                    } catch (e) {
                      console.warn('[StagehandManager] Mid-interaction captcha check failed:', e);
                    }
                  }
                } else if (tc.toolName === 'search') {
                  this.sendProgress('searching', { domain: this.currentDomain });
                }
              }
            }
          },
        },
      });
      
      // Consume the text stream for streaming content delivery
      // This is the ONLY source for content chunks (not using onChunk to avoid duplicates)
      try {
        for await (const text of streamResult.textStream) {
          // Check for cancellation - stop streaming if cancelled
          if (this.shouldCancel()) {
            console.log('[StagehandManager] Task cancelled, stopping text stream');
            break;
          }
          
          if (text && text.trim()) {
            chunkBuffer += text;
            
            if (chunkBuffer.length >= MIN_CHUNK_SIZE) {
              console.log(`[StagehandManager] TextStream chunk (${chunkBuffer.length} chars)`);
              this.sendProgress('content_chunk', { 
                text: chunkBuffer,
                domain: this.currentDomain 
              });
              streamedContent += chunkBuffer;
              chunkBuffer = '';
            }
          }
        }
      } catch (streamError) {
        console.warn('[StagehandManager] TextStream error:', streamError);
      }
      
      // Send any remaining buffered content (unless cancelled)
      if (chunkBuffer.length > 0 && !this.shouldCancel()) {
        console.log(`[StagehandManager] Final chunk (${chunkBuffer.length} chars)`);
        this.sendProgress('content_chunk', { 
          text: chunkBuffer,
          domain: this.currentDomain 
        });
        streamedContent += chunkBuffer;
      }
      
      // Get final result
      const agentResult = await streamResult.result;
      
      // Check if task was cancelled - return early
      if (this.shouldCancel()) {
        console.log('[StagehandManager] Task was cancelled, returning early');
        this.clearTaskState();
        return {
          success: false,
          error: 'Task cancelled by user',
          captchaSolved,
        };
      }

      // Log built-in metrics from Stagehand
      const metrics = await stagehand.metrics;
      console.log(`[StagehandManager] Agent complete - tokens: ${metrics.agentPromptTokens + metrics.agentCompletionTokens}, inference: ${metrics.agentInferenceTimeMs}ms`);
      console.log('[StagehandManager] Agent message:', agentResult.message?.substring(0, 300));

      // Check if agent failed due to captcha (check the message and the page)
      const agentMentionsCaptcha = agentResult.message?.toLowerCase().includes('captcha') ||
                                    agentResult.message?.toLowerCase().includes('recaptcha') ||
                                    agentResult.message?.toLowerCase().includes('verify') ||
                                    agentResult.message?.toLowerCase().includes('robot');

      // Check for captcha after agent task
      const postCaptchaResult = await this.handleCaptchaIfPresent(page);
      
      if (postCaptchaResult.solved) {
        captchaSolved = true;
        
        // RETRY the task if we haven't exceeded retry limit
        if (retryCount < MAX_RETRIES) {
          console.log(`[StagehandManager] Retrying after captcha (${retryCount + 1}/${MAX_RETRIES})`);
          await page.waitForTimeout(1000);
          const retryResult = await this.executeTask(request, retryCount + 1);
          retryResult.captchaSolved = true;
          return retryResult;
        }
      } else if (agentMentionsCaptcha && !agentResult.success && retryCount < MAX_RETRIES) {
        // Agent mentioned captcha but we didn't detect one - might be an image challenge
        const manualResult = await this.solveCaptchaIfPresent();
        if (manualResult.success && manualResult.message?.includes('solved')) {
          captchaSolved = true;
          console.log(`[StagehandManager] Retrying after manual captcha solve (${retryCount + 1}/${MAX_RETRIES})`);
          await page.waitForTimeout(1000);
          const retryResult = await this.executeTask(request, retryCount + 1);
          retryResult.captchaSolved = true;
          return retryResult;
        }
      }

      // STEP 2: Check if we got content via streaming
      // If streaming delivered content, we're done - skip the separate extract() call
      // This is the key optimization: content was already spoken incrementally
      if (streamedContent.length > 50) {
        console.log(`[StagehandManager] Streaming delivered ${streamedContent.length} chars - skipping extract()`);
        return {
          success: true,
          message: 'Content streamed successfully',
          data: streamedContent,
          captchaSolved,
        };
      }

      // STEP 3: Fallback to extract() only if streaming didn't provide content
      // This handles cases where agent performed actions but didn't output text
      const finalUrl = page.url();

      if (finalUrl && finalUrl !== 'about:blank') {
        try {
          console.log('[StagehandManager] No streaming content, falling back to extract()');
          this.sendProgress('content_extracting', { domain: this.currentDomain });
          await page.waitForLoadState('domcontentloaded');
          
          // Voice-friendly extraction - limit to top 5 items for quick response
          // Users can ask for more if needed. This reduces:
          // - Token usage (fewer items = less output)
          // - Inference time (simpler extraction)
          // - TTS time (shorter response to speak)
          const extractInstruction = `For: ${request.instruction}

Extract ONLY the top 5 most relevant items. Be concise - just titles/headlines, no descriptions.
Format as a simple numbered list.`;
          
          const extractResult = await stagehand.extract(extractInstruction);
          
          // Log extraction metrics
          const extractMetrics = await stagehand.metrics;
          console.log(`[StagehandManager] Extraction - tokens: ${extractMetrics.extractPromptTokens + extractMetrics.extractCompletionTokens}, inference: ${extractMetrics.extractInferenceTimeMs}ms`);

          let extractedData: string | undefined;

          // Parse the result based on its shape
          if (extractResult && typeof extractResult === 'object' && 'extraction' in extractResult) {
            extractedData = (extractResult as { extraction: string }).extraction;
          } else if (extractResult && typeof extractResult === 'object' && 'pageText' in extractResult) {
            extractedData = (extractResult as { pageText: string }).pageText;
          } else if (typeof extractResult === 'string') {
            extractedData = extractResult;
          }

          // Check if extracted data is actually captcha content (don't return it)
          const isCaptchaContent = extractedData && (
            extractedData.toLowerCase().includes('prove your humanity') ||
            extractedData.toLowerCase().includes("i'm not a robot") ||
            extractedData.toLowerCase().includes('verify you are human')
          );

          if (extractedData && extractedData.length > 0 && !isCaptchaContent) {
            console.log(`[StagehandManager] Extraction succeeded (${extractedData.length} chars)`);
            return {
              success: true,
              message: 'Content extracted successfully',
              data: extractedData,
              captchaSolved,
            };
          } else if (isCaptchaContent) {
            console.log('[StagehandManager] Extracted content is captcha page, skipping');
          }
        } catch (extractError) {
          console.warn('[StagehandManager] Extraction failed:', extractError);
        }
      }

      // STEP 4: Return agent result if extraction didn't yield content
      return {
        success: agentResult.success ?? true,
        message: agentResult.message || 'Task completed',
        actions: agentResult.actions ? [`${agentResult.actions.length} actions performed`] : undefined,
        captchaSolved,
      };
    } catch (error) {
      // Handle AgentAbortError specially (per Stagehand docs)
      const errorName = error instanceof Error ? error.name : '';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorName === 'AgentAbortError' || this.shouldCancel()) {
        console.log('[StagehandManager] Task was aborted by user');
        this.clearTaskState();
        return {
          success: false,
          error: 'Task cancelled by user',
          captchaSolved,
        };
      }
      
      console.error('[StagehandManager] Task failed:', errorMessage);
      this.clearTaskState();
      return {
        success: false,
        error: errorMessage,
        captchaSolved,
      };
    }
  }

  /**
   * Execute a simple action on the current page
   */
  async act(action: string): Promise<StagehandTaskResult> {
    try {
      const stagehand = await this.initialize();

      console.log(`[StagehandManager] Performing action: ${action}`);
      await stagehand.act(action);

      return {
        success: true,
        message: `Action completed: ${action}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[StagehandManager] Action failed:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Extract data from the current page
   */
  async extract(instruction: string): Promise<StagehandTaskResult> {
    try {
      const stagehand = await this.initialize();

      console.log(`[StagehandManager] Extracting: ${instruction}`);
      const data = await stagehand.extract(instruction);

      return {
        success: true,
        data,
        message: 'Extraction completed',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[StagehandManager] Extraction failed:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<StagehandTaskResult> {
    try {
      const stagehand = await this.initialize();
      const page = stagehand.context.pages()[0];

      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      console.log(`[StagehandManager] Navigating to: ${normalizedUrl}`);

      await page.goto(normalizedUrl);

      // Check for captcha after navigation
      const captchaResult = await this.handleCaptchaIfPresent(page);

      return {
        success: true,
        message: `Navigated to ${normalizedUrl}`,
        captchaSolved: captchaResult.solved,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[StagehandManager] Navigation failed:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get current page URL
   */
  async getCurrentUrl(): Promise<string | null> {
    try {
      if (!this.stagehand) return null;
      const page = this.stagehand.context.pages()[0];
      return page.url();
    } catch {
      return null;
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async screenshot(): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const stagehand = await this.initialize();
      const page = stagehand.context.pages()[0];

      const buffer = await page.screenshot({ type: 'png' });
      const base64 = buffer.toString('base64');

      return {
        success: true,
        data: base64,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Close Stagehand and browser
   */
  async close(): Promise<void> {
    if (this.stagehand) {
      console.log('[StagehandManager] Closing Stagehand...');
      await this.stagehand.close();
      this.stagehand = null;
      this.initPromise = null;
      console.log('[StagehandManager] Closed');
    }
  }

  /**
   * Check if Stagehand is active
   */
  isActive(): boolean {
    return this.stagehand !== null;
  }

  /**
   * Check for captcha and solve if present
   * Returns { ok: boolean, solved: boolean }
   *   - ok: whether we should continue (true even if no captcha found)
   *   - solved: whether we actually solved a captcha
   */
  private async handleCaptchaIfPresent(page: any): Promise<{ ok: boolean; solved: boolean }> {
    this.ensureCaptchaSolver();
    if (!this.captchaSolver) {
      return { ok: true, solved: false }; // No solver configured, skip
    }

    try {
      const urlBefore = page.url();
      const cleanOriginalUrl = this.getCleanUrl(urlBefore);
      
      const detection = await this.captchaSolver.detectCaptcha(page);

      if (detection.detected) {
        console.log(`[StagehandManager] Captcha detected: ${detection.type}`);
        this.sendProgress('captcha_detected', { captchaType: detection.type, domain: this.currentDomain });
        this.sendProgress('captcha_solving', { captchaType: detection.type, domain: this.currentDomain });
        
        const result = await this.captchaSolver.solveCaptcha(page, detection);

        if (result.success) {
          console.log('[StagehandManager] Captcha solved, waiting for page update...');
          this.sendProgress('captcha_solved', { domain: this.currentDomain });
          
          // Wait for navigation or page change
          try {
            if (typeof page.waitForNavigation === 'function') {
              await Promise.race([
                page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
                page.waitForTimeout(5000),
              ]);
            } else {
              await page.waitForTimeout(5000);
            }
          } catch {
            // Ignore navigation timeout
          }
          
          await page.waitForTimeout(2000);
          
          try {
            await page.waitForLoadState('domcontentloaded');
          } catch {
            // Ignore timeout errors
          }
          
          const urlAfter = page.url();
          
          // Check if we're still on captcha page
          if (urlAfter === urlBefore) {
            const recheck = await this.captchaSolver.detectCaptcha(page);
            if (recheck.detected) {
              console.log('[StagehandManager] Still on captcha page, may need retry');
              return { ok: true, solved: false };
            }
          }
          
          // Navigate back to clean URL if needed
          const urlAfterClean = this.getCleanUrl(urlAfter);
          if (urlAfterClean !== cleanOriginalUrl || urlAfter.includes('captcha')) {
            try {
              await page.goto(cleanOriginalUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
              await page.waitForTimeout(2000);
            } catch (navError) {
              console.warn('[StagehandManager] Navigation to clean URL failed:', navError);
            }
          }
          
          console.log('[StagehandManager] Captcha handling complete');
          return { ok: true, solved: true };
        } else {
          console.error(`[StagehandManager] Captcha solve failed: ${result.error}`);
          return { ok: false, solved: false };
        }
      }

      return { ok: true, solved: false }; // No captcha found
    } catch (error) {
      console.error('[StagehandManager] Captcha check error:', error);
      return { ok: true, solved: false }; // Continue anyway
    }
  }

  /**
   * Get a clean URL without captcha-related query parameters
   */
  private getCleanUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove common captcha-related params
      const paramsToRemove = ['captcha', 'challenge', 'verify', 'cf_chl', 'cf_ray'];
      paramsToRemove.forEach(param => parsed.searchParams.delete(param));
      
      // If no other params remain, return just origin + pathname
      if (parsed.search === '' || parsed.search === '?') {
        return parsed.origin + parsed.pathname;
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Manually check and solve captcha on current page
   */
  async solveCaptchaIfPresent(): Promise<StagehandTaskResult> {
    this.ensureCaptchaSolver();
    try {
      if (!this.captchaSolver) {
        return {
          success: false,
          error: 'Captcha solver not configured. Set CAPTCHA_SOLVER_API_KEY and CAPTCHA_SOLVER_SERVICE.',
        };
      }

      const stagehand = await this.initialize();
      const page = stagehand.context.pages()[0] as any; // Cast for compatibility

      const detection = await this.captchaSolver.detectCaptcha(page);

      if (!detection.detected) {
        return {
          success: true,
          message: 'No captcha detected on current page',
        };
      }

      console.log(`[StagehandManager] Captcha found: ${detection.type}`);
      const result = await this.captchaSolver.solveCaptcha(page, detection);

      if (result.success) {
        await page.waitForTimeout(2000);
        return {
          success: true,
          message: `${detection.type} captcha solved successfully`,
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

// Singleton instance
export const stagehandManager = new StagehandManager();

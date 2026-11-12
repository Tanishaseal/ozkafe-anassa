/**
 * Centralized Client-Side Debug Logger for OZKAFE ANASSA
 *
 * Provides rich, detailed console logs for all UI actions and background database
 * manipulations. Ensures all errors are logged with full debugging context (payload,
 * endpoint, status, response, stack trace, rollback state) without exposing ugly
 * error popups/banners to the end user.
 */

export interface ActionErrorContext {
  action: string;
  endpoint?: string;
  method?: string;
  payload?: unknown;
  status?: number;
  response?: unknown;
  error?: unknown;
  rollbackState?: unknown;
  extra?: Record<string, unknown>;
}

/**
 * Log a detailed, structured error to the browser console.
 * Formatted with clear visual styling so developers can immediately inspect
 * payloads, endpoints, server responses, and stack traces.
 */
export function logActionError(ctx: ActionErrorContext): void {
  const timestamp = new Date().toISOString();
  const title = `❌ [OZKAFE ACTION FAILED] ${ctx.action} (${timestamp})`;

  // Use console.groupCollapsed so it's clean but easily expandable
  try {
    console.groupCollapsed(
      `%c${title}`,
      'color: #e53e3e; font-weight: bold; background: #fff5f5; padding: 2px 8px; border-radius: 4px; border: 1px solid #feb2b2;'
    );
  } catch {
    console.error(title);
  }

  console.error('%cAction Name:', 'font-weight: bold; color: #c53030;', ctx.action);

  if (ctx.endpoint) {
    console.error(
      `%cEndpoint: [${ctx.method || 'POST'}] ${ctx.endpoint}`,
      'font-weight: bold; color: #dd6b20;'
    );
  }

  if (ctx.payload !== undefined) {
    console.error('%cRequest Payload Sent:', 'font-weight: bold; color: #4a5568;', ctx.payload);
  }

  if (ctx.status !== undefined) {
    console.error(`%cHTTP Response Status: ${ctx.status}`, 'font-weight: bold; color: #e53e3e;');
  }

  if (ctx.response !== undefined) {
    console.error('%cServer Response Body:', 'font-weight: bold; color: #805ad5;', ctx.response);
  }

  if (ctx.error) {
    const errorDetails = ctx.error instanceof Error
      ? { message: ctx.error.message, stack: ctx.error.stack, name: ctx.error.name }
      : ctx.error;
    console.error('%cException / Error Details:', 'font-weight: bold; color: #e53e3e;', errorDetails);
  }

  if (ctx.rollbackState !== undefined) {
    console.warn('%cUI Rollback Applied (Restored State):', 'font-weight: bold; color: #d69e2e;', ctx.rollbackState);
  }

  if (ctx.extra) {
    console.info('%cAdditional Diagnostic Context:', 'font-weight: bold; color: #3182ce;', ctx.extra);
  }

  try {
    console.trace('%cExecution Call Stack:', 'font-weight: bold;');
  } catch {}

  try {
    console.groupEnd();
  } catch {}
}

/**
 * Log an optimistic UI update confirmation.
 */
export function logOptimisticSuccess(action: string, optimisticData?: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `%c⚡ [OZKAFE OPTIMISTIC UI] ${action}`,
      'color: #319795; font-weight: bold;',
      optimisticData !== undefined ? optimisticData : ''
    );
  }
}

/**
 * Log a confirmed background sync success.
 */
export function logActionSuccess(action: string, result?: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `%c✅ [OZKAFE DB SYNC OK] ${action}`,
      'color: #38a169; font-weight: bold;',
      result !== undefined ? result : ''
    );
  }
}


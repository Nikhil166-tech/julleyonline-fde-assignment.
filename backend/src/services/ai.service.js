import { config } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

export class AiService {
  /**
   * Forwards user message and sanitized workspace context to the Python AI service.
   *
   * @param {string} message - User natural-language question
   * @param {object} context - Sanitized tenant workspace context from AiContextService
   * @returns {Promise<object>} AI response payload
   */
  static async chat(message, context) {
    if (!config.aiAssistantEnabled) {
      throw new AppError('AI Assistant is currently disabled in system configuration', 503, 'FEATURE_DISABLED');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, config.aiRequestTimeoutMs || 15000);

    const targetUrl = `${config.aiServiceUrl.replace(/\/$/, '')}/chat`;

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': config.aiServiceToken || '',
        },
        body: JSON.stringify({
          message,
          context,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const status = response.status >= 500 ? 502 : response.status;
        const sanitizedMsg = status === 502
          ? 'AI Assistant service is temporarily unable to process this request. Please try again shortly.'
          : (data?.detail || 'Invalid request to AI Assistant service.');
        throw new AppError(sanitizedMsg, status, 'AI_SERVICE_ERROR');
      }

      return {
        responseType: data.responseType || 'general_answer',
        answer: data.answer,
        structuredData: data.structuredData || null,
        toolsUsed: data.toolsUsed || [],
        confidence: data.confidence || 'high',
        generatedAt: data.generatedAt || new Date().toISOString(),
        recordsAnalyzed: data.recordsAnalyzed ?? null,
        dataScope: data.dataScope || null,
        generation: data.generation || {
          source: 'local',
          provider: 'local',
          model: null,
          fallbackUsed: false,
          tier: 3,
        },
      };
    } catch (err) {
      clearTimeout(timeout);

      if (err instanceof AppError) {
        throw err;
      }

      if (err.name === 'AbortError') {
        throw new AppError('AI Assistant request timed out waiting for microservice response', 504, 'AI_REQUEST_TIMEOUT');
      }

      // Handle connection errors (e.g. ECONNREFUSED)
      throw new AppError(
        'AI Assistant microservice is currently unreachable. Please ensure the Python service is active on ' + config.aiServiceUrl,
        503,
        'AI_SERVICE_UNAVAILABLE'
      );
    }
  }
}

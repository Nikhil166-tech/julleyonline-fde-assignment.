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
        const errorDetail = data?.error?.message || data?.detail || `HTTP ${response.status} from AI microservice`;
        throw new AppError(`AI Service Error: ${errorDetail}`, response.status >= 500 ? 502 : response.status, 'AI_SERVICE_ERROR');
      }

      return {
        answer: data.answer,
        toolsUsed: data.toolsUsed || [],
        confidence: data.confidence || 'high',
        generatedAt: data.generatedAt || new Date().toISOString(),
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

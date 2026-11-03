import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireTenantContext } from '../middlewares/tenant.middleware.js';
import { AiContextService } from '../services/ai-context.service.js';
import { AiService } from '../services/ai.service.js';

const router = Router();

// Protect all AI assistant routes with JWT and tenant context verification
router.use(authenticateToken);
router.use(requireTenantContext);

const chatRequestSchema = z.object({
  message: z
    .string({ required_error: 'Question message is required' })
    .trim()
    .min(1, 'Question cannot be empty')
    .max(1000, 'Question cannot exceed 1000 characters'),
  boardId: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string().uuid('Invalid boardId: must be a valid UUID').optional()
  ),
});

/**
 * POST /api/v1/ai/chat
 * Scoped, read-only AI question answering grounded in active tenant data.
 */
router.post('/chat', async (req, res, next) => {
  try {
    const { message, boardId } = chatRequestSchema.parse(req.body);

    // 1. Compile sanitized, authorized tenant context
    const context = await AiContextService.getSanitizedContext(req.tenantId, boardId || null);

    // 2. Delegate question answering to Python AI microservice
    const aiResult = await AiService.chat(message, context);

    res.status(200).json({
      success: true,
      data: {
        responseType: aiResult.responseType || 'general_answer',
        answer: aiResult.answer,
        structuredData: aiResult.structuredData || null,
        toolsUsed: aiResult.toolsUsed,
        confidence: aiResult.confidence,
        generatedAt: aiResult.generatedAt,
        recordsAnalyzed: aiResult.recordsAnalyzed ?? context.metrics.totalTasks,
        dataScope: aiResult.dataScope || context.tenantName,
        generation: aiResult.generation || { source: 'local', model: null, fallbackUsed: false },
        contextMeta: {
          tenantId: context.tenantId,
          tenantName: context.tenantName,
          boardId: context.boardId,
          boardName: context.boardName,
          totalTasks: context.metrics.totalTasks,
          isTruncated: context.isTruncated,
          currentTime: context.currentTime,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

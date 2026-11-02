import { z } from 'zod';
import { Priority } from '@prisma/client';

export const createBoardSchema = z.object({
  name: z.string().min(2, 'Board name must be at least 2 characters long').max(100),
  description: z.string().max(500).optional(),
});

export const updateBoardSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
}).refine((data) => data.name !== undefined || data.description !== undefined, {
  message: 'At least one field (name or description) must be provided for update',
});

export const createColumnSchema = z.object({
  name: z.string().min(1, 'Column name is required').max(100),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1, 'Column name is required').max(100),
});

export const moveColumnSchema = z.object({
  newPosition: z.number().int().min(0, 'Position must be a non-negative integer'),
});

export const createTaskSchema = z.object({
  columnId: z.string().uuid('columnId must be a valid UUID'),
  title: z.string().min(1, 'Task title is required').max(255),
  description: z.string().max(5000).optional(),
  priority: z.enum([Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.URGENT]).default(Priority.MEDIUM),
  dueDate: z.string().datetime().optional().nullable(),
  assignedToUserId: z.string().uuid('assignedToUserId must be a valid UUID').optional().nullable(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum([Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.URGENT]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  version: z.number().int().min(1, 'Known task version is required for optimistic locking'),
});

export const moveTaskSchema = z.object({
  targetColumnId: z.string().uuid('targetColumnId must be a valid UUID'),
  newPosition: z.number().int().min(0, 'Position must be a non-negative integer'),
  version: z.number().int().min(1, 'Known task version is required for optimistic locking'),
});

export const deleteTaskSchema = z.object({
  version: z.coerce.number().int().min(1, 'Known task version is required for optimistic locking'),
});

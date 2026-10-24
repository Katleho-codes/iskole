/**
 * Expenses and budgets: the money side of staying on track after registration.
 *
 * Amounts arrive in rands and are stored in cents, so a learner typing 12.50 is never
 * rounded away by floating point. Every query is scoped by the session's userId; no route
 * accepts a record id on read and none accepts a userId on write, so there is no IDOR
 * surface here.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { prisma } from '../lib/prisma';

export const expensesRouter = Router();

const MAX_AMOUNT_RANDS = 1_000_000;
const CATEGORY_MAX = 60;
const DESCRIPTION_MAX = 200;

const ExpenseCreateSchema = z
  .object({
    category: z.string().trim().min(1).max(CATEGORY_MAX),
    amount: z.number().positive().max(MAX_AMOUNT_RANDS),
    description: z.string().trim().max(DESCRIPTION_MAX).optional(),
    date: z.coerce.date().optional(),
  })
  .strict();

const BudgetCreateSchema = z
  .object({
    category: z.string().trim().min(1).max(CATEGORY_MAX),
    amount: z.number().positive().max(MAX_AMOUNT_RANDS),
    period: z.enum(['MONTHLY', 'WEEKLY', 'YEARLY']).default('MONTHLY'),
  })
  .strict();

function toRands(cents: number): number {
  return Math.round(cents) / 100;
}

function toCents(rands: number): number {
  return Math.round(rands * 100);
}

expensesRouter.get('/expenses', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const expenses = await prisma.expense.findMany({
      where: { userId },
      orderBy: { spentAt: 'desc' },
      take: 200,
    });

    res.json({
      expenses: expenses.map((expense) => ({
        id: expense.id,
        category: expense.category,
        amount: toRands(expense.amountCents),
        description: expense.description,
        date: expense.spentAt,
        createdAt: expense.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

expensesRouter.post(
  '/expenses',
  requireSession,
  requireRole('STUDENT'),
  idempotent(),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const input = ExpenseCreateSchema.parse(req.body);

      const expense = await prisma.expense.create({
        data: {
          userId,
          category: input.category,
          amountCents: toCents(input.amount),
          description: input.description ?? null,
          ...(input.date ? { spentAt: input.date } : {}),
        },
      });

      res.status(201).json({
        expense: {
          id: expense.id,
          category: expense.category,
          amount: toRands(expense.amountCents),
          description: expense.description,
          date: expense.spentAt,
          createdAt: expense.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

expensesRouter.get('/budgets', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const budgets = await prisma.budget.findMany({
      where: { userId },
      orderBy: [{ period: 'asc' }, { category: 'asc' }],
    });

    res.json({
      budgets: budgets.map((budget) => ({
        id: budget.id,
        category: budget.category,
        amount: toRands(budget.amountCents),
        period: budget.period,
        updatedAt: budget.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

expensesRouter.post(
  '/budgets',
  requireSession,
  requireRole('STUDENT'),
  idempotent(),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const input = BudgetCreateSchema.parse(req.body);

      // One budget per category and period. Re-posting corrects the amount instead of
      // stacking a second limit on the same category.
      const budget = await prisma.budget.upsert({
        where: {
          userId_category_period: {
            userId,
            category: input.category,
            period: input.period,
          },
        },
        create: {
          userId,
          category: input.category,
          period: input.period,
          amountCents: toCents(input.amount),
        },
        update: { amountCents: toCents(input.amount) },
      });

      res.status(201).json({
        budget: {
          id: budget.id,
          category: budget.category,
          amount: toRands(budget.amountCents),
          period: budget.period,
          updatedAt: budget.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

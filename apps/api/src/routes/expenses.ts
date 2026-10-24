/**
 * Expenses and budgets: the money side of staying on track after registration.
 *
 * Amounts arrive in rands and are stored in cents, so a learner typing 12.50 is never
 * rounded away by floating point. Every query is scoped by the session's userId; no route
 * accepts a record id on read and none accepts a userId on write, so there is no IDOR
 * surface here.
 */
import { Router } from 'express';
import { BudgetInputSchema, ExpenseInputSchema } from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/http-error';

export const expensesRouter = Router();

function toRands(cents: number): number {
  return Math.round(cents) / 100;
}

function toCents(rands: number): number {
  return Math.round(rands * 100);
}

function serialiseExpense(expense: {
  id: string;
  category: string;
  amountCents: number;
  description: string | null;
  remindMe: boolean;
  spentAt: Date;
  createdAt: Date;
}) {
  return {
    id: expense.id,
    category: expense.category,
    amount: toRands(expense.amountCents),
    description: expense.description,
    remindMe: expense.remindMe,
    date: expense.spentAt,
    createdAt: expense.createdAt,
  };
}

function serialiseBudget(budget: {
  id: string;
  category: string;
  amountCents: number;
  period: string;
  updatedAt: Date;
}) {
  return {
    id: budget.id,
    category: budget.category,
    amount: toRands(budget.amountCents),
    period: budget.period,
    updatedAt: budget.updatedAt,
  };
}

expensesRouter.get('/expenses', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const expenses = await prisma.expense.findMany({
      where: { userId },
      orderBy: { spentAt: 'desc' },
      take: 200,
    });

    res.json({ expenses: expenses.map(serialiseExpense) });
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
      const input = ExpenseInputSchema.parse(req.body);

      const expense = await prisma.expense.create({
        data: {
          userId,
          category: input.category,
          amountCents: toCents(input.amount),
          description: input.description ?? null,
          remindMe: input.remindMe,
          ...(input.date ? { spentAt: input.date } : {}),
        },
      });

      res.status(201).json({ expense: serialiseExpense(expense) });
    } catch (error) {
      next(error);
    }
  },
);

expensesRouter.delete(
  '/expenses/:id',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const id = String(req.params.id);
      const expense = await prisma.expense.findFirst({ where: { id, userId }, select: { id: true } });

      if (!expense) {
        return next(notFound('expense not found'));
      }

      await prisma.expense.delete({ where: { id: expense.id } });
      res.status(204).send();
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

    res.json({ budgets: budgets.map(serialiseBudget) });
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
      const input = BudgetInputSchema.parse(req.body);

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

      res.status(201).json({ budget: serialiseBudget(budget) });
    } catch (error) {
      next(error);
    }
  },
);

expensesRouter.delete(
  '/budgets/:id',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const id = String(req.params.id);
      const budget = await prisma.budget.findFirst({ where: { id, userId }, select: { id: true } });

      if (!budget) {
        return next(notFound('budget not found'));
      }

      await prisma.budget.delete({ where: { id: budget.id } });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

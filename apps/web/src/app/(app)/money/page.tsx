'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, EmptyState, ErrorState, Section } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

type Expense = {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  remindMe: boolean;
  date: string;
};

type Budget = {
  id: string;
  category: string;
  amount: number;
  period: string;
};

type MoneyPlan = {
  paydayDay: number;
};

const CATEGORIES = ['Food', 'Transport', 'Books', 'Data', 'Rent', 'Utilities', 'Leisure', 'Other'];
const PERIODS = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'YEARLY', label: 'Yearly' },
];

function toRands(value: string): number {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

function formatCurrency(value: number): string {
  return `R${value.toFixed(2)}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function paydayLabel(paydayDay: number): string {
  if (paydayDay === 0) return 'Last day of month';
  return `Day ${paydayDay} of month`;
}

export default function MoneyPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [plan, setPlan] = useState<MoneyPlan>({ paydayDay: 25 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [expensePending, setExpensePending] = useState(false);
  const [budgetPending, setBudgetPending] = useState(false);
  const [planPending, setPlanPending] = useState(false);
  const [nudgePending, setNudgePending] = useState(false);

  const [expenseForm, setExpenseForm] = useState({
    category: 'Food',
    amount: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    remindMe: false,
  });
  const [budgetForm, setBudgetForm] = useState({ category: 'Food', amount: '', period: 'MONTHLY' });
  const [paydayForm, setPaydayForm] = useState('25');

  const now = useMemo(() => new Date(), []);
  const currentMonth = monthKey(now);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [expensesRes, budgetsRes, planRes] = await Promise.all([
          fetch('/api/expenses'),
          fetch('/api/budgets'),
          fetch('/api/money/plan'),
        ]);

        if (!expensesRes.ok || !budgetsRes.ok || !planRes.ok) {
          if (!cancelled) setStatus('error');
          return;
        }

        const expensesData = (await expensesRes.json()) as { expenses: Expense[] };
        const budgetsData = (await budgetsRes.json()) as { budgets: Budget[] };
        const planData = (await planRes.json()) as { plan: MoneyPlan };

        if (!cancelled) {
          setExpenses(expensesData.expenses);
          setBudgets(budgetsData.budgets);
          setPlan(planData.plan);
          setPaydayForm(String(planData.plan.paydayDay));
          setStatus('ready');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthlyExpenses = useMemo(() => {
    return expenses.filter((expense) => monthKey(new Date(expense.date)) === currentMonth);
  }, [expenses, currentMonth]);

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const expense of monthlyExpenses) {
      map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amount);
    }
    return map;
  }, [monthlyExpenses]);

  const totalSpent = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const monthlyBudgets = budgets.filter((budget) => budget.period === 'MONTHLY');
  const totalBudget = monthlyBudgets.reduce((sum, budget) => sum + budget.amount, 0);

  const maxChartValue = Math.max(
    1,
    ...monthlyBudgets.map((budget) => budget.amount),
    totalSpent,
    ...spentByCategory.values(),
  );

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = toRands(expenseForm.amount);
    if (amount <= 0) {
      toast.error('Enter an amount greater than zero');
      return;
    }
    setExpensePending(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          category: expenseForm.category,
          amount,
          description: expenseForm.description.trim() || undefined,
          date: expenseForm.date,
          remindMe: expenseForm.remindMe,
        }),
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { expense: Expense };
      setExpenses((current) => [data.expense, ...current]);
      setExpenseForm((current) => ({ ...current, amount: '', description: '', remindMe: false }));
      toast.success('Expense added');
    } catch {
      toast.error('Could not add expense');
    } finally {
      setExpensePending(false);
    }
  }

  async function deleteExpense(id: string) {
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('failed');
      setExpenses((current) => current.filter((expense) => expense.id !== id));
      toast.success('Expense removed');
    } catch {
      toast.error('Could not remove expense');
    }
  }

  async function addBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = toRands(budgetForm.amount);
    if (amount <= 0) {
      toast.error('Enter an amount greater than zero');
      return;
    }
    setBudgetPending(true);
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `budget-${budgetForm.category}-${budgetForm.period}-${amount}`,
        },
        body: JSON.stringify({ category: budgetForm.category, amount, period: budgetForm.period }),
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { budget: Budget };
      setBudgets((current) => {
        const filtered = current.filter((b) => !(b.category === data.budget.category && b.period === data.budget.period));
        return [...filtered, data.budget];
      });
      setBudgetForm((current) => ({ ...current, amount: '' }));
      toast.success('Budget saved');
    } catch {
      toast.error('Could not save budget');
    } finally {
      setBudgetPending(false);
    }
  }

  async function savePayday() {
    const paydayDay = Number.parseInt(paydayForm, 10);
    if (Number.isNaN(paydayDay) || paydayDay < 0 || paydayDay > 31) {
      toast.error('Enter 0 for last day of month or 1-31');
      return;
    }
    setPlanPending(true);
    try {
      const res = await fetch('/api/money/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paydayDay }),
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { plan: MoneyPlan };
      setPlan(data.plan);
      toast.success('Payday updated');
    } catch {
      toast.error('Could not update payday');
    } finally {
      setPlanPending(false);
    }
  }

  async function runDemoNudge() {
    setNudgePending(true);
    try {
      const res = await fetch('/api/demo/run-nudges', { method: 'POST' });
      if (res.status === 404) {
        toast.info('Demo nudges disabled in this environment');
        return;
      }
      if (!res.ok) throw new Error('failed');
      toast.success('Nudge generated if today is payday');
    } catch {
      toast.error('Could not run nudges');
    } finally {
      setNudgePending(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <PageHeader title="Money" description="Track spending, set budgets and see what is left." />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading...</CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title="Money" />
        <ErrorState title="Money did not load" retryHref="/money" />
      </div>
    );
  }

  const monthLabel = now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Money"
        description="Track spending, set monthly budgets and see what is left. Amounts are in rands."
        action={
          <Badge variant="sky" className="gap-1.5">
            <Banknote className="size-3.5" />
            {formatCurrency(totalSpent)} spent this month
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardContent className="pt-1">
            <Section title="Add expense" description="Logged to your account only.">
              <form onSubmit={addExpense} className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="expense-category">Category</Label>
                  <Select value={expenseForm.category} onValueChange={(value) => setExpenseForm((c) => ({ ...c, category: value }))}>
                    <SelectTrigger id="expense-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-amount">Amount (R)</Label>
                  <Input id="expense-amount" inputMode="decimal" placeholder="50.00" value={expenseForm.amount} onChange={(e) => setExpenseForm((c) => ({ ...c, amount: e.target.value }))} required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="expense-desc">Description (optional)</Label>
                  <Input id="expense-desc" placeholder="Lunch at campus" value={expenseForm.description} onChange={(e) => setExpenseForm((c) => ({ ...c, description: e.target.value }))} maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-date">Date</Label>
                  <Input id="expense-date" type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((c) => ({ ...c, date: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox id="remind-me" checked={expenseForm.remindMe} onCheckedChange={(checked) => setExpenseForm((c) => ({ ...c, remindMe: checked === true }))} />
                  <Label htmlFor="remind-me" className="text-sm font-normal">Remind me on payday</Label>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={expensePending}>
                    <Plus className="size-4" />
                    {expensePending ? 'Adding...' : 'Add expense'}
                  </Button>
                </div>
              </form>
            </Section>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-1">
            <Section title="Budgets" description="Set a limit per category.">
              <form onSubmit={addBudget} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="budget-category">Category</Label>
                  <Select value={budgetForm.category} onValueChange={(value) => setBudgetForm((c) => ({ ...c, category: value }))}>
                    <SelectTrigger id="budget-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full space-y-1.5 sm:w-32">
                  <Label htmlFor="budget-amount">Amount (R)</Label>
                  <Input id="budget-amount" inputMode="decimal" placeholder="500" value={budgetForm.amount} onChange={(e) => setBudgetForm((c) => ({ ...c, amount: e.target.value }))} required />
                </div>
                <div className="w-full space-y-1.5 sm:w-36">
                  <Label htmlFor="budget-period">Period</Label>
                  <Select value={budgetForm.period} onValueChange={(value) => setBudgetForm((c) => ({ ...c, period: value }))}>
                    <SelectTrigger id="budget-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((period) => (
                        <SelectItem key={period.value} value={period.value}>
                          {period.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={budgetPending}>
                  {budgetPending ? 'Saving...' : 'Save budget'}
                </Button>
              </form>
            </Section>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-1">
          <Section title={`Monthly summary — ${monthLabel}`} description="Spent vs budget by category.">
            {monthlyBudgets.length === 0 && monthlyExpenses.length === 0 ? (
              <EmptyState illustration="money" title="No data yet" body="Add expenses and budgets to see your summary." compact />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <span className="font-medium">Total spent:</span> {formatCurrency(totalSpent)}
                  </div>
                  <div>
                    <span className="font-medium">Total budget:</span> {formatCurrency(totalBudget)}
                  </div>
                  <div>
                    <span className="font-medium">Remaining:</span> {formatCurrency(Math.max(0, totalBudget - totalSpent))}
                  </div>
                </div>
                <svg viewBox="0 0 400 200" className="w-full h-[200px]" role="img" aria-label="Monthly spending chart">
                  <title>Monthly spending chart</title>
                  {monthlyBudgets.slice(0, 6).map((budget, index) => {
                    const spent = spentByCategory.get(budget.category) ?? 0;
                    const barX = 40 + index * 60;
                    const budgetHeight = Math.max(4, (budget.amount / maxChartValue) * 150);
                    const spentHeight = Math.max(4, (spent / maxChartValue) * 150);
                    const ratio = budget.amount > 0 ? spent / budget.amount : 0;
                    const color = ratio > 1 ? 'var(--color-danger)' : ratio > 0.8 ? 'var(--color-amber)' : 'var(--color-leaf)';
                    return (
                      <g key={budget.id}>
                        <rect x={barX} y={170 - budgetHeight} width={20} height={budgetHeight} fill="var(--color-muted)" opacity={0.5} rx={3} />
                        <rect x={barX + 28} y={170 - spentHeight} width={20} height={spentHeight} fill={color} rx={3} />
                        <text x={barX + 24} y={190} textAnchor="middle" fontSize="8" fill="var(--color-muted-foreground)">
                          {budget.category.slice(0, 6)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 text-left font-medium">Category</th>
                        <th className="py-2 text-right font-medium">Spent</th>
                        <th className="py-2 text-right font-medium">Budget</th>
                        <th className="py-2 text-right font-medium">Left</th>
                        <th className="py-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyBudgets.map((budget) => {
                        const spent = spentByCategory.get(budget.category) ?? 0;
                        const left = budget.amount - spent;
                        const ratio = budget.amount > 0 ? spent / budget.amount : 0;
                        const statusLabel = ratio > 1 ? 'Over' : ratio > 0.8 ? 'Near' : 'On track';
                        const statusVariant: 'danger' | 'amber' | 'leaf' =
                          ratio > 1 ? 'danger' : ratio > 0.8 ? 'amber' : 'leaf';
                        return (
                          <tr key={budget.id} className="border-b border-border/60">
                            <td className="py-2">{budget.category}</td>
                            <td className="py-2 text-right tabular">{formatCurrency(spent)}</td>
                            <td className="py-2 text-right tabular">{formatCurrency(budget.amount)}</td>
                            <td className="py-2 text-right tabular">{formatCurrency(Math.max(0, left))}</td>
                            <td className="py-2 text-right">
                              <Badge variant={statusVariant}>{statusLabel}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-1">
            <Section title="Expenses" description="Recent entries.">
              {monthlyExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses this month yet.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {monthlyExpenses.slice(0, 12).map((expense) => (
                    <li key={expense.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{expense.category}</p>
                          {expense.remindMe ? <Badge variant="neutral">Remind me</Badge> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(expense.date).toLocaleDateString('en-ZA')}
                          {expense.description ? ` · ${expense.description}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular text-sm font-medium">{formatCurrency(expense.amount)}</span>
                        <Button variant="ghost" size="icon" onClick={() => void deleteExpense(expense.id)} aria-label="Remove expense">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-1">
            <Section title="Payday" description={paydayLabel(plan.paydayDay)}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="w-full space-y-1.5 sm:w-48">
                  <Label htmlFor="payday">Payday (0 = last day)</Label>
                  <Input id="payday" inputMode="numeric" value={paydayForm} onChange={(e) => setPaydayForm(e.target.value)} />
                </div>
                <Button onClick={() => void savePayday()} disabled={planPending}>
                  {planPending ? 'Saving...' : 'Save payday'}
                </Button>
                <Button variant="outline" onClick={() => void runDemoNudge()} disabled={nudgePending}>
                  {nudgePending ? 'Running...' : 'Run demo nudge'}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Payday nudges run daily at 07:00. The demo button lets you trigger one now.
              </p>
            </Section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

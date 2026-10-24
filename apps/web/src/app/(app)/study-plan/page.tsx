'use client';

/**
 * Guided study-plan builder and review.
 *
 * The learner chooses modules, sets weekly availability, reviews the generated week and can
 * edit every block before approving it. The API falls back to a deterministic plan when the
 * model is unavailable, so this screen never dead-ends.
 *
 * Nothing in the request is personally identifying: the API only receives module codes,
 * difficulty, exam dates and availability windows.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Download,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  STUDY_BLOCK_KINDS,
  STUDY_DAYS,
  timeToMinutes,
  type StudyBlock,
  type StudyBlockKind,
  type StudyDay,
} from '@iskole/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, ErrorState, FormField, PageHeader, SkeletonList } from '@/components/page-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

type StudyPlan = {
  id: string;
  title: string;
  approved: boolean;
  blocks: StudyBlock[];
  createdAt: string;
  updatedAt: string;
};

type ModuleDraft = {
  code: string;
  name: string;
  difficulty: number;
  examDate: string;
};

type AvailabilityRow = {
  day: StudyDay;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

type BlockPatch = {
  day?: StudyDay;
  task?: string;
  startTime?: string;
  durationMinutes?: number;
  kind?: StudyBlockKind;
  moduleCode?: string | null;
  notes?: string | null;
};

type Step = 1 | 2 | 3 | 4;

const MODULE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

const PRESETS: Record<string, Partial<Record<StudyDay, { startTime: string; endTime: string }>>> = {
  balanced: {
    MONDAY: { startTime: '17:00', endTime: '19:00' },
    TUESDAY: { startTime: '17:00', endTime: '19:00' },
    WEDNESDAY: { startTime: '17:00', endTime: '19:00' },
    THURSDAY: { startTime: '17:00', endTime: '19:00' },
    SATURDAY: { startTime: '09:00', endTime: '12:00' },
  },
  evenings: {
    MONDAY: { startTime: '17:00', endTime: '19:00' },
    TUESDAY: { startTime: '17:00', endTime: '19:00' },
    WEDNESDAY: { startTime: '17:00', endTime: '19:00' },
    THURSDAY: { startTime: '17:00', endTime: '19:00' },
    FRIDAY: { startTime: '17:00', endTime: '19:00' },
  },
  weekend: {
    SATURDAY: { startTime: '09:00', endTime: '12:00' },
    SUNDAY: { startTime: '09:00', endTime: '12:00' },
  },
  clear: {},
};

const STEP_LABELS = ['Modules', 'Availability', 'Review', 'Calendar'] as const;

const KIND_LABELS: Record<StudyBlockKind, string> = {
  STUDY: 'Study',
  REVISION: 'Revision',
  PRACTICE: 'Practice',
  EXAM_PREP: 'Exam prep',
};

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dayLabel(day: StudyDay) {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

function moduleCodeFromSubject(subject: string, index: number) {
  const code = subject
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 14);
  return code.length >= 2 ? code : `MOD${index + 1}`;
}

function difficultyFromMark(mark: number) {
  if (mark < 40) return 5;
  if (mark < 50) return 4;
  if (mark < 60) return 3;
  if (mark < 70) return 2;
  return 1;
}

function emptyModule(): ModuleDraft {
  return { code: '', name: '', difficulty: 3, examDate: '' };
}

function availabilityFromPreset(name: keyof typeof PRESETS): AvailabilityRow[] {
  const preset = PRESETS[name] ?? {};
  return STUDY_DAYS.map((day) => {
    const window = preset[day];
    return {
      day,
      enabled: Boolean(window),
      startTime: window?.startTime ?? '17:00',
      endTime: window?.endTime ?? '19:00',
    };
  });
}

function orderedBlocks(blocks: StudyBlock[]) {
  return [...blocks].sort((a, b) => {
    const dayDelta = STUDY_DAYS.indexOf(a.day) - STUDY_DAYS.indexOf(b.day);
    if (dayDelta !== 0) return dayDelta;
    return a.startTime.localeCompare(b.startTime);
  });
}

function totalMinutes(blocks: StudyBlock[]) {
  return blocks.reduce((total, block) => total + block.durationMinutes, 0);
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export default function StudyPlanPage() {
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleDraft[]>([emptyModule()]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>(() =>
    availabilityFromPreset('balanced'),
  );
  const [prefilledFromMarks, setPrefilledFromMarks] = useState(false);
  const [formError, setFormError] = useState('');
  const [requestKey, setRequestKey] = useState(newIdempotencyKey);

  const activePlan = plans.find((plan) => plan.id === activePlanId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [plansRes, marksRes] = await Promise.all([
          fetch('/api/study-plans'),
          fetch('/api/marks'),
        ]);

        if (!plansRes.ok) {
          if (!cancelled) setLoadError(true);
          return;
        }

        const planData = (await plansRes.json()) as { studyPlans: StudyPlan[] };
        if (cancelled) return;
        setPlans(planData.studyPlans);

        const first = planData.studyPlans[0];
        if (first) {
          setActivePlanId(first.id);
          setStep(first.approved ? 4 : 3);
        }

        if (marksRes.ok) {
          const markData = (await marksRes.json()) as {
            marks: Array<{ subject: string; mark: number }>;
          };
          if (markData.marks.length > 0 && !first) {
            setModules(
              [...markData.marks]
                .sort((a, b) => a.mark - b.mark)
                .slice(0, 4)
                .map((mark, index) => ({
                  code: moduleCodeFromSubject(mark.subject, index),
                  name: mark.subject,
                  difficulty: difficultyFromMark(mark.mark),
                  examDate: '',
                })),
            );
            setPrefilledFromMarks(true);
          }
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateModule(index: number, patch: Partial<ModuleDraft>) {
    setModules((current) =>
      current.map((module, moduleIndex) =>
        moduleIndex === index ? { ...module, ...patch } : module,
      ),
    );
  }

  function addModule() {
    if (modules.length >= 8) return;
    setModules((current) => [...current, emptyModule()]);
  }

  function removeModule(index: number) {
    setModules((current) =>
      current.length === 1 ? current : current.filter((_, moduleIndex) => moduleIndex !== index),
    );
  }

  function updateAvailability(day: StudyDay, patch: Partial<AvailabilityRow>) {
    setAvailability((current) =>
      current.map((row) => (row.day === day ? { ...row, ...patch } : row)),
    );
  }

  function applyPreset(name: keyof typeof PRESETS) {
    setAvailability(availabilityFromPreset(name));
    setFormError('');
  }

  function validateModules() {
    if (modules.length === 0) return 'Add at least one module.';
    const codes = new Set<string>();
    for (const [index, module] of modules.entries()) {
      const code = module.code.trim();
      if (!code) return `Add a module code for module ${index + 1}.`;
      if (code.length < 2 || code.length > 24 || !MODULE_CODE_PATTERN.test(code)) {
        return `Use 2–24 letters or numbers for the code in module ${index + 1}.`;
      }
      if (codes.has(code.toLowerCase())) return 'Each module code must be different.';
      codes.add(code.toLowerCase());
    }
    return '';
  }

  function validateAvailability() {
    const enabled = availability.filter((row) => row.enabled);
    if (enabled.length === 0) return 'Choose at least one time window.';
    for (const row of enabled) {
      const length = timeToMinutes(row.endTime) - timeToMinutes(row.startTime);
      if (length < 45) {
        return `${dayLabel(row.day)} needs at least 45 minutes, or clear that day.`;
      }
    }
    return '';
  }

  function goToAvailability() {
    const error = validateModules();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError('');
    setStep(2);
  }

  function goToReview() {
    const error = validateAvailability();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError('');
    void generatePlan();
  }

  async function generatePlan() {
    setBusy('generate');
    setFormError('');

    const payload = {
      modules: modules.map((module) => ({
        code: module.code.trim(),
        name: module.name.trim() || undefined,
        difficulty: module.difficulty,
        examDate: module.examDate || undefined,
      })),
      availability: availability
        .filter((row) => row.enabled)
        .map((row) => ({ day: row.day, startTime: row.startTime, endTime: row.endTime })),
    };

    try {
      const res = await fetch('/api/study-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        toast.error(
          res.status === 401
            ? 'Please sign in again to build a plan.'
            : 'We could not build a plan just now. Check your availability and try again.',
        );
        setBusy(null);
        return;
      }

      const data = (await res.json()) as { studyPlan: StudyPlan };
      setPlans((current) => [data.studyPlan, ...current]);
      setActivePlanId(data.studyPlan.id);
      setRequestKey(newIdempotencyKey());
      setStep(3);
      toast.success('Your week is ready to review', {
        description: 'Move a block or change the time before you approve it.',
      });
    } catch {
      toast.error('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function approvePlan(id: string) {
    setBusy(`approve:${id}`);
    try {
      const res = await fetch(`/api/study-plans/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (!res.ok) {
        toast.error(
          res.status === 401
            ? 'Please sign in again to approve this plan.'
            : 'We could not approve that plan. Add a block and try again.',
        );
        return;
      }

      const data = (await res.json()) as { studyPlan: StudyPlan };
      setPlans((current) => current.map((plan) => (plan.id === id ? data.studyPlan : plan)));
      setActivePlanId(id);
      setStep(4);
      toast.success('Plan approved', {
        description: 'It is now on your calendar. You can still edit individual blocks.',
      });
    } catch {
      toast.error('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function patchBlock(blockId: string, patch: BlockPatch) {
    if (!activePlan) return null;
    const planId = activePlan.id;
    setBusy(`block:${blockId}`);

    try {
      const res = await fetch(`/api/study-plans/${planId}/blocks/${blockId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        toast.error('That change did not save. Check the time and try again.');
        return null;
      }

      const data = (await res.json()) as { studyPlan: StudyPlan; block: StudyBlock };
      setPlans((current) => current.map((plan) => (plan.id === planId ? data.studyPlan : plan)));
      toast.success('Block updated');
      return data.block;
    } catch {
      toast.error('We could not reach the server. Check your connection and try again.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function deleteBlock(blockId: string) {
    if (!activePlan) return;
    const planId = activePlan.id;
    setBusy(`delete:${blockId}`);

    try {
      const res = await fetch(`/api/study-plans/${planId}/blocks/${blockId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('We could not remove that block. A plan needs at least one block.');
        return;
      }
      setPlans((current) =>
        current.map((plan) =>
          plan.id === planId
            ? { ...plan, blocks: plan.blocks.filter((block) => block.id !== blockId) }
            : plan,
        ),
      );
      toast.success('Block removed');
    } catch {
      toast.error('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function addBlock(draft: BlockPatch) {
    if (!activePlan) return false;
    const planId = activePlan.id;
    setBusy('add-block');

    try {
      const res = await fetch(`/api/study-plans/${planId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });

      if (!res.ok) {
        toast.error('We could not add that block. Check the time and try again.');
        return false;
      }

      const data = (await res.json()) as { studyPlan: StudyPlan };
      setPlans((current) => current.map((plan) => (plan.id === planId ? data.studyPlan : plan)));
      toast.success('Block added');
      return true;
    } catch {
      toast.error('We could not reach the server. Check your connection and try again.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  function startNewPlan() {
    setActivePlanId(null);
    setStep(1);
    setFormError('');
    setRequestKey(newIdempotencyKey());
    setAvailability(availabilityFromPreset('balanced'));
  }

  function openPlan(plan: StudyPlan) {
    setActivePlanId(plan.id);
    setStep(plan.approved ? 4 : 3);
    setFormError('');
  }

  const groupedBlocks = useMemo(() => {
    const map = new Map<StudyDay, StudyBlock[]>();
    for (const day of STUDY_DAYS) map.set(day, []);
    for (const block of orderedBlocks(activePlan?.blocks ?? [])) {
      map.get(block.day)?.push(block);
    }
    return map;
  }, [activePlan]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Study plan"
          description="Build a realistic week from your modules and the time you actually have."
        />
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Study plan" />
        <ErrorState
          title="Your study plans did not load"
          body="The server may be unavailable. Reload the page to try again."
          retryHref="/study-plan"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study plan"
        description="Tell us what you are studying and when you are free. We will shape a week you can actually keep, then you approve it before it reaches your calendar."
        action={
          activePlan ? (
            <Button variant="outline" onClick={startNewPlan}>
              <Plus className="size-4" aria-hidden="true" />
              New plan
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{STEP_LABELS[step - 1]}</CardTitle>
                  <CardDescription>
                    {step === 1
                      ? 'Pick the modules that need attention. Difficulty tells us where to start.'
                      : step === 2
                        ? 'Choose honest, repeatable windows. Small blocks beat one heroic Sunday.'
                        : step === 3
                          ? 'This is your week. Edit anything before you approve it.'
                          : 'Your plan is approved and ready to use.'}
                  </CardDescription>
                </div>
                <Badge variant={step === 4 ? 'leaf' : 'sky'}>
                  Step {step} of 4
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Plan creation progress">
                {STEP_LABELS.map((label, index) => {
                  const number = index + 1;
                  const current = number === step;
                  const complete = number < step;
                  return (
                    <li key={label} className="min-w-0">
                      <div
                        className={`flex items-center gap-2 rounded-lg px-2 py-2 ${
                          current ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                        }`}
                        aria-current={current ? 'step' : undefined}
                      >
                        <span
                          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            complete
                              ? 'bg-leaf text-white'
                              : current
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {complete ? <Check className="size-3.5" aria-hidden="true" /> : number}
                        </span>
                        <span className="hidden truncate text-xs font-medium sm:block">{label}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {step === 1 ? (
                <div className="space-y-5">
                  {prefilledFromMarks ? (
                    <div className="flex gap-3 rounded-lg bg-sky-soft px-4 py-3 text-sm leading-6 text-[#1d4f86]">
                      <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <p>
                        We prefilled your weakest subjects from your marks. Change the codes to
                        match your course modules.
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {modules.map((module, index) => (
                      <fieldset
                        key={index}
                        className="rounded-lg border border-border bg-background/60 p-4"
                      >
                        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Module {index + 1}
                        </legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <FormField
                            label="Module code"
                            htmlFor={`module-code-${index}`}
                            required
                            hint="e.g. MATH101 or ACC1A"
                          >
                            <Input
                              id={`module-code-${index}`}
                              value={module.code}
                              onChange={(event) =>
                                updateModule(index, { code: event.target.value })
                              }
                              placeholder="MATH101"
                              autoComplete="off"
                              maxLength={24}
                            />
                          </FormField>
                          <FormField
                            label="Module name"
                            htmlFor={`module-name-${index}`}
                            hint="Optional. A human name helps the plan read well."
                          >
                            <Input
                              id={`module-name-${index}`}
                              value={module.name}
                              onChange={(event) =>
                                updateModule(index, { name: event.target.value })
                              }
                              placeholder="Mathematics"
                              autoComplete="off"
                              maxLength={80}
                            />
                          </FormField>
                          <FormField
                            label="How hard does it feel?"
                            htmlFor={`module-difficulty-${index}`}
                            hint="1 is confident, 5 is struggling."
                          >
                            <div className="flex items-center gap-3">
                              <input
                                id={`module-difficulty-${index}`}
                                type="range"
                                min={1}
                                max={5}
                                step={1}
                                value={module.difficulty}
                                onChange={(event) =>
                                  updateModule(index, { difficulty: Number(event.target.value) })
                                }
                                className="h-2 w-full cursor-pointer accent-[var(--color-protea)]"
                              />
                              <Badge variant="outline" className="w-12 justify-center">
                                {module.difficulty}/5
                              </Badge>
                            </div>
                          </FormField>
                          <FormField
                            label="Exam date"
                            htmlFor={`module-exam-${index}`}
                            hint="Optional. The plan will get more practice-heavy closer to the date."
                          >
                            <Input
                              id={`module-exam-${index}`}
                              type="date"
                              value={module.examDate}
                              onChange={(event) =>
                                updateModule(index, { examDate: event.target.value })
                              }
                            />
                          </FormField>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => removeModule(index)}
                            disabled={modules.length === 1}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            Remove
                          </Button>
                        </div>
                      </fieldset>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addModule}
                    disabled={modules.length >= 8}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add another module
                  </Button>

                  {formError ? (
                    <p role="alert" className="text-sm text-danger">
                      {formError}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <Button variant="accent" onClick={goToAvailability}>
                      Continue
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Availability presets">
                    <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('balanced')}>
                      Balanced week
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('evenings')}>
                      Weekday evenings
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('weekend')}>
                      Weekend focus
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset('clear')}>
                      Clear
                    </Button>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="hidden grid-cols-[1fr_120px_120px] gap-3 bg-muted px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                      <span>Day</span>
                      <span>From</span>
                      <span>To</span>
                    </div>
                    <div className="divide-y divide-border">
                      {availability.map((row) => (
                        <div
                          key={row.day}
                          className="grid grid-cols-[1fr_1fr] items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_120px_120px]"
                        >
                          <label className="flex items-center gap-3 text-sm font-medium">
                            <Checkbox
                              checked={row.enabled}
                              onCheckedChange={(checked) =>
                                updateAvailability(row.day, { enabled: checked === true })
                              }
                              aria-label={`Available on ${dayLabel(row.day)}`}
                            />
                            {dayLabel(row.day)}
                          </label>
                          <Input
                            type="time"
                            step={900}
                            value={row.startTime}
                            disabled={!row.enabled}
                            aria-label={`${dayLabel(row.day)} start time`}
                            onChange={(event) =>
                              updateAvailability(row.day, { startTime: event.target.value })
                            }
                          />
                          <Input
                            type="time"
                            step={900}
                            value={row.endTime}
                            disabled={!row.enabled}
                            aria-label={`${dayLabel(row.day)} end time`}
                            onChange={(event) =>
                              updateAvailability(row.day, { endTime: event.target.value })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {formError ? (
                    <p role="alert" className="text-sm text-danger">
                      {formError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap justify-between gap-2">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      Back
                    </Button>
                    <Button variant="accent" onClick={goToReview} disabled={busy === 'generate'}>
                      {busy === 'generate' ? (
                        'Building your week…'
                      ) : (
                        <>
                          <Sparkles className="size-4" aria-hidden="true" />
                          Build my week
                        </>
                      )}
                    </Button>
                  </div>
                  {busy === 'generate' ? (
                    <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                      This usually takes a few seconds. If the assistant is unavailable, we use a
                      deterministic plan instead.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === 3 && activePlan ? (
                <PlanReview
                  plan={activePlan}
                  busy={busy}
                  groupedBlocks={groupedBlocks}
                  onApprove={() => void approvePlan(activePlan.id)}
                  onPatch={patchBlock}
                  onDelete={deleteBlock}
                  onAdd={addBlock}
                  onBack={() => setStep(2)}
                />
              ) : null}

              {step === 4 && activePlan ? (
                <div className="space-y-5">
                  <div className="rounded-lg border border-leaf/25 bg-leaf-soft px-5 py-6 text-center">
                    <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-leaf text-white">
                      <Check className="size-6" aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 text-lg font-semibold text-foreground">
                      Your week is on the calendar
                    </h3>
                    <p className="mx-auto mt-1 max-w-[48ch] text-sm leading-6 text-muted-foreground">
                      {activePlan.blocks.length} blocks, about{' '}
                      {formatDuration(totalMinutes(activePlan.blocks))} a week. Tick blocks off as
                      you go, or move one when life changes.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <Button asChild variant="accent">
                        <Link href="/calendar">
                          <CalendarDays className="size-4" aria-hidden="true" />
                          Open calendar
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <a href={`/api/study-plans/${activePlan.id}/calendar.ics`}>
                          <Download className="size-4" aria-hidden="true" />
                          Download .ics
                        </a>
                      </Button>
                    </div>
                  </div>

                  <PlanPreview plan={activePlan} />

                  <div className="flex flex-wrap justify-between gap-2">
                    <Button variant="outline" onClick={() => setStep(3)}>
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit blocks
                    </Button>
                    <Button variant="outline" onClick={startNewPlan}>
                      <Plus className="size-4" aria-hidden="true" />
                      Build another plan
                    </Button>
                  </div>
                </div>
              ) : null}

              {step !== 1 && step !== 2 && !activePlan ? (
                <div className="py-6">
                  <EmptyState
                    illustration="calendar"
                    title="No plan selected"
                    body="Choose a plan below, or start a new one."
                    action={{ href: '/study-plan', label: 'Start a new plan' }}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your plans</CardTitle>
              <CardDescription>
                Drafts stay here until you approve them. Only an approved plan appears on the
                calendar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No plan yet. Choose your modules above to build the first one.
                </p>
              ) : (
                <ul className="space-y-3">
                  {plans.map((plan) => {
                    const active = plan.id === activePlanId;
                    return (
                      <li
                        key={plan.id}
                        className={`rounded-lg border p-4 ${
                          active ? 'border-sky/50 bg-sky-soft/40' : 'border-border bg-card'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-foreground">
                                {plan.title}
                              </h3>
                              <Badge variant={plan.approved ? 'leaf' : 'neutral'}>
                                {plan.approved ? 'Approved' : 'Draft'}
                              </Badge>
                              {active ? <Badge variant="sky">Open</Badge> : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {plan.blocks.length} blocks ·{' '}
                              {formatDuration(totalMinutes(plan.blocks))} a week ·{' '}
                              {new Date(plan.createdAt).toLocaleDateString('en-ZA', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPlan(plan)}
                            >
                              {plan.approved ? 'View' : 'Review'}
                            </Button>
                            {!plan.approved ? (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => void approvePlan(plan.id)}
                                disabled={busy === `approve:${plan.id}` || plan.blocks.length === 0}
                              >
                                {busy === `approve:${plan.id}` ? 'Approving…' : 'Approve'}
                              </Button>
                            ) : (
                              <Button asChild size="sm" variant="outline">
                                <a href={`/api/study-plans/${plan.id}/calendar.ics`}>
                                  <Download className="size-3.5" aria-hidden="true" />
                                  .ics
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CompassIcon />
                How this works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
              <p className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-soft text-sky">
                  1
                </span>
                Pick your modules and how hard each one feels.
              </p>
              <p className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-soft text-sky">
                  2
                </span>
                Tell us when you are actually free. Recurring windows work best.
              </p>
              <p className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-soft text-sky">
                  3
                </span>
                Review the week, edit any block, then approve it.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-leaf" aria-hidden="true" />
                Private by design
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                The assistant only receives module codes, difficulty, exam dates and your
                availability. It never receives your name, email, phone number or ID.
              </p>
              <p>
                If the assistant is unavailable, we use a deterministic plan. You can still edit
                and approve it.
              </p>
            </CardContent>
          </Card>

          {activePlan ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="size-4 text-sky" aria-hidden="true" />
                  This plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Blocks</span>
                  <span className="font-medium">{activePlan.blocks.length}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Study time</span>
                  <span className="font-medium">{formatDuration(totalMinutes(activePlan.blocks))}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={activePlan.approved ? 'leaf' : 'neutral'}>
                    {activePlan.approved ? 'Approved' : 'Draft'}
                  </Badge>
                </div>
                <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                  Times are shown in Johannesburg time. You can move a block without rebuilding the
                  whole plan.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function CompassIcon() {
  return <BookOpen className="size-4 text-sky" aria-hidden="true" />;
}

function PlanPreview({ plan }: { plan: StudyPlan }) {
  const blocks = orderedBlocks(plan.blocks);
  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/60 px-4 py-3">
        <h3 className="text-sm font-semibold">Weekly preview</h3>
        <span className="text-xs text-muted-foreground">
          {blocks.length} blocks · {formatDuration(totalMinutes(blocks))}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {blocks.map((block) => (
          <li key={block.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
            <span className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {dayLabel(block.day)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{block.task}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {block.startTime} · {formatDuration(block.durationMinutes)}
                {block.moduleCode ? ` · ${block.moduleCode}` : ''}
              </p>
            </div>
            <Badge variant="outline">{KIND_LABELS[block.kind]}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanReview({
  plan,
  busy,
  groupedBlocks,
  onApprove,
  onPatch,
  onDelete,
  onAdd,
  onBack,
}: {
  plan: StudyPlan;
  busy: string | null;
  groupedBlocks: Map<StudyDay, StudyBlock[]>;
  onApprove: () => void;
  onPatch: (blockId: string, patch: BlockPatch) => Promise<StudyBlock | null>;
  onDelete: (blockId: string) => Promise<void>;
  onAdd: (draft: BlockPatch) => Promise<boolean>;
  onBack: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{plan.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {plan.blocks.length} blocks · {formatDuration(totalMinutes(plan.blocks))} a week
            {plan.approved ? ' · approved' : ''}
          </p>
        </div>
        <Badge variant={plan.approved ? 'leaf' : 'sky'}>
          {plan.approved ? 'On your calendar' : 'Needs your approval'}
        </Badge>
      </div>

      <div className="space-y-4">
        {STUDY_DAYS.map((day) => {
          const blocks = groupedBlocks.get(day) ?? [];
          if (blocks.length === 0) return null;
          return (
            <section key={day} aria-labelledby={`day-${day}`}>
              <h4
                id={`day-${day}`}
                className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                {dayLabel(day)}
              </h4>
              <ul className="space-y-2">
                {blocks.map((block) => (
                  <PlanBlockRow
                    key={block.id}
                    block={block}
                    busy={busy}
                    onSave={onPatch}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {adding ? (
        <AddBlockForm
          busy={busy === 'add-block'}
          onCancel={() => setAdding(false)}
          onAdd={async (draft) => {
            const ok = await onAdd(draft);
            if (ok) setAdding(false);
          }}
        />
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add a block
        </Button>
      )}

      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-5">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Change availability
        </Button>
        {plan.approved ? (
          <Button asChild variant="accent">
            <Link href="/calendar">
              <CalendarDays className="size-4" aria-hidden="true" />
              Open calendar
            </Link>
          </Button>
        ) : (
          <Button
            variant="accent"
            onClick={onApprove}
            disabled={busy === `approve:${plan.id}` || plan.blocks.length === 0}
          >
            {busy === `approve:${plan.id}` ? 'Approving…' : 'Approve this week'}
            <Check className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      {plan.blocks.length === 0 ? (
        <p className="text-sm text-danger" role="alert">
          Add at least one block before approving.
        </p>
      ) : null}
    </div>
  );
}

function PlanBlockRow({
  block,
  busy,
  onSave,
  onDelete,
}: {
  block: StudyBlock;
  busy: string | null;
  onSave: (blockId: string, patch: BlockPatch) => Promise<StudyBlock | null>;
  onDelete: (blockId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [task, setTask] = useState(block.task);
  const [day, setDay] = useState<StudyDay>(block.day);
  const [startTime, setStartTime] = useState(block.startTime);
  const [durationMinutes, setDurationMinutes] = useState(String(block.durationMinutes));
  const [kind, setKind] = useState<StudyBlockKind>(block.kind);
  const [moduleCode, setModuleCode] = useState(block.moduleCode ?? '');
  const [localError, setLocalError] = useState('');
  const pending = busy === `block:${block.id}` || busy === `delete:${block.id}`;

  function beginEdit() {
    setTask(block.task);
    setDay(block.day);
    setStartTime(block.startTime);
    setDurationMinutes(String(block.durationMinutes));
    setKind(block.kind);
    setModuleCode(block.moduleCode ?? '');
    setLocalError('');
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duration = Number(durationMinutes);
    if (!task.trim()) {
      setLocalError('Give the block a short task.');
      return;
    }
    if (!Number.isInteger(duration) || duration < 15 || duration > 240) {
      setLocalError('Duration must be between 15 and 240 minutes.');
      return;
    }
    const updated = await onSave(block.id, {
      task: task.trim(),
      day,
      startTime,
      durationMinutes: duration,
      kind,
      moduleCode: moduleCode.trim() || null,
    });
    if (updated) setEditing(false);
  }

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {block.moduleCode ? <Badge variant="sky">{block.moduleCode}</Badge> : null}
            <Badge variant="neutral">{KIND_LABELS[block.kind]}</Badge>
            <span className="text-xs text-muted-foreground">
              {block.startTime} · {formatDuration(block.durationMinutes)}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{block.task}</p>
          {block.reason ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{block.reason}</p>
          ) : null}
        </div>
        <div className="flex gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={beginEdit}
            disabled={pending}
            aria-label={`Edit ${block.task}`}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={pending}
                aria-label={`Remove ${block.task}`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            }
            title="Remove this block?"
            description={`“${block.task}” will be removed from this plan. You can add it again later.`}
            confirmLabel="Remove block"
            onConfirm={() => onDelete(block.id)}
          />
        </div>
      </div>

      {editing ? (
        <form onSubmit={(event) => void save(event)} className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <FormField label="Task" htmlFor={`block-task-${block.id}`} className="sm:col-span-2">
            <Input
              id={`block-task-${block.id}`}
              value={task}
              onChange={(event) => setTask(event.target.value)}
              maxLength={160}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Day" htmlFor={`block-day-${block.id}`}>
            <select
              id={`block-day-${block.id}`}
              value={day}
              onChange={(event) => setDay(event.target.value as StudyDay)}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              {STUDY_DAYS.map((studyDay) => (
                <option key={studyDay} value={studyDay}>
                  {dayLabel(studyDay)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Start time" htmlFor={`block-start-${block.id}`}>
            <Input
              id={`block-start-${block.id}`}
              type="time"
              step={900}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </FormField>
          <FormField label="Minutes" htmlFor={`block-duration-${block.id}`}>
            <Input
              id={`block-duration-${block.id}`}
              type="number"
              min={15}
              max={240}
              step={15}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />
          </FormField>
          <FormField label="Kind" htmlFor={`block-kind-${block.id}`}>
            <select
              id={`block-kind-${block.id}`}
              value={kind}
              onChange={(event) => setKind(event.target.value as StudyBlockKind)}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              {STUDY_BLOCK_KINDS.map((blockKind) => (
                <option key={blockKind} value={blockKind}>
                  {KIND_LABELS[blockKind]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Module code"
            htmlFor={`block-module-${block.id}`}
            hint="Optional"
            className="sm:col-span-2"
          >
            <Input
              id={`block-module-${block.id}`}
              value={moduleCode}
              onChange={(event) => setModuleCode(event.target.value)}
              maxLength={24}
              autoComplete="off"
            />
          </FormField>
          {localError ? (
            <p className="text-sm text-danger sm:col-span-2" role="alert">
              {localError}
            </p>
          ) : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving…' : 'Save block'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function AddBlockForm({
  busy,
  onCancel,
  onAdd,
}: {
  busy: boolean;
  onCancel: () => void;
  onAdd: (draft: BlockPatch) => Promise<void>;
}) {
  const [task, setTask] = useState('');
  const [day, setDay] = useState<StudyDay>('MONDAY');
  const [startTime, setStartTime] = useState('17:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [kind, setKind] = useState<StudyBlockKind>('STUDY');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task.trim()) {
      setError('Give the block a short task.');
      return;
    }
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 15 || duration > 240) {
      setError('Duration must be between 15 and 240 minutes.');
      return;
    }
    setError('');
    await onAdd({
      task: task.trim(),
      day,
      startTime,
      durationMinutes: duration,
      kind,
    });
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-lg border border-sky/40 bg-sky-soft/30 p-4"
    >
      <h4 className="text-sm font-semibold">Add a block</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField label="Task" htmlFor="new-block-task" className="sm:col-span-2">
          <Input
            id="new-block-task"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Work through one past-paper question"
            maxLength={160}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Day" htmlFor="new-block-day">
          <select
            id="new-block-day"
            value={day}
            onChange={(event) => setDay(event.target.value as StudyDay)}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            {STUDY_DAYS.map((studyDay) => (
              <option key={studyDay} value={studyDay}>
                {dayLabel(studyDay)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Start time" htmlFor="new-block-start">
          <Input
            id="new-block-start"
            type="time"
            step={900}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </FormField>
        <FormField label="Minutes" htmlFor="new-block-duration">
          <Input
            id="new-block-duration"
            type="number"
            min={15}
            max={240}
            step={15}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
        </FormField>
        <FormField label="Kind" htmlFor="new-block-kind">
          <select
            id="new-block-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as StudyBlockKind)}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            {STUDY_BLOCK_KINDS.map((blockKind) => (
              <option key={blockKind} value={blockKind}>
                {KIND_LABELS[blockKind]}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Adding…' : 'Add block'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

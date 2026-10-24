'use client';

/**
 * Real calendar for study blocks, funding deadlines and clinic bookings.
 *
 * Week and day views are time grids in Johannesburg time; month and agenda views use the same
 * event data. Study blocks can be dragged to another day/time, nudged with the keyboard, or
 * edited in the details dialog. The API owns the weekly expansion, so the calendar never
 * duplicates occurrence logic on the client.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  RotateCcw,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  STUDY_DAYS,
  johannesburgLocalToUtc,
  minutesToTime,
  studyDayForDateKey,
  type CalendarEvent,
  type StudyBlockStatus,
  type StudyDay,
} from '@iskole/shared';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  WEEKDAY_LABELS,
  eventDateKey,
  eventDateTimeLabel,
  eventMinutes,
  eventTimeLabel,
  formatDateKey,
  isToday,
  monthGridKeys,
  rangeForView,
  sameMonth,
  shiftAnchor,
  todayKey,
  weekKeys,
  type CalendarView,
} from '@/lib/calendar';

type CalendarStats = {
  blocks: number;
  done: number;
  skipped: number;
  planned: number;
  minutesDone: number;
  consistency: number;
};

type CalendarPayload = {
  timezone: string;
  from: string;
  to: string;
  planId: string | null;
  events: CalendarEvent[];
  stats: CalendarStats;
};

type BlockPatch = {
  day?: StudyDay;
  startTime?: string;
  durationMinutes?: number;
  status?: StudyBlockStatus;
  date?: string;
};

const VIEWS: Array<{ value: CalendarView; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
];

const EVENT_LABELS: Record<CalendarEvent['kind'], string> = {
  STUDY: 'Study block',
  FUNDING: 'Funding deadline',
  CLINIC: 'Clinic booking',
};

const STUDY_STATUS_LABELS: Record<StudyBlockStatus, string> = {
  PLANNED: 'Planned',
  DONE: 'Done',
  SKIPPED: 'Skipped',
};

const EVENT_CLASSES: Record<string, string> = {
  STUDY: 'border-sky bg-sky-soft text-[#1d4f86] hover:bg-[#d8e8f8]',
  FUNDING: 'border-amber bg-amber-soft text-[#7a4f11] hover:bg-[#ffedc2]',
  CLINIC: 'border-protea bg-protea-soft text-[#9f2149] hover:bg-[#f9dbe5]',
  DONE: 'border-leaf bg-leaf-soft text-[#14603e] hover:bg-[#d6edde]',
  SKIPPED: 'border-border bg-muted text-muted-foreground hover:bg-muted',
};

function eventClass(event: CalendarEvent) {
  if (event.kind === 'FUNDING') return EVENT_CLASSES.FUNDING;
  if (event.kind === 'CLINIC') return EVENT_CLASSES.CLINIC;
  if (event.status === 'DONE') return EVENT_CLASSES.DONE;
  if (event.status === 'SKIPPED') return EVENT_CLASSES.SKIPPED;
  return EVENT_CLASSES.STUDY;
}

function eventBadgeVariant(event: CalendarEvent) {
  if (event.kind === 'FUNDING') return 'amber' as const;
  if (event.kind === 'CLINIC') return 'sky' as const;
  if (event.status === 'DONE') return 'leaf' as const;
  if (event.status === 'SKIPPED') return 'neutral' as const;
  return 'sky' as const;
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

async function fetchCalendar(url: string, signal?: AbortSignal): Promise<CalendarPayload> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`calendar request failed: ${response.status}`);
  return (await response.json()) as CalendarPayload;
}

const MOBILE_QUERY = '(max-width: 767px)';
const EMPTY_EVENTS: CalendarEvent[] = [];

function subscribeToMobile(callback: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerMobileSnapshot() {
  return false;
}

type CalendarResponse = {
  url: string;
  status: 'success' | 'error';
  data: CalendarPayload | null;
};

export default function CalendarPage() {
  const isMobile = useSyncExternalStore(
    subscribeToMobile,
    getMobileSnapshot,
    getServerMobileSnapshot,
  );
  const [viewOverride, setViewOverride] = useState<CalendarView | null>(null);
  const view = viewOverride ?? (isMobile ? 'day' : 'week');
  const [anchorKey, setAnchorKey] = useState(todayKey);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const range = useMemo(() => rangeForView(view, anchorKey), [view, anchorKey]);

  const calendarUrl = useMemo(() => {
    const from = johannesburgLocalToUtc(range.startKey, '00:00').toISOString();
    const to = johannesburgLocalToUtc(range.endKey, '00:00').toISOString();
    return `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }, [range.startKey, range.endKey]);

  const currentCalendar = calendar?.url === calendarUrl ? calendar : null;
  const status = currentCalendar?.status ?? 'loading';
  const events = currentCalendar?.data?.events ?? EMPTY_EVENTS;
  const stats = currentCalendar?.data?.stats ?? null;
  const planId = currentCalendar?.data?.planId ?? null;

  useEffect(() => {
    const controller = new AbortController();

    fetchCalendar(calendarUrl, controller.signal)
      .then((data) => {
        setCalendar({ url: calendarUrl, status: 'success', data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCalendar({ url: calendarUrl, status: 'error', data: null });
      });

    return () => controller.abort();
  }, [calendarUrl]);

  const refreshCalendar = useCallback(async () => {
    try {
      const data = await fetchCalendar(calendarUrl);
      setCalendar({ url: calendarUrl, status: 'success', data });
    } catch {
      toast.error('The calendar could not refresh. Reload the page to see the latest changes.');
    }
  }, [calendarUrl]);

  async function patchEvent(
    event: CalendarEvent,
    patch: BlockPatch,
    successMessage: string,
  ): Promise<boolean> {
    if (!event.planId || !event.blockId) return false;
    setBusyEventId(event.id);

    try {
      const response = await fetch(
        `/api/study-plans/${event.planId}/blocks/${event.blockId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );

      if (!response.ok) {
        toast.error(
          response.status === 401
            ? 'Please sign in again to change this block.'
            : 'That change did not save. Try another time.',
        );
        return false;
      }

      await refreshCalendar();
      setAnnouncement(successMessage);
      toast.success(successMessage);
      return true;
    } catch {
      toast.error('We could not reach the server. Check your connection and try again.');
      return false;
    } finally {
      setBusyEventId(null);
    }
  }

  async function markEvent(event: CalendarEvent, statusValue: StudyBlockStatus) {
    const ok = await patchEvent(
      event,
      { status: statusValue, date: eventDateKey(event) },
      statusValue === 'DONE'
        ? 'Marked this block done'
        : statusValue === 'SKIPPED'
          ? 'Skipped this occurrence'
          : 'Moved this block back to planned',
    );
    if (ok) {
      setSelectedEvent((current) =>
        current && current.id === event.id ? { ...current, status: statusValue } : current,
      );
    }
    return ok;
  }

  async function nudgeEvent(event: CalendarEvent, deltaMinutes: number) {
    if (!event.planId || busyEventId) return;
    const start = eventMinutes(event).start;
    const next = Math.max(0, Math.min(23 * 60 + 45, start + deltaMinutes));
    await patchEvent(event, { startTime: minutesToTime(next) }, 'Block moved');
  }

  async function moveEventDay(event: CalendarEvent, direction: -1 | 1) {
    if (!event.planId || busyEventId) return;
    const currentDay = studyDayForDateKey(eventDateKey(event));
    const index = STUDY_DAYS.indexOf(currentDay);
    const nextDay = STUDY_DAYS[(index + direction + 7) % 7]!;
    await patchEvent(event, { day: nextDay }, `Block moved to ${nextDay.toLowerCase()}`);
  }

  async function dropEvent(event: CalendarEvent, targetDayKey: string, startMinute: number) {
    if (!event.planId) return;
    const day = studyDayForDateKey(targetDayKey);
    const rounded = Math.max(
      0,
      Math.min(23 * 60 + 45, Math.round(startMinute / 30) * 30),
    );
    await patchEvent(
      event,
      { day, startTime: minutesToTime(rounded) },
      `Block moved to ${formatDateKey(targetDayKey, 'EEEE')} at ${minutesToTime(rounded)}`,
    );
    setDraggedEvent(null);
  }

  function onKeyDown(event: CalendarEvent, keyEvent: React.KeyboardEvent<HTMLButtonElement>) {
    if (!event.planId) return;
    if (keyEvent.key === 'ArrowUp' || keyEvent.key === 'ArrowDown') {
      keyEvent.preventDefault();
      void nudgeEvent(event, keyEvent.key === 'ArrowUp' ? -15 : 15);
    }
    if (keyEvent.key === 'ArrowLeft' || keyEvent.key === 'ArrowRight') {
      keyEvent.preventDefault();
      void moveEventDay(event, keyEvent.key === 'ArrowLeft' ? -1 : 1);
    }
  }

  function openDay(day: string) {
    setAnchorKey(day);
    setViewOverride('day');
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = eventDateKey(event);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start.localeCompare(b.start);
      });
    }
    return map;
  }, [events]);

  const week = useMemo(() => weekKeys(range.startKey), [range.startKey]);
  const monthDays = useMemo(
    () => (view === 'month' ? monthGridKeys(anchorKey) : []),
    [view, anchorKey],
  );
  const visibleDays = view === 'week' ? week : view === 'day' ? [anchorKey] : [];
  const hasEvents = events.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description="Your study blocks, funding deadlines and clinic bookings in Johannesburg time. Drag a block to move it, or use the arrow keys when a block is focused."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/study-plan">
                <Sparkles className="size-4" aria-hidden="true" />
                Edit plan
              </Link>
            </Button>
            {planId ? (
              <Button asChild variant="outline">
                <a href={`/api/study-plans/${planId}/calendar.ics`}>
                  <Download className="size-4" aria-hidden="true" />
                  Export .ics
                </a>
              </Button>
            ) : null}
          </div>
        }
      />

      <Card>
        <CardContent className="pt-1">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => setAnchorKey((key) => shiftAnchor(view, key, -1))}
                aria-label={`Previous ${view}`}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Button type="button" size="icon-sm" variant="outline" onClick={() => setAnchorKey(todayKey())}>
                <CalendarDays className="size-4" aria-hidden="true" />
                <span className="sr-only">Today</span>
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => setAnchorKey((key) => shiftAnchor(view, key, 1))}
                aria-label={`Next ${view}`}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
              <div className="ml-1 min-w-0">
                <h2 className="truncate text-lg font-semibold text-foreground">{range.label}</h2>
                <p className="text-xs text-muted-foreground">
                  {status === 'success'
                    ? `${events.filter((event) => event.kind === 'STUDY').length} study blocks in view`
                    : 'Loading your calendar…'}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Input
                  type="date"
                  value={anchorKey}
                  onChange={(event) => {
                    if (event.target.value) setAnchorKey(event.target.value);
                  }}
                  className="h-9 w-[150px]"
                  aria-label="Jump to a date"
                />
              </div>
            </div>

            <div
              className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/50 p-1"
              role="group"
              aria-label="Calendar view"
            >
              {VIEWS.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={view === item.value ? 'default' : 'ghost'}
                  aria-pressed={view === item.value}
                  onClick={() => setViewOverride(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {status === 'success' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="pt-1">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                In this range
              </p>
              <p className="tabular mt-2 text-2xl font-semibold">{stats?.blocks ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">study blocks</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-1">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Marked done
              </p>
              <p className="tabular mt-2 text-2xl font-semibold text-leaf">{stats?.done ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats?.planned ?? 0} still planned
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-1">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Consistency
              </p>
              <p className="tabular mt-2 text-2xl font-semibold">{stats?.consistency ?? 0}%</p>
              <Progress value={stats?.consistency ?? 0} className="mt-2 h-2" aria-label="Weekly study consistency" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-1">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Time completed
              </p>
              <p className="tabular mt-2 text-2xl font-semibold">
                {durationLabel(stats?.minutesDone ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats?.skipped ?? 0} skipped on purpose
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {status === 'success' && !planId ? (
        <div className="flex flex-col gap-3 rounded-[10px] border border-sky/30 bg-sky-soft px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-sky" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">No approved study plan yet</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Funding deadlines and clinic bookings still appear here. Build and approve a plan
                to add study blocks.
              </p>
            </div>
          </div>
          <Button asChild variant="accent" size="sm">
            <Link href="/study-plan">
              Build a plan
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-1">
          {status === 'loading' ? (
            <CalendarSkeleton view={view} />
          ) : status === 'error' ? (
            <ErrorState
              title="The calendar did not load"
              body="The server may be unavailable. Reload the page to try again."
              retryHref="/calendar"
            />
          ) : !hasEvents ? (
            <EmptyState
              illustration="calendar"
              title="A clear week"
              body="There are no study blocks, funding deadlines or clinic bookings in this range. Move to another week or build a study plan."
              action={{ href: '/study-plan', label: 'Build a study plan' }}
            />
          ) : view === 'month' ? (
            <MonthView
              anchorKey={anchorKey}
              days={monthDays}
              eventsByDate={eventsByDate}
              onOpenDay={openDay}
              onSelectEvent={setSelectedEvent}
            />
          ) : view === 'agenda' ? (
            <AgendaView events={events} onSelectEvent={setSelectedEvent} />
          ) : (
            <TimeGridView
              days={visibleDays}
              eventsByDate={eventsByDate}
              busyEventId={busyEventId}
              onSelectEvent={setSelectedEvent}
              onOpenDay={openDay}
              onKeyDown={onKeyDown}
              onDragStart={setDraggedEvent}
              onDragEnd={() => setDraggedEvent(null)}
              onDrop={dropEvent}
              draggedEvent={draggedEvent}
            />
          )}
        </CardContent>
      </Card>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-sky" aria-hidden="true" />
          Study
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-leaf" aria-hidden="true" />
          Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-amber" aria-hidden="true" />
          Funding deadline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-protea" aria-hidden="true" />
          Clinic
        </span>
        <span className="hidden sm:inline">Times shown in SAST (UTC+2).</span>
      </div>

      {selectedEvent ? (
        <EventDialog
          key={`${selectedEvent.id}-${selectedEvent.status}`}
          event={selectedEvent}
          busy={busyEventId === selectedEvent.id}
          onClose={() => setSelectedEvent(null)}
          onMark={markEvent}
          onMove={async (event, patch) => {
            const ok = await patchEvent(event, patch, 'Block updated');
            if (ok) setSelectedEvent(null);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}

function TimeGridView({
  days,
  eventsByDate,
  busyEventId,
  onSelectEvent,
  onOpenDay,
  onKeyDown,
  onDragStart,
  onDragEnd,
  onDrop,
  draggedEvent,
}: {
  days: string[];
  eventsByDate: Map<string, CalendarEvent[]>;
  busyEventId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onOpenDay: (day: string) => void;
  onKeyDown: (event: CalendarEvent, keyEvent: React.KeyboardEvent<HTMLButtonElement>) => void;
  onDragStart: (event: CalendarEvent) => void;
  onDragEnd: () => void;
  onDrop: (event: CalendarEvent, dayKey: string, startMinute: number) => void;
  draggedEvent: CalendarEvent | null;
}) {
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, index) => DAY_START_HOUR + index);
  const bodyHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;
  const columns = `56px repeat(${days.length}, minmax(0, 1fr))`;
  const hasAllDay = days.some((day) =>
    (eventsByDate.get(day) ?? []).some((event) => event.allDay),
  );

  return (
    <div className="overflow-x-auto">
      <div className={days.length > 1 ? 'min-w-[760px]' : 'min-w-0'}>
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: columns }}
        >
          <div className="px-2 py-3 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            SAST
          </div>
          {days.map((day) => {
            const current = isToday(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => onOpenDay(day)}
                className={`border-l border-border px-2 py-2 text-left transition-colors hover:bg-muted ${
                  current ? 'bg-sky-soft/60' : ''
                }`}
                aria-label={`Open ${formatDateKey(day, 'EEEE d MMMM')}`}
              >
                <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {formatDateKey(day, 'EEE')}
                </span>
                <span
                  className={`mt-0.5 inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                    current ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  }`}
                >
                  {formatDateKey(day, 'd')}
                </span>
              </button>
            );
          })}
        </div>

        {hasAllDay ? (
          <div className="grid border-b border-border bg-amber-soft/25" style={{ gridTemplateColumns: columns }}>
            <div className="px-2 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              All day
            </div>
            {days.map((day) => {
              const allDay = (eventsByDate.get(day) ?? []).filter((event) => event.allDay);
              return (
                <div key={`all-day-${day}`} className="min-h-8 space-y-1 border-l border-border p-1">
                  {allDay.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      className={`block w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[10px] font-medium ${eventClass(event)}`}
                      title={event.title}
                    >
                      {event.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="grid" style={{ gridTemplateColumns: columns }}>
          <div className="relative" style={{ height: bodyHeight }}>
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] tabular text-muted-foreground"
                style={{ top: (hour - DAY_START_HOUR) * HOUR_HEIGHT }}
              >
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>

          {days.map((day) => {
            const dayEvents = (eventsByDate.get(day) ?? []).filter((event) => !event.allDay);
            return (
              <div
                key={day}
                className={`relative border-l border-border ${isToday(day) ? 'bg-sky-soft/15' : ''}`}
                style={{ height: bodyHeight }}
                onDragOver={(event) => {
                  if (draggedEvent?.planId) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggedEvent) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const minuteOffset = ((event.clientY - rect.top) / HOUR_HEIGHT) * 60;
                  onDrop(draggedEvent, day, DAY_START_HOUR * 60 + minuteOffset);
                }}
              >
                {hours.map((hour) => (
                  <span
                    key={hour}
                    className="pointer-events-none absolute inset-x-0 border-t border-border/70"
                    style={{ top: (hour - DAY_START_HOUR) * HOUR_HEIGHT }}
                    aria-hidden="true"
                  />
                ))}

                {dayEvents.map((event) => {
                  const { start, end } = eventMinutes(event);
                  const startMinute = Math.max(start, DAY_START_HOUR * 60);
                  const endMinute = Math.min(end, DAY_END_HOUR * 60);
                  if (endMinute <= DAY_START_HOUR * 60 || startMinute >= DAY_END_HOUR * 60) {
                    return null;
                  }
                  const top = ((startMinute - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;
                  const height = Math.max(
                    24,
                    ((endMinute - startMinute) / 60) * HOUR_HEIGHT,
                  );
                  const draggable = Boolean(event.planId);

                  return (
                    <button
                      key={event.id}
                      type="button"
                      draggable={draggable}
                      onDragStart={() => {
                        if (draggable) onDragStart(event);
                      }}
                      onDragEnd={onDragEnd}
                      onClick={() => onSelectEvent(event)}
                      onKeyDown={(keyEvent) => onKeyDown(event, keyEvent)}
                      className={`absolute left-1 right-1 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-opacity ${eventClass(
                        event,
                      )} ${busyEventId === event.id ? 'opacity-50' : ''}`}
                      style={{ top, height }}
                      title={`${event.title} · ${eventDateTimeLabel(event)}`}
                      aria-label={`${event.title}, ${eventDateTimeLabel(event)}${draggable ? '. Use arrow keys to move, or drag to another day and time.' : ''}`}
                    >
                      <span className="block truncate font-medium">{event.title}</span>
                      {height >= 36 ? (
                        <span className="mt-0.5 block truncate opacity-80">
                          {eventTimeLabel(event)}
                          {event.moduleCode ? ` · ${event.moduleCode}` : ''}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthView({
  anchorKey,
  days,
  eventsByDate,
  onOpenDay,
  onSelectEvent,
}: {
  anchorKey: string;
  days: string[];
  eventsByDate: Map<string, CalendarEvent[]>;
  onOpenDay: (day: string) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayEvents = eventsByDate.get(day) ?? [];
            const inMonth = sameMonth(day, anchorKey);
            return (
              <div
                key={day}
                className={`min-h-28 border-b border-l border-border p-1.5 ${
                  inMonth ? 'bg-card' : 'bg-muted/30'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className={`mb-1 flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors hover:bg-muted ${
                    isToday(day)
                      ? 'bg-primary text-primary-foreground'
                      : inMonth
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                  }`}
                  aria-label={`Open ${formatDateKey(day, 'EEEE d MMMM')}`}
                >
                  {formatDateKey(day, 'd')}
                </button>
                <div className="space-y-1">
                  {dayEvents.slice(0, 2).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      className={`block w-full truncate rounded border-l-2 px-1 py-0.5 text-left text-[10px] font-medium ${eventClass(event)}`}
                      title={event.title}
                    >
                      {event.allDay ? '' : `${eventTimeLabel(event)} `}
                      {event.title}
                    </button>
                  ))}
                  {dayEvents.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => onOpenDay(day)}
                      className="block w-full text-left text-[10px] font-medium text-sky hover:underline"
                    >
                      +{dayEvents.length - 2} more
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgendaView({
  events,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = eventDateKey(event);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  return (
    <div className="divide-y divide-border">
      {grouped.map(([day, dayEvents]) => (
        <section key={day} className="py-4 first:pt-1" aria-labelledby={`agenda-${day}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 id={`agenda-${day}`} className="text-sm font-semibold text-foreground">
              {formatDateKey(day, 'EEEE d MMMM')}
              {isToday(day) ? (
                <Badge variant="sky" className="ml-2">
                  Today
                </Badge>
              ) : null}
            </h3>
            <span className="text-xs text-muted-foreground">
              {dayEvents.length} {dayEvents.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <ul className="space-y-2">
            {dayEvents.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent(event)}
                  className="flex w-full flex-wrap items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="w-14 shrink-0 text-xs font-medium tabular text-muted-foreground">
                    {event.allDay ? 'All day' : eventTimeLabel(event)}
                  </span>
                  <span className={`mt-0.5 size-2.5 shrink-0 rounded-full ${event.kind === 'FUNDING' ? 'bg-amber' : event.kind === 'CLINIC' ? 'bg-protea' : event.status === 'DONE' ? 'bg-leaf' : 'bg-sky'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{event.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {EVENT_LABELS[event.kind]}
                      {event.moduleCode ? ` · ${event.moduleCode}` : ''}
                      {event.status !== 'OPEN' ? ` · ${event.status.toLowerCase()}` : ''}
                    </span>
                  </span>
                  <Badge variant={eventBadgeVariant(event)}>{EVENT_LABELS[event.kind]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EventDialog({
  event,
  busy,
  onClose,
  onMark,
  onMove,
}: {
  event: CalendarEvent;
  busy: boolean;
  onClose: () => void;
  onMark: (event: CalendarEvent, status: StudyBlockStatus) => Promise<boolean>;
  onMove: (event: CalendarEvent, patch: BlockPatch) => Promise<boolean>;
}) {
  const dateKey = eventDateKey(event);
  const status: StudyBlockStatus = event.status === 'OPEN' ? 'PLANNED' : event.status;
  const [day, setDay] = useState<StudyDay>(studyDayForDateKey(dateKey));
  const [startTime, setStartTime] = useState(minutesToTime(eventMinutes(event).start));
  const [durationMinutes, setDurationMinutes] = useState(
    String(Math.max(15, eventMinutes(event).end - eventMinutes(event).start)),
  );
  const [saving, setSaving] = useState(false);

  const isStudy = event.kind === 'STUDY' && Boolean(event.planId && event.blockId);

  async function mark(next: StudyBlockStatus) {
    await onMark(event, next);
  }

  async function save(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 15 || duration > 240) {
      toast.error('Duration must be between 15 and 240 minutes.');
      return;
    }
    setSaving(true);
    try {
      await onMove(event, { day, startTime, durationMinutes: duration });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={eventBadgeVariant(event)}>{EVENT_LABELS[event.kind]}</Badge>
            {isStudy ? (
              <Badge
                variant={
                  status === 'DONE' ? 'leaf' : status === 'SKIPPED' ? 'neutral' : 'sky'
                }
              >
                {STUDY_STATUS_LABELS[status]}
              </Badge>
            ) : null}
          </div>
          <DialogTitle>{event.title}</DialogTitle>
          <DialogDescription>
            {eventDateTimeLabel(event)}
            {event.moduleCode ? ` · ${event.moduleCode}` : ''}
          </DialogDescription>
        </DialogHeader>

        {isStudy ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={status === 'DONE' ? 'default' : 'outline'}
                onClick={() => void mark('DONE')}
                disabled={busy}
              >
                <Check className="size-3.5" aria-hidden="true" />
                {status === 'DONE' ? 'Done' : 'Mark done'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={status === 'SKIPPED' ? 'default' : 'outline'}
                onClick={() => void mark('SKIPPED')}
                disabled={busy}
              >
                <SkipForward className="size-3.5" aria-hidden="true" />
                Skip
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void mark('PLANNED')}
                disabled={busy || status === 'PLANNED'}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reset
              </Button>
            </div>

            <form onSubmit={(formEvent) => void save(formEvent)} className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Move this weekly block
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Day</span>
                  <select
                    value={day}
                    onChange={(selectEvent) => setDay(selectEvent.target.value as StudyDay)}
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  >
                    {STUDY_DAYS.map((studyDay) => (
                      <option key={studyDay} value={studyDay}>
                        {studyDay.charAt(0) + studyDay.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Start time</span>
                  <Input
                    type="time"
                    step={900}
                    value={startTime}
                    onChange={(inputEvent) => setStartTime(inputEvent.target.value)}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Minutes</span>
                  <Input
                    type="number"
                    min={15}
                    max={240}
                    step={15}
                    value={durationMinutes}
                    onChange={(inputEvent) => setDurationMinutes(inputEvent.target.value)}
                  />
                </label>
                <div className="flex items-end">
                  <Button type="submit" size="sm" disabled={busy || saving}>
                    {saving ? 'Saving…' : 'Save time'}
                  </Button>
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                This changes the recurring weekly block, not just this date. In week view you can
                also drag it or use the arrow keys.
              </p>
            </form>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
            <p>{event.notes ?? 'This item comes from another part of iskole.'}</p>
            {event.href ? (
              <Button asChild variant="outline" size="sm">
                <Link href={event.href}>
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  Open item
                </Link>
              </Button>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy || saving}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CalendarSkeleton({ view }: { view: CalendarView }) {
  if (view === 'agenda') {
    return (
      <div className="space-y-4" aria-label="Loading calendar" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-lg border border-border p-4">
            <div className="h-3 w-32 rounded bg-muted" />
            <div className="mt-3 h-3 w-full rounded bg-muted" />
            <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-pulse" aria-label="Loading calendar" aria-busy="true">
      <div className="grid grid-cols-7 gap-2 border-b border-border pb-3">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="h-3 rounded bg-muted" />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-2">
        {Array.from({ length: view === 'month' ? 35 : 21 }).map((_, index) => (
          <div key={index} className="h-16 rounded bg-muted/70" />
        ))}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, HeartPulse, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, EmptyState, ErrorState, Section, StatusBadge } from '@/components/page-parts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type ClinicSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  topic: string;
  capacity: number;
  booked: number;
  placesLeft: number;
};

type Booking = {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string;
  slot: {
    id: string;
    topic: string;
    startsAt: string;
    endsAt: string;
  };
};

const REASONS = [
  { value: 'FUNDING', label: 'Funding and NSFAS' },
  { value: 'REGISTRATION', label: 'Registration and documents' },
  { value: 'STUDY_SKILLS', label: 'Study skills and planning' },
  { value: 'WELLBEING', label: 'Wellbeing and support' },
  { value: 'OTHER', label: 'Something else' },
];

function formatSlotTime(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${start.toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function WellnessPage() {
  const [slots, setSlots] = useState<ClinicSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [reason, setReason] = useState('FUNDING');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [slotsRes, bookingsRes] = await Promise.all([
          fetch('/api/clinic/slots'),
          fetch('/api/clinic/bookings'),
        ]);
        if (!slotsRes.ok || !bookingsRes.ok) {
          if (!cancelled) setStatus('error');
          return;
        }
        const slotsData = (await slotsRes.json()) as { slots: ClinicSlot[] };
        const bookingsData = (await bookingsRes.json()) as { bookings: Booking[] };
        if (!cancelled) {
          setSlots(slotsData.slots);
          setBookings(bookingsData.bookings);
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

  const [now] = useState(() => Date.now());

  const upcoming = useMemo(() => {
    return bookings
      .filter((b) => b.status === 'CONFIRMED' && new Date(b.slot.startsAt).getTime() > now)
      .sort((a, b) => new Date(a.slot.startsAt).getTime() - new Date(b.slot.startsAt).getTime());
  }, [bookings, now]);

  const past = useMemo(() => {
    return bookings
      .filter((b) => new Date(b.slot.startsAt).getTime() <= now || b.status === 'CANCELLED')
      .sort((a, b) => new Date(b.slot.startsAt).getTime() - new Date(a.slot.startsAt).getTime())
      .slice(0, 12);
  }, [bookings, now]);

  async function bookSlot(slotId: string) {
    setPending(true);
    setBookingSlotId(slotId);
    try {
      const res = await fetch('/api/clinic/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `clinic-${slotId}-${reason}`,
        },
        body: JSON.stringify({ slotId, reason }),
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { booking: Booking };
      setBookings((current) => [data.booking, ...current]);
      setSlots((current) =>
        current.map((slot) => (slot.id === slotId ? { ...slot, booked: slot.booked + 1, placesLeft: Math.max(0, slot.placesLeft - 1) } : slot)),
      );
      toast.success('Clinic session booked');
    } catch {
      toast.error('Could not book this slot');
    } finally {
      setPending(false);
      setBookingSlotId(null);
    }
  }

  async function cancelBooking(bookingId: string) {
    try {
      const res = await fetch(`/api/clinic/bookings/${bookingId}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        setBookings((current) => current.map((b) => (b.id === bookingId ? { ...b, status: 'CANCELLED' } : b)));
        toast.success('Booking cancelled');
      } else {
        throw new Error('failed');
      }
    } catch {
      toast.error('Could not cancel booking');
    }
  }

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <PageHeader title="Wellness" description="Book a clinic session for funding, registration or support." />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading...</CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeader title="Wellness" />
        <ErrorState title="Wellness did not load" retryHref="/wellness" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wellness"
        description="Practical support from the clinic. Pick a fixed reason — we only store the category, never free-text health details."
        action={
          <Badge variant="sky" className="gap-1.5">
            <HeartPulse className="size-3.5" />
            {upcoming.length} upcoming
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardContent className="pt-1">
            <Section title="Available slots" description="Small group sessions. Places are limited.">
              {slots.length === 0 ? (
                <EmptyState illustration="wellness" title="No slots available" body="Check back soon for upcoming clinic sessions." compact />
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reason">Booking reason</Label>
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger id="reason" className="sm:w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {slots.map((slot) => (
                      <li key={slot.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-sky-soft text-sky">
                            <CalendarDays className="size-4" aria-hidden="true" />
                          </span>
                          <div>
                            <p className="font-medium">{slot.topic}</p>
                            <p className="text-sm text-muted-foreground">{formatSlotTime(slot.startsAt, slot.endsAt)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {slot.placesLeft} {slot.placesLeft === 1 ? 'place' : 'places'} left ({slot.booked}/{slot.capacity})
                            </p>
                          </div>
                        </div>
                        <Button onClick={() => void bookSlot(slot.id)} disabled={pending && bookingSlotId === slot.id || slot.placesLeft === 0}>
                          {pending && bookingSlotId === slot.id ? 'Booking...' : slot.placesLeft === 0 ? 'Full' : 'Book slot'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-1">
            <Section title="Your bookings" description="Upcoming and past.">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium">Upcoming</p>
                  {upcoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
                  ) : (
                    <ul className="space-y-2">
                      {upcoming.map((booking) => (
                        <li key={booking.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-border p-3">
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 size-4 text-leaf" aria-hidden="true" />
                            <div>
                              <p className="text-sm font-medium">{booking.slot.topic}</p>
                              <p className="text-xs text-muted-foreground">{formatSlotTime(booking.slot.startsAt, booking.slot.endsAt)}</p>
                              {booking.reason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {REASONS.find((r) => r.value === booking.reason)?.label ?? booking.reason}</p> : null}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => void cancelBooking(booking.id)}>
                            Cancel
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Past</p>
                  {past.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No past bookings.</p>
                  ) : (
                    <ul className="space-y-2">
                      {past.map((booking) => (
                        <li key={booking.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-border/70 bg-muted/40 p-3">
                          <div className="flex items-center gap-2">
                            {booking.status === 'CANCELLED' ? <XCircle className="size-4 text-muted-foreground" aria-hidden="true" /> : <Clock className="size-4 text-muted-foreground" aria-hidden="true" />}
                            <div>
                              <p className="text-sm">{booking.slot.topic}</p>
                              <p className="text-xs text-muted-foreground">{new Date(booking.slot.startsAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            </div>
                          </div>
                          <StatusBadge status={booking.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Section>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-4">
          <p className="text-xs leading-5 text-muted-foreground">
            Private and POPIA-aware. Reasons are chosen from a fixed list. Nothing sensitive is stored in free text. Bookings appear on your calendar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

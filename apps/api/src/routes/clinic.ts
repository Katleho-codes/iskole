/**
 * Clinic: small-group sessions with an advisor (funding, registration, study skills).
 *
 * Slots are public to read, because a learner should be able to see what is on before
 * creating an account. Booking requires a session. The capacity check runs inside a
 * serialisable transaction, so two learners tapping at the same moment cannot both take
 * the last place.
 */
import { Router } from 'express';
import { ClinicBookingInputSchema } from '@iskole/shared';
import { requireRole, requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';

export const clinicRouter = Router();

clinicRouter.get('/clinic/slots', async (_req, res, next) => {
  try {
    const slots = await prisma.clinicSlot.findMany({
      where: { startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 50,
      include: { _count: { select: { bookings: true } } },
    });

    res.json({
      slots: slots.map((slot) => ({
        id: slot.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        topic: slot.topic,
        capacity: slot.capacity,
        booked: slot._count.bookings,
        placesLeft: Math.max(0, slot.capacity - slot._count.bookings),
      })),
    });
  } catch (error) {
    next(error);
  }
});

clinicRouter.post(
  '/clinic/bookings',
  requireSession,
  requireRole('STUDENT'),
  idempotent(),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const { slotId, reason } = ClinicBookingInputSchema.parse(req.body);

      const booking = await prisma.$transaction(
        async (tx) => {
          const slot = await tx.clinicSlot.findUnique({ where: { id: slotId } });
          if (!slot) {
            throw new HttpError(404, 'clinic slot not found');
          }
          if (slot.startsAt <= new Date()) {
            throw new HttpError(422, 'that clinic slot has already started');
          }

          const booked = await tx.booking.count({ where: { slotId } });
          if (booked >= slot.capacity) {
            throw new HttpError(409, 'that clinic slot is full');
          }

          return tx.booking.create({
            data: { slotId, userId, status: 'CONFIRMED', reason },
            include: { slot: true },
          });
        },
        { isolationLevel: 'Serializable' },
      );

      res.status(201).json({
        booking: {
          id: booking.id,
          status: booking.status,
          reason: booking.reason,
          createdAt: booking.createdAt,
          slot: {
            id: booking.slot.id,
            topic: booking.slot.topic,
            startsAt: booking.slot.startsAt,
            endsAt: booking.slot.endsAt,
          },
        },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        return next(new HttpError(409, 'you have already booked this clinic'));
      }
      if (code === 'P2034') {
        return next(new HttpError(409, 'the last place went while you were booking; try again'));
      }
      next(error);
    }
  },
);

clinicRouter.delete(
  '/clinic/bookings/:id',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const booking = await prisma.booking.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, userId: true, status: true, slot: { select: { startsAt: true } } },
      });

      if (!booking) {
        return res.status(404).json({ error: 'booking not found' });
      }
      if (booking.userId !== userId) {
        return res.status(403).json({ error: 'not allowed' });
      }
      if (booking.status === 'CANCELLED') {
        return res.status(204).send();
      }

      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED' },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

clinicRouter.get(
  '/clinic/bookings',
  requireSession,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id;
      const bookings = await prisma.booking.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { slot: true },
        take: 50,
      });

      res.json({
        bookings: bookings.map((booking) => ({
          id: booking.id,
          status: booking.status,
          reason: booking.reason,
          createdAt: booking.createdAt,
          slot: {
            id: booking.slot.id,
            topic: booking.slot.topic,
            startsAt: booking.slot.startsAt,
            endsAt: booking.slot.endsAt,
          },
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

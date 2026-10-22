/**
 * Clinic: small-group sessions with an advisor (funding, registration, study skills).
 *
 * Slots are public to read, because a learner should be able to see what is on before
 * creating an account. Booking requires a session. The capacity check runs inside a
 * serialisable transaction, so two learners tapping at the same moment cannot both take
 * the last place.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireSession } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';

export const clinicRouter = Router();

const BookingSchema = z.object({ slotId: z.string().min(1).max(64) }).strict();

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
      const { slotId } = BookingSchema.parse(req.body);

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
            data: { slotId, userId, status: 'CONFIRMED' },
            include: { slot: true },
          });
        },
        { isolationLevel: 'Serializable' },
      );

      res.status(201).json({
        booking: {
          id: booking.id,
          status: booking.status,
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

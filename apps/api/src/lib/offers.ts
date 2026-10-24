import { createHmac } from 'node:crypto';
import { prisma } from './prisma';
import { canTransitionApplication, type ApplicationStatus } from '@iskole/shared';
import { unprocessable } from './http-error';
import {
  detectDocumentType,
  DOWNLOAD_URL_TTL_SECONDS,
  removeStoredDocument,
  storeDocument,
  type SignedDownload,
} from './storage';
import { sendMail } from './email';
import { logger } from './logger';
import { env } from './env';

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildOfferPdf(input: {
  learnerName: string;
  courseName: string;
  institutionName: string;
  applicationId: string;
  issuedAt: Date;
}): Buffer {
  const issued = input.issuedAt.toISOString().slice(0, 10);
  const lines = [
    'SAMPLE OFFER LETTER',
    'Not a real institution decision',
    '',
    `Prepared for: ${input.learnerName}`,
    `Course: ${input.courseName}`,
    `Institution: ${input.institutionName}`,
    `Application reference: ${input.applicationId}`,
    `Issued: ${issued}`,
    '',
    'This is a sample offer issued by the iskole demo.',
    'Review the offer details on the platform and respond below.',
    'No financial guarantee or enrolment is implied by this document.',
  ];

  const commands: string[] = [];
  commands.push('BT');
  commands.push('/F2 18 Tf');
  commands.push('50 780 Td');
  commands.push(`(${escapePdfText('SAMPLE OFFER - iskole')}) Tj`);
  commands.push('/F1 12 Tf');
  commands.push('0 -28 Td');
  commands.push(`(${escapePdfText('NOT A REAL INSTITUTION DECISION')}) Tj`);
  commands.push('0 -28 Td');
  let yOffset = -48;
  for (let i = 2; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line === '') {
      yOffset -= 12;
      commands.push(`0 ${yOffset} Td`);
      continue;
    }
    commands.push(`(${escapePdfText(line)}) Tj`);
    yOffset -= 16;
    commands.push(`0 ${yOffset} Td`);
  }
  commands.push('ET');
  const stream = commands.join('\n') + '\n';
  const streamBuffer = Buffer.from(stream, 'latin1');

  const objects: string[] = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n');
  objects.push(
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj\n',
  );
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n');
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n');
  objects.push(
    `6 0 obj << /Length ${streamBuffer.length} >> stream\n${stream}endstream endobj\n`,
  );

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += objects[i];
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += 'xref\n';
  pdf += `0 ${offsets.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += 'trailer\n';
  pdf += `<< /Size ${offsets.length} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF\n';

  return Buffer.from(pdf, 'latin1');
}

export async function issueOffer(input: {
  applicationId: string;
  actorId: string;
  note?: string;
  sendEmail?: boolean;
}): Promise<{ offerLetterId: string }> {
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: {
      course: { include: { institution: true } },
      user: { select: { id: true, name: true, email: true } },
      offerLetter: true,
    },
  });

  if (!application) {
    throw unprocessable('application not found');
  }

  if (application.offerLetter) {
    return { offerLetterId: application.offerLetter.id };
  }

  const fromStatus = application.status as ApplicationStatus;
  if (!canTransitionApplication(fromStatus, 'OFFER_ISSUED')) {
    throw unprocessable('application cannot move to OFFER_ISSUED from current status');
  }

  const issuedAt = new Date();
  const pdf = buildOfferPdf({
    learnerName: application.user.name,
    courseName: application.course.name,
    institutionName: application.course.institution.name,
    applicationId: application.id,
    issuedAt,
  });

  let storedKey: string | null = null;
  try {
    storedKey = await storeDocument(pdf, application.user.id, 'pdf');
    if (detectDocumentType(pdf) === null) {
      // Should never happen; keep as a safety check.
      throw new Error('generated offer is not a valid PDF');
    }

    const result = await prisma.$transaction(async (tx) => {
      const offerLetter = await tx.offerLetter.create({
        data: {
          applicationId: application.id,
          filename: `Offer-${application.course.code ?? application.course.name}.pdf`,
          key: storedKey!,
        },
      });

      await tx.application.update({
        where: { id: application.id },
        data: { status: 'OFFER_ISSUED' },
      });

      await tx.applicationEvent.create({
        data: {
          applicationId: application.id,
          status: 'OFFER_ISSUED',
          note: input.note ?? 'Offer issued',
          actorId: input.actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'OFFER_ISSUED',
          entity: 'application',
          entityId: application.id,
        },
      });

      await tx.notification.upsert({
        where: {
          userId_dedupeKey: { userId: application.userId, dedupeKey: `offer:${application.id}` },
        },
        create: {
          userId: application.userId,
          type: 'OFFER',
          title: 'You have an offer',
          body: 'A sample offer is ready to review. Accept or decline it in Offers.',
          href: '/offers',
          dedupeKey: `offer:${application.id}`,
        },
        update: {
          readAt: null,
        },
      });

      return offerLetter;
    });

    if (input.sendEmail !== false) {
      void sendMail({
        to: application.user.email,
        subject: 'Your iskole offer is ready',
        text: `You have an offer for ${application.course.name} at ${application.course.institution.name}. Review and respond in Offers: /offers`,
        userId: application.user.id,
        template: 'offer-issued',
      }).catch((error) => {
        logger.error(
          { userId: application.user.id, applicationId: application.id, err: error instanceof Error ? error.message : 'unknown' },
          'offer email failed',
        );
      });
    }

    return { offerLetterId: result.id };
  } catch (error) {
    if (storedKey) {
      await removeStoredDocument(storedKey).catch(() => undefined);
    }
    throw error;
  }
}

function offerSignatureFor(offerLetterId: string, expires: number): string {
  return createHmac('sha256', env.SIGNING_SECRET).update(`${offerLetterId}.${expires}`).digest('hex');
}

export function createOfferDownloadLink(offerLetterId: string, ttlSeconds = DOWNLOAD_URL_TTL_SECONDS): SignedDownload {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = offerSignatureFor(offerLetterId, expires);
  return {
    url: `/api/offers/${encodeURIComponent(offerLetterId)}/download?expires=${expires}&signature=${signature}`,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

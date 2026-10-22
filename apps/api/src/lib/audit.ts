/**
 * Audit log for ordinary data changes (who changed what, when). Distinct from
 * SecurityEvent, which is for attack and misuse signals.
 *
 * Rules:
 * - Store the actor id, the entity type and id, and a short action string.
 * - Never store field contents that could contain PII (no before/after payloads of
 *   names, ID numbers, messages).
 */
import { prisma } from './prisma';
import { logger } from './logger';

export type AuditInput = {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
};

export async function recordAudit({ actorId, action, entity, entityId }: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { actorId, action, entity, entityId } });
  } catch (error) {
    logger.error(
      { actorId, action, entity, entityId, err: error instanceof Error ? error.message : 'unknown' },
      'failed to record audit log',
    );
  }
}

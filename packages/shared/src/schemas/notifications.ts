/**
 * Notification types are server-written labels. Keeping them in one place lets the API
 * validate a write and the UI render a consistent icon and label without guessing.
 */
export const NOTIFICATION_TYPES = [
  'OFFER',
  'DEADLINE',
  'REPORT',
  'STUDY',
  'NUDGE',
  'CLINIC',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  OFFER: 'Offer',
  DEADLINE: 'Deadline',
  REPORT: 'Application update',
  STUDY: 'Study',
  NUDGE: 'Reminder',
  CLINIC: 'Clinic',
};

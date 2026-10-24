/**
 * Shared constants for iskole. Sample data rules apply to anything seeded:
 * label it "sample, verify before use".
 */

export const APP_NAME = 'iskole';

/** Roles. Stored by better-auth; a client can never set its own role. */
export const ROLES = ['STUDENT', 'COMPANY', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** The nine South African provinces. */
export const PROVINCES = [
  'EASTERN_CAPE',
  'FREE_STATE',
  'GAUTENG',
  'KWAZULU_NATAL',
  'LIMPOPO',
  'MPUMALANGA',
  'NORTHERN_CAPE',
  'NORTH_WEST',
  'WESTERN_CAPE',
] as const;
export type Province = (typeof PROVINCES)[number];

/** UI languages for the key screens. */
export const LANGUAGES = ['en', 'zu'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Hard limits shared by API and UI so both agree before a request is sent. */
export const LIMITS = {
  /** Max upload for acceptance letters and similar documents: 5 MB. */
  maxUploadBytes: 5 * 1024 * 1024,
  /** Cap on any single piece of user text sent to the AI. */
  maxAiInputChars: 4000,
  /** Cap on AI output text we will accept before Zod validation. */
  maxAiOutputChars: 8000,
  /** Chat message length. */
  maxMessageChars: 2000,
} as const;

/** Where a learner is in the system, which changes what matching can offer them. */
export const QUALIFICATION_STATUSES = [
  'AT_SCHOOL',
  'COMPLETED_SCHOOL',
  'STUDYING',
  'QUALIFIED',
] as const;
export type QualificationStatus = (typeof QUALIFICATION_STATUSES)[number];

/** Highest school qualification a learner can hold. */
export const SCHOOL_QUALIFICATIONS = ['NSC', 'NSC_IEB', 'SENIOR_CERTIFICATE', 'NONE'] as const;
export type SchoolQualification = (typeof SCHOOL_QUALIFICATIONS)[number];

/** How a learner wants to study. */
export const STUDY_MODES = ['FULL_TIME', 'PART_TIME'] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

/** Broad fields of study. Matching and communities both key off these. */
export const FIELDS_OF_STUDY = [
  'AGRICULTURE',
  'BUSINESS',
  'COMMERCE',
  'COMPUTING',
  'DATA_SCIENCE',
  'EDUCATION',
  'ENGINEERING',
  'HEALTH_SCIENCES',
  'HUMANITIES',
  'LAW',
  'NURSING',
  'SCIENCE',
  'SOCIAL_WORK',
  'TEACHING',
  'TVET_TRADES',
] as const;
export type FieldOfStudy = (typeof FIELDS_OF_STUDY)[number];

/** Body text comes from a phone keyboard, so cap it well below anything abusive. */
export const PROFILE_LIMITS = {
  fullName: 120,
  phone: 20,
  interests: 500,
} as const;

/** Subject name length cap for marks. */
export const MAX_SUBJECT_CHARS = 80;

/**
 * Subjects offered at NSC level, used to guide input. Learners may also enter a subject not
 * on this list (some schools offer others), so this is a suggestion set, not an enum.
 */
export const COMMON_SUBJECTS = [
  'Mathematics',
  'Mathematical Literacy',
  'Technical Mathematics',
  'Physical Sciences',
  'Life Sciences',
  'Accounting',
  'Business Studies',
  'Economics',
  'Geography',
  'History',
  'Information Technology',
  'Computer Applications Technology',
  'Engineering Graphics and Design',
  'Agricultural Sciences',
  'Consumer Studies',
  'Tourism',
  'Visual Arts',
  'Music',
  'Religion Studies',
  'Life Orientation',
] as const;

/** Home language subjects, which APS handles differently from other subjects. */
export const HOME_LANGUAGES = [
  'isiZulu',
  'isiXhosa',
  'Afrikaans',
  'English',
  'Sepedi',
  'Setswana',
  'Sesotho',
  'Xitsonga',
  'siSwati',
  'Tshivenda',
  'isiNdebele',
] as const;

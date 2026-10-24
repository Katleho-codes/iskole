/**
 * Development and demo seed.
 *
 * Every record here is sample data, not an authoritative prospectus. The demo account is
 * pre-verified on purpose: email verification is a security control, but a judge should
 * not have to configure a mailbox to see the product. Real sign-ups still verify.
 *
 * Run with `pnpm --filter @iskole/api seed`.
 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from './src/lib/prisma';

const DEMO_EMAIL = 'demo@iskole.app';
const DEMO_PASSWORD = 'iskole-demo-2026';

type InstitutionSeed = {
  name: string;
  province: string;
  type: string;
  website: string;
};

type CourseSeed = {
  institution: string;
  name: string;
  code: string;
  field: string;
  qualification: 'DEGREE' | 'DIPLOMA';
  apsMin: number;
  tuitionMin: number;
  tuitionMax: number;
  duration: string;
};

const institutions: InstitutionSeed[] = [
  {
    name: 'University of the Witwatersrand',
    province: 'GAUTENG',
    type: 'UNIVERSITY',
    website: 'https://www.wits.ac.za',
  },
  {
    name: 'University of Pretoria',
    province: 'GAUTENG',
    type: 'UNIVERSITY',
    website: 'https://www.up.ac.za',
  },
  {
    name: 'University of KwaZulu-Natal',
    province: 'KWAZULU_NATAL',
    type: 'UNIVERSITY',
    website: 'https://www.ukzn.ac.za',
  },
  {
    name: 'Cape Peninsula University of Technology',
    province: 'WESTERN_CAPE',
    type: 'UNIVERSITY',
    website: 'https://www.cput.ac.za',
  },
  {
    name: 'Tshwane University of Technology',
    province: 'GAUTENG',
    type: 'UNIVERSITY',
    website: 'https://www.tut.ac.za',
  },
  {
    name: 'University of Cape Town',
    province: 'WESTERN_CAPE',
    type: 'UNIVERSITY',
    website: 'https://www.uct.ac.za',
  },
  {
    name: 'Stellenbosch University',
    province: 'WESTERN_CAPE',
    type: 'UNIVERSITY',
    website: 'https://www.sun.ac.za',
  },
  {
    name: 'University of Johannesburg',
    province: 'GAUTENG',
    type: 'UNIVERSITY',
    website: 'https://www.uj.ac.za',
  },
  {
    name: 'Rhodes University',
    province: 'EASTERN_CAPE',
    type: 'UNIVERSITY',
    website: 'https://www.ru.ac.za',
  },
  {
    name: 'University of the Free State',
    province: 'FREE_STATE',
    type: 'UNIVERSITY',
    website: 'https://www.ufs.ac.za',
  },
];

const courses: CourseSeed[] = [
  { institution: 'University of the Witwatersrand', name: 'Bachelor of Science in Computer Science', code: 'COMS2000', field: 'COMPUTING', qualification: 'DEGREE', apsMin: 42, tuitionMin: 60000, tuitionMax: 70000, duration: '3 years' },
  { institution: 'University of the Witwatersrand', name: 'Bachelor of Commerce in Accounting', code: 'BCOM101', field: 'COMMERCE', qualification: 'DEGREE', apsMin: 38, tuitionMin: 55000, tuitionMax: 65000, duration: '3 years' },
  { institution: 'University of the Witwatersrand', name: 'Bachelor of Engineering in Electrical Engineering', code: 'EBE123', field: 'ENGINEERING', qualification: 'DEGREE', apsMin: 42, tuitionMin: 65000, tuitionMax: 75000, duration: '4 years' },
  { institution: 'University of the Witwatersrand', name: 'Bachelor of Arts in Law', code: 'BAW200', field: 'LAW', qualification: 'DEGREE', apsMin: 38, tuitionMin: 50000, tuitionMax: 60000, duration: '3 years' },

  { institution: 'University of Pretoria', name: 'Bachelor of Science in Data Science', code: 'BSCDS01', field: 'DATA_SCIENCE', qualification: 'DEGREE', apsMin: 40, tuitionMin: 60000, tuitionMax: 72000, duration: '3 years' },
  { institution: 'University of Pretoria', name: 'Bachelor of Engineering in Civil Engineering', code: 'BENGCE1', field: 'ENGINEERING', qualification: 'DEGREE', apsMin: 40, tuitionMin: 65000, tuitionMax: 78000, duration: '4 years' },
  { institution: 'University of Pretoria', name: 'Bachelor of Education in Foundation Phase', code: 'BEDFP01', field: 'EDUCATION', qualification: 'DEGREE', apsMin: 32, tuitionMin: 40000, tuitionMax: 50000, duration: '4 years' },
  { institution: 'University of Pretoria', name: 'Bachelor of Public Administration', code: 'BPAD101', field: 'BUSINESS', qualification: 'DEGREE', apsMin: 30, tuitionMin: 42000, tuitionMax: 52000, duration: '3 years' },

  { institution: 'University of KwaZulu-Natal', name: 'Bachelor of Nursing', code: 'NURS100', field: 'NURSING', qualification: 'DEGREE', apsMin: 35, tuitionMin: 45000, tuitionMax: 55000, duration: '4 years' },
  { institution: 'University of KwaZulu-Natal', name: 'Bachelor of Science in Agriculture', code: 'BSCAG01', field: 'AGRICULTURE', qualification: 'DEGREE', apsMin: 30, tuitionMin: 40000, tuitionMax: 50000, duration: '4 years' },
  { institution: 'University of KwaZulu-Natal', name: 'Bachelor of Laws', code: 'LLB100', field: 'LAW', qualification: 'DEGREE', apsMin: 40, tuitionMin: 50000, tuitionMax: 60000, duration: '4 years' },
  { institution: 'University of KwaZulu-Natal', name: 'Bachelor of Social Work', code: 'BSW100', field: 'SOCIAL_WORK', qualification: 'DEGREE', apsMin: 32, tuitionMin: 42000, tuitionMax: 52000, duration: '4 years' },

  { institution: 'Cape Peninsula University of Technology', name: 'Diploma in Information Technology', code: 'DIT200', field: 'COMPUTING', qualification: 'DIPLOMA', apsMin: 26, tuitionMin: 30000, tuitionMax: 40000, duration: '3 years' },
  { institution: 'Cape Peninsula University of Technology', name: 'Diploma in Business Management', code: 'BUS100', field: 'BUSINESS', qualification: 'DIPLOMA', apsMin: 28, tuitionMin: 35000, tuitionMax: 45000, duration: '3 years' },
  { institution: 'Cape Peninsula University of Technology', name: 'Diploma in Electrical Engineering', code: 'DEE101', field: 'ENGINEERING', qualification: 'DIPLOMA', apsMin: 30, tuitionMin: 38000, tuitionMax: 48000, duration: '3 years' },
  { institution: 'Cape Peninsula University of Technology', name: 'Diploma in Hospitality Management', code: 'DHM101', field: 'BUSINESS', qualification: 'DIPLOMA', apsMin: 26, tuitionMin: 32000, tuitionMax: 42000, duration: '3 years' },

  { institution: 'Tshwane University of Technology', name: 'Diploma in Information Technology', code: 'DIT200', field: 'COMPUTING', qualification: 'DIPLOMA', apsMin: 26, tuitionMin: 30000, tuitionMax: 40000, duration: '3 years' },
  { institution: 'Tshwane University of Technology', name: 'Diploma in Mechanical Engineering', code: 'DME101', field: 'ENGINEERING', qualification: 'DIPLOMA', apsMin: 30, tuitionMin: 38000, tuitionMax: 48000, duration: '3 years' },
  { institution: 'Tshwane University of Technology', name: 'Diploma in Tourism Management', code: 'DTM101', field: 'BUSINESS', qualification: 'DIPLOMA', apsMin: 24, tuitionMin: 30000, tuitionMax: 40000, duration: '3 years' },
  { institution: 'Tshwane University of Technology', name: 'Diploma in Education', code: 'DED101', field: 'EDUCATION', qualification: 'DIPLOMA', apsMin: 28, tuitionMin: 32000, tuitionMax: 42000, duration: '3 years' },

  { institution: 'University of Cape Town', name: 'Bachelor of Science in Computer Science', code: 'CSC100', field: 'COMPUTING', qualification: 'DEGREE', apsMin: 44, tuitionMin: 65000, tuitionMax: 76000, duration: '3 years' },
  { institution: 'University of Cape Town', name: 'Bachelor of Commerce', code: 'BCOM100', field: 'COMMERCE', qualification: 'DEGREE', apsMin: 40, tuitionMin: 58000, tuitionMax: 68000, duration: '3 years' },
  { institution: 'University of Cape Town', name: 'Bachelor of Engineering in Mechanical Engineering', code: 'BENGME1', field: 'ENGINEERING', qualification: 'DEGREE', apsMin: 42, tuitionMin: 68000, tuitionMax: 80000, duration: '4 years' },
  { institution: 'University of Cape Town', name: 'Bachelor of Social Work', code: 'BSW100', field: 'SOCIAL_WORK', qualification: 'DEGREE', apsMin: 34, tuitionMin: 45000, tuitionMax: 55000, duration: '4 years' },

  { institution: 'Stellenbosch University', name: 'Bachelor of Science in Data Science', code: 'BSCDS01', field: 'DATA_SCIENCE', qualification: 'DEGREE', apsMin: 42, tuitionMin: 62000, tuitionMax: 74000, duration: '3 years' },
  { institution: 'Stellenbosch University', name: 'Bachelor of Commerce', code: 'BCOM100', field: 'COMMERCE', qualification: 'DEGREE', apsMin: 38, tuitionMin: 56000, tuitionMax: 66000, duration: '3 years' },
  { institution: 'Stellenbosch University', name: 'Bachelor of Engineering', code: 'BENG100', field: 'ENGINEERING', qualification: 'DEGREE', apsMin: 42, tuitionMin: 66000, tuitionMax: 78000, duration: '4 years' },
  { institution: 'Stellenbosch University', name: 'Bachelor of Arts in Humanities', code: 'BAH100', field: 'HUMANITIES', qualification: 'DEGREE', apsMin: 32, tuitionMin: 45000, tuitionMax: 55000, duration: '3 years' },

  { institution: 'University of Johannesburg', name: 'Bachelor of Commerce in Accounting', code: 'BCOMA01', field: 'COMMERCE', qualification: 'DEGREE', apsMin: 34, tuitionMin: 48000, tuitionMax: 58000, duration: '3 years' },
  { institution: 'University of Johannesburg', name: 'Diploma in Information Technology', code: 'DIT200', field: 'COMPUTING', qualification: 'DIPLOMA', apsMin: 26, tuitionMin: 32000, tuitionMax: 42000, duration: '3 years' },
  { institution: 'University of Johannesburg', name: 'Bachelor of Education', code: 'BED100', field: 'EDUCATION', qualification: 'DEGREE', apsMin: 30, tuitionMin: 40000, tuitionMax: 50000, duration: '4 years' },
  { institution: 'University of Johannesburg', name: 'Bachelor of Science in Life Sciences', code: 'BSCLS01', field: 'SCIENCE', qualification: 'DEGREE', apsMin: 32, tuitionMin: 45000, tuitionMax: 55000, duration: '3 years' },

  { institution: 'Rhodes University', name: 'Bachelor of Arts in Journalism', code: 'BAJ100', field: 'HUMANITIES', qualification: 'DEGREE', apsMin: 32, tuitionMin: 42000, tuitionMax: 52000, duration: '3 years' },
  { institution: 'Rhodes University', name: 'Bachelor of Science in Computer Science', code: 'CSC100', field: 'COMPUTING', qualification: 'DEGREE', apsMin: 38, tuitionMin: 50000, tuitionMax: 60000, duration: '3 years' },
  { institution: 'Rhodes University', name: 'Bachelor of Laws', code: 'LLB100', field: 'LAW', qualification: 'DEGREE', apsMin: 38, tuitionMin: 48000, tuitionMax: 58000, duration: '4 years' },
  { institution: 'Rhodes University', name: 'Bachelor of Commerce', code: 'BCOM100', field: 'COMMERCE', qualification: 'DEGREE', apsMin: 34, tuitionMin: 46000, tuitionMax: 56000, duration: '3 years' },

  { institution: 'University of the Free State', name: 'Bachelor of Science in Agriculture', code: 'BSCAG01', field: 'AGRICULTURE', qualification: 'DEGREE', apsMin: 30, tuitionMin: 38000, tuitionMax: 48000, duration: '4 years' },
  { institution: 'University of the Free State', name: 'Bachelor of Nursing', code: 'NURS100', field: 'NURSING', qualification: 'DEGREE', apsMin: 34, tuitionMin: 42000, tuitionMax: 52000, duration: '4 years' },
  { institution: 'University of the Free State', name: 'Bachelor of Education', code: 'BED100', field: 'EDUCATION', qualification: 'DEGREE', apsMin: 30, tuitionMin: 38000, tuitionMax: 48000, duration: '4 years' },
  { institution: 'University of the Free State', name: 'Bachelor of Commerce', code: 'BCOM100', field: 'COMMERCE', qualification: 'DEGREE', apsMin: 32, tuitionMin: 42000, tuitionMax: 52000, duration: '3 years' },
];

function requirementsFor(field: string): Array<{ subject: string; minMark: number }> {
  switch (field) {
    case 'COMPUTING':
    case 'DATA_SCIENCE':
      return [{ subject: 'Mathematics', minMark: 60 }];
    case 'ENGINEERING':
      return [
        { subject: 'Mathematics', minMark: 60 },
        { subject: 'Physical Sciences', minMark: 60 },
      ];
    case 'SCIENCE':
      return [
        { subject: 'Mathematics', minMark: 50 },
        { subject: 'Physical Sciences', minMark: 50 },
      ];
    case 'COMMERCE':
    case 'BUSINESS':
      return [{ subject: 'Mathematics', minMark: 50 }];
    case 'NURSING':
      return [
        { subject: 'Life Sciences', minMark: 50 },
        { subject: 'Mathematics', minMark: 40 },
      ];
    case 'HEALTH_SCIENCES':
      return [
        { subject: 'Life Sciences', minMark: 50 },
        { subject: 'Mathematics', minMark: 50 },
      ];
    case 'LAW':
      return [{ subject: 'English Home Language', minMark: 60 }];
    case 'HUMANITIES':
    case 'SOCIAL_WORK':
      return [{ subject: 'English Home Language', minMark: 50 }];
    case 'EDUCATION':
    case 'TEACHING':
      return [
        { subject: 'English Home Language', minMark: 50 },
        { subject: 'Mathematics', minMark: 40 },
      ];
    case 'AGRICULTURE':
      return [
        { subject: 'Life Sciences', minMark: 50 },
        { subject: 'Mathematics', minMark: 40 },
      ];
    default:
      return [];
  }
}

async function seedDemoAccount() {
  const hashed = await hashPassword(DEMO_PASSWORD);
  const demo = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      id: randomUUID(),
      name: 'Thandi Mokoena',
      email: DEMO_EMAIL,
      emailVerified: true,
      role: 'STUDENT',
    },
    update: {
      name: 'Thandi Mokoena',
      emailVerified: true,
      role: 'STUDENT',
      banned: false,
      banReason: null,
      banExpires: null,
    },
  });

  const account = await prisma.account.findFirst({
    where: { userId: demo.id, providerId: 'credential' },
  });
  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { password: hashed } });
  } else {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        userId: demo.id,
        accountId: demo.id,
        providerId: 'credential',
        password: hashed,
      },
    });
  }

  await prisma.profile.upsert({
    where: { userId: demo.id },
    create: {
      userId: demo.id,
      fullName: 'Thandi Mokoena',
      province: 'GAUTENG',
      qualificationStatus: 'COMPLETED_SCHOOL',
      grade: 12,
      schoolQualification: 'NSC',
      interests: 'Software, data and solving problems for my community.',
      dateOfBirth: new Date('2005-04-18'),
      consentedAt: new Date(),
      talentVisible: false,
    },
    update: {
      fullName: 'Thandi Mokoena',
      province: 'GAUTENG',
      qualificationStatus: 'COMPLETED_SCHOOL',
      grade: 12,
      schoolQualification: 'NSC',
      dateOfBirth: new Date('2005-04-18'),
      consentedAt: new Date(),
      talentVisible: false,
    },
  });

  await prisma.preference.upsert({
    where: { userId: demo.id },
    create: {
      userId: demo.id,
      fields: ['COMPUTING', 'DATA_SCIENCE', 'ENGINEERING'],
      provinces: ['GAUTENG', 'WESTERN_CAPE'],
      budgetCeiling: 75000,
      studyMode: 'FULL_TIME',
      language: 'en',
    },
    update: {
      fields: ['COMPUTING', 'DATA_SCIENCE', 'ENGINEERING'],
      provinces: ['GAUTENG', 'WESTERN_CAPE'],
      budgetCeiling: 75000,
      studyMode: 'FULL_TIME',
      language: 'en',
    },
  });

  const marks = [
    { subject: 'Mathematics', mark: 78 },
    { subject: 'Physical Sciences', mark: 72 },
    { subject: 'English Home Language', mark: 74 },
    { subject: 'Life Sciences', mark: 68 },
    { subject: 'Geography', mark: 81 },
    { subject: 'Life Orientation', mark: 85 },
  ];
  for (const mark of marks) {
    await prisma.subjectMark.upsert({
      where: { userId_subject: { userId: demo.id, subject: mark.subject } },
      create: { userId: demo.id, ...mark },
      update: { mark: mark.mark },
    });
  }

  // A realistic starting dashboard: three saved funding options, a small monthly plan and
  // two unread nudges. Re-running the seed is safe (upserts and a count guard).
  const savedOptions = await prisma.fundingOption.findMany({
    where: { name: { in: ['NSFAS Bursary', 'Funza Lushaka Bursary', 'Sasol Bursary'] } },
    select: { id: true },
  });
  for (const option of savedOptions) {
    await prisma.savedFunding.upsert({
      where: { userId_fundingOptionId: { userId: demo.id, fundingOptionId: option.id } },
      create: { userId: demo.id, fundingOptionId: option.id },
      update: {},
    });
  }

  const budgets = [
    { category: 'Food', amountCents: 150_000 },
    { category: 'Transport', amountCents: 80_000 },
    { category: 'Study materials', amountCents: 60_000 },
  ];
  for (const budget of budgets) {
    await prisma.budget.upsert({
      where: {
        userId_category_period: { userId: demo.id, category: budget.category, period: 'MONTHLY' },
      },
      create: { userId: demo.id, period: 'MONTHLY', ...budget },
      update: { amountCents: budget.amountCents },
    });
  }

  if ((await prisma.expense.count({ where: { userId: demo.id } })) === 0) {
    const expenses = [
      { category: 'Transport', amountCents: 4_200, description: 'Taxi to campus' },
      { category: 'Food', amountCents: 6_800, description: 'Groceries' },
      { category: 'Study materials', amountCents: 3_600, description: 'Printing and a notebook' },
    ];
    for (const expense of expenses) {
      await prisma.expense.create({ data: { userId: demo.id, ...expense } });
    }
  }

  await prisma.notification.upsert({
    where: { userId_dedupeKey: { userId: demo.id, dedupeKey: 'seed:funding-deadline' } },
    create: {
      userId: demo.id,
      type: 'FUNDING_DEADLINE',
      title: 'A funding deadline is coming up',
      body: 'One of your saved bursaries closes soon. Check what is still outstanding.',
      href: '/funding',
      dedupeKey: 'seed:funding-deadline',
    },
    update: {},
  });
  await prisma.notification.upsert({
    where: { userId_dedupeKey: { userId: demo.id, dedupeKey: 'seed:welcome' } },
    create: {
      userId: demo.id,
      type: 'WELCOME',
      title: 'Welcome to iskole',
      body: 'Start with your profile, then add your marks. Everything else builds from there.',
      href: '/profile',
      dedupeKey: 'seed:welcome',
    },
    update: {},
  });

  return demo;
}

async function seed() {
  const institutionIds = new Map<string, string>();
  for (const institution of institutions) {
    const record = await prisma.institution.upsert({
      where: { name: institution.name },
      create: institution,
      update: {
        province: institution.province,
        type: institution.type,
        website: institution.website,
      },
    });
    institutionIds.set(institution.name, record.id);
  }

  let seededCourses = 0;
  for (const course of courses) {
    const institutionId = institutionIds.get(course.institution);
    if (!institutionId) throw new Error(`Unknown institution in seed: ${course.institution}`);

    let record = await prisma.course.findFirst({
      where: { institutionId, code: course.code },
    });
    if (!record) {
      record = await prisma.course.create({
        data: {
          institutionId,
          name: course.name,
          code: course.code,
          field: course.field,
          qualification: course.qualification,
          apsMin: course.apsMin,
          tuitionMin: course.tuitionMin,
          tuitionMax: course.tuitionMax,
          duration: course.duration,
        },
      });
    } else {
      record = await prisma.course.update({
        where: { id: record.id },
        data: {
          name: course.name,
          field: course.field,
          qualification: course.qualification,
          apsMin: course.apsMin,
          tuitionMin: course.tuitionMin,
          tuitionMax: course.tuitionMax,
          duration: course.duration,
        },
      });
    }

    for (const requirement of requirementsFor(course.field)) {
      const existing = await prisma.courseRequirement.findFirst({
        where: { courseId: record.id, subject: requirement.subject },
      });
      if (existing) {
        await prisma.courseRequirement.update({
          where: { id: existing.id },
          data: { minMark: requirement.minMark, isRequired: true },
        });
      } else {
        await prisma.courseRequirement.create({
          data: { courseId: record.id, ...requirement, isRequired: true },
        });
      }
    }
    seededCourses += 1;
  }

  // Funding options: sample annual rand estimates for the demo, not offers. Deadlines are
  // relative to the seed date so the screen still has upcoming dates months later.
  const daysFromNow = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    date.setUTCHours(12, 0, 0, 0);
    return date;
  };

  const fundingOptions = [
    {
      name: 'NSFAS Bursary',
      provider: 'National Student Financial Aid Scheme',
      type: 'GOVERNMENT_BURSARY',
      description:
        'Sample: full-cost funding for eligible South African students at public universities and TVET colleges.',
      eligibility:
        'South African citizen with a household income of R350 000 or less per year. Apply before the advertised closing date.',
      benefits: 'Tuition, accommodation, books and a monthly living allowance.',
      coversTuition: true,
      coversAccommodation: true,
      coversBooks: true,
      coversAllowance: true,
      amountMin: null,
      amountMax: null,
      deadline: daysFromNow(60),
      website: 'https://www.nsfas.org.za',
    },
    {
      name: 'Funza Lushaka Bursary',
      provider: 'Department of Basic Education',
      type: 'GOVERNMENT_BURSARY',
      description:
        'Sample: a teacher-training bursary for learners who want to teach at a public school.',
      eligibility:
        'Accepted into an approved initial teacher education programme. Commit to teaching after graduation.',
      benefits: 'Tuition, accommodation, books and a living allowance.',
      coversTuition: true,
      coversAccommodation: true,
      coversBooks: true,
      coversAllowance: true,
      amountMin: 60_000,
      amountMax: 120_000,
      deadline: daysFromNow(90),
      website: 'https://www.funzalushaka.doe.gov.za',
    },
    {
      name: 'Sasol Bursary',
      provider: 'Sasol',
      type: 'CORPORATE_BURSARY',
      description:
        'Sample: a corporate bursary for science, engineering and technology students, with vacation work.',
      eligibility:
        'Strong marks in Mathematics and Physical Sciences, studying a STEM qualification at a recognised institution.',
      benefits: 'Tuition, accommodation, books, allowance and vacation work.',
      coversTuition: true,
      coversAccommodation: true,
      coversBooks: true,
      coversAllowance: true,
      amountMin: 80_000,
      amountMax: 150_000,
      deadline: daysFromNow(120),
      website: 'https://www.sasolbursaries.com',
    },
    {
      name: 'Allan Gray Orbis Fellowship',
      provider: 'Allan Gray Orbis Foundation',
      type: 'FELLOWSHIP',
      description:
        'Sample: a fellowship for learners with an entrepreneurial track record, including mentorship and a stipend.',
      eligibility:
        'Academic merit, demonstrated leadership and an interest in entrepreneurship. Selection includes interviews.',
      benefits: 'Tuition support, a stipend, mentorship and a peer network.',
      coversTuition: true,
      coversAccommodation: false,
      coversBooks: true,
      coversAllowance: true,
      amountMin: 50_000,
      amountMax: 110_000,
      deadline: daysFromNow(75),
      website: 'https://www.allangrayorbis.org',
    },
    {
      name: 'Sibanye-Stillwater Bursary',
      provider: 'Sibanye-Stillwater',
      type: 'CORPORATE_BURSARY',
      description:
        'Sample: a mining-sector bursary for engineering, geoscience and related technical qualifications.',
      eligibility:
        'South African citizen with strong Mathematics and Physical Sciences marks, studying a relevant qualification.',
      benefits: 'Tuition, accommodation, books, a stipend and vacation work.',
      coversTuition: true,
      coversAccommodation: true,
      coversBooks: true,
      coversAllowance: true,
      amountMin: 70_000,
      amountMax: 140_000,
      deadline: daysFromNow(105),
      website: 'https://www.sibanyestillwater.com',
    },
    {
      name: 'Western Cape Provincial Bursary',
      provider: 'Western Cape Government',
      type: 'GOVERNMENT_BURSARY',
      description:
        'Sample: a provincial bursary for learners from the Western Cape studying at a recognised institution.',
      eligibility:
        'Western Cape resident with financial need and acceptance into an approved qualification.',
      benefits: 'Tuition and a contribution towards study costs.',
      coversTuition: true,
      coversAccommodation: false,
      coversBooks: true,
      coversAllowance: false,
      amountMin: 30_000,
      amountMax: 80_000,
      deadline: daysFromNow(45),
      website: 'https://www.westerncape.gov.za',
    },
  ];

  for (const option of fundingOptions) {
    await prisma.fundingOption.upsert({
      where: { name: option.name },
      create: { ...option, isActive: true },
      update: { ...option, isActive: true },
    });
  }

  // Clinic slots: sample sessions, weekdays at 16:00 SAST for the next three weeks.
  const clinicTopics = [
    'NSFAS and funding applications',
    'Choosing a course that fits your APS',
    'Registration and your first week',
  ];

  let seededSlots = 0;
  for (let dayOffset = 1; dayOffset <= 21; dayOffset += 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + dayOffset);
    date.setUTCHours(14, 0, 0, 0); // 16:00 in South Africa (SAST, UTC+2)

    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    const topic = clinicTopics[dayOffset % clinicTopics.length]!;
    const endsAt = new Date(date.getTime() + 60 * 60 * 1000);

    await prisma.clinicSlot.upsert({
      where: { startsAt_topic: { startsAt: date, topic } },
      create: { startsAt: date, endsAt, topic, capacity: 6 },
      update: { endsAt, capacity: 6 },
    });
    seededSlots += 1;
  }

  const demo = await seedDemoAccount();

  process.stdout.write(
    `Seeded ${institutions.length} institutions, ${seededCourses} courses, ${fundingOptions.length} funding options, ` +
      `${seededSlots} clinic slots and demo account ${demo.email}\n`,
  );
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

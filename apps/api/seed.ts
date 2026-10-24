import { prisma } from './src/lib/prisma';

async function seed() {
  // Institutions
  const wits = await prisma.institution.upsert({
    where: { name: 'University of the Witwatersrand' },
    create: { name: 'University of the Witwatersrand', province: 'GAUTENG', type: 'UNIVERSITY', website: 'https://www.wits.ac.za' },
    update: {},
  });
  const up = await prisma.institution.upsert({
    where: { name: 'University of Pretoria' },
    create: { name: 'University of Pretoria', province: 'GAUTENG', type: 'UNIVERSITY', website: 'https://www.up.ac.za' },
    update: {},
  });
  const ukzn = await prisma.institution.upsert({
    where: { name: 'University of KwaZulu-Natal' },
    create: { name: 'University of KwaZulu-Natal', province: 'KWAZULU_NATAL', type: 'UNIVERSITY', website: 'https://www.ukzn.ac.za' },
    update: {},
  });
  const cput = await prisma.institution.upsert({
    where: { name: 'Cape Peninsula University of Technology' },
    create: { name: 'Cape Peninsula University of Technology', province: 'WESTERN_CAPE', type: 'UNIVERSITY', website: 'https://www.cput.ac.za' },
    update: {},
  });
  const tshwane = await prisma.institution.upsert({
    where: { name: 'Tshwane University of Technology' },
    create: { name: 'Tshwane University of Technology', province: 'GAUTENG', type: 'UNIVERSITY', website: 'https://www.tut.ac.za' },
    update: {},
  });

  // Courses - sample data, verify before use
  const courses = [
    { inst: wits, name: 'Bachelor of Science in Computer Science', code: 'COMS2000', field: 'COMPUTING', qualification: 'DEGREE', apsMin: 42, tuitionMin: 60000, tuitionMax: 70000 },
    { inst: up, name: 'BEng Electrical Engineering', code: 'EBE123', field: 'ENGINEERING', qualification: 'DEGREE', apsMin: 38, tuitionMin: 65000, tuitionMax: 75000 },
    { inst: ukzn, name: 'Bachelor of Nursing', code: 'NURS100', field: 'NURSING', qualification: 'DEGREE', apsMin: 35, tuitionMin: 45000, tuitionMax: 55000 },
    { inst: cput, name: 'Diploma in Business Management', code: 'BUS100', field: 'BUSINESS', qualification: 'DIPLOMA', apsMin: 28, tuitionMin: 35000, tuitionMax: 45000 },
    { inst: tshwane, name: 'Diploma in Information Technology', code: 'DIT200', field: 'COMPUTING', qualification: 'DIPLOMA', apsMin: 26, tuitionMin: 30000, tuitionMax: 40000 },
    { inst: wits, name: 'Bachelor of Commerce', code: 'BCOM101', field: 'COMMERCE', qualification: 'DEGREE', apsMin: 34, tuitionMin: 55000, tuitionMax: 65000 },
    { inst: up, name: 'Bachelor of Education', code: 'BED200', field: 'EDUCATION', qualification: 'DEGREE', apsMin: 32, tuitionMin: 40000, tuitionMax: 50000 },
    { inst: ukzn, name: 'Bachelor of Laws', code: 'LLB100', field: 'LAW', qualification: 'DEGREE', apsMin: 40, tuitionMin: 50000, tuitionMax: 60000 },
  ];

  for (const c of courses) {
    let courseRecord = await prisma.course.findFirst({
      where: { institutionId: c.inst.id, code: c.code },
    });
    
    if (!courseRecord) {
      courseRecord = await prisma.course.create({
        data: { institutionId: c.inst.id, name: c.name, code: c.code, field: c.field, qualification: c.qualification, apsMin: c.apsMin, tuitionMin: c.tuitionMin, tuitionMax: c.tuitionMax },
      });
    }

    // Add requirements
    if (c.field === 'COMPUTING' || c.field === 'ENGINEERING' || c.field === 'SCIENCE' || c.field === 'COMMERCE' || c.field === 'BUSINESS') {
      const existing = await prisma.courseRequirement.findFirst({
        where: { courseId: courseRecord.id, subject: 'Mathematics' },
      });
      if (!existing) {
        await prisma.courseRequirement.create({
          data: { courseId: courseRecord.id, subject: 'Mathematics', minMark: c.field === 'ENGINEERING' || c.field === 'COMPUTING' ? 60 : 50 },
        });
      }
    }
    if (c.field === 'ENGINEERING') {
      const existing = await prisma.courseRequirement.findFirst({
        where: { courseId: courseRecord.id, subject: 'Physical Sciences' },
      });
      if (!existing) {
        await prisma.courseRequirement.create({
          data: { courseId: courseRecord.id, subject: 'Physical Sciences', minMark: 60 },
        });
      }
    }
    if (c.field === 'NURSING') {
      const existing = await prisma.courseRequirement.findFirst({
        where: { courseId: courseRecord.id, subject: 'Life Sciences' },
      });
      if (!existing) {
        await prisma.courseRequirement.create({
          data: { courseId: courseRecord.id, subject: 'Life Sciences', minMark: 50 },
        });
      }
    }
  }

  // Funding options - sample data, verify before use.
  // Amounts are annual rand estimates for the demo, not offers. Deadlines are relative to
  // the seed date so a demo later in the year still shows upcoming dates.
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
  ];

  for (const option of fundingOptions) {
    await prisma.fundingOption.upsert({
      where: { name: option.name },
      create: { ...option, isActive: true },
      update: {
        provider: option.provider,
        type: option.type,
        description: option.description,
        eligibility: option.eligibility,
        benefits: option.benefits,
        coversTuition: option.coversTuition,
        coversAccommodation: option.coversAccommodation,
        coversBooks: option.coversBooks,
        coversAllowance: option.coversAllowance,
        amountMin: option.amountMin,
        amountMax: option.amountMax,
        deadline: option.deadline,
        website: option.website,
        isActive: true,
      },
    });
  }

  // Clinic slots - sample sessions, weekdays at 16:00 SAST for the next three weeks.
  // Upsert on (startsAt, topic) so re-running the seed does not duplicate a session.
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

  process.stdout.write(
    `Seeded ${courses.length} courses, ${fundingOptions.length} funding options and ${seededSlots} clinic slots\n`,
  );
}

seed().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());

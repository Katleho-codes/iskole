import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { calculateAps, findSubjectShortfalls, type FieldOfStudy } from '@iskole/shared';
import { completeJson } from '../lib/ai/json';
import { AiUnavailableError } from '../lib/ai/client';
import { assertSafeForPrompt, PromptRejectedError } from '../lib/ai/guard';
import { LIMITS } from '@iskole/shared';

export const matchRouter = Router();

const matchSchema = z.object({
  recommendations: z
    .array(
      z.object({
        courseId: z.string(),
        score: z.number().min(0).max(100),
        why: z.string().max(300),
        improvements: z.array(z.string().max(200)).max(3),
      }),
    )
    .max(10),
});

matchRouter.post('/match', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;

    const [preferences, marks] = await Promise.all([
      prisma.preference.findUnique({ where: { userId } }),
      prisma.subjectMark.findMany({ where: { userId } }),
    ]);

    // Deterministic filter first (hybrid matching)
    const apsResult = calculateAps({
      marks: marks.map((m) => ({ subject: m.subject, mark: m.mark, isHomeLanguage: m.isHomeLanguage })),
    });

    const fields = preferences?.fields?.length ? preferences.fields : undefined;
    const provinces = preferences?.provinces?.length ? preferences.provinces : undefined;
    const budgetCeiling = preferences?.budgetCeiling;

    const courses = await prisma.course.findMany({
      where: {
        ...(fields ? { field: { in: fields } } : {}),
        ...(provinces ? { institution: { province: { in: provinces } } } : {}),
        apsMin: { lte: apsResult.score },
      },
      include: {
        institution: true,
        requirements: true,
      },
      take: 50,
    });

    // Filter by subject requirements
    const eligible = courses.filter((course) => {
      if (course.requirements.length === 0) return true;
      const shortfalls = findSubjectShortfalls(course.field as FieldOfStudy, marks);
      return shortfalls.length === 0;
    });

    // If budget constraint, filter roughly
    const affordable = budgetCeiling
      ? eligible.filter((c) => !c.tuitionMax || c.tuitionMax <= budgetCeiling)
      : eligible;

    // Deterministic ranking by APS headroom and tuition
    const ranked = affordable
      .map((course) => {
        const headroom = apsResult.score - course.apsMin;
        let score = Math.min(100, 50 + headroom * 2);
        if (course.tuitionMin && budgetCeiling && course.tuitionMin <= budgetCeiling) score += 10;
        return { course, score: Math.min(100, score) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Try AI to add explanations, but degrade gracefully to deterministic
    let aiRecommendations: z.infer<typeof matchSchema>['recommendations'] | null = null;

    try {
      if (ranked.length > 0) {
        const prompt = assertSafeForPrompt(
          [
            `APS: ${apsResult.score}`,
            `Interests: ${preferences?.fields?.join(', ') || 'none'}`,
            `Province preference: ${preferences?.provinces?.join(', ') || 'any'}`,
            `Top courses: ${ranked
              .map(
                (r, i) =>
                  `${i + 1}. ${r.course.name} at ${r.course.institution.name} (APS ${r.course.apsMin}, field ${r.course.field})`,
              )
              .join('; ')}`,
          ].join('\n'),
          LIMITS.maxAiInputChars,
        );

        const result = await completeJson({
          system:
            'You are an advisor helping a South African learner choose courses. Give practical, honest advice. Never suggest courses they cannot qualify for. Focus on actionable improvements.',
          user: `Given this info:\n${prompt}\n\nRank and explain these courses. For each, give a "why" (max 200 chars) and 1-2 concrete "improvements" they can make.`,
          schema: matchSchema,
          schemaName: 'match_recommendations',
          maxTokens: 800,
        });

        aiRecommendations = result.data.recommendations.filter((r) =>
          ranked.some((rk) => rk.course.id === r.courseId),
        );
      }
    } catch (err) {
      // A guard rejection is an AI failure like any other: the learner still gets the
      // deterministic ranking. Letting it escape would turn a conservative PII check into a
      // 500 on a route that promised to degrade gracefully.
      if (
        err instanceof AiUnavailableError ||
        err instanceof PromptRejectedError ||
        (err as Error).name === 'AiInvalidOutputError'
      ) {
        aiRecommendations = null;
      } else {
        throw err;
      }
    }

    const recommendations = ranked.map((r) => {
      const aiRec = aiRecommendations?.find((a) => a.courseId === r.course.id);
      const shortfalls = findSubjectShortfalls(r.course.field as FieldOfStudy, marks);

      return {
        course: {
          id: r.course.id,
          name: r.course.name,
          code: r.course.code,
          field: r.course.field,
          qualification: r.course.qualification,
          apsMin: r.course.apsMin,
          institution: {
            name: r.course.institution.name,
            province: r.course.institution.province,
            type: r.course.institution.type,
          },
        },
        score: Math.round(r.score),
        why:
          aiRec?.why ||
          (shortfalls.length === 0
            ? `You meet the requirements for this ${r.course.field.toLowerCase().replace('_', ' ')} course.`
            : `You qualify on APS; focus on improving your marks for specific subjects.`),
        improvements:
          aiRec?.improvements ||
          shortfalls.slice(0, 2).map((s) =>
            s.actual === null
              ? `Add ${s.subject} to your subject list (need at least ${s.required}%)`
              : `Raise ${s.subject} by ${s.gap}% to meet the ${s.required}% requirement`,
          ),
        aiEnhanced: !!aiRec,
      };
    });

    res.json({
      aps: { score: apsResult.score, maxScore: apsResult.maxScore },
      recommendations,
      filtered: {
        total: courses.length,
        eligible: eligible.length,
        affordable: affordable.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

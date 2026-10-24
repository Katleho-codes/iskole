/**
 * CV generation with AI.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireSession } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export const cvRouter = Router();

const GenerateSchema = z.object({}).strict();

cvRouter.post('/cv/generate', requireSession, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    const apiKey = process.env.OPENROUTER_API_KEY;

    const [profile, marks, preferences, applications] = await Promise.all([
      prisma.profile.findUnique({ where: { userId } }),
      prisma.subjectMark.findMany({ where: { userId }, orderBy: { subject: 'asc' } }),
      prisma.preference.findUnique({ where: { userId } }),
      prisma.application.findMany({
        where: { userId },
        include: { course: { include: { institution: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ]);

    const prompt = `You are an expert CV writer for South African university applicants. Generate a complete CV in JSON format with the following structure:
{
  "contact": {"fullName": "...", "email": "...", "phone": "...", "province": "..."},
  "profileSummary": "...",
  "education": [{"institution": "...", "qualification": "...", "year": "...", "details": "..."}],
  "skills": ["..."],
  "achievements": ["..."],
  "projects": [{"name": "...", "description": "...", "year": "..."}],
  "experience": [{"role": "...", "organisation": "...", "year": "...", "description": "..."}],
  "references": [{"name": "...", "contact": "...", "relation": "..."}]
}

Use this data:
- Profile: ${JSON.stringify(profile)}
- Marks: ${JSON.stringify(marks)}
- Preferences: ${JSON.stringify(preferences)}
- Applications: ${JSON.stringify(applications.map(a => ({ course: a.course.name, institution: a.course.institution.name, status: a.status })))}
- User email: ${req.authUser!.email}

Keep it professional, South African context appropriate, focus on strengths. Do not include ID numbers.`;

    if (!apiKey) {
      // Fallback CV if no API key
      const cv = {
        contact: {
          fullName: profile?.fullName || req.authUser!.name || '',
          email: req.authUser!.email,
          phone: profile?.phone || '',
          province: profile?.province || '',
        },
        profileSummary: `Motivated learner with interest in ${preferences?.fields?.join(', ') || 'further studies'}.`,
        education: profile?.grade
          ? [
              {
                institution: profile?.schoolQualification || 'School',
                qualification: `Grade ${profile.grade}`,
                year: new Date().getFullYear().toString(),
                details: '',
              },
            ]
          : [],
        skills: ['Communication', 'Problem solving', 'Time management'],
        achievements: [],
        projects: [],
        experience: [],
        references: [],
      };
      return res.json({ cv });
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'iskole',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [
            { role: 'system', content: 'You output valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error('AI request failed');
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      let cv;
      try {
        cv = JSON.parse(content);
      } catch {
        cv = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
      }
      res.json({ cv });
    } catch (aiError) {
      // Fallback
      const cv = {
        contact: {
          fullName: profile?.fullName || req.authUser!.name || '',
          email: req.authUser!.email,
          phone: profile?.phone || '',
          province: profile?.province || '',
        },
        profileSummary: `Motivated learner with interest in ${preferences?.fields?.join(', ') || 'further studies'}.`,
        education: [],
        skills: ['Communication', 'Problem solving'],
        achievements: [],
        projects: [],
        experience: [],
        references: [],
      };
      res.json({ cv });
    }
  } catch (error) {
    next(error);
  }
});

export default cvRouter;

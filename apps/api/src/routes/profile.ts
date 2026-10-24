/**
 * Learner profile and preferences.
 *
 * Both are one-per-user, so there is no `/:id` and no id ever comes from the client. The
 * userId is taken from the session, which is why these routes cannot express an IDOR even
 * if a handler is written carelessly.
 *
 * Guards: requireSession then requireRole('STUDENT'). A company or moderator account has
 * no learner profile to read or write, so it gets 403 rather than an empty row.
 */
import { Router } from "express";
import {
    preferenceUpdateSchema,
    profileUpdateSchema,
    ageInYears,
    MIN_LEARNER_AGE,
    parseDateOfBirth,
} from "@iskole/shared";
import { requireRole, requireSession } from "../middleware/auth";
import {
    getOrCreatePreferences,
    getOrCreateProfile,
    updatePreferences,
    updateProfile,
} from "../data/profile";
import { unprocessable } from "../lib/http-error";

export const profileRouter = Router();

/** Shape sent to the client. Explicit, so adding a column cannot silently leak it. */
function toProfileResponse(profile: {
    fullName: string | null;
    phone: string | null;
    province: string | null;
    qualificationStatus: string | null;
    grade: number | null;
    schoolQualification: string | null;
    interests: string | null;
    dateOfBirth: Date | null;
    consentedAt: Date | null;
}) {
    return {
        fullName: profile.fullName,
        phone: profile.phone,
        province: profile.province,
        qualificationStatus: profile.qualificationStatus,
        grade: profile.grade,
        schoolQualification: profile.schoolQualification,
        interests: profile.interests,
        dateOfBirth: profile.dateOfBirth
            ? profile.dateOfBirth.toISOString().slice(0, 10)
            : null,
        consentedAt: profile.consentedAt,
    };
}

function toPreferenceResponse(preference: {
    fields: string[];
    provinces: string[];
    budgetCeiling: number | null;
    studyMode: string | null;
    language: string;
    lowDataMode: boolean;
}) {
    return {
        fields: preference.fields,
        provinces: preference.provinces,
        budgetCeiling: preference.budgetCeiling,
        studyMode: preference.studyMode,
        language: preference.language,
        lowDataMode: preference.lowDataMode,
    };
}

profileRouter.get(
    "/profile",
    requireSession,
    requireRole("STUDENT"),
    async (req, res, next) => {
        try {
            const profile = await getOrCreateProfile(req.authUser!.id);
            console.log("profile", profile);
            res.json({ profile: toProfileResponse(profile) });
        } catch (error) {
            next(error);
        }
    },
);

profileRouter.put(
    "/profile",
    requireSession,
    requireRole("STUDENT"),
    async (req, res, next) => {
        try {
            // parse() throws ZodError, which the error handler turns into a 400 with safe field
            // detail. Unknown keys are rejected by .strict(), so a body carrying `role` or
            // `idNumber` fails loudly instead of being quietly ignored.
            const input = profileUpdateSchema.parse(req.body);
            if (input.dateOfBirth) {
                const dateOfBirth = parseDateOfBirth(input.dateOfBirth);
                // The schema already checked the shape; a null here would mean a programming error,
                // so fail closed rather than storing an unusable date.
                if (!dateOfBirth) {
                    return next(
                        unprocessable("date of birth is not a valid date"),
                    );
                }
                if (ageInYears(dateOfBirth) < MIN_LEARNER_AGE) {
                    return next(
                        unprocessable(
                            "iskole is for learners aged 16 and over",
                        ),
                    );
                }
            }
            const profile = await updateProfile(req.authUser!.id, input);
            res.json({ profile: toProfileResponse(profile) });
        } catch (error) {
            next(error);
        }
    },
);

profileRouter.get(
    "/preferences",
    requireSession,
    requireRole("STUDENT"),
    async (req, res, next) => {
        try {
            const preference = await getOrCreatePreferences(req.authUser!.id);
            res.json({ preferences: toPreferenceResponse(preference) });
        } catch (error) {
            next(error);
        }
    },
);

profileRouter.put(
    "/preferences",
    requireSession,
    requireRole("STUDENT"),
    async (req, res, next) => {
        try {
            const input = preferenceUpdateSchema.parse(req.body);
            const preference = await updatePreferences(req.authUser!.id, input);
            res.json({ preferences: toPreferenceResponse(preference) });
        } catch (error) {
            next(error);
        }
    },
);

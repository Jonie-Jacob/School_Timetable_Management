import { prisma } from '../db/client';
import { ForbiddenError } from '../errors';

/**
 * Subscription tier and enforcement helpers.
 * Pre-built for Enhancement 13 (Super Admin Portal).
 */

export type SubscriptionTier = 'BASIC' | 'ADVANCED' | 'PREMIUM';

export interface TierLimits {
  maxGenerations: number | null;  // null = unlimited
  allowTeacherAccounts: boolean;
  allowViewerAccounts: boolean;
  hasDedicatedSupport: boolean;
}

/**
 * Tier feature limits -- single source of truth.
 */
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  BASIC: {
    maxGenerations: 1,
    allowTeacherAccounts: false,
    allowViewerAccounts: false,
    hasDedicatedSupport: false,
  },
  ADVANCED: {
    maxGenerations: null,
    allowTeacherAccounts: true,
    allowViewerAccounts: true,
    hasDedicatedSupport: false,
  },
  PREMIUM: {
    maxGenerations: null,
    allowTeacherAccounts: true,
    allowViewerAccounts: true,
    hasDedicatedSupport: true,
  },
};

export type SubscriptionAction = 'GENERATE_TIMETABLE' | 'CREATE_TEACHER_USER' | 'CREATE_VIEWER_USER';

/**
 * Check if an action is allowed by the school's subscription tier.
 * Throws ForbiddenError with upgrade message if not allowed.
 *
 * Used by:
 * - timetable service (generation limit check)
 * - auth service (user creation limit check)
 *
 * NOTE: Requires the `subscriptions` table to exist (Enhancement 13, Phase 1 migration).
 * Until that migration runs, this function returns silently (allows all actions).
 */
export async function checkTierAllows(params: {
  schoolId: string;
  action: SubscriptionAction;
}): Promise<void> {
  const { schoolId, action } = params;

  let subscription: { tier: string; status: string } | null = null;

  try {
    subscription = await (prisma as any).subscription.findUnique({
      where: { schoolId },
      select: { tier: true, status: true },
    });
  } catch {
    // subscriptions table may not exist yet (pre-Enhancement 13 migration)
    return;
  }

  if (!subscription) return; // no subscription record = no restrictions

  const tier = subscription.tier as SubscriptionTier;
  const limits = TIER_LIMITS[tier];
  if (!limits) return;

  if (action === 'GENERATE_TIMETABLE' && limits.maxGenerations !== null) {
    // generationCount field added in Enhancement 13 migration -- use raw query
    let count = 0;
    try {
      const result = await prisma.$queryRawUnsafe<Array<{ generation_count: number }>>(
        `SELECT generation_count FROM schools WHERE id = $1`, schoolId,
      );
      count = result[0]?.generation_count ?? 0;
    } catch {
      // column may not exist yet
      return;
    }
    if (count >= limits.maxGenerations) {
      throw new ForbiddenError(
        `Your ${tier} plan allows only ${limits.maxGenerations} timetable generation. ` +
        'Please upgrade to Advanced or Premium to generate again.',
      );
    }
  }

  if (action === 'CREATE_TEACHER_USER' && !limits.allowTeacherAccounts) {
    throw new ForbiddenError(
      'Your Basic plan does not support teacher user accounts. ' +
      'Please upgrade to Advanced or Premium to create teacher logins.',
    );
  }

  if (action === 'CREATE_VIEWER_USER' && !limits.allowViewerAccounts) {
    throw new ForbiddenError(
      'Your Basic plan does not support viewer user accounts. ' +
      'Please upgrade to Advanced or Premium to create viewer logins.',
    );
  }
}

/**
 * Check if a school's subscription is active.
 * Returns readOnly flag + reason if subscription is expired/suspended or school is deactivated.
 *
 * Used by auth service during login to determine access level.
 *
 * NOTE: Requires `subscriptions` table and `school.deactivatedAt` field (Enhancement 13).
 * Until that migration runs, returns { active: true, readOnly: false }.
 */
export async function checkSubscriptionStatus(
  schoolId: string,
): Promise<{ active: boolean; readOnly: boolean; reason?: 'EXPIRED' | 'SUSPENDED' | 'DEACTIVATED' }> {
  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) return { active: false, readOnly: true, reason: 'DEACTIVATED' };

    // Check deactivatedAt (field may not exist yet)
    const schoolFull = school as any;
    if (schoolFull.deactivatedAt) {
      return { active: false, readOnly: true, reason: 'DEACTIVATED' };
    }

    // Check subscription status
    let subscription: any = null;
    try {
      subscription = await (prisma as any).subscription.findUnique({
        where: { schoolId },
        select: { status: true },
      });
    } catch {
      // subscriptions table may not exist yet
      return { active: true, readOnly: false };
    }

    if (!subscription) return { active: true, readOnly: false };

    if (subscription.status === 'EXPIRED') {
      return { active: false, readOnly: true, reason: 'EXPIRED' };
    }

    if (subscription.status === 'SUSPENDED') {
      return { active: false, readOnly: true, reason: 'SUSPENDED' };
    }

    return { active: true, readOnly: false };
  } catch {
    // Safe fallback if schema doesn't have these fields yet
    return { active: true, readOnly: false };
  }
}

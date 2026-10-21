import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { appUsersTable, db } from "@workspace/db";

type AppProfile = typeof appUsersTable.$inferSelect;

async function provisionProfile(clerkUserId: string): Promise<AppProfile> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(71398041)`);
    const [current] = await tx
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.clerkUserId, clerkUserId))
      .limit(1);

    if (current) return current;

    const [{ adminCount }] = await tx
      .select({ adminCount: sql<number>`count(*)::int` })
      .from(appUsersTable)
      .where(eq(appUsersTable.role, "admin"));
    const isFirstAdmin = adminCount === 0;
    const [created] = await tx
      .insert(appUsersTable)
      .values({
        clerkUserId,
        role: isFirstAdmin ? "admin" : "staff",
        isFirstAdmin,
      })
      .returning();
    return created;
  });
}

export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  try {
    res.locals.profile = await provisionProfile(userId);
    next();
  } catch (error) {
    req.log.error({ error }, "Unable to provision application user");
    res.status(500).json({ error: "Could not load your account." });
  }
}

export function requireAdmin(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const profile = res.locals.profile as AppProfile | undefined;
  if (!profile || profile.role !== "admin") {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }
  next();
}

export function isFirstAdminProfile(profile: AppProfile | undefined): boolean {
  return Boolean(profile && profile.isFirstAdmin);
}

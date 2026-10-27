import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { appUsersTable, db } from "@workspace/db";
import { verifyToken, type AuthTokenPayload } from "../lib/auth";

type AppProfile = typeof appUsersTable.$inferSelect;

export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // 1. Check local session token from Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const payload = verifyToken(token);
    if (payload) {
      res.locals.user = payload;
      res.locals.profile = {
        clerkUserId: String(payload.userId),
        role: payload.role,
        isFirstAdmin: payload.role === "admin",
      };
      next();
      return;
    }
  }

  // 2. Fall back to Clerk auth if present
  try {
    const clerkAuth = getAuth(req);
    const userId = clerkAuth?.userId;
    if (userId) {
      const [current] = await db
        .select()
        .from(appUsersTable)
        .where(eq(appUsersTable.clerkUserId, userId))
        .limit(1);

      if (current) {
        res.locals.profile = current;
        res.locals.user = {
          userId: 0,
          role: current.role,
          fullName: "Admin User",
        };
        next();
        return;
      }

      const [{ adminCount }] = await db
        .select({ adminCount: sql<number>`count(*)::int` })
        .from(appUsersTable)
        .where(eq(appUsersTable.role, "admin"));
      const isFirstAdmin = adminCount === 0;
      const [created] = await db
        .insert(appUsersTable)
        .values({
          clerkUserId: userId,
          role: isFirstAdmin ? "admin" : "staff",
          isFirstAdmin,
        })
        .returning();

      res.locals.profile = created;
      res.locals.user = {
        userId: 0,
        role: created.role,
        fullName: "Admin User",
      };
      next();
      return;
    }
  } catch {
    // Clerk not configured, continue to 401
  }

  res.status(401).json({ error: "Sign in to continue." });
}

export function requireAdmin(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = res.locals.user as AuthTokenPayload | undefined;
  const profile = res.locals.profile as AppProfile | undefined;
  const role = user?.role || profile?.role;

  if (role !== "admin") {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }
  next();
}

export function requireCustomer(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = res.locals.user as AuthTokenPayload | undefined;
  const profile = res.locals.profile as AppProfile | undefined;
  const role = user?.role || profile?.role;

  if (role !== "customer") {
    res.status(403).json({ error: "Customer access is required." });
    return;
  }
  next();
}

export function isFirstAdminProfile(profile: AppProfile | undefined): boolean {
  return Boolean(profile && profile.isFirstAdmin);
}

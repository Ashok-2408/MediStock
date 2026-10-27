import { Router, type Request, type Response } from "express";
import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import { db, phoneVerificationsTable, usersTable, appUsersTable } from "@workspace/db";
import {
  cleanPhone,
  createToken,
  generateOtp,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from "../lib/auth";
import { requireUser } from "../middlewares/requireUser";

const authRouter = Router();

function sendRegistrationError(res: Response, status: number, error: string): void {
  res.status(status).json({ success: false, error });
}

// Send OTP for phone verification
authRouter.post("/phone-otp/send", async (req: Request, res: Response): Promise<void> => {
  try {
    const rawPhone = String(req.body.phone || "").trim();
    const phone = cleanPhone(rawPhone);

    if (!phone || phone.length < 10) {
      res.status(400).json({ error: "Please enter a valid phone number (at least 10 digits)." });
      return;
    }

    const code = generateOtp(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    await db.insert(phoneVerificationsTable).values({
      phone,
      code,
      expiresAt,
      verified: false,
    });

    // In a live production system, SMS gateway is used here.
    // We return the code and log it so phone verification can be easily tested.
    console.log(`[PHONE VERIFICATION] Code for ${phone}: ${code}`);
    res.json({
      success: true,
      message: `Verification code sent to ${phone}. (For testing/demo: code is ${code})`,
      code, // Returned for effortless demo/testing
    });
  } catch (err) {
    console.error("Error sending phone OTP:", err);
    res.status(500).json({ error: "Failed to send verification code. Please try again." });
  }
});

// Verify OTP
authRouter.post("/phone-otp/verify", async (req: Request, res: Response): Promise<void> => {
  try {
    const rawPhone = String(req.body.phone || "").trim();
    const code = String(req.body.code || "").trim();
    const phone = cleanPhone(rawPhone);

    if (!phone || !code) {
      res.status(400).json({ error: "Phone number and verification code are required." });
      return;
    }

    const now = new Date();
    const rows = await db
      .select()
      .from(phoneVerificationsTable)
      .where(
        and(
          eq(phoneVerificationsTable.phone, phone),
          eq(phoneVerificationsTable.code, code),
          gt(phoneVerificationsTable.expiresAt, now),
        ),
      )
      .orderBy(desc(phoneVerificationsTable.createdAt))
      .limit(1);

    if (!rows.length) {
      res.status(400).json({ error: "Invalid or expired verification code." });
      return;
    }

    const record = rows[0];
    await db
      .update(phoneVerificationsTable)
      .set({ verified: true })
      .where(eq(phoneVerificationsTable.id, record.id));

    res.json({ success: true, message: "Phone number verified successfully." });
  } catch (err) {
    console.error("Error verifying phone OTP:", err);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

// Customer Registration
authRouter.post("/register-customer", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      sendRegistrationError(res, 400, "Registration details must be sent as a JSON object.");
      return;
    }

    const {
      fullName,
      age,
      phone,
      address,
      email,
      password,
      confirmPassword,
      hasNoEmail,
      verificationCode,
    } = req.body;

    // 1. Validate full name
    const trimmedName = String(fullName || "").trim();
    if (!trimmedName || trimmedName.length < 2) {
      sendRegistrationError(res, 400, "Full name must be at least 2 characters long.");
      return;
    }

    // 2. Validate age
    const parsedAge = Number(age);
    if (!age || isNaN(parsedAge) || parsedAge < 1 || parsedAge > 125) {
      sendRegistrationError(res, 400, "Please enter a valid age between 1 and 125.");
      return;
    }

    // 3. Validate phone
    const cleanedPhone = cleanPhone(String(phone || ""));
    if (!cleanedPhone || cleanedPhone.length < 10) {
      sendRegistrationError(res, 400, "Please enter a valid phone number with at least 10 digits.");
      return;
    }

    // 4. Validate address
    const trimmedAddress = String(address || "").trim();
    if (!trimmedAddress || trimmedAddress.length < 3) {
      sendRegistrationError(res, 400, "Please enter a valid address.");
      return;
    }

    // 5. Validate email or phone-only option
    const normalizedEmail = hasNoEmail ? null : normalizeEmail(email);
    if (!hasNoEmail) {
      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        sendRegistrationError(res, 400, "Please provide a valid email address, or select 'I do not have an email address'.");
        return;
      }
    }

    // 6. Validate password & confirmation
    const pass = String(password || "");
    const confirm = String(confirmPassword || "");
    if (!pass || pass.length < 6) {
      sendRegistrationError(res, 400, "Password must be at least 6 characters long.");
      return;
    }
    if (pass !== confirm) {
      sendRegistrationError(res, 400, "Passwords do not match.");
      return;
    }

    // 7. Duplicate Checks
    if (normalizedEmail) {
      const existingEmail = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, normalizedEmail))
        .limit(1);
      if (existingEmail.length > 0) {
        sendRegistrationError(res, 409, "An account with this email address already exists. Please sign in or use another email.");
        return;
      }
    }

    const existingPhone = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, cleanedPhone))
      .limit(1);
    if (existingPhone.length > 0) {
      sendRegistrationError(res, 409, "An account with this phone number already exists. Please sign in or use another phone number.");
      return;
    }

    // 8. Phone verification check for customers without email
    let phoneVerified = false;
    if (hasNoEmail) {
      const now = new Date();
      // Check if previously verified or matching code provided
      const verifiedRecord = await db
        .select()
        .from(phoneVerificationsTable)
        .where(
          and(
            eq(phoneVerificationsTable.phone, cleanedPhone),
            eq(phoneVerificationsTable.verified, true),
          ),
        )
        .limit(1);

      if (verifiedRecord.length > 0) {
        phoneVerified = true;
      } else if (verificationCode) {
        const codeRecord = await db
          .select()
          .from(phoneVerificationsTable)
          .where(
            and(
              eq(phoneVerificationsTable.phone, cleanedPhone),
              eq(phoneVerificationsTable.code, String(verificationCode).trim()),
              gt(phoneVerificationsTable.expiresAt, now),
            ),
          )
          .limit(1);

        if (codeRecord.length > 0) {
          phoneVerified = true;
          await db
            .update(phoneVerificationsTable)
            .set({ verified: true })
            .where(eq(phoneVerificationsTable.id, codeRecord[0].id));
        }
      }

      if (!phoneVerified) {
        sendRegistrationError(
          res,
          400,
          "Phone number verification is required when registering without an email address. Please verify your phone number.",
        );
        return;
      }
    }

    // 9. Hash password securely
    const passwordHash = hashPassword(pass);

    // 10. Insert customer record into database
    const [createdUser] = await db
      .insert(usersTable)
      .values({
        role: "customer",
        fullName: trimmedName,
        email: normalizedEmail,
        phone: cleanedPhone,
        age: parsedAge,
        address: trimmedAddress,
        passwordHash,
        isPhoneVerified: phoneVerified,
      })
      .returning();

    // 11. Create secure session token
    const token = createToken({
      userId: createdUser.id,
      role: "customer",
      fullName: createdUser.fullName,
      email: createdUser.email,
      phone: createdUser.phone,
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: createdUser.id,
        role: createdUser.role,
        fullName: createdUser.fullName,
        email: createdUser.email,
        phone: createdUser.phone,
        age: createdUser.age,
        address: createdUser.address,
      },
      message: "Customer account created successfully.",
    });
  } catch (err) {
    console.error("Error during customer registration:", err);
    sendRegistrationError(res, 500, "Registration failed due to a server error. Please try again.");
  }
});

// User Login (Admin & Customer options)
authRouter.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const requestedRole = req.body.role === "admin" ? "admin" : "customer";
    const rawIdentifier = String(req.body.identifier || req.body.email || "").trim();
    const password = String(req.body.password || "");

    if (!rawIdentifier || !password) {
      res.status(400).json({
        success: false,
        error: "Please enter your username/email and password.",
      });
      return;
    }

    const cleanIdPhone = cleanPhone(rawIdentifier);
    const normalizedIdEmail = normalizeEmail(rawIdentifier);

    // Lookup user by email OR phone
    const candidates = await db
      .select()
      .from(usersTable)
      .where(
        or(
          normalizedIdEmail ? eq(usersTable.email, normalizedIdEmail) : sql`false`,
          cleanIdPhone.length >= 7 ? eq(usersTable.phone, cleanIdPhone) : sql`false`,
          eq(usersTable.fullName, rawIdentifier),
        ),
      )
      .limit(1);

    if (candidates.length === 0) {
      // Check if fallback admin exists or if default admin should be created
      if (requestedRole === "admin" && (normalizedIdEmail === "admin@medistock.com" || normalizedIdEmail === "admin@mediledger.com" || rawIdentifier.toLowerCase() === "admin")) {
        // Check if any admin exists in the database
        const adminCheck = await db.select().from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
        if (adminCheck.length === 0 && password === "Admin@123") {
          // Auto-seed default admin if no admin was ever created
          const defaultAdminHash = hashPassword("Admin@123");
          const [defaultAdmin] = await db
            .insert(usersTable)
            .values({
              role: "admin",
              fullName: "Pharmacy Administrator",
              email: "admin@medistock.com",
              phone: "9999999999",
              passwordHash: defaultAdminHash,
              isPhoneVerified: true,
            })
            .returning();

          const token = createToken({
            userId: defaultAdmin.id,
            role: "admin",
            fullName: defaultAdmin.fullName,
            email: defaultAdmin.email,
            phone: defaultAdmin.phone,
          });

          res.json({
            success: true,
            token,
            user: {
              id: defaultAdmin.id,
              role: "admin",
              fullName: defaultAdmin.fullName,
              email: defaultAdmin.email,
              phone: defaultAdmin.phone,
            },
          });
          return;
        }
      }

      res.status(401).json({
        success: false,
        error: "Invalid credentials. Please check your username/email and password.",
      });
      return;
    }

    const user = candidates[0];

    // Verify Password
    const isValidPassword = verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: "Invalid credentials. Please check your password.",
      });
      return;
    }

    // Role-based validation
    if (requestedRole === "admin" && user.role !== "admin") {
      res.status(403).json({
        success: false,
        error: "Access denied. Only registered administrators can log in using Admin Login.",
      });
      return;
    }
    if (requestedRole === "customer" && user.role !== "customer") {
      res.status(403).json({
        success: false,
        error: "Access denied. Administrator accounts must use Admin Login.",
      });
      return;
    }

    const token = createToken({
      userId: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        role: user.role,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        age: user.age,
        address: user.address,
      },
    });
  } catch (err) {
    console.error("Error during login:", err);
    res.status(500).json({
      success: false,
      error: "Login failed due to a server error. Please try again.",
    });
  }
});

// Current User Profile
authRouter.get("/me", requireUser, async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Fetch fresh profile from database
  const [profile] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .limit(1);

  if (!profile) {
    res.json({
      userId: String(user.userId),
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      isFirstAdmin: user.role === "admin",
    });
    return;
  }

  res.json({
    userId: String(profile.id),
    role: profile.role,
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    age: profile.age,
    address: profile.address,
    isFirstAdmin: profile.role === "admin",
  });
});

// Logout
authRouter.post("/logout", (_req: Request, res: Response): void => {
  res.json({ success: true, message: "Logged out successfully." });
});

export default authRouter;

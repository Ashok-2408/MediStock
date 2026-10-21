import { Router, type IRouter } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  activitiesTable,
  appUsersTable,
  db,
  feedbackTable,
  medicinesTable,
  questionsTable,
} from "@workspace/db";
import {
  CheckoutCartBody,
  CheckoutCartResponse,
  CreateMedicineBody,
  CreateMedicineResponse,
  DeleteMedicineParams,
  GetCurrentProfileResponse,
  GetDashboardSummaryResponse,
  GetDashboardTrendsResponse,
  GetMedicineParams,
  GetMedicineResponse,
  GetStockReportResponse,
  ListActivitiesQueryParams,
  ListActivitiesResponse,
  ListFaqsResponse,
  ListFeedbackResponse,
  ListMedicinesQueryParams,
  ListMedicinesResponse,
  SubmitFeedbackBody,
  SubmitFeedbackResponse,
  SubmitQuestionBody,
  SubmitQuestionResponse,
  UpdateMedicineBody,
  UpdateMedicineParams,
  UpdateMedicineResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireUser } from "../middlewares/requireUser";

const router: IRouter = Router();

const faqs = [
  {
    id: 1,
    question: "How are low-stock medicines flagged?",
    answer:
      "Any medicine with fewer than 10 units is marked as low stock. Restock it from the Medicines page and the dashboard updates automatically.",
  },
  {
    id: 2,
    question: "When does an expiry warning appear?",
    answer:
      "Medicines expiring within the next 30 days receive a yellow warning. Already expired medicines are shown as a separate red alert.",
  },
  {
    id: 3,
    question: "When does a cart change inventory?",
    answer:
      "Stock changes only after you review the cart and confirm checkout. The system checks available quantities before saving the transaction.",
  },
  {
    id: 4,
    question: "Can I edit or remove a medicine?",
    answer:
      "Yes. Administrators can update medicine details, adjust quantities, or remove a record from the Medicines page.",
  },
];

function calendarDate(daysFromToday = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function toDateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

router.use(requireUser);

router.get("/auth/me", (req, res) => {
  const profile = res.locals.profile as typeof appUsersTable.$inferSelect;
  res.json(
    GetCurrentProfileResponse.parse({
      userId: profile.clerkUserId,
      role: profile.role,
      isFirstAdmin: profile.isFirstAdmin,
    }),
  );
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const medicines = await db.select().from(medicinesTable);
  const today = calendarDate();
  const expiryLimit = calendarDate(30);
  const summary = {
    medicineTypes: medicines.length,
    totalUnits: medicines.reduce((total, medicine) => total + medicine.quantity, 0),
    lowStockCount: medicines.filter((medicine) => medicine.quantity < 10).length,
    expiringSoonCount: medicines.filter(
      (medicine) =>
        medicine.expiryDate >= today && medicine.expiryDate <= expiryLimit,
    ).length,
    expiredCount: medicines.filter((medicine) => medicine.expiryDate < today)
      .length,
    inventoryValue: medicines.reduce(
      (total, medicine) => total + medicine.quantity * medicine.unitPrice,
      0,
    ),
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/trends", async (_req, res): Promise<void> => {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 5);
  const rows = await db
    .select()
    .from(activitiesTable)
    .where(gte(activitiesTable.createdAt, start))
    .orderBy(asc(activitiesTable.createdAt));
  const trends = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date();
    monthDate.setUTCDate(1);
    monthDate.setUTCMonth(monthDate.getUTCMonth() - (5 - index));
    const key = monthDate.toISOString().slice(0, 7);
    const stockIn = rows
      .filter(
        (row) =>
          row.createdAt.toISOString().slice(0, 7) === key &&
          row.action === "stock_added",
      )
      .reduce((total, row) => total + (row.quantity ?? 0), 0);
    const stockOut = rows
      .filter(
        (row) =>
          row.createdAt.toISOString().slice(0, 7) === key &&
          row.action === "dispensed",
      )
      .reduce((total, row) => total + (row.quantity ?? 0), 0);
    return {
      month: monthDate.toLocaleString("en", { month: "short", timeZone: "UTC" }),
      stockIn,
      stockOut,
    };
  });
  res.json(GetDashboardTrendsResponse.parse(trends));
});

router.get("/activities", async (req, res): Promise<void> => {
  const params = ListActivitiesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const limit = params.data.limit ?? 20;
  const activities = await db
    .select()
    .from(activitiesTable)
    .orderBy(desc(activitiesTable.createdAt))
    .limit(limit);
  res.json(ListActivitiesResponse.parse(activities));
});

router.get("/medicines", async (req, res): Promise<void> => {
  const params = ListMedicinesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { search, status } = params.data;
  const filters = [];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    filters.push(
      or(
        ilike(medicinesTable.name, term),
        ilike(medicinesTable.category, term),
        ilike(medicinesTable.batchNumber, term),
        ilike(medicinesTable.supplier, term),
      )!,
    );
  }
  const today = calendarDate();
  const expiryLimit = calendarDate(30);
  if (status === "low-stock") filters.push(sql`${medicinesTable.quantity} < 10`);
  if (status === "expired") filters.push(sql`${medicinesTable.expiryDate} < ${today}`);
  if (status === "expiring") {
    filters.push(
      and(
        gte(medicinesTable.expiryDate, today),
        lte(medicinesTable.expiryDate, expiryLimit),
      )!,
    );
  }
  const medicines = await db
    .select()
    .from(medicinesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(medicinesTable.name));
  res.json(ListMedicinesResponse.parse(medicines));
});

router.post(
  "/medicines",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = CreateMedicineBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [medicine] = await db
      .insert(medicinesTable)
      .values({
        ...parsed.data,
        expiryDate: toDateOnly(parsed.data.expiryDate),
      })
      .returning();
    await db.insert(activitiesTable).values({
      action: "stock_added",
      details: `Added ${medicine.name} to inventory`,
      medicineName: medicine.name,
      quantity: medicine.quantity,
    });
    res.status(201).json(CreateMedicineResponse.parse(medicine));
  },
);

router.get("/medicines/:id", async (req, res): Promise<void> => {
  const params = GetMedicineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [medicine] = await db
    .select()
    .from(medicinesTable)
    .where(eq(medicinesTable.id, params.data.id));
  if (!medicine) {
    res.status(404).json({ error: "Medicine not found." });
    return;
  }
  res.json(GetMedicineResponse.parse(medicine));
});

router.patch(
  "/medicines/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateMedicineParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateMedicineBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { expiryDate, ...otherUpdates } = parsed.data;
    const updateData: Partial<typeof medicinesTable.$inferInsert> = {
      ...otherUpdates,
    };
    if (expiryDate) {
      updateData.expiryDate = toDateOnly(expiryDate);
    }
    const [medicine] = await db
      .update(medicinesTable)
      .set(updateData)
      .where(eq(medicinesTable.id, params.data.id))
      .returning();
    if (!medicine) {
      res.status(404).json({ error: "Medicine not found." });
      return;
    }
    const activity = expiryDate || otherUpdates.quantity === undefined
      ? {
          action: "medicine_updated",
          details: `Updated ${medicine.name}`,
          medicineName: medicine.name,
        }
      : {
          action: "stock_added",
          details: `Adjusted stock for ${medicine.name}`,
          medicineName: medicine.name,
          quantity: otherUpdates.quantity,
        };
    await db.insert(activitiesTable).values(activity);
    res.json(UpdateMedicineResponse.parse(medicine));
  },
);

router.delete(
  "/medicines/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteMedicineParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [medicine] = await db
      .delete(medicinesTable)
      .where(eq(medicinesTable.id, params.data.id))
      .returning();
    if (!medicine) {
      res.status(404).json({ error: "Medicine not found." });
      return;
    }
    await db.insert(activitiesTable).values({
      action: "medicine_removed",
      details: `Removed ${medicine.name} from inventory`,
      medicineName: medicine.name,
      quantity: medicine.quantity,
    });
    res.sendStatus(204);
  },
);

router.post(
  "/checkout",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = CheckoutCartBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const quantities = new Map<number, number>();
    for (const item of parsed.data.items) {
      quantities.set(
        item.medicineId,
        (quantities.get(item.medicineId) ?? 0) + item.quantity,
      );
    }
    try {
      const checkout = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(medicinesTable)
          .where(inArray(medicinesTable.id, Array.from(quantities.keys())))
          .for("update");
        if (rows.length !== quantities.size) {
          throw new Error("MEDICINE_NOT_FOUND");
        }
        const items = [];
        for (const medicine of rows) {
          const quantity = quantities.get(medicine.id)!;
          if (medicine.quantity < quantity) {
            throw new Error(`INSUFFICIENT_STOCK:${medicine.name}`);
          }
          if (medicine.expiryDate < calendarDate()) {
            throw new Error(`EXPIRED_MEDICINE:${medicine.name}`);
          }
          await tx
            .update(medicinesTable)
            .set({ quantity: medicine.quantity - quantity })
            .where(eq(medicinesTable.id, medicine.id));
          await tx.insert(activitiesTable).values({
            action: "dispensed",
            details: `Dispensed ${quantity} × ${medicine.name}`,
            medicineName: medicine.name,
            quantity,
          });
          items.push({
            medicineId: medicine.id,
            medicineName: medicine.name,
            quantity,
            lineTotal: quantity * medicine.unitPrice,
          });
        }
        return {
          total: items.reduce((total, item) => total + item.lineTotal, 0),
          completedAt: new Date(),
          items,
        };
      });
      res.status(201).json(CheckoutCartResponse.parse(checkout));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "MEDICINE_NOT_FOUND") {
        res.status(404).json({ error: "A medicine in this cart no longer exists." });
        return;
      }
      if (message.startsWith("INSUFFICIENT_STOCK:")) {
        res.status(409).json({
          error: `${message.slice("INSUFFICIENT_STOCK:".length)} has insufficient stock.`,
        });
        return;
      }
      if (message.startsWith("EXPIRED_MEDICINE:")) {
        res.status(409).json({
          error: `${message.slice("EXPIRED_MEDICINE:".length)} is expired and cannot be dispensed.`,
        });
        return;
      }
      throw error;
    }
  },
);

router.get("/feedback", async (_req, res): Promise<void> => {
  const feedback = await db
    .select()
    .from(feedbackTable)
    .orderBy(desc(feedbackTable.createdAt))
    .limit(50);
  res.json(ListFeedbackResponse.parse(feedback));
});

router.post("/feedback", async (req, res): Promise<void> => {
  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const profile = res.locals.profile as typeof appUsersTable.$inferSelect;
  const [feedback] = await db
    .insert(feedbackTable)
    .values({ ...parsed.data, userId: profile.clerkUserId })
    .returning();
  res.status(201).json(SubmitFeedbackResponse.parse(feedback));
});

router.get("/faqs", (_req, res) => {
  res.json(ListFaqsResponse.parse(faqs));
});

router.post("/questions", async (req, res): Promise<void> => {
  const parsed = SubmitQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const profile = res.locals.profile as typeof appUsersTable.$inferSelect;
  const [question] = await db
    .insert(questionsTable)
    .values({ ...parsed.data, userId: profile.clerkUserId })
    .returning();
  res.status(201).json(SubmitQuestionResponse.parse(question));
});

router.get("/reports/stock", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(medicinesTable)
    .orderBy(asc(medicinesTable.name));
  res.json(GetStockReportResponse.parse({ generatedAt: new Date(), items }));
});

export default router;

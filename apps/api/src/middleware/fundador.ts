import type { Request, Response, NextFunction } from "express";
import { authenticate } from "./auth.js";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";

export function fundadorEmails(): string[] {
  return (process.env.FUNDADOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function requireFundador(req: Request, res: Response, next: NextFunction): void {
  authenticate(req, res, async () => {
    try {
      const userId = (req as { user?: { userId: string } }).user?.userId;
      if (!userId) { res.status(401).json({ error: "No autenticado." }); return; }

      const [u] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!u || !fundadorEmails().includes(u.email.toLowerCase())) {
        res.status(403).json({ error: "Acceso reservado para fundadores de Doravia." });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  });
}

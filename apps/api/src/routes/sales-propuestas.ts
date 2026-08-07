import { Router } from "express";
import { db, sales_accounts, sales_contacts, sales_quote_line_items, sales_quotes } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/** Página pública de propuestas: únicamente expone una cotización por token aleatorio. */
const router = Router();

router.get("/:token", async (req, res, next) => {
  try {
    const [quote] = await db.select().from(sales_quotes).where(eq(sales_quotes.public_token, req.params.token)).limit(1);
    if (!quote || ["cancelled", "rejected"].includes(quote.status)) return res.status(404).json({ error: "Propuesta no disponible." });
    if (quote.valid_until && new Date(`${quote.valid_until}T23:59:59`).getTime() < Date.now()) return res.status(410).json({ error: "Esta propuesta venció." });
    const now = new Date();
    await db.update(sales_quotes).set({ status: quote.status === "sent" ? "viewed" : quote.status, viewed_at: now, view_count: sql`${sales_quotes.view_count} + 1`, updated_at: now }).where(eq(sales_quotes.id, quote.id));
    const [account, contact, items] = await Promise.all([
      db.select({ nombre_comercial: sales_accounts.nombre_comercial, razon_social: sales_accounts.razon_social }).from(sales_accounts).where(eq(sales_accounts.id, quote.account_id)).limit(1),
      quote.contact_id ? db.select({ nombres: sales_contacts.nombres, apellidos: sales_contacts.apellidos }).from(sales_contacts).where(eq(sales_contacts.id, quote.contact_id)).limit(1) : Promise.resolve([]),
      db.select().from(sales_quote_line_items).where(eq(sales_quote_line_items.quote_id, quote.id)),
    ]);
    res.json({ quote: { quote_number: quote.quote_number, currency: quote.currency, subtotal: quote.subtotal, discount_total: quote.discount_total, tax_total: quote.tax_total, total: quote.total, valid_until: quote.valid_until, payment_option: quote.payment_option, installments: quote.installments, terms: quote.terms, notes: quote.notes, status: quote.status, version: quote.version }, account: account ?? null, contact: contact ?? null, items });
  } catch (err) { next(err); }
});

export default router;

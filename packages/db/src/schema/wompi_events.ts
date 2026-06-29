import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Registro de webhooks de Wompi ya procesados — garantiza idempotencia.
// Si el mismo wompi_tx_id llega dos veces, la segunda inserción falla y se ignora.
export const wompi_events = pgTable("wompi_events", {
  wompi_tx_id:  text("wompi_tx_id").primaryKey(),
  reference:    text("reference").notNull(),
  processed_at: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

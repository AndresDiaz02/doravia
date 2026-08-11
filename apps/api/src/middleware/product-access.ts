import type { NextFunction, Request, Response } from "express";
import { db, product_subscriptions } from "@workspace/db";
import type { PlanFeature } from "@workspace/shared";
import { and, eq } from "drizzle-orm";

export type ProductoDoravia = "erp" | "pos" | "facturacion" | "nomina";

type SubscriptionState = {
  status: string;
  ends_at: Date | string;
} | undefined;

function productFromPlan(product: string): ProductoDoravia {
  return product === "origen" ? "facturacion" : product as ProductoDoravia;
}

export function tieneAccesoProducto(
  subscription: SubscriptionState,
  incluyePlanPrincipal: boolean,
  addonHistorico: boolean,
  now = new Date(),
): boolean {
  // A subscription is authoritative when it exists: this prevents an old addon
  // flag from keeping a separately purchased product enabled after expiration.
  if (subscription) {
    return incluyePlanPrincipal || (
      subscription.status === "active" && new Date(subscription.ends_at) >= now
    );
  }
  return incluyePlanPrincipal || addonHistorico;
}

/**
 * Enforces independent product subscriptions while honoring plans that include
 * the feature. Legacy add-ons are only accepted when no subscription record
 * exists, so cancelled products cannot remain accessible accidentally.
 */
export function requireProductoActivo(product: ProductoDoravia, feature: PlanFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [subscription] = await db
        .select({ status: product_subscriptions.status, ends_at: product_subscriptions.ends_at })
        .from(product_subscriptions)
        .where(and(
          eq(product_subscriptions.tenant_id, req.tenantId),
          eq(product_subscriptions.product, product),
        ))
        .limit(1);

      const incluyePlanPrincipal =
        productFromPlan(req.tenant.plan.product) === product ||
        req.tenant.plan.features[feature] === true;
      const addonHistorico = (req.tenant.addons as Record<string, boolean> | null)?.[feature] === true;

      if (!tieneAccesoProducto(subscription, incluyePlanPrincipal, addonHistorico)) {
        return res.status(403).json({
          error: `Tu suscripcion de ${product.toUpperCase()} no esta activa. Renueva o activa este producto para continuar.`,
          code: "PRODUCT_SUBSCRIPTION_NOT_ACTIVE",
          product,
          upgrade_required: true,
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

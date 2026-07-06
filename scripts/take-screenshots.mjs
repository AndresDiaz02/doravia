/**
 * Captura pantallas de la app Doravia para la landing page.
 *
 * Uso:
 *   DORAVIA_EMAIL=tu@email.com DORAVIA_PASSWORD=tupass node scripts/take-screenshots.mjs
 *
 * Las imágenes se guardan en apps/landing/assets/screenshots/
 * Luego commitea ese directorio con git add apps/landing/assets/
 *
 * Requiere que Playwright esté instalado:
 *   npm install -D playwright
 *   npx playwright install chromium
 */

import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR   = path.join(REPO_ROOT, "apps", "landing", "assets", "screenshots");

const BASE = process.env.DORAVIA_URL ?? "https://app.doraviasoft.com";
const EMAIL    = process.env.DORAVIA_EMAIL    ?? "";
const PASSWORD = process.env.DORAVIA_PASSWORD ?? "";

if (!EMAIL || !PASSWORD) {
  console.error("❌ Define DORAVIA_EMAIL y DORAVIA_PASSWORD como variables de entorno.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Páginas a capturar: [nombre_archivo, ruta, tiempo_espera_ms]
const PAGINAS = [
  // ERP
  ["erp-dashboard",       "/dashboard",        3000],
  ["erp-facturas",        "/facturas",         2500],
  ["erp-gastos",          "/gastos",           2500],
  ["erp-inventario",      "/inventario",       2500],
  // Origen / Facturación
  ["origen-facturas",     "/facturas",         2500],
  ["origen-nueva-factura","/facturas/nueva",   3000],
  ["origen-cotizaciones", "/cotizaciones",     2500],
  // Punto POS
  ["pos-cajero",          "/pos/cajeros",      3500],
  ["pos-productos",       "/productos",        2500],
  ["pos-dashboard",       "/dashboard",        3000],
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Esperar a que cargue el dashboard tras el login
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("✅ Login exitoso");
}

async function capturar(page, nombre, ruta, espera) {
  try {
    await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(espera);

    // Ocultar el header fijo para que no tape contenido en la captura
    await page.evaluate(() => {
      const header = document.querySelector("header");
      if (header) header.style.display = "none";
    });

    const archivo = path.join(OUT_DIR, `${nombre}.png`);
    await page.screenshot({
      path: archivo,
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 760 },
    });
    console.log(`📸 ${nombre}.png`);
  } catch (err) {
    console.warn(`⚠️  ${nombre}: ${err.message}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 760 },
    deviceScaleFactor: 2, // retina para mayor calidad
  });
  const page = await context.newPage();

  try {
    await login(page);

    for (const [nombre, ruta, espera] of PAGINAS) {
      await capturar(page, nombre, ruta, espera);
    }

    console.log(`\n✅ Capturas guardadas en apps/landing/assets/screenshots/`);
    console.log(`Ejecuta: git add apps/landing/assets/ && git commit -m "feat: add app screenshots to landing"`);
  } finally {
    await browser.close();
  }
})();

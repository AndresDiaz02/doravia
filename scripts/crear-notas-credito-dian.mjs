/**
 * Crea 10 notas crédito para el set de habilitación DIAN.
 * Requiere que ya existan facturas en estado "aceptada".
 * Uso: node scripts/crear-notas-credito-dian.mjs
 * Variables requeridas: DORAVIA_EMAIL, DORAVIA_PASSWORD
 */

const API      = "https://api.doraviasoft.com";
const EMAIL    = process.env.DORAVIA_EMAIL    ?? "andres@doravia.com";
const PASSWORD = process.env.DORAVIA_PASSWORD ?? "";

if (!PASSWORD) {
  console.error("ERROR: Define DORAVIA_PASSWORD antes de ejecutar.");
  process.exit(1);
}

// ── 1. Login ───────────────────────────────────────────────────────────────────
console.log("Autenticando...");
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const loginData = await loginRes.json();
if (!loginRes.ok) { console.error("Error de login:", loginData); process.exit(1); }

let token = loginData.accessToken ?? loginData.access_token;
if (loginData.selectionToken && loginData.empresas?.length) {
  const empresa = loginData.empresas.find(e => e.facturacion_electronica) ?? loginData.empresas[0];
  const sel = await fetch(`${API}/api/auth/select-empresa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectionToken: loginData.selectionToken, tenantId: empresa.id }),
  });
  const selData = await sel.json();
  token = selData.accessToken ?? selData.access_token ?? token;
  console.log(`  → Empresa: ${empresa.nombre}`);
}
if (!token) { console.error("No se pudo obtener token:", loginData); process.exit(1); }
console.log("✓ Autenticado");

const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

// ── 2. Cargar facturas aceptadas ───────────────────────────────────────────────
const factRes = await fetch(`${API}/api/facturas?limit=100`, { headers });
const factData = await factRes.json();
const todasFacturas = factData.data ?? factData;
const facturasAceptadas = todasFacturas.filter(f => f.estado === "aceptada");

console.log(`✓ ${facturasAceptadas.length} facturas aceptadas disponibles`);

if (facturasAceptadas.length < 10) {
  console.error(`Se necesitan al menos 10 facturas aceptadas. Solo hay ${facturasAceptadas.length}.`);
  console.error("Espera a que las facturas sean procesadas por Plemsi/DIAN y vuelve a intentar.");
  process.exit(1);
}

// ── 3. Tipos y motivos de notas crédito ───────────────────────────────────────
const configuraciones = [
  { tipo: "devolucion",  motivo: "Devolución parcial de mercancía" },
  { tipo: "descuento",   motivo: "Descuento comercial acordado" },
  { tipo: "ajuste",      motivo: "Ajuste de precio por negociación" },
  { tipo: "devolucion",  motivo: "Producto en mal estado" },
  { tipo: "descuento",   motivo: "Descuento por volumen de compra" },
  { tipo: "ajuste",      motivo: "Error en precio facturado" },
  { tipo: "devolucion",  motivo: "Devolución por garantía" },
  { tipo: "descuento",   motivo: "Descuento por pronto pago" },
  { tipo: "ajuste",      motivo: "Ajuste por diferencia en cantidad" },
  { tipo: "devolucion",  motivo: "Devolución total del pedido" },
];

// ── 4. Crear 10 notas crédito ─────────────────────────────────────────────────
console.log("\nCreando 10 notas crédito...");
let ok = 0;
let errores = 0;

for (let i = 0; i < 10; i++) {
  const factura = facturasAceptadas[i];
  const cfg = configuraciones[i];

  // Nota crédito por el 30% del total de la factura
  const valorNota = Math.max(1000, Math.round(Number(factura.total) * 0.30));
  const precioUnitario = Math.round(valorNota / 1.19); // descontar IVA 19%

  const body = {
    tipo: cfg.tipo,
    motivo: cfg.motivo,
    items: [{
      descripcion: `Nota crédito — ${cfg.motivo}`,
      cantidad: 1,
      precio_unitario: precioUnitario,
      iva_pct: 19,
    }],
  };

  const res = await fetch(`${API}/api/notas-credito/factura/${factura.id}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (res.ok) {
    ok++;
    console.log(`  ✓ [${ok}/10] ${data.numero} sobre factura ${factura.numero} — $${Number(data.total).toLocaleString("es-CO")}`);
  } else {
    errores++;
    console.error(`  ✗ [${i+1}/10] Factura ${factura.numero}: ${data.error ?? JSON.stringify(data)}`);
  }

  await new Promise(r => setTimeout(r, 1500));
}

console.log(`\n✅ Completado: ${ok} notas crédito creadas, ${errores} errores.`);

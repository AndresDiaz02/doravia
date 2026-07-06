/**
 * Crea 10 notas débito para el set de habilitación DIAN.
 * Requiere que ya existan facturas en estado "aceptada".
 * Uso: node scripts/crear-notas-debito-dian.mjs
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
  process.exit(1);
}

// ── 3. Tipos y motivos de notas débito ────────────────────────────────────────
const configuraciones = [
  { tipo: "interes",  motivo: "Intereses de mora por pago tardío" },
  { tipo: "gastos",   motivo: "Gastos de envío no incluidos en factura original" },
  { tipo: "ajuste",   motivo: "Ajuste de precio por cambio en cotización" },
  { tipo: "interes",  motivo: "Intereses pactados en el contrato de venta" },
  { tipo: "gastos",   motivo: "Gastos de almacenamiento adicionales" },
  { tipo: "ajuste",   motivo: "Diferencia de precio por actualización de tarifa" },
  { tipo: "interes",  motivo: "Intereses de mora mes de enero" },
  { tipo: "gastos",   motivo: "Gastos de instalación y puesta en marcha" },
  { tipo: "ajuste",   motivo: "Ajuste por mayor cantidad entregada" },
  { tipo: "gastos",   motivo: "Gastos de seguro de transporte" },
];

// ── 4. Crear 10 notas débito ──────────────────────────────────────────────────
console.log("\nCreando 10 notas débito...");
let ok = 0;
let errores = 0;

// Usamos facturas desde la posición 20 para no reusar las mismas de las notas crédito
const offset = Math.min(20, facturasAceptadas.length - 10);
const facturasPorUsar = facturasAceptadas.slice(offset, offset + 10);

if (facturasPorUsar.length < 10) {
  console.log("Advertencia: menos de 10 facturas disponibles desde posición 20, usando las disponibles.");
}

for (let i = 0; i < facturasPorUsar.length && i < 10; i++) {
  const factura = facturasPorUsar[i];
  const cfg = configuraciones[i];

  // Nota débito por el 10% del total de la factura (cargo adicional)
  const valorNota = Math.max(5000, Math.round(Number(factura.total) * 0.10));
  const precioUnitario = Math.round(valorNota / 1.19);

  const body = {
    tipo: cfg.tipo,
    motivo: cfg.motivo,
    items: [{
      descripcion: `Nota débito — ${cfg.motivo}`,
      cantidad: 1,
      precio_unitario: precioUnitario,
      iva_pct: 19,
    }],
  };

  const res = await fetch(`${API}/api/notas-debito/factura/${factura.id}`, {
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

console.log(`\n✅ Completado: ${ok} notas débito creadas, ${errores} errores.`);
console.log("\nSet de habilitación DIAN:");
console.log("  ✓ 30 facturas");
console.log("  ✓ 10 notas crédito");
console.log(`  ${ok === 10 ? "✓" : "✗"} 10 notas débito`);

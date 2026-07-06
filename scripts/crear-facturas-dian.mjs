/**
 * Crea 29 facturas de prueba para el set de habilitación DIAN.
 * Uso: node scripts/crear-facturas-dian.mjs
 * Variables requeridas: DORAVIA_EMAIL, DORAVIA_PASSWORD
 */

const API = "https://api.doraviasoft.com";
const EMAIL    = process.env.DORAVIA_EMAIL    ?? "epsa2211@gmail.com";
const PASSWORD = process.env.DORAVIA_PASSWORD ?? "";

if (!PASSWORD) {
  console.error("ERROR: Define DORAVIA_PASSWORD antes de ejecutar.");
  console.error("  PowerShell: $env:DORAVIA_PASSWORD='tuPassword'; node scripts/crear-facturas-dian.mjs");
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
if (!loginRes.ok) {
  console.error("Error de login:", loginData);
  process.exit(1);
}

// Si hay selección de empresa (multi-tenant), elegir la primera con facturación electrónica
let token = loginData.access_token;
if (loginData.selectionToken) {
  // Obtener la empresa con facturación electrónica
  const empRes = await fetch(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Para multi-empresa usar select-empresa
  const selectRes = await fetch(`${API}/api/auth/select-empresa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectionToken: loginData.selectionToken, tenantId: loginData.empresas?.[0]?.id }),
  });
  const selectData = await selectRes.json();
  token = selectData.access_token ?? token;
}

console.log("✓ Autenticado");

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
};

// ── 2. Cargar clientes ─────────────────────────────────────────────────────────
const clientesRes = await fetch(`${API}/api/clientes?limit=100`, { headers });
const clientesData = await clientesRes.json();
const clientes = clientesData.data ?? clientesData;
console.log(`✓ ${clientes.length} clientes disponibles`);

if (clientes.length === 0) {
  console.error("No hay clientes. Ejecuta primero: pnpm --filter @workspace/db seed:dian");
  process.exit(1);
}

// ── 3. Cargar productos ────────────────────────────────────────────────────────
const productosRes = await fetch(`${API}/api/productos?limit=100`, { headers });
const productosData = await productosRes.json();
const productos = productosData.data ?? productosData;
console.log(`✓ ${productos.length} productos disponibles`);

if (productos.length === 0) {
  console.error("No hay productos. Ejecuta primero: pnpm --filter @workspace/db seed:dian");
  process.exit(1);
}

// ── 4. Definir combinaciones variadas ─────────────────────────────────────────
// Rota clientes y usa combinaciones de 1-3 productos por factura
function pick(arr, i) { return arr[i % arr.length]; }

const combinaciones = [
  // factura 1-item simple
  (c, p) => ({ cliente_id: pick(c,0).id, items: [{ producto_id: pick(p,0).id, descripcion: pick(p,0).nombre, cantidad: 2,  precio_unitario: Number(pick(p,0).precio_venta ?? pick(p,0).precio_base), iva_pct: Number(pick(p,0).iva_pct) }] }),
  (c, p) => ({ cliente_id: pick(c,1).id, items: [{ producto_id: pick(p,1).id, descripcion: pick(p,1).nombre, cantidad: 1,  precio_unitario: Number(pick(p,1).precio_venta ?? pick(p,1).precio_base), iva_pct: Number(pick(p,1).iva_pct) }] }),
  (c, p) => ({ cliente_id: pick(c,2).id, items: [{ producto_id: pick(p,2).id, descripcion: pick(p,2).nombre, cantidad: 5,  precio_unitario: Number(pick(p,2).precio_venta ?? pick(p,2).precio_base), iva_pct: Number(pick(p,2).iva_pct) }] }),
  (c, p) => ({ cliente_id: pick(c,3).id, items: [{ producto_id: pick(p,3).id, descripcion: pick(p,3).nombre, cantidad: 3,  precio_unitario: Number(pick(p,3).precio_venta ?? pick(p,3).precio_base), iva_pct: Number(pick(p,3).iva_pct) }] }),
  (c, p) => ({ cliente_id: pick(c,4).id, items: [{ producto_id: pick(p,4).id, descripcion: pick(p,4).nombre, cantidad: 1,  precio_unitario: Number(pick(p,4).precio_venta ?? pick(p,4).precio_base), iva_pct: Number(pick(p,4).iva_pct) }] }),
  // facturas 2-items
  (c, p) => ({ cliente_id: pick(c,5).id, items: [
    { producto_id: pick(p,0).id, descripcion: pick(p,0).nombre, cantidad: 4, precio_unitario: Number(pick(p,0).precio_venta ?? pick(p,0).precio_base), iva_pct: Number(pick(p,0).iva_pct) },
    { producto_id: pick(p,5).id, descripcion: pick(p,5).nombre, cantidad: 1, precio_unitario: Number(pick(p,5).precio_venta ?? pick(p,5).precio_base), iva_pct: Number(pick(p,5).iva_pct) },
  ]}),
  (c, p) => ({ cliente_id: pick(c,6).id, items: [
    { producto_id: pick(p,6).id, descripcion: pick(p,6).nombre, cantidad: 1, precio_unitario: Number(pick(p,6).precio_venta ?? pick(p,6).precio_base), iva_pct: Number(pick(p,6).iva_pct) },
    { producto_id: pick(p,7).id, descripcion: pick(p,7).nombre, cantidad: 2, precio_unitario: Number(pick(p,7).precio_venta ?? pick(p,7).precio_base), iva_pct: Number(pick(p,7).iva_pct) },
  ]}),
  (c, p) => ({ cliente_id: pick(c,7).id, items: [
    { producto_id: pick(p,8).id, descripcion: pick(p,8).nombre, cantidad: 1, precio_unitario: Number(pick(p,8).precio_venta ?? pick(p,8).precio_base), iva_pct: Number(pick(p,8).iva_pct) },
    { producto_id: pick(p,2).id, descripcion: pick(p,2).nombre, cantidad: 3, precio_unitario: Number(pick(p,2).precio_venta ?? pick(p,2).precio_base), iva_pct: Number(pick(p,2).iva_pct) },
  ]}),
  // facturas 3-items
  (c, p) => ({ cliente_id: pick(c,8).id, items: [
    { producto_id: pick(p,0).id, descripcion: pick(p,0).nombre, cantidad: 10, precio_unitario: Number(pick(p,0).precio_venta ?? pick(p,0).precio_base), iva_pct: Number(pick(p,0).iva_pct) },
    { producto_id: pick(p,1).id, descripcion: pick(p,1).nombre, cantidad: 5,  precio_unitario: Number(pick(p,1).precio_venta ?? pick(p,1).precio_base), iva_pct: Number(pick(p,1).iva_pct) },
    { producto_id: pick(p,9).id, descripcion: pick(p,9).nombre, cantidad: 2,  precio_unitario: Number(pick(p,9).precio_venta ?? pick(p,9).precio_base), iva_pct: Number(pick(p,9).iva_pct) },
  ]}),
  (c, p) => ({ cliente_id: pick(c,9).id, items: [
    { producto_id: pick(p,6).id, descripcion: pick(p,6).nombre, cantidad: 1, precio_unitario: Number(pick(p,6).precio_venta ?? pick(p,6).precio_base), iva_pct: Number(pick(p,6).iva_pct) },
    { producto_id: pick(p,7).id, descripcion: pick(p,7).nombre, cantidad: 1, precio_unitario: Number(pick(p,7).precio_venta ?? pick(p,7).precio_base), iva_pct: Number(pick(p,7).iva_pct) },
    { producto_id: pick(p,8).id, descripcion: pick(p,8).nombre, cantidad: 1, precio_unitario: Number(pick(p,8).precio_venta ?? pick(p,8).precio_base), iva_pct: Number(pick(p,8).iva_pct) },
  ]}),
];

// ── 5. Crear 29 facturas ───────────────────────────────────────────────────────
console.log("\nCreando 29 facturas...");
let ok = 0;
let errores = 0;

for (let i = 0; i < 29; i++) {
  const fn = combinaciones[i % combinaciones.length];
  const body = fn(clientes, productos);

  const res = await fetch(`${API}/api/facturas`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (res.ok) {
    ok++;
    console.log(`  ✓ [${ok}/29] ${data.numero} — $${Number(data.total).toLocaleString("es-CO")}`);
  } else {
    errores++;
    console.error(`  ✗ [${i+1}/29] Error: ${data.error ?? JSON.stringify(data)}`);
  }

  // Pausa breve para no saturar el API ni la DIAN
  await new Promise((r) => setTimeout(r, 1500));
}

console.log(`\n✅ Completado: ${ok} facturas creadas, ${errores} errores.`);
console.log("Revisa Doravia y Plemsi para confirmar que llegaron a la DIAN.");

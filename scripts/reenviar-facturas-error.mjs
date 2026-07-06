/**
 * Reenvía a Plemsi/DIAN todas las facturas que tienen error_dian = "error"
 * o que Plemsi tiene como "Error al emitir".
 * Uso: node scripts/reenviar-facturas-error.mjs
 */

const API      = "https://api.doraviasoft.com";
const EMAIL    = process.env.DORAVIA_EMAIL    ?? "andres@doravia.com";
const PASSWORD = process.env.DORAVIA_PASSWORD ?? "";

if (!PASSWORD) { console.error("ERROR: Define DORAVIA_PASSWORD."); process.exit(1); }

// ── Login ──────────────────────────────────────────────────────────────────────
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const loginData = await loginRes.json();
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
if (!token) { console.error("No se pudo obtener token."); process.exit(1); }
console.log("✓ Autenticado");

const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

// ── Cargar facturas para habilitación DIAN ─────────────────────────────────────
const factRes = await fetch(`${API}/api/facturas?limit=200`, { headers });
const factData = await factRes.json();
const todas = factData.data ?? factData;

// Incluir:
//  1. Facturas con estado_dian de error o pendiente
//  2. Facturas con CUFE stub (anteriores reenvíos donde Plemsi aceptó pero devolvió "cude" que no se leyó)
const lista = todas.filter(f =>
  f.facturacion_electronica !== false &&
  (
    f.estado_dian === "error" ||
    f.estado_dian === "pendiente" ||
    (f.estado_dian === null) ||
    (f.cufe && String(f.cufe).startsWith("STUB-"))
  )
);

console.log(`\nFacturas a reenviar: ${lista.length}`);
if (!lista.length) {
  console.log("No hay facturas pendientes. Verifica estado_dian en la base de datos.");
  process.exit(0);
}

let ok = 0; let errores = 0;
for (const f of lista) {
  const res = await fetch(`${API}/api/facturas/${f.id}/reenviar-dian`, { method: "POST", headers });
  const data = await res.json();
  if (data.ok && data.cufe && !String(data.cufe).startsWith("STUB-")) {
    ok++;
    console.log(`  ✓ ${f.numero} → CUDE: ${String(data.cufe).slice(0, 24)}...`);
  } else if (data.ok) {
    errores++;
    console.error(`  ✗ ${f.numero}: emitida pero CUDE no recibido (cufe=${data.cufe ?? "vacío"})`);
  } else {
    errores++;
    console.error(`  ✗ ${f.numero}: ${data.error ?? JSON.stringify(data).slice(0, 100)}`);
  }
  await new Promise(r => setTimeout(r, 2000));
}

console.log(`\n✅ Completado: ${ok} reenviadas, ${errores} errores.`);

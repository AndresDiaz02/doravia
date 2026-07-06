/**
 * Reenvía a Plemsi las notas crédito y débito con estado_dian != "emitida".
 * Uso: node scripts/reenviar-nc-nd-dian.mjs
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

// ── Notas Crédito ──────────────────────────────────────────────────────────────
const ncRes = await fetch(`${API}/api/notas-credito`, { headers });
const ncData = await ncRes.json();
const ncPendientes = (Array.isArray(ncData) ? ncData : ncData.data ?? []).filter(n =>
  n.estado_dian !== "emitida" || (n.cude && String(n.cude).startsWith("STUB-"))
);

console.log(`\nNotas Crédito a reenviar: ${ncPendientes.length}`);
let okNC = 0; let errNC = 0;
for (const nc of ncPendientes) {
  const res = await fetch(`${API}/api/notas-credito/${nc.id}/reenviar-dian`, { method: "POST", headers });
  const data = await res.json();
  if (data.ok) {
    okNC++;
    console.log(`  ✓ ${nc.numero} → CUDE: ${String(data.cude ?? "").slice(0, 24)}...`);
  } else {
    errNC++;
    console.error(`  ✗ ${nc.numero}: ${data.error ?? JSON.stringify(data).slice(0, 100)}`);
  }
  await new Promise(r => setTimeout(r, 2000));
}

// ── Notas Débito ──────────────────────────────────────────────────────────────
const ndRes = await fetch(`${API}/api/notas-debito`, { headers });
const ndData = await ndRes.json();
const ndPendientes = (Array.isArray(ndData) ? ndData : ndData.data ?? []).filter(n =>
  n.estado_dian !== "emitida" || (n.cude && String(n.cude).startsWith("STUB-"))
);

console.log(`\nNotas Débito a reenviar: ${ndPendientes.length}`);
let okND = 0; let errND = 0;
for (const nd of ndPendientes) {
  const res = await fetch(`${API}/api/notas-debito/${nd.id}/reenviar-dian`, { method: "POST", headers });
  const data = await res.json();
  if (data.ok) {
    okND++;
    console.log(`  ✓ ${nd.numero} → CUDE: ${String(data.cude ?? "").slice(0, 24)}...`);
  } else {
    errND++;
    console.error(`  ✗ ${nd.numero}: ${data.error ?? JSON.stringify(data).slice(0, 100)}`);
  }
  await new Promise(r => setTimeout(r, 2000));
}

console.log(`\n✅ Notas Crédito: ${okNC} enviadas, ${errNC} errores.`);
console.log(`✅ Notas Débito:  ${okND} enviadas, ${errND} errores.`);

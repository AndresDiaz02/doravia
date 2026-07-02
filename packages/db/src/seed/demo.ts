import bcrypt from "bcryptjs";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import {
  db, plans, tenants, users, clientes, productos, bodegas, facturas, items_factura,
  resoluciones_dian, user_accesos, comisiones_contador, contador_registrations,
  movimientos_inventario, cajas_pos, audit_log, centros_costos, cotizaciones,
  items_cotizacion, gastos, notas_credito, items_nota_credito,
  cuentas_contables, asientos_contables, lineas_asiento,
} from "../index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T { return arr[rnd(0, arr.length - 1)]; }

function fechaEnMes(mesesAtras: number): Date {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - mesesAtras, 1);
  const fin   = new Date(hoy.getFullYear(), hoy.getMonth() - mesesAtras + 1, 0);
  return new Date(inicio.getTime() + Math.random() * (fin.getTime() - inicio.getTime()));
}

const HASH_DEMO = await bcrypt.hash("Demo2026!", 10);

// ── Datos empresas ────────────────────────────────────────────────────────────

const EMPRESAS = [
  {
    nombre: "Restaurante El Fogón Dorado",
    nit: "900100001",
    planSlug: "brote",
    addons: {} as Record<string, boolean>,
    adminEmail: "admin@fogondorado.co",
    adminNombre: "Valentina Ospina Ríos",
    ciudad: "Bogotá D.C.", departamento: "Cundinamarca",
    actividad: "5611", regimen: "comun",
    direccion: "Cra 13 # 85-32 Local 2",
    clientesData: [
      { nombre: "Juan Camilo Vargas", doc: "CC", nro: "80234567", ciudad: "Bogotá D.C." },
      { nombre: "Empresa Eventos Dorados SAS", doc: "NIT", nro: "900211344", ciudad: "Bogotá D.C." },
      { nombre: "María Alejandra Ruiz", doc: "CC", nro: "52678901", ciudad: "Bogotá D.C." },
      { nombre: "Catering Empresarial del Norte Ltda", doc: "NIT", nro: "800345678", ciudad: "Medellín" },
      { nombre: "Luis Fernando Morales", doc: "CC", nro: "79345678", ciudad: "Bogotá D.C." },
      { nombre: "Andrea Catalina Torres", doc: "CC", nro: "53012345", ciudad: "Bogotá D.C." },
      { nombre: "Hoteles Sabana SA", doc: "NIT", nro: "900876543", ciudad: "Bogotá D.C." },
      { nombre: "Carlos Enrique Peña", doc: "CC", nro: "1020345678", ciudad: "Bogotá D.C." },
    ],
    productosData: [
      { codigo: "ALM-001", nombre: "Almuerzo ejecutivo", precio: 18000, iva: 0 },
      { codigo: "BAN-001", nombre: "Bandeja paisa", precio: 28000, iva: 0 },
      { codigo: "AJI-001", nombre: "Ajiaco santafereño", precio: 25000, iva: 0 },
      { codigo: "SAN-001", nombre: "Sancocho de gallina", precio: 22000, iva: 0 },
      { codigo: "DES-001", nombre: "Desayuno completo", precio: 13000, iva: 0 },
      { codigo: "GAS-001", nombre: "Gaseosa 350ml", precio: 4500, iva: 19 },
      { codigo: "JUG-001", nombre: "Jugo natural 400ml", precio: 6000, iva: 19 },
      { codigo: "CER-001", nombre: "Cerveza Club Colombia", precio: 7000, iva: 19 },
      { codigo: "CAF-001", nombre: "Café tinto / cappuccino", precio: 3000, iva: 19 },
      { codigo: "POS-001", nombre: "Postre del día", precio: 8000, iva: 19 },
    ],
    facturasPorMes: 10,
  },
  {
    nombre: "Ferretería El Martillo",
    nit: "900100002",
    planSlug: "semilla",
    addons: { pos: true } as Record<string, boolean>,
    adminEmail: "admin@ferreteriaelmartillo.co",
    adminNombre: "Roberto Salamanca Díaz",
    ciudad: "Medellín", departamento: "Antioquia",
    actividad: "4752", regimen: "comun",
    direccion: "Calle 33 # 74A-12",
    clientesData: [
      { nombre: "Constructora Prados Verdes SAS", doc: "NIT", nro: "900223456", ciudad: "Medellín" },
      { nombre: "Hernán Alonso Betancur", doc: "CC", nro: "71234567", ciudad: "Medellín" },
      { nombre: "Inmobiliaria Los Andes Ltda", doc: "NIT", nro: "800567123", ciudad: "Medellín" },
      { nombre: "Santiago Mejía Restrepo", doc: "CC", nro: "1037845678", ciudad: "Medellín" },
      { nombre: "Obras y Proyectos del Valle SA", doc: "NIT", nro: "900765432", ciudad: "Cali" },
      { nombre: "Camilo Andrés Zuluaga", doc: "CC", nro: "1039234567", ciudad: "Medellín" },
      { nombre: "Vidriería Industrial NorOeste SAS", doc: "NIT", nro: "900123789", ciudad: "Medellín" },
      { nombre: "Gloria Patricia Espinosa", doc: "CC", nro: "43234567", ciudad: "Medellín" },
    ],
    productosData: [
      { codigo: "CEM-001", nombre: "Cemento gris Argos 50kg", precio: 38000, iva: 0 },
      { codigo: "ARE-001", nombre: "Arena de río bulto 40kg", precio: 18500, iva: 0 },
      { codigo: "VAR-001", nombre: "Varilla corrugada 3/8\" × 6m", precio: 32000, iva: 0 },
      { codigo: "TUB-001", nombre: "Tubo PVC presión 4\" × 6m", precio: 45000, iva: 19 },
      { codigo: "PIN-001", nombre: "Pintura vinilo blanco galón", precio: 42000, iva: 19 },
      { codigo: "TOR-001", nombre: "Tornillos 3/4\" caja × 100und", precio: 12800, iva: 19 },
      { codigo: "CAB-001", nombre: "Cable THHN cal.12 rollo 100m", precio: 198000, iva: 19 },
      { codigo: "LLA-001", nombre: "Llave de paso bronce 1/2\"", precio: 22500, iva: 19 },
      { codigo: "MAL-001", nombre: "Malla eslabonada cal.11 rollo 25m", precio: 185000, iva: 19 },
      { codigo: "TAQ-001", nombre: "Taquetes expansivos 1/4\" × 100und", precio: 9500, iva: 19 },
      { codigo: "SRV-001", nombre: "Corte y dimensionado material", precio: 45000, iva: 19 },
      { codigo: "SRV-002", nombre: "Flete entrega Medellín", precio: 80000, iva: 19 },
    ],
    facturasPorMes: 8,
  },
  {
    nombre: "Boutique Luna Azul",
    nit: "900100003",
    planSlug: "raiz",
    addons: {} as Record<string, boolean>,
    adminEmail: "admin@lunaazul.co",
    adminNombre: "Paola Andrea Sánchez",
    ciudad: "Cali", departamento: "Valle del Cauca",
    actividad: "4771", regimen: "comun",
    direccion: "Cra 100 # 11-45 CC Chipichape Local 215",
    clientesData: [
      { nombre: "Sofía Valentina Castaño", doc: "CC", nro: "1107234567", ciudad: "Cali" },
      { nombre: "Isabella Ramírez Lozano", doc: "CC", nro: "1108345678", ciudad: "Cali" },
      { nombre: "Diana Marcela Holguín", doc: "CC", nro: "31234567", ciudad: "Cali" },
      { nombre: "Uniformes Empresariales del Pacífico SAS", doc: "NIT", nro: "900334455", ciudad: "Cali" },
      { nombre: "Laura Cristina Muñoz", doc: "CC", nro: "29876543", ciudad: "Palmira" },
      { nombre: "Valentina Guerrero Ríos", doc: "CC", nro: "1109456789", ciudad: "Cali" },
      { nombre: "Confecciones El Estilo SA", doc: "NIT", nro: "800234890", ciudad: "Bogotá D.C." },
      { nombre: "Ana María Patiño", doc: "CC", nro: "31987654", ciudad: "Cali" },
    ],
    productosData: [
      { codigo: "BLU-001", nombre: "Blusa manga larga mujer", precio: 65000, iva: 19 },
      { codigo: "PAN-001", nombre: "Pantalón jean skinny mujer", precio: 120000, iva: 19 },
      { codigo: "VES-001", nombre: "Vestido casual media pierna", precio: 145000, iva: 19 },
      { codigo: "FAL-001", nombre: "Falda plisada midi", precio: 89000, iva: 19 },
      { codigo: "SAC-001", nombre: "Saco tejido oversize", precio: 98000, iva: 19 },
      { codigo: "CAR-001", nombre: "Cartera cuero sintético", precio: 110000, iva: 19 },
      { codigo: "CIN-001", nombre: "Cinturón de cuero", precio: 45000, iva: 19 },
      { codigo: "ACC-001", nombre: "Accesorios (collar/aretes set)", precio: 38000, iva: 19 },
      { codigo: "ZAP-001", nombre: "Zapatos tacón bajo mujer", precio: 185000, iva: 19 },
      { codigo: "LEG-001", nombre: "Leggins deportivos", precio: 72000, iva: 19 },
    ],
    facturasPorMes: 7,
  },
  {
    nombre: "Farmacia Salud Total",
    nit: "900100004",
    planSlug: "cosecha",
    addons: {} as Record<string, boolean>,
    adminEmail: "admin@saludtotal.co",
    adminNombre: "Mauricio Herrera Palomino",
    ciudad: "Bogotá D.C.", departamento: "Cundinamarca",
    actividad: "4772", regimen: "comun",
    direccion: "Av. Chile # 14-32",
    clientesData: [
      { nombre: "EPS Sanitas Colseguros", doc: "NIT", nro: "800251443", ciudad: "Bogotá D.C." },
      { nombre: "Clínica Los Nogales SA", doc: "NIT", nro: "900045123", ciudad: "Bogotá D.C." },
      { nombre: "Carmen Alicia Rojas", doc: "CC", nro: "51678901", ciudad: "Bogotá D.C." },
      { nombre: "Jorge Armando Castillo", doc: "CC", nro: "79012345", ciudad: "Bogotá D.C." },
      { nombre: "Colegio San Bartolomé SAS", doc: "NIT", nro: "860012345", ciudad: "Bogotá D.C." },
      { nombre: "Empresa Social del Estado Simón Bolívar", doc: "NIT", nro: "800234123", ciudad: "Bogotá D.C." },
      { nombre: "Margarita del Carmen Forero", doc: "CC", nro: "52345678", ciudad: "Bogotá D.C." },
      { nombre: "Rodrigo Alberto Niño", doc: "CC", nro: "80567890", ciudad: "Bogotá D.C." },
    ],
    productosData: [
      { codigo: "MED-001", nombre: "Acetaminofén 500mg × 100tab", precio: 8500, iva: 0 },
      { codigo: "MED-002", nombre: "Ibuprofeno 400mg × 50tab", precio: 12000, iva: 0 },
      { codigo: "MED-003", nombre: "Amoxicilina 500mg × 21cap", precio: 18500, iva: 0 },
      { codigo: "MED-004", nombre: "Loratadina 10mg × 30tab", precio: 9800, iva: 0 },
      { codigo: "VIT-001", nombre: "Vitamina C 1000mg × 30tab", precio: 24000, iva: 0 },
      { codigo: "CUI-001", nombre: "Alcohol antiséptico 750ml", precio: 8900, iva: 0 },
      { codigo: "CUI-002", nombre: "Crema Nivea corporal 400ml", precio: 22000, iva: 19 },
      { codigo: "CUI-003", nombre: "Shampoo Head & Shoulders 375ml", precio: 19500, iva: 19 },
      { codigo: "SRV-001", nombre: "Toma de tensión / glucometría", precio: 8000, iva: 0 },
      { codigo: "SRV-002", nombre: "Inyectología", precio: 12000, iva: 0 },
      { codigo: "INS-001", nombre: "Jeringas 5ml × caja × 100und", precio: 28000, iva: 0 },
      { codigo: "INS-002", nombre: "Tapabocas quirúrgico × 50und", precio: 18000, iva: 19 },
    ],
    facturasPorMes: 9,
  },
  {
    nombre: "Panadería La Espiga Dorada",
    nit: "900100005",
    planSlug: "semilla",
    addons: {} as Record<string, boolean>,
    adminEmail: "admin@laespigadorada.co",
    adminNombre: "Esperanza Villamizar Cruz",
    ciudad: "Barranquilla", departamento: "Atlántico",
    actividad: "1081", regimen: "comun",
    direccion: "Calle 72 # 46-12",
    clientesData: [
      { nombre: "Hotel El Prado Barranquilla SA", doc: "NIT", nro: "800123890", ciudad: "Barranquilla" },
      { nombre: "Supermercados Olímpica SA", doc: "NIT", nro: "800011237", ciudad: "Barranquilla" },
      { nombre: "Ana Lucía Pertuz", doc: "CC", nro: "22345678", ciudad: "Barranquilla" },
      { nombre: "Carlos Mario Fontalvo", doc: "CC", nro: "72345678", ciudad: "Barranquilla" },
      { nombre: "Catering Eventos Costa Ltda", doc: "NIT", nro: "900456789", ciudad: "Cartagena" },
      { nombre: "Yolanda Beatriz Salas", doc: "CC", nro: "22901234", ciudad: "Barranquilla" },
    ],
    productosData: [
      { codigo: "PAN-001", nombre: "Pan de agua docena", precio: 7200, iva: 0 },
      { codigo: "PAN-002", nombre: "Pan de molde tajado 500g", precio: 5800, iva: 0 },
      { codigo: "PAS-001", nombre: "Croissant mantequilla und", precio: 3500, iva: 0 },
      { codigo: "PAS-002", nombre: "Almojábanas × 6und", precio: 8000, iva: 0 },
      { codigo: "PAS-003", nombre: "Ponqué mármol 500g", precio: 18000, iva: 0 },
      { codigo: "TOR-001", nombre: "Torta celebración personalizada", precio: 85000, iva: 0 },
      { codigo: "GAL-001", nombre: "Galletas avena × 12und", precio: 9500, iva: 0 },
      { codigo: "BEB-001", nombre: "Café con leche 12oz", precio: 5000, iva: 19 },
      { codigo: "BEB-002", nombre: "Chocolate caliente 12oz", precio: 5500, iva: 19 },
      { codigo: "BEB-003", nombre: "Jugo natural botella 400ml", precio: 6000, iva: 19 },
    ],
    facturasPorMes: 8,
  },
  {
    nombre: "AutoPartes Veloz SAS",
    nit: "900100006",
    planSlug: "brote",
    addons: { pos: true } as Record<string, boolean>,
    adminEmail: "admin@autopartesveloz.co",
    adminNombre: "Francisco Javier Pedraza",
    ciudad: "Bogotá D.C.", departamento: "Cundinamarca",
    actividad: "4530", regimen: "comun",
    direccion: "Autopista Norte # 127-50 Local 8",
    clientesData: [
      { nombre: "Transportes Urbanos del Centro SA", doc: "NIT", nro: "900123001", ciudad: "Bogotá D.C." },
      { nombre: "Pedro Ignacio Lara", doc: "CC", nro: "79012678", ciudad: "Bogotá D.C." },
      { nombre: "Flota Empresarial Norte Ltda", doc: "NIT", nro: "800789012", ciudad: "Bogotá D.C." },
      { nombre: "Tecnimec Automotriz SAS", doc: "NIT", nro: "900345678", ciudad: "Bogotá D.C." },
      { nombre: "Edwin Ricardo Garzón", doc: "CC", nro: "80789012", ciudad: "Bogotá D.C." },
      { nombre: "Germán Augusto Forero", doc: "CC", nro: "79678901", ciudad: "Chía" },
      { nombre: "Moto Repuestos Express SAS", doc: "NIT", nro: "900567890", ciudad: "Bogotá D.C." },
      { nombre: "Sandra Milena Quiroga", doc: "CC", nro: "52890123", ciudad: "Bogotá D.C." },
    ],
    productosData: [
      { codigo: "FIL-001", nombre: "Filtro aceite Mazda línea media", precio: 28000, iva: 19 },
      { codigo: "FIL-002", nombre: "Filtro aire universal tipo panel", precio: 35000, iva: 19 },
      { codigo: "ACE-001", nombre: "Aceite motor 10W-40 4L Mobil", precio: 95000, iva: 19 },
      { codigo: "ACE-002", nombre: "Aceite caja automática ATF 1L", precio: 42000, iva: 19 },
      { codigo: "FRE-001", nombre: "Pastillas de freno eje delantero", precio: 68000, iva: 19 },
      { codigo: "FRE-002", nombre: "Disco de freno ventilado 12\"", precio: 125000, iva: 19 },
      { codigo: "BAT-001", nombre: "Batería 40Ah Willard libre mantenimiento", precio: 320000, iva: 19 },
      { codigo: "LLA-001", nombre: "Llanta 175/65 R14 Michelin", precio: 350000, iva: 19 },
      { codigo: "COR-001", nombre: "Correa distribución kit completo", precio: 185000, iva: 19 },
      { codigo: "SRV-001", nombre: "Mano de obra diagnóstico", precio: 65000, iva: 19 },
      { codigo: "SRV-002", nombre: "Cambio aceite y filtro (servicio)", precio: 45000, iva: 19 },
      { codigo: "SRV-003", nombre: "Alineación y balanceo 4 ruedas", precio: 80000, iva: 19 },
    ],
    facturasPorMes: 8,
  },
  {
    nombre: "Consultorio Dental Smile",
    nit: "900100007",
    planSlug: "raiz",
    addons: {} as Record<string, boolean>,
    adminEmail: "admin@dentalsmile.co",
    adminNombre: "Dra. Juliana Cardona Ossa",
    ciudad: "Bucaramanga", departamento: "Santander",
    actividad: "8621", regimen: "comun",
    direccion: "Calle 45 # 31-22 Piso 3",
    clientesData: [
      { nombre: "Alejandro Márquez Niño", doc: "CC", nro: "91345678", ciudad: "Bucaramanga" },
      { nombre: "Gloria Inés Prada", doc: "CC", nro: "63234567", ciudad: "Bucaramanga" },
      { nombre: "Empresa Minera Santander SA", doc: "NIT", nro: "800890123", ciudad: "Bucaramanga" },
      { nombre: "Diego Fernando Serrano", doc: "CC", nro: "91678901", ciudad: "Bucaramanga" },
      { nombre: "Martha Cecilia Gómez", doc: "CC", nro: "63456789", ciudad: "Floridablanca" },
      { nombre: "Andrés Mauricio Delgado", doc: "CC", nro: "1098234567", ciudad: "Bucaramanga" },
      { nombre: "Inversiones Salud Total SAS", doc: "NIT", nro: "900678901", ciudad: "Bucaramanga" },
      { nombre: "Catalina Rueda Vásquez", doc: "CC", nro: "37234567", ciudad: "Bucaramanga" },
    ],
    productosData: [
      { codigo: "SRV-001", nombre: "Consulta odontológica general", precio: 50000, iva: 0 },
      { codigo: "SRV-002", nombre: "Limpieza dental / profilaxis", precio: 120000, iva: 0 },
      { codigo: "SRV-003", nombre: "Extracción dental simple", precio: 180000, iva: 0 },
      { codigo: "SRV-004", nombre: "Endodoncia unirradicular", precio: 650000, iva: 0 },
      { codigo: "SRV-005", nombre: "Resina compuesta por cara", precio: 200000, iva: 0 },
      { codigo: "SRV-006", nombre: "Corona metal porcelana", precio: 1200000, iva: 0 },
      { codigo: "SRV-007", nombre: "Blanqueamiento dental clínico", precio: 480000, iva: 0 },
      { codigo: "SRV-008", nombre: "Placa neuromuscular noche", precio: 380000, iva: 0 },
    ],
    facturasPorMes: 5,
  },
  {
    nombre: "Constructora Horizonte SA",
    nit: "900100008",
    planSlug: "cosecha",
    addons: {} as Record<string, boolean>,
    adminEmail: "admin@constructorahorizonte.co",
    adminNombre: "Gerardo Enrique Salcedo",
    ciudad: "Bogotá D.C.", departamento: "Cundinamarca",
    actividad: "4111", regimen: "comun",
    direccion: "Cra 7 # 115-33 Of. 502",
    clientesData: [
      { nombre: "Urbanización La Hacienda SAS", doc: "NIT", nro: "900445566", ciudad: "Bogotá D.C." },
      { nombre: "Banco Popular SA", doc: "NIT", nro: "860007738", ciudad: "Bogotá D.C." },
      { nombre: "Fideicomiso Prado Norte", doc: "NIT", nro: "900112233", ciudad: "Bogotá D.C." },
      { nombre: "Ecopetrol SA", doc: "NIT", nro: "899999068", ciudad: "Bogotá D.C." },
      { nombre: "Gobernación de Cundinamarca", doc: "NIT", nro: "899999177", ciudad: "Bogotá D.C." },
      { nombre: "Inversiones Capital SA", doc: "NIT", nro: "900778899", ciudad: "Bogotá D.C." },
    ],
    productosData: [
      { codigo: "SRV-001", nombre: "Construcción estructura metálica m²", precio: 1800000, iva: 19 },
      { codigo: "SRV-002", nombre: "Obra civil mampostería m²", precio: 950000, iva: 19 },
      { codigo: "SRV-003", nombre: "Consultoría diseño arquitectónico", precio: 3500000, iva: 19 },
      { codigo: "SRV-004", nombre: "Interventoría de obra mensual", precio: 8000000, iva: 19 },
      { codigo: "SRV-005", nombre: "Movimiento de tierra m³", precio: 120000, iva: 19 },
      { codigo: "MAT-001", nombre: "Suministro concreto premezclado m³", precio: 380000, iva: 0 },
      { codigo: "MAT-002", nombre: "Suministro acero corrugado ton", precio: 3200000, iva: 0 },
      { codigo: "SRV-006", nombre: "Instalaciones hidráulicas m²", precio: 280000, iva: 19 },
    ],
    facturasPorMes: 4,
  },
  {
    nombre: "Papelería e Imprenta Color",
    nit: "900100009",
    planSlug: "semilla",
    addons: {} as Record<string, boolean>,
    adminEmail: "admin@imprentacolor.co",
    adminNombre: "Beatriz Elena Londoño",
    ciudad: "Manizales", departamento: "Caldas",
    actividad: "1811", regimen: "comun",
    direccion: "Calle 21 # 22-34",
    clientesData: [
      { nombre: "Universidad de Caldas", doc: "NIT", nro: "890000685", ciudad: "Manizales" },
      { nombre: "Alcaldía de Manizales", doc: "NIT", nro: "890801434", ciudad: "Manizales" },
      { nombre: "Empresa de Energía de Caldas SA", doc: "NIT", nro: "890001235", ciudad: "Manizales" },
      { nombre: "Eduardo Augusto Castro", doc: "CC", nro: "10234567", ciudad: "Manizales" },
      { nombre: "Comercializadora Eje Cafetero SAS", doc: "NIT", nro: "900345012", ciudad: "Pereira" },
      { nombre: "Patricia Lorena Aguirre", doc: "CC", nro: "42789012", ciudad: "Manizales" },
      { nombre: "Colegio Liceo Inglés SA", doc: "NIT", nro: "890006789", ciudad: "Manizales" },
    ],
    productosData: [
      { codigo: "IMP-001", nombre: "Impresión láser B/N × 100 pág", precio: 15000, iva: 19 },
      { codigo: "IMP-002", nombre: "Impresión full color A4 × 50 pág", precio: 35000, iva: 19 },
      { codigo: "IMP-003", nombre: "Impresión plano A0", precio: 28000, iva: 19 },
      { codigo: "PAP-001", nombre: "Resma papel Bond 75g × 500 hjs", precio: 22000, iva: 19 },
      { codigo: "PAP-002", nombre: "Carpeta AZ oficio und", precio: 12500, iva: 19 },
      { codigo: "ESC-001", nombre: "Esferos BIC × 12und", precio: 9800, iva: 19 },
      { codigo: "ESC-002", nombre: "Marcadores Expo × 4und", precio: 14000, iva: 19 },
      { codigo: "SRV-001", nombre: "Diseño gráfico por hora", precio: 65000, iva: 19 },
      { codigo: "SRV-002", nombre: "Plastificado tamaño carta und", precio: 3500, iva: 19 },
      { codigo: "SRV-003", nombre: "Empastado tesis", precio: 45000, iva: 19 },
    ],
    facturasPorMes: 7,
  },
  {
    nombre: "Supermercado Fresco",
    nit: "900100010",
    planSlug: "brote",
    addons: { pos: true, pos_multi_caja: true } as Record<string, boolean>,
    adminEmail: "admin@supermercadofresco.co",
    adminNombre: "Hernando José Arévalo",
    ciudad: "Cali", departamento: "Valle del Cauca",
    actividad: "4711", regimen: "comun",
    direccion: "Av. Roosevelt # 38-12",
    clientesData: [
      { nombre: "Restaurante El Sabor Latino", doc: "NIT", nro: "900234001", ciudad: "Cali" },
      { nombre: "Catering Eventos del Valle SAS", doc: "NIT", nro: "900234567", ciudad: "Cali" },
      { nombre: "Carlos Alberto Moncayo", doc: "CC", nro: "16678901", ciudad: "Cali" },
      { nombre: "Sandra Liliana Ríos", doc: "CC", nro: "31456789", ciudad: "Cali" },
      { nombre: "Hotel Dann Carlton Cali SA", doc: "NIT", nro: "800456789", ciudad: "Cali" },
      { nombre: "Constructora Ciudad Verde SAS", doc: "NIT", nro: "900789123", ciudad: "Palmira" },
      { nombre: "Fernando Augusto Montoya", doc: "CC", nro: "94234567", ciudad: "Cali" },
      { nombre: "Cooperativa Multiactiva CooValle", doc: "NIT", nro: "890300513", ciudad: "Cali" },
      { nombre: "Pilar Esperanza Córdoba", doc: "CC", nro: "31789012", ciudad: "Cali" },
      { nombre: "Distribuidora Frutas del Pacifico Ltda", doc: "NIT", nro: "900012345", ciudad: "Buenaventura" },
    ],
    productosData: [
      { codigo: "FRU-001", nombre: "Manzana roja kg", precio: 4800, iva: 0 },
      { codigo: "FRU-002", nombre: "Banano kg", precio: 2200, iva: 0 },
      { codigo: "VER-001", nombre: "Tomate chonto kg", precio: 3500, iva: 0 },
      { codigo: "VER-002", nombre: "Papa pastusa kg", precio: 2800, iva: 0 },
      { codigo: "CAR-001", nombre: "Pechuga de pollo kg", precio: 14500, iva: 0 },
      { codigo: "LAC-001", nombre: "Leche entera Alquería 1L", precio: 3800, iva: 0 },
      { codigo: "LAC-002", nombre: "Queso campesino 500g", precio: 12500, iva: 0 },
      { codigo: "ABA-001", nombre: "Arroz Diana 500g", precio: 3200, iva: 0 },
      { codigo: "ABA-002", nombre: "Aceite girasol Gourmet 1L", precio: 16800, iva: 0 },
      { codigo: "LIM-001", nombre: "Jabón Ariel 1kg", precio: 18500, iva: 19 },
      { codigo: "LIM-002", nombre: "Desinfectante Fabuloso 2L", precio: 14200, iva: 19 },
      { codigo: "BEB-001", nombre: "Gaseosa Coca-Cola 2L", precio: 8900, iva: 19 },
      { codigo: "BEB-002", nombre: "Agua Cristal 600ml", precio: 2500, iva: 19 },
      { codigo: "SNA-001", nombre: "Paquete papas Margarita 150g", precio: 5800, iva: 19 },
      { codigo: "SNA-002", nombre: "Galletas Oreo 176g", precio: 7200, iva: 19 },
    ],
    facturasPorMes: 12,
  },
  // ── POS puro: plan "punto" ────────────────────────────────────────────────
  {
    nombre: "Tienda de Ropa Nuevas Tendencias",
    nit: "900100011",
    planSlug: "punto",
    addons: { pos: true } as Record<string, boolean>,
    adminEmail: "admin@nuevastendencias.co",
    adminNombre: "Claudia Marcela Herrera",
    ciudad: "Bogotá D.C.", departamento: "Cundinamarca",
    actividad: "4771", regimen: "comun",
    direccion: "Calle 80 # 68-25 Local 4",
    clientesData: [
      { nombre: "Consumidor Final", doc: "CC", nro: "222222222", ciudad: "Bogotá D.C." },
      { nombre: "Johana Ríos Patiño", doc: "CC", nro: "1016234567", ciudad: "Bogotá D.C." },
      { nombre: "Mariela González", doc: "CC", nro: "52456789", ciudad: "Bogotá D.C." },
    ],
    productosData: [
      { codigo: "CAM-001", nombre: "Camiseta básica algodón", precio: 35000, iva: 19 },
      { codigo: "CAM-002", nombre: "Camiseta polo manga corta", precio: 55000, iva: 19 },
      { codigo: "PAN-001", nombre: "Pantalón jean slim", precio: 89000, iva: 19 },
      { codigo: "PAN-002", nombre: "Pantalón sudadera", precio: 45000, iva: 19 },
      { codigo: "VES-001", nombre: "Vestido casual floral", precio: 95000, iva: 19 },
      { codigo: "BLU-001", nombre: "Blusa manga larga", precio: 48000, iva: 19 },
      { codigo: "SAC-001", nombre: "Saco tejido cuello alto", precio: 72000, iva: 19 },
      { codigo: "REP-001", nombre: "Ropa interior pack x3", precio: 28000, iva: 19 },
      { codigo: "CAL-001", nombre: "Medias x6 pares", precio: 18000, iva: 19 },
      { codigo: "ACC-001", nombre: "Cinturón cuero sintético", precio: 22000, iva: 19 },
    ],
    facturasPorMes: 14,
  },
  {
    nombre: "Panadería y Pastelería La Canela",
    nit: "900100012",
    planSlug: "punto_plus",
    addons: { pos: true, pos_multi_caja: true } as Record<string, boolean>,
    adminEmail: "admin@lacanela.co",
    adminNombre: "Beatriz Elena Morales",
    ciudad: "Medellín", departamento: "Antioquia",
    actividad: "1071", regimen: "comun",
    direccion: "Carrera 43A # 18-12",
    clientesData: [
      { nombre: "Consumidor Final", doc: "CC", nro: "333333333", ciudad: "Medellín" },
      { nombre: "Cafetería Universitaria EAFIT", doc: "NIT", nro: "890903938", ciudad: "Medellín" },
      { nombre: "Eventos y Banquetes del Poblado SAS", doc: "NIT", nro: "900445566", ciudad: "Medellín" },
    ],
    productosData: [
      { codigo: "PAN-001", nombre: "Pan campesino unidad", precio: 1200, iva: 0 },
      { codigo: "PAN-002", nombre: "Pan baguette", precio: 4500, iva: 0 },
      { codigo: "PAN-003", nombre: "Pan de queso x6", precio: 9000, iva: 0 },
      { codigo: "PAN-004", nombre: "Croissant mantequilla", precio: 5500, iva: 0 },
      { codigo: "TOR-001", nombre: "Torta de chocolate 16 porciones", precio: 95000, iva: 19 },
      { codigo: "TOR-002", nombre: "Torta tres leches 16 porciones", precio: 85000, iva: 19 },
      { codigo: "PAS-001", nombre: "Pastel de fruta individual", precio: 8500, iva: 19 },
      { codigo: "PAS-002", nombre: "Brownie de chocolate", precio: 5000, iva: 19 },
      { codigo: "BEB-001", nombre: "Café americano", precio: 4000, iva: 19 },
      { codigo: "BEB-002", nombre: "Cappuccino", precio: 6500, iva: 19 },
      { codigo: "BEB-003", nombre: "Chocolate caliente", precio: 5500, iva: 19 },
      { codigo: "GAL-001", nombre: "Galleta avena x12", precio: 12000, iva: 19 },
    ],
    facturasPorMes: 18,
  },
];

// ── Datos contadores ──────────────────────────────────────────────────────────

const CONTADORES = [
  {
    nombre: "Carlos Andrés Ramírez Herrera",
    email: "carlos.ramirez@contador.co",
    celular: "3112345001",
    empresasIdx: [0, 1],
  },
  {
    nombre: "Diana Patricia Torres Muñoz",
    email: "diana.torres@contador.co",
    celular: "3123456002",
    empresasIdx: [2, 3],
  },
  {
    nombre: "Julián Esteban Pérez Salazar",
    email: "julian.perez@contador.co",
    celular: "3134567003",
    empresasIdx: [4, 5],
  },
  {
    nombre: "Sandra Milena Gómez Vargas",
    email: "sandra.gomez@contador.co",
    celular: "3145678004",
    empresasIdx: [6, 7],
  },
  {
    nombre: "Miguel Ángel Vargas Quintero",
    email: "miguel.vargas@contador.co",
    celular: "3156789005",
    empresasIdx: [8, 9],
  },
];

// ── Limpieza ──────────────────────────────────────────────────────────────────

// Ejecuta un DELETE y absorbe errores de schema drift (columna/tabla inexistente).
// Las tablas con schema diferente al esperado simplemente se omiten.
async function safeExec(query: ReturnType<typeof sql>, label: string) {
  try {
    await db.execute(query);
  } catch (e: any) {
    // 42703 = columna no existe, 42P01 = relación no existe
    if (e?.code === "42703" || e?.code === "42P01") {
      console.warn(`  [limpiar] omitiendo ${label}: ${e.message}`);
    } else {
      throw e;
    }
  }
}

async function limpiarTenants(preservar: string[]) {
  const todos = await db.select({ id: tenants.id }).from(tenants);
  const eliminar = todos.map((t) => t.id).filter((id) => !preservar.includes(id));
  if (!eliminar.length) return;

  const idList = sql.join(eliminar.map((id) => sql`${id}::uuid`), sql`, `);

  // Eliminar en orden (hijo primero). safeExec omite tablas con schema drift.
  await safeExec(sql`DELETE FROM lineas_asiento WHERE asiento_id IN (SELECT id FROM asientos_contables WHERE tenant_id IN (${idList}))`, "lineas_asiento");
  await safeExec(sql`DELETE FROM asientos_contables WHERE tenant_id IN (${idList})`, "asientos_contables");
  await safeExec(sql`DELETE FROM retenciones_factura WHERE factura_id IN (SELECT id FROM facturas WHERE tenant_id IN (${idList}))`, "retenciones_factura");
  await safeExec(sql`DELETE FROM items_nota_credito WHERE nota_credito_id IN (SELECT id FROM notas_credito WHERE tenant_id IN (${idList}))`, "items_nota_credito");
  await safeExec(sql`DELETE FROM notas_credito WHERE tenant_id IN (${idList})`, "notas_credito");
  await safeExec(sql`DELETE FROM items_factura WHERE factura_id IN (SELECT id FROM facturas WHERE tenant_id IN (${idList}))`, "items_factura");
  await safeExec(sql`DELETE FROM facturas WHERE tenant_id IN (${idList})`, "facturas");
  await safeExec(sql`DELETE FROM items_cotizacion WHERE cotizacion_id IN (SELECT id FROM cotizaciones WHERE tenant_id IN (${idList}))`, "items_cotizacion");
  await safeExec(sql`DELETE FROM cotizaciones WHERE tenant_id IN (${idList})`, "cotizaciones");
  await safeExec(sql`DELETE FROM items_venta_pos WHERE venta_id IN (SELECT id FROM ventas_pos WHERE tenant_id IN (${idList}))`, "items_venta_pos");
  await safeExec(sql`DELETE FROM ventas_pos WHERE tenant_id IN (${idList})`, "ventas_pos");
  await safeExec(sql`DELETE FROM abonos_fiado WHERE fiado_id IN (SELECT id FROM fiados WHERE tenant_id IN (${idList}))`, "abonos_fiado");
  await safeExec(sql`DELETE FROM items_fiado WHERE fiado_id IN (SELECT id FROM fiados WHERE tenant_id IN (${idList}))`, "items_fiado");
  await safeExec(sql`DELETE FROM fiados WHERE tenant_id IN (${idList})`, "fiados");
  await safeExec(sql`DELETE FROM citas_pos WHERE tenant_id IN (${idList})`, "citas_pos");
  await safeExec(sql`DELETE FROM turnos_pos WHERE tenant_id IN (${idList})`, "turnos_pos");
  await safeExec(sql`DELETE FROM cajas_pos WHERE tenant_id IN (${idList})`, "cajas_pos");
  await safeExec(sql`DELETE FROM componentes_producto WHERE tenant_id IN (${idList})`, "componentes_producto");
  await safeExec(sql`DELETE FROM movimientos_inventario WHERE tenant_id IN (${idList})`, "movimientos_inventario");
  await safeExec(sql`DELETE FROM productos WHERE tenant_id IN (${idList})`, "productos");
  await safeExec(sql`DELETE FROM bodegas WHERE tenant_id IN (${idList})`, "bodegas");
  await safeExec(sql`DELETE FROM clientes WHERE tenant_id IN (${idList})`, "clientes");
  await safeExec(sql`DELETE FROM resoluciones_dian WHERE tenant_id IN (${idList})`, "resoluciones_dian");
  await safeExec(sql`DELETE FROM retenciones_config WHERE tenant_id IN (${idList})`, "retenciones_config");
  await safeExec(sql`DELETE FROM cuentas_contables WHERE tenant_id IN (${idList})`, "cuentas_contables");
  await safeExec(sql`DELETE FROM centros_costos WHERE tenant_id IN (${idList})`, "centros_costos");
  await safeExec(sql`DELETE FROM tutorial_progress WHERE tenant_id IN (${idList})`, "tutorial_progress");
  await safeExec(sql`DELETE FROM retencion_seguimiento WHERE tenant_id IN (${idList})`, "retencion_seguimiento");
  await safeExec(sql`DELETE FROM pending_registrations WHERE tenant_id IN (${idList})`, "pending_registrations");
  await safeExec(sql`DELETE FROM plantillas_factura WHERE tenant_id IN (${idList})`, "plantillas_factura");
  await safeExec(sql`DELETE FROM gastos WHERE tenant_id IN (${idList})`, "gastos");
  await safeExec(sql`DELETE FROM proveedores WHERE tenant_id IN (${idList})`, "proveedores");
  await safeExec(sql`DELETE FROM audit_log WHERE tenant_id IN (${idList})`, "audit_log");
  await safeExec(sql`DELETE FROM user_accesos WHERE tenant_id IN (${idList})`, "user_accesos");
  await safeExec(sql`DELETE FROM comisiones_contador WHERE tenant_id IN (${idList})`, "comisiones_contador");
  await safeExec(sql`DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE tenant_id IN (${idList}))`, "refresh_tokens");
  await safeExec(sql`DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE tenant_id IN (${idList}))`, "password_reset_tokens");
  // Estas dos son críticas — si fallan hay un FK inesperado, se lanza el error.
  await db.execute(sql`DELETE FROM users WHERE tenant_id IN (${idList})`);
  await db.execute(sql`DELETE FROM tenants WHERE id IN (${idList})`);

  console.log(`  Eliminados ${eliminar.length} tenant(s) anteriores.`);
}

// ── Generador de facturas ─────────────────────────────────────────────────────

type ProdRef = { id: string; nombre: string; precio: number; iva: number };

function generarFacturas(
  tenantId: string,
  resolucionId: string,
  prefijo: string,
  clienteIds: string[],
  prods: ProdRef[],
  totalFacturas: number,
  startConsecutivo = 1,
) {
  const facturasList: any[] = [];
  const itemsList: any[] = [];

  let consecutivo = startConsecutivo;

  for (let i = 0; i < totalFacturas; i++) {
    // Distribuir uniformemente en los últimos 6 meses
    const mesesAtras = Math.floor((i / totalFacturas) * 6);
    const fechaEmision = fechaEnMes(mesesAtras);

    // 30% de facturas en cartera (enviadas, sin pagar)
    const enCartera = Math.random() < 0.30;
    const estado = enCartera ? "enviada" : "aceptada";
    const condicion = enCartera ? "credito" : (Math.random() < 0.7 ? "contado" : "credito");

    const fechaVencimiento = new Date(fechaEmision);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + pick([30, 45, 60]));
    const pagadaAt = estado === "aceptada" ? fechaEmision : null;

    const clienteId = clienteIds[i % clienteIds.length];

    // 1 a 3 items por factura
    const numItems = rnd(1, 3);
    const itemsSeleccionados = [...prods].sort(() => Math.random() - 0.5).slice(0, numItems);

    let subtotal = 0;
    let ivaTotal = 0;
    const facturaItemsTemp: { descripcion: string; cantidad: number; precio: number; ivaPct: number }[] = [];

    for (const prod of itemsSeleccionados) {
      const cantidad = rnd(1, 4);
      const itemSubtotal = Math.round(prod.precio * cantidad);
      const itemIva = Math.round(itemSubtotal * prod.iva / 100);
      subtotal += itemSubtotal;
      ivaTotal += itemIva;
      facturaItemsTemp.push({ descripcion: prod.nombre, cantidad, precio: prod.precio, ivaPct: prod.iva });
    }

    const total = subtotal + ivaTotal;
    const numero = `${prefijo}-${String(consecutivo).padStart(4, "0")}`;

    facturasList.push({
      tenant_id: tenantId,
      cliente_id: clienteId,
      resolucion_id: resolucionId,
      prefijo,
      consecutivo,
      numero,
      estado,
      condicion_pago: condicion,
      forma_pago: pick(["efectivo", "transferencia", "tarjeta_credito"] as const),
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVencimiento,
      subtotal: String(subtotal),
      descuento_total: "0",
      iva_total: String(ivaTotal),
      total: String(total),
      total_retenciones: "0",
      neto_a_pagar: String(total),
      pagada_at: pagadaAt,
    });

    for (const fi of facturaItemsTemp) {
      const isub = Math.round(fi.precio * fi.cantidad);
      const iiva = Math.round(isub * fi.ivaPct / 100);
      itemsList.push({
        factura_id: numero, // temporal placeholder — will be replaced
        descripcion: fi.descripcion,
        cantidad: String(fi.cantidad),
        precio_unitario: String(fi.precio),
        descuento_pct: "0",
        iva_pct: String(fi.ivaPct),
        unidad_medida: "UN",
        subtotal: String(isub),
        iva_valor: String(iiva),
        total: String(isub + iiva),
      });
    }

    consecutivo++;
  }

  return { facturasList, itemsList, totalConsecutivo: consecutivo - 1 };
}

// ── Asientos contables demo (partida doble por factura) ──────────────────────

type FacturaResumen = {
  id: string; numero: string; total: string; subtotal: string;
  descuento_total: string; iva_total: string; fecha_emision: Date; estado: string;
};

async function crearAsientosDemo(tenantId: string, factsList: FacturaResumen[]) {
  if (!factsList.length) return;

  const cuentasRows = await db
    .select({ id: cuentas_contables.id, codigo: cuentas_contables.codigo })
    .from(cuentas_contables)
    .where(and(
      inArray(cuentas_contables.codigo, ["1305", "4135", "2408"]),
      isNull(cuentas_contables.tenant_id),
    ));

  const cuentaMap: Record<string, string> = {};
  for (const c of cuentasRows) cuentaMap[c.codigo] = c.id;

  if (!cuentaMap["1305"] || !cuentaMap["4135"]) {
    console.warn("  [seed] PUC sin cuentas 1305/4135, omitiendo asientos.");
    return;
  }

  let seq = 1;
  for (const f of factsList) {
    const fecha = new Date(f.fecha_emision);
    const anio = fecha.getFullYear();
    const [asiento] = await (db.insert(asientos_contables).values({
      tenant_id: tenantId,
      numero: `ASI-${anio}-${String(seq++).padStart(5, "0")}`,
      fecha: fecha.toISOString().split("T")[0],
      descripcion: `Factura de venta ${f.numero}`,
      origen: "factura" as const,
      referencia_id: f.id,
    } as any).returning());

    const total    = Number(f.total);
    const subtotal = Number(f.subtotal) - Number(f.descuento_total);
    const iva      = Number(f.iva_total);

    const lineas = [
      { asiento_id: asiento.id, cuenta_id: cuentaMap["1305"], descripcion: "Clientes",           debito: String(total),    credito: "0" },
      { asiento_id: asiento.id, cuenta_id: cuentaMap["4135"], descripcion: "Ingresos por venta", debito: "0",              credito: String(subtotal) },
    ] as any[];
    if (iva > 0 && cuentaMap["2408"]) {
      lineas.push({ asiento_id: asiento.id, cuenta_id: cuentaMap["2408"], descripcion: "IVA generado", debito: "0", credito: String(iva) });
    }
    await db.insert(lineas_asiento).values(lineas as any);
    await db.update(facturas).set({ asiento_id: asiento.id } as any).where(eq(facturas.id, f.id));
  }
}

// ── Datos por empresa (completamente idempotente por paso) ────────────────────

async function seedDatosEmpresa(tenantId: string, emp: (typeof EMPRESAS)[0], idx: number) {
  // ── Bodega ──────────────────────────────────────────────────────────────────
  const [bodegaExiste] = await db.select({ id: bodegas.id }).from(bodegas)
    .where(eq(bodegas.tenant_id, tenantId)).limit(1);
  const bodegaReg = bodegaExiste ?? (await db.insert(bodegas).values({
    tenant_id: tenantId, nombre: "Bodega Principal", activo: true,
  }).returning())[0];

  // ── Cajas POS ───────────────────────────────────────────────────────────────
  if (emp.addons.pos) {
    const [cajaExiste] = await db.select({ id: cajas_pos.id }).from(cajas_pos)
      .where(eq(cajas_pos.tenant_id, tenantId)).limit(1);
    if (!cajaExiste) {
      await db.insert(cajas_pos).values({ tenant_id: tenantId, nombre: "Caja 1 — Principal", activo: true });
      if (emp.addons.pos_multi_caja) {
        await db.insert(cajas_pos).values({ tenant_id: tenantId, nombre: "Caja 2 — Secundaria", activo: true });
      }
    }
  }

  // ── Resolución DIAN ─────────────────────────────────────────────────────────
  const [resolExiste] = await db
    .select({ id: resoluciones_dian.id, consecutivo_actual: resoluciones_dian.consecutivo_actual })
    .from(resoluciones_dian).where(eq(resoluciones_dian.tenant_id, tenantId)).limit(1);
  const resolReg = resolExiste ?? (await db.insert(resoluciones_dian).values({
    tenant_id: tenantId,
    numero_resolucion: `18764000000${String(idx + 1).padStart(5, "0")}`,
    fecha_resolucion: "2024-01-15",
    prefijo: "FV",
    consecutivo_desde: 1,
    consecutivo_hasta: 10000,
    consecutivo_actual: 0,
    fecha_desde: "2024-01-15",
    fecha_hasta: "2027-01-15",
    activa: true,
  }).returning())[0];

  // ── Clientes (idempotente) ──────────────────────────────────────────────────
  const [clienteExiste] = await db.select({ id: clientes.id }).from(clientes)
    .where(eq(clientes.tenant_id, tenantId)).limit(1);
  let clienteIds: string[];
  if (clienteExiste) {
    clienteIds = (await db.select({ id: clientes.id }).from(clientes)
      .where(eq(clientes.tenant_id, tenantId))).map((c) => c.id);
  } else {
    const insertados = await db.insert(clientes).values(
      emp.clientesData.map((c) => ({
        tenant_id: tenantId,
        tipo_persona: c.doc === "NIT" ? "juridica" as const : "natural" as const,
        tipo_documento: c.doc as "CC" | "NIT",
        numero_documento: c.nro,
        digito_verificacion: c.doc === "NIT" ? "7" : undefined,
        nombre: c.nombre,
        municipio: c.ciudad,
        departamento: emp.departamento,
        activo: true,
      })),
    ).returning();
    clienteIds = insertados.map((c) => c.id);
  }

  // ── Productos (idempotente) ─────────────────────────────────────────────────
  const [productoExiste] = await db
    .select({ id: productos.id, nombre: productos.nombre, precio_venta: productos.precio_venta, iva_pct: productos.iva_pct })
    .from(productos).where(eq(productos.tenant_id, tenantId)).limit(1);
  let prodRefs: ProdRef[];
  if (productoExiste) {
    const existentes = await db
      .select({ id: productos.id, nombre: productos.nombre, precio_venta: productos.precio_venta, iva_pct: productos.iva_pct })
      .from(productos).where(eq(productos.tenant_id, tenantId));
    prodRefs = existentes.map((p) => ({
      id: p.id, nombre: p.nombre,
      precio: Number(p.precio_venta), iva: Number(p.iva_pct),
    }));
  } else {
    const productosInsertados = await db.insert(productos).values(
      emp.productosData.map((p) => ({
        tenant_id: tenantId,
        codigo: p.codigo,
        nombre: p.nombre,
        tipo: "producto" as const,
        unidad: "und",
        precio_base: String(Math.round(p.precio * 0.75)),
        precio_venta: String(p.precio),
        iva_pct: String(p.iva),
        stock_actual: String(rnd(20, 200)),
        activo: true,
      })),
    ).returning();

    await db.insert(movimientos_inventario).values(
      productosInsertados.map((p) => ({
        tenant_id: tenantId,
        bodega_id: bodegaReg.id,
        producto_id: p.id,
        tipo: "entrada" as const,
        cantidad: p.stock_actual ?? "50",
        costo_unitario: p.precio_base,
        referencia_tipo: "ajuste_manual",
        observaciones: "Stock inicial — ambiente de simulación",
      })),
    );

    prodRefs = productosInsertados.map((p, i) => ({
      id: p.id, nombre: p.nombre,
      precio: emp.productosData[i].precio, iva: emp.productosData[i].iva,
    }));
  }

  // ── Facturas (idempotente) ──────────────────────────────────────────────────
  const [facturaExiste] = await db.select({ id: facturas.id }).from(facturas)
    .where(eq(facturas.tenant_id, tenantId)).limit(1);

  if (!facturaExiste) {
    const startConsecutivo = (resolReg.consecutivo_actual ?? 0) + 1;
    const totalFacturas = emp.facturasPorMes * 6;
    const { facturasList, itemsList, totalConsecutivo } = generarFacturas(
      tenantId, resolReg.id, "FV", clienteIds, prodRefs, totalFacturas, startConsecutivo,
    );

    const LOTE = 50;
    const facturasConId: FacturaResumen[] = [];
    for (let i = 0; i < facturasList.length; i += LOTE) {
      const insertadas = await db.insert(facturas).values(facturasList.slice(i, i + LOTE) as any).returning();
      facturasConId.push(...insertadas.map((f) => ({
        id: f.id, numero: f.numero, total: f.total, subtotal: f.subtotal,
        descuento_total: f.descuento_total, iva_total: f.iva_total,
        fecha_emision: f.fecha_emision, estado: f.estado,
      })));
    }

    // Mapeo por numero (resistente a orden de retorno de la BD)
    const facturaByNumero = new Map(facturasConId.map((f) => [f.numero, f.id]));
    const itemsConId = (itemsList as any[])
      .map((item) => ({ ...item, factura_id: facturaByNumero.get(item.factura_id) ?? null }))
      .filter((item) => item.factura_id !== null);

    for (let i = 0; i < itemsConId.length; i += LOTE) {
      await db.insert(items_factura).values(itemsConId.slice(i, i + LOTE) as any);
    }

    await db.update(resoluciones_dian)
      .set({ consecutivo_actual: startConsecutivo - 1 + totalConsecutivo })
      .where(eq(resoluciones_dian.id, resolReg.id));

    await crearAsientosDemo(tenantId, facturasConId.filter((f) => f.estado === "aceptada"));
    console.log(`  ✓ ${emp.nombre} — ${totalFacturas} facturas + asientos`);
  } else {
    // Facturas ya existen: verificar si faltan asientos
    const [asientoExiste] = await db.select({ id: asientos_contables.id }).from(asientos_contables)
      .where(eq(asientos_contables.tenant_id, tenantId)).limit(1);
    if (!asientoExiste) {
      const factsAceptadas = await db
        .select({ id: facturas.id, numero: facturas.numero, total: facturas.total,
          subtotal: facturas.subtotal, descuento_total: facturas.descuento_total,
          iva_total: facturas.iva_total, fecha_emision: facturas.fecha_emision, estado: facturas.estado })
        .from(facturas)
        .where(eq(facturas.tenant_id, tenantId));
      await crearAsientosDemo(tenantId, factsAceptadas.filter((f) => f.estado === "aceptada"));
      console.log(`  ✓ ${emp.nombre} — asientos creados retroactivamente`);
    } else {
      console.log(`  ✓ ${emp.nombre} — datos completos`);
    }
  }

  // ── Usuario cajero para empresas con POS (idempotente) ──────────────────────
  if (emp.addons.pos) {
    const cajeroEmail = emp.adminEmail.replace("admin@", "cajero@");
    const [cajeroExiste] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.email, cajeroEmail), eq(users.tenant_id, tenantId))).limit(1);
    if (!cajeroExiste) {
      await db.insert(users).values({
        tenant_id: tenantId,
        email: cajeroEmail,
        nombre: `Cajero — ${emp.nombre}`,
        role: "vendedor",
        password_hash: HASH_DEMO,
      });
      console.log(`  ✓ Cajero POS creado: ${cajeroEmail}`);
    }
  }
}

// ── Vinculación contadores → empresas (siempre idempotente) ──────────────────

async function vincularContadoresAEmpresas() {
  const planesDB = await db.select({ id: plans.id, slug: plans.slug, precio: plans.precio_anual_cop }).from(plans);

  for (const c of CONTADORES) {
    const [contUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.email, c.email)).limit(1);
    if (!contUser) continue;

    for (const empIdx of c.empresasIdx) {
      const empNit = EMPRESAS[empIdx].nit;
      const [empresa] = await db.select({ id: tenants.id, planId: tenants.plan_id })
        .from(tenants).where(eq(tenants.nit, empNit)).limit(1);
      if (!empresa) continue;

      await db.insert(user_accesos).values({
        user_id: contUser.id,
        tenant_id: empresa.id,
        role: "contador",
        permisos_contables: true,
      }).onConflictDoNothing();

      // Comisión solo si no existe aún
      const [comExiste] = await db.select({ id: comisiones_contador.id })
        .from(comisiones_contador)
        .where(eq(comisiones_contador.contador_user_id, contUser.id))
        .limit(1);
      if (!comExiste) {
        const plan = planesDB.find((p) => p.id === empresa.planId);
        if (plan && plan.precio > 0) {
          await db.insert(comisiones_contador).values({
            contador_user_id: contUser.id,
            tenant_id: empresa.id,
            tipo: "venta_inicial",
            porcentaje: "15.00",
            base_cop: plan.precio,
            valor_cop: Math.round(plan.precio * 0.15),
            pagada: false,
          });
        }
      }
    }
  }
  console.log("  ✓ Contadores vinculados a empresas.");
}

// ── Seed principal ────────────────────────────────────────────────────────────

export async function seedDemo() {
  // Cargar planes y fechas (necesarios en ambos paths)
  const planesDB = await db.select({ id: plans.id, slug: plans.slug, precio: plans.precio_anual_cop })
    .from(plans);
  const planMap = Object.fromEntries(planesDB.map((p) => [p.slug, p]));

  const ahora = new Date();
  const planFin = new Date(ahora); planFin.setFullYear(planFin.getFullYear() + 1);
  const seisMesesAtras = new Date(ahora); seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

  // Idempotente: si ya existe Fogón Dorado, completar datos faltantes en TODAS las empresas
  const [existe] = await db.select({ id: tenants.id })
    .from(tenants).where(eq(tenants.nit, "900100001")).limit(1);
  if (existe) {
    console.log("✓ Demo ya existe — verificando datos por empresa...");
    for (let idx = 0; idx < EMPRESAS.length; idx++) {
      const emp = EMPRESAS[idx];
      let [tenant] = await db.select({ id: tenants.id })
        .from(tenants).where(eq(tenants.nit, emp.nit)).limit(1);

      // Si el tenant no existe aún, crearlo (puede pasar si el seed anterior crasheó a mitad)
      if (!tenant) {
        const plan = planMap[emp.planSlug];
        if (!plan) { console.error(`  ✗ Plan ${emp.planSlug} no encontrado para ${emp.nombre}`); continue; }
        try {
          const [newTenant] = await db.insert(tenants).values({
            nombre: emp.nombre, nit: emp.nit, plan_id: plan.id,
            plan_starts_at: seisMesesAtras, plan_ends_at: planFin,
            activo: true, ciudad: emp.ciudad, direccion: emp.direccion,
            regimen: emp.regimen as "comun" | "simplificado",
            actividad_economica: emp.actividad, onboarding_completado: true,
            addons: Object.keys(emp.addons).length ? emp.addons : null,
            ultimo_pago_confirmado_at: seisMesesAtras,
          }).returning();
          await db.insert(users).values({
            tenant_id: newTenant.id, email: emp.adminEmail, nombre: emp.adminNombre,
            role: "admin", password_hash: HASH_DEMO,
          });
          tenant = newTenant;
          console.log(`  + Tenant creado: ${emp.nombre}`);
        } catch (e) {
          console.error(`  ✗ Error creando tenant ${emp.nombre}:`, e);
          continue;
        }
      }

      try {
        await seedDatosEmpresa(tenant.id, emp, idx);
      } catch (e) {
        console.error(`  ✗ Error en ${emp.nombre}:`, e);
      }
    }
    await vincularContadoresAEmpresas();
    return;
  }

  console.log("Preparando ambiente de simulación...");

  // Encontrar tenants a preservar
  const [doraviaUser] = await db.select({ tenant_id: users.tenant_id })
    .from(users).where(eq(users.email, "andres@doravia.com")).limit(1);
  const [hubTenant] = await db.select({ id: tenants.id })
    .from(tenants).where(eq(tenants.nit, "0000000001")).limit(1);

  const preservar = [doraviaUser?.tenant_id, hubTenant?.id].filter(Boolean) as string[];

  // Crear Rose como fundadora en el tenant de Doravia
  if (doraviaUser?.tenant_id) {
    const [roseExiste] = await db.select({ id: users.id }).from(users)
      .where(eq(users.email, "rose@doravia.com")).limit(1);
    if (!roseExiste) {
      const roseHash = await bcrypt.hash("Miku123", 10);
      await db.insert(users).values({
        tenant_id: doraviaUser.tenant_id,
        email: "rose@doravia.com",
        nombre: "Rose Doravia",
        role: "admin",
        password_hash: roseHash,
      });
      console.log("  ✓ Usuario Rose creado (rose@doravia.com).");
    }
  }

  // Limpiar tenants anteriores
  await limpiarTenants(preservar);

  // Crear 5 contadores en el hub
  const contadorUsers: { id: string; email: string; empresasIdx: number[] }[] = [];
  if (hubTenant) {
    for (const c of CONTADORES) {
      const [existe2] = await db.select({ id: users.id }).from(users)
        .where(eq(users.email, c.email)).limit(1);
      const userId = existe2?.id ?? (await db.insert(users).values({
        tenant_id: hubTenant.id,
        email: c.email,
        nombre: c.nombre,
        role: "contador",
        password_hash: HASH_DEMO,
      }).returning())[0].id;

      // Registro confirmado
      const [regExiste] = await db.select({ id: contador_registrations.id })
        .from(contador_registrations).where(eq(contador_registrations.email, c.email)).limit(1);
      if (!regExiste) {
        await db.insert(contador_registrations).values({
          nombre: c.nombre,
          email: c.email,
          celular: c.celular,
          password_hash: HASH_DEMO,
          token_confirmacion: `DEMO${Math.random().toString(36).slice(2)}`,
          confirmado: true,
          user_id: userId,
          confirmado_at: seisMesesAtras,
        });
      }
      contadorUsers.push({ id: userId, email: c.email, empresasIdx: c.empresasIdx });
    }
    console.log("  ✓ 5 contadores creados en hub.");
  }

  // Crear 10 empresas
  const empresasCreadas: { id: string; idx: number; nombre: string; plan: string }[] = [];

  for (let idx = 0; idx < EMPRESAS.length; idx++) {
    const emp = EMPRESAS[idx];
    const plan = planMap[emp.planSlug];
    if (!plan) throw new Error(`Plan ${emp.planSlug} no encontrado.`);

    // Tenant
    const [tenant] = await db.insert(tenants).values({
      nombre: emp.nombre,
      nit: emp.nit,
      plan_id: plan.id,
      plan_starts_at: seisMesesAtras,
      plan_ends_at: planFin,
      activo: true,
      ciudad: emp.ciudad,
      direccion: emp.direccion,
      regimen: emp.regimen as "comun" | "simplificado",
      actividad_economica: emp.actividad,
      onboarding_completado: true,
      addons: Object.keys(emp.addons).length ? emp.addons : null,
      ultimo_pago_confirmado_at: seisMesesAtras,
    }).returning();

    // Admin user
    await db.insert(users).values({
      tenant_id: tenant.id,
      email: emp.adminEmail,
      nombre: emp.adminNombre,
      role: "admin",
      password_hash: HASH_DEMO,
    });

    await seedDatosEmpresa(tenant.id, emp, idx);
    empresasCreadas.push({ id: tenant.id, idx, nombre: emp.nombre, plan: emp.planSlug });
  }

  await vincularContadoresAEmpresas();

  // ── Resumen de credenciales ───────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  CREDENCIALES AMBIENTE DE SIMULACIÓN — DORAVIA");
  console.log("════════════════════════════════════════════════════════════");
  console.log("\n  FUNDADORES:");
  console.log("  andres@doravia.com   / (contraseña original)   — Admin fundador");
  console.log("  rose@doravia.com     / Miku123                  — Admin fundadora");
  console.log("\n  EMPRESAS (todas con contraseña Demo2026!):");
  for (let i = 0; i < EMPRESAS.length; i++) {
    const e = EMPRESAS[i];
    const posLabel = Object.keys(e.addons).length ? ` + POS${e.addons.pos_multi_caja ? " Multi-Caja" : ""}` : "";
    console.log(`  [${String(i + 1).padStart(2, " ")}] ${e.adminEmail.padEnd(38)} NIT: ${e.nit}  Plan: ${e.planSlug}${posLabel}`);
  }
  console.log("\n  CONTADORES (todos con contraseña Demo2026!):");
  for (let i = 0; i < CONTADORES.length; i++) {
    const c = CONTADORES[i];
    const empresasNombres = c.empresasIdx.map((idx) => EMPRESAS[idx].nombre).join(" / ");
    console.log(`  [${i + 1}] ${c.email.padEnd(35)} → ${empresasNombres}`);
  }
  console.log("════════════════════════════════════════════════════════════\n");
}

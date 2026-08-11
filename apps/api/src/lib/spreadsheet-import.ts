import * as XLSX from "xlsx";

const EXTENSIONES_PERMITIDAS = new Set([".csv", ".xlsx"]);
const CABECERAS_PELIGROSAS = new Set(["__proto__", "prototype", "constructor"]);

export class ArchivoImportacionInvalido extends Error {}

function extensionDe(nombre: string) {
  const punto = nombre.lastIndexOf(".");
  return punto >= 0 ? nombre.slice(punto).toLowerCase() : "";
}

function pareceZip(buffer: Buffer) {
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

function pareceTexto(buffer: Buffer) {
  return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0);
}

/**
 * Lee importaciones de hoja de cálculo con límites explícitos. SheetJS sigue
 * siendo necesario para compatibilidad, por lo que nunca se deben aceptar
 * archivos sin tamaño, formato, hojas y rango controlados.
 */
export function leerFilasImportacion(
  archivo: { originalname: string; buffer: Buffer },
  maxFilas: number,
  maxColumnas = 80,
): Record<string, unknown>[] {
  const extension = extensionDe(archivo.originalname);
  if (!EXTENSIONES_PERMITIDAS.has(extension)) {
    throw new ArchivoImportacionInvalido("Solo se admiten archivos CSV o XLSX.");
  }
  if (archivo.buffer.length === 0) {
    throw new ArchivoImportacionInvalido("El archivo está vacío.");
  }
  if (extension === ".xlsx" && !pareceZip(archivo.buffer)) {
    throw new ArchivoImportacionInvalido("El archivo XLSX no tiene un formato válido.");
  }
  if (extension === ".csv" && !pareceTexto(archivo.buffer)) {
    throw new ArchivoImportacionInvalido("El archivo CSV contiene datos binarios no válidos.");
  }

  const libro = XLSX.read(archivo.buffer, {
    type: "buffer",
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    // Incluye encabezado y una fila adicional: así podemos rechazar, en vez
    // de truncar silenciosamente, los archivos que superen el límite.
    sheetRows: maxFilas + 2,
    WTF: false,
  });

  if (libro.SheetNames.length !== 1) {
    throw new ArchivoImportacionInvalido("El archivo debe contener una sola hoja.");
  }
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja || !hoja["!ref"]) {
    throw new ArchivoImportacionInvalido("El archivo no contiene datos legibles.");
  }

  const rango = XLSX.utils.decode_range(hoja["!ref"]);
  if (rango.e.r + 1 > maxFilas + 1 || rango.e.c + 1 > maxColumnas) {
    throw new ArchivoImportacionInvalido(`Máximo ${maxFilas} filas y ${maxColumnas} columnas por importación.`);
  }

  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "", raw: true });
  if (filas.length > maxFilas) {
    throw new ArchivoImportacionInvalido(`Máximo ${maxFilas} filas por importación.`);
  }

  return filas.map((fila) => {
    const segura = Object.create(null) as Record<string, unknown>;
    for (const clave of Object.keys(fila)) {
      const normalizada = clave.trim();
      if (!normalizada || CABECERAS_PELIGROSAS.has(normalizada.toLowerCase())) {
        throw new ArchivoImportacionInvalido("El archivo contiene una cabecera no permitida.");
      }
      segura[normalizada] = fila[clave];
    }
    return segura;
  });
}

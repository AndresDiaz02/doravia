import { describe, expect, it } from "vitest";
import { ArchivoImportacionInvalido, leerFilasImportacion } from "../lib/spreadsheet-import.js";

function archivo(nombre: string, contenido: string) {
  return { originalname: nombre, buffer: Buffer.from(contenido, "utf8") };
}

describe("importaciones de hojas de cálculo", () => {
  it("lee un CSV válido en objetos sin prototipo", () => {
    const [fila] = leerFilasImportacion(archivo("clientes.csv", "nombre,numero_documento\nAna,123"), 10);

    expect(fila.nombre).toBe("Ana");
    expect(Object.getPrototypeOf(fila)).toBeNull();
  });

  it("rechaza extensiones y archivos binarios que no corresponden", () => {
    expect(() => leerFilasImportacion(archivo("clientes.xls", "nombre\nAna"), 10))
      .toThrow(ArchivoImportacionInvalido);
    expect(() => leerFilasImportacion({ originalname: "clientes.csv", buffer: Buffer.from([0, 1, 2]) }, 10))
      .toThrow(ArchivoImportacionInvalido);
  });

  it("limita la cantidad de filas antes de importar", () => {
    expect(() => leerFilasImportacion(archivo("clientes.csv", "nombre\nAna\nBea"), 1))
      .toThrow("Máximo 1 filas");
  });
});

/** Calcula el arqueo en centavos para evitar errores de punto flotante. */
function aCentavos(valor: string | number): bigint {
  const texto = String(valor).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(texto)) throw new Error("Monto monetario inválido.");
  const negativo = texto.startsWith("-");
  const [entero, decimal = ""] = (negativo ? texto.slice(1) : texto).split(".");
  const centavos = BigInt(entero) * 100n + BigInt((decimal + "00").slice(0, 2));
  return negativo ? -centavos : centavos;
}

function desdeCentavos(valor: bigint): string {
  const signo = valor < 0n ? "-" : "";
  const absoluto = valor < 0n ? -valor : valor;
  return `${signo}${absoluto / 100n}.${String(absoluto % 100n).padStart(2, "0")}`;
}

export function calcularArqueoCiego(input: {
  montoInicial: string | number;
  ventasEfectivo: Array<string | number>;
  gastosCaja: Array<string | number>;
  devolucionesEfectivo: Array<string | number>;
  montoDeclarado: string | number;
}) {
  const sumar = (valores: Array<string | number>) => valores.reduce((total, valor) => total + aCentavos(valor), 0n);
  const esperado = aCentavos(input.montoInicial) + sumar(input.ventasEfectivo) - sumar(input.gastosCaja) - sumar(input.devolucionesEfectivo);
  const declarado = aCentavos(input.montoDeclarado);
  return { montoEsperado: desdeCentavos(esperado), montoDeclarado: desdeCentavos(declarado), diferencia: desdeCentavos(declarado - esperado) };
}

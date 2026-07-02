import { useState, useEffect, useRef, useCallback } from "react";
import type { CajaConfig } from "../pages/SeleccionCaja";

// Web Serial API types — not yet in TypeScript stdlib
interface SerialOptions { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; }
interface SerialPortLike {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface SerialAPILike { requestPort(): Promise<SerialPortLike>; }

export type GrameraStatus = "desconectada" | "conectando" | "lista" | "error";

export interface GrameraState {
  status: GrameraStatus;
  peso: number | null;
  unidad: string;
  conectar: () => Promise<void>;
  desconectar: () => void;
  limpiar: () => void;
  soportada: boolean;
}

function serialSoportada() {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

function getSerial(): SerialAPILike | null {
  if (!serialSoportada()) return null;
  return (navigator as unknown as { serial: SerialAPILike }).serial;
}

export function useGramera(cajaConfig: CajaConfig | null | undefined): GrameraState {
  const grameraConfig = cajaConfig?.gramera;
  const habilitada = grameraConfig?.habilitada === true;

  const [status, setStatus] = useState<GrameraStatus>("desconectada");
  const [peso, setPeso] = useState<number | null>(null);
  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  // Keyboard-wedge mode: listen for a standalone numeric line sent by the scale
  const bufferRef = useRef("");
  const lastKeyRef = useRef(0);

  const unidad = grameraConfig?.unidad ?? "kg";
  const regex = grameraConfig?.regex ?? "(\\d+\\.?\\d*)";

  function extraerPeso(raw: string): number | null {
    try {
      const m = raw.match(new RegExp(regex));
      if (m?.[1]) return parseFloat(m[1]);
    } catch { /* invalid regex from IA */ }
    return null;
  }

  // ── Keyboard-wedge mode ───────────────────────────────────────────────────
  useEffect(() => {
    if (!habilitada || grameraConfig?.tipo !== "keyboard") return;

    setStatus("lista");

    function handleKey(e: KeyboardEvent) {
      const now = Date.now();
      const gap = now - lastKeyRef.current;
      lastKeyRef.current = now;

      if (e.key === "Enter") {
        const linea = bufferRef.current.trim();
        bufferRef.current = "";
        if (linea) {
          const p = extraerPeso(linea);
          if (p !== null) setPeso(p);
        }
        return;
      }
      if (e.key.length === 1 && gap < 80) {
        bufferRef.current += e.key;
      } else if (e.key.length === 1) {
        bufferRef.current = e.key;
      } else {
        bufferRef.current = "";
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      setStatus("desconectada");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habilitada, grameraConfig?.tipo, regex]);

  // ── Serial mode ───────────────────────────────────────────────────────────
  const conectar = useCallback(async () => {
    if (!habilitada || grameraConfig?.tipo !== "serial") return;
    if (!serialSoportada()) { setStatus("error"); return; }

    setStatus("conectando");
    try {
      const serial = getSerial();
      if (!serial) { setStatus("error"); return; }
      const port = await serial.requestPort();
      await port.open({
        baudRate: grameraConfig.baudRate ?? 9600,
        dataBits: grameraConfig.dataBits ?? 8,
        stopBits: grameraConfig.stopBits ?? 1,
        parity: grameraConfig.parity ?? "none",
      });
      portRef.current = port;

      const decoder = new TextDecoderStream();
      void port.readable?.pipeTo(decoder.writable as WritableStream<Uint8Array>);
      const reader = decoder.readable.getReader();
      readerRef.current = reader;

      setStatus("lista");

      // Read loop
      let buf = "";
      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            const lines = buf.split(/[\r\n]+/);
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const p = extraerPeso(line);
              if (p !== null) setPeso(p);
            }
          }
        } catch {
          setStatus("desconectada");
        }
      };
      void readLoop();
    } catch {
      setStatus("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habilitada, grameraConfig?.tipo, grameraConfig?.baudRate, regex]);

  const desconectar = useCallback(() => {
    void readerRef.current?.cancel();
    void portRef.current?.close();
    readerRef.current = null;
    portRef.current = null;
    setStatus("desconectada");
    setPeso(null);
  }, []);

  const limpiar = useCallback(() => setPeso(null), []);

  if (!habilitada) {
    return {
      status: "desconectada",
      peso: null,
      unidad,
      conectar: async () => {},
      desconectar: () => {},
      limpiar: () => {},
      soportada: false,
    };
  }

  return {
    status,
    peso,
    unidad,
    conectar,
    desconectar,
    limpiar,
    soportada: grameraConfig?.tipo === "keyboard" || serialSoportada(),
  };
}

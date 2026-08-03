import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJE_KOK = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** Kütüphane dizini: APSIS_KUTUPHANE ile taşınabilir (ör. ortak bir ağ/Drive klasörü). */
export const KUTUPHANE_KOK = path.resolve(
  process.env.APSIS_KUTUPHANE || path.join(PROJE_KOK, 'kutuphane')
);

export const GUNLUK_DOSYASI = path.resolve(
  process.env.APSIS_GUNLUK_DOSYASI || path.join(PROJE_KOK, 'logs', 'sorular.jsonl')
);

/** @returns {{http: boolean, port: number, host: string}} */
export function argumanlariOku(argv = process.argv.slice(2)) {
  const http = argv.includes('--http');
  const portIndex = argv.indexOf('--port');
  const hostIndex = argv.indexOf('--host');
  return {
    http,
    port: Number(portIndex !== -1 ? argv[portIndex + 1] : process.env.PORT || 8787),
    host: hostIndex !== -1 ? argv[hostIndex + 1] : process.env.HOST || '127.0.0.1'
  };
}

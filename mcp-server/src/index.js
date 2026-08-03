#!/usr/bin/env node
/**
 * Apsis Kütüphane MCP sunucusu — giriş noktası.
 *
 *   node mcp-server/src/index.js                  → stdio (Claude Desktop, Claude Code, Cursor…)
 *   node mcp-server/src/index.js --http --port 8787 → Streamable HTTP (ekip için tek merkezî sunucu)
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { sunucuOlustur } from './server.js';
import { Kutuphane } from './indexer.js';
import { SoruGunlugu } from './log.js';
import { KUTUPHANE_KOK, GUNLUK_DOSYASI, argumanlariOku } from './config.js';

const { http: httpModu, port, host } = argumanlariOku();

// stdio modunda stdout protokole aittir; her türlü mesaj stderr'e yazılır.
const yaz = (mesaj) => process.stderr.write(`[apsis-kutuphane] ${mesaj}\n`);

const kutuphane = new Kutuphane(KUTUPHANE_KOK);
const gunluk = new SoruGunlugu(GUNLUK_DOSYASI);

const ist = await kutuphane.yenile();
yaz(`indeks hazır: ${ist.belgeSayisi} belge, ${ist.parcaSayisi} bölüm (${KUTUPHANE_KOK})`);
for (const uyari of ist.uyarilar) yaz(`uyarı: ${uyari}`);

if (!httpModu) {
  const { sunucu } = sunucuOlustur({ kutuphane, gunluk });
  await sunucu.connect(new StdioServerTransport());
  yaz('stdio aktarımı bağlandı');
} else {
  await httpBaslat();
}

async function httpBaslat() {
  const token = process.env.APSIS_TOKEN || '';
  if (!token && host !== '127.0.0.1' && host !== 'localhost') {
    yaz('DİKKAT: APSIS_TOKEN tanımlı değil, sunucu kimlik doğrulamasız dışa açılıyor.');
  }

  const httpSunucu = http.createServer(async (req, res) => {
    if (req.url === '/saglik') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ durum: 'ok', ...kutuphane.istatistik() }));
      return;
    }

    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404).end('Bulunamadı. MCP uç noktası: /mcp');
      return;
    }

    if (token) {
      const gelen = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (gelen !== token) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ hata: 'Yetkisiz: geçerli Bearer token gerekli' }));
        return;
      }
    }

    try {
      const govde = await govdeOku(req);
      // Durumsuz (stateless) mod: her istek kendi sunucu+aktarım çiftini kullanır,
      // indeks ve günlük ise paylaşılır.
      const { sunucu } = sunucuOlustur({ kutuphane, gunluk });
      const aktarim = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        aktarim.close();
        sunucu.close();
      });
      await sunucu.connect(aktarim);
      await aktarim.handleRequest(req, res, govde);
    } catch (hata) {
      yaz(`istek hatası: ${hata.stack || hata.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Sunucu hatası' },
          id: randomUUID()
        }));
      }
    }
  });

  httpSunucu.listen(port, host, () => {
    yaz(`HTTP aktarımı: http://${host}:${port}/mcp  (sağlık: /saglik)`);
    yaz(token ? 'kimlik doğrulama: Bearer token açık' : 'kimlik doğrulama: kapalı');
  });
}

function govdeOku(req) {
  if (req.method !== 'POST') return Promise.resolve(undefined);
  return new Promise((cozumle, reddet) => {
    let veri = '';
    req.on('data', (parca) => {
      veri += parca;
      if (veri.length > 4_000_000) reddet(new Error('İstek gövdesi çok büyük'));
    });
    req.on('end', () => {
      if (!veri) return cozumle(undefined);
      try {
        cozumle(JSON.parse(veri));
      } catch (hata) {
        reddet(new Error(`Geçersiz JSON: ${hata.message}`));
      }
    });
    req.on('error', reddet);
  });
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

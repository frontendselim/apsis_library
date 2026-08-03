import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const kok = '/Users/slmkcy/Desktop/apsis/apsis_library';
const transport = new StdioClientTransport({
  command: 'node',
  args: [`${kok}/mcp-server/src/index.js`],
  env: { ...process.env, APSIS_KULLANICI: 'test-kullanici' }
});
const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(transport);

console.log('--- instructions ---');
console.log((client.getInstructions() || '').slice(0, 200), '...\n');

const tools = await client.listTools();
console.log('--- tools ---');
for (const t of tools.tools) console.log(' •', t.name, '—', t.title);

const prompts = await client.listPrompts();
console.log('\n--- prompts ---', prompts.prompts.map((p) => p.name).join(', '));
const res = await client.listResources();
console.log('--- resources ---', res.resources.map((r) => r.uri).join(', '));

console.log('\n--- kutuphane_ara ---');
const ara = await client.callTool({
  name: 'kutuphane_ara',
  arguments: { soru: 'KOSGEB başvuru öncesi kontrol listesi', departman: 'kosgeb', limit: 2 }
});
console.log(ara.content[0].text.slice(0, 900));

console.log('\n--- departman_yonergesi ---');
const yon = await client.callTool({ name: 'departman_yonergesi', arguments: { departman: 'yatirim-tesvik' } });
console.log(yon.content[0].text.slice(0, 400));

console.log('\n--- belge_oku (bölüm) ---');
const oku = await client.callTool({
  name: 'belge_oku',
  arguments: { belge_id: 'kutuphane-kullanim', bolum: 'güncelleme döngüsü' }
});
console.log(oku.content[0].text.slice(0, 600));

console.log('\n--- belge_listele ---');
const liste = await client.callTool({ name: 'belge_listele', arguments: {} });
console.log(liste.content[0].text.slice(0, 700));

console.log('\n--- sonuçsuz arama ---');
const bos = await client.callTool({ name: 'kutuphane_ara', arguments: { soru: 'zeytinyağı ihracat kotası bulgaristan' } });
console.log(bos.content[0].text.slice(0, 400));

console.log('\n--- eksik_bilgi_bildir ---');
const eksik = await client.callTool({
  name: 'eksik_bilgi_bildir',
  arguments: { soru: 'zeytinyağı ihracat kotası', departman: 'e-ticaret', not: 'test' }
});
console.log(eksik.content[0].text);

console.log('\n--- kutuphane_durumu ---');
const durum = await client.callTool({ name: 'kutuphane_durumu', arguments: {} });
console.log(durum.content[0].text.slice(0, 800));

console.log('\n--- docx okundu mu ---');
const docx = await client.callTool({ name: 'kutuphane_ara', arguments: { soru: 'başvuru formu bölüm', limit: 3 } });
console.log(docx.content[0].text.slice(0, 500));

await client.close();
console.log('\nTAMAM');
process.exit(0);

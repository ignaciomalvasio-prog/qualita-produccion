// Publicación directa en Firebase Hosting (API REST), sin la herramienta de Firebase.
// Se usa como respaldo en el workflow cuando `firebase deploy` falla por la revisión de APIs habilitadas
// (permiso serviceusage.services.get), que esta vía no necesita.
// Lee la cuenta de servicio de la variable FIREBASE_SA y la configuración de firebase.json.
import { createSign, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SITE = process.env.SITE || 'qualita-produccion';
const API = 'https://firebasehosting.googleapis.com/v1beta1';
const sa = JSON.parse(process.env.FIREBASE_SA || '{}');
const cfg = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting;
const b64 = (x) => Buffer.from(x).toString('base64url');

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const s = createSign('RSA-SHA256'); s.update(head + '.' + body);
  const jwt = head + '.' + body + '.' + s.sign(sa.private_key).toString('base64url');
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt });
  const j = await r.json(); if (!j.access_token) throw new Error('No se pudo obtener el permiso: ' + JSON.stringify(j));
  return j.access_token;
}
async function llamar(tk, metodo, url, cuerpo, tipo) {
  const r = await fetch(url, { method: metodo, headers: { authorization: 'Bearer ' + tk, 'content-type': tipo || 'application/json' }, body: cuerpo == null ? undefined : (tipo ? cuerpo : JSON.stringify(cuerpo)) });
  const t = await r.text(); if (!r.ok) throw new Error(metodo + ' ' + url.replace(API, '') + ' → ' + r.status + ' ' + t.slice(0, 400));
  return t ? JSON.parse(t) : {};
}
function archivos(dir) {
  const out = [];
  (function ir(d) { for (const n of readdirSync(d)) { if (n.startsWith('.')) continue; const p = join(d, n); if (statSync(p).isDirectory()) ir(p); else out.push(p); } })(dir);
  return out;
}
const tk = await token();
const config = { cleanUrls: !!cfg.cleanUrls, headers: (cfg.headers || []).map((h) => ({ glob: h.source, headers: Object.fromEntries(h.headers.map((x) => [x.key, x.value])) })) };
const ver = await llamar(tk, 'POST', `${API}/sites/${SITE}/versions`, { config });
const files = {}, datos = {};
for (const p of archivos(cfg.public)) {
  const gz = gzipSync(readFileSync(p), { level: 9 });
  const h = createHash('sha256').update(gz).digest('hex');
  files['/' + relative(cfg.public, p).split(sep).join('/')] = h; datos[h] = gz;
}
const pop = await llamar(tk, 'POST', `${API}/${ver.name}:populateFiles`, { files });
for (const h of pop.uploadRequiredHashes || []) await llamar(tk, 'POST', `${pop.uploadUrl}/${h}`, datos[h], 'application/octet-stream');
await llamar(tk, 'PATCH', `${API}/${ver.name}?update_mask=status`, { status: 'FINALIZED' });
const rel = await llamar(tk, 'POST', `${API}/sites/${SITE}/releases?versionName=${encodeURIComponent(ver.name)}`, {});
console.log('Publicado:', Object.keys(files).length, 'archivos ·', (pop.uploadRequiredHashes || []).length, 'subidos ·', rel.name);

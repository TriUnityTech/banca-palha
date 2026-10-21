/* Deixa o app abrir sem internet (só consulta). Os dados em si vêm sempre do Supabase, nunca daqui.
   Troque VERSAO quando quiser forçar a limpeza do que ficou guardado no aparelho. */
const VERSAO = 'banca-v1';
const CASCA = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'css/phosphor.css',
  'fonts/outfit-latin-wght-normal.woff2', 'fonts/jetbrains-mono-latin-wght-normal.woff2', 'fonts/Phosphor.woff2',
  'js/config.js', 'js/domain.js', 'js/store.js', 'js/ui.js', 'js/views.js', 'js/app.js',
  'icons/icone-180.png', 'icons/icone-192.png', 'icons/icone-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

/* Rede primeiro (para sempre pegar a versão nova), cache só quando está sem internet. Outros sites (Supabase) passam direto. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

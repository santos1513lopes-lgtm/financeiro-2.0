 // Service Worker Básico
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Instalado');
});

self.addEventListener('fetch', (e) => {
  // Apenas responde normalmente (necessário para PWA funcionar)
  e.respondWith(fetch(e.request));
});
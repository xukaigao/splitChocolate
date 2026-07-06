/* 巧克力对半分 —— PWA 离线缓存
 * 策略：stale-while-revalidate
 *  - 优先返回缓存里的文件（离线也能秒开）
 *  - 同时后台联网拉最新版并写回缓存（下次打开就是新版）
 * 更新游戏文件后，把下面的 CACHE 版本号 +1 可强制刷新缓存。
 */
const CACHE = "splitchoco-v1";
const ASSETS = [
  ".",
  "index.html",
  "css/style.css",
  "js/game.js",
  "manifest.webmanifest",
  "icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached || (req.mode === "navigate" ? cache.match("index.html") : undefined));
        return cached || network;
      })
    )
  );
});

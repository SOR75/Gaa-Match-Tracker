// Update discovery never reloads, activates a waiting worker, or accesses match stores.
export async function registerOfflineApp({ onStatus, onUpdate,
  serviceWorker = navigator.serviceWorker, onlineTarget = window,
  isOnline = () => navigator.onLine } = {}) {
  const registration = await serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  let announced = false;
  const announce = (installed = false) => {
    if ((registration.waiting || installed) && serviceWorker.controller && !announced) {
      announced = true;
      onUpdate?.('An app update is ready. Close all Sideline tabs after the match to apply it.');
    }
  };
  const watch = () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => announce(worker.state === 'installed'));
    announce();
  };
  registration.addEventListener('updatefound', watch);
  watch();
  const check = () => {
    if (isOnline()) return registration.update().then(() => announce()).catch(() => {});
    return Promise.resolve();
  };
  onlineTarget.addEventListener('online', check);
  // An explicit check avoids relying only on the browser's periodic update cadence.
  void check();
  await serviceWorker.ready;
  onStatus?.(serviceWorker.controller ? 'Offline app ready' : 'App cached — reload once before going offline');
  announce();
  return registration;
}

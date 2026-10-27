import { SERVICE_WORKER_FILE, SKIP_WAITING_MESSAGE } from './sw/offlineCache.ts';

/**
 * Keeps the offline copy (sw.js) registered and offers newer builds. The page always opens from the copy; a newer
 * build installs in the background and waits until the viewer reloads into it. The first install replaces nothing,
 * so it offers nothing. DOM-free, so it is testable in Node; src/main.ts passes the browser's objects.
 */
export interface WaitingWorker {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

export interface WorkerRegistration {
  readonly installing: WaitingWorker | null;
  readonly waiting: WaitingWorker | null;
  update(): Promise<unknown>;
  addEventListener(type: 'updatefound', listener: () => void): void;
}

export interface WorkerContainer {
  readonly controller: object | null;
  register(url: string, options: { readonly scope: string }): Promise<WorkerRegistration>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

export interface UpdateHooks {
  /** A newer build is ready; `apply` switches to it and then `reload` runs. */
  onUpdateReady(apply: () => void): void;
  reload(): void;
  /** Installed apps on phones resume without loading the page again, so they ask for a newer build on each resume. */
  onResume(listener: () => void): void;
}

export async function keepOfflineCopy(container: WorkerContainer, hooks: UpdateHooks): Promise<void> {
  let applying = false;
  container.addEventListener('controllerchange', () => {
    // Another tab that switched builds switches this tab's worker too; this tab keeps the build it has loaded.
    if (!applying) return;
    applying = false;
    hooks.reload();
  });

  const registration = await container.register(SERVICE_WORKER_FILE, { scope: './' });
  const offer = (worker: WaitingWorker) =>
    hooks.onUpdateReady(() => {
      applying = true;
      worker.postMessage(SKIP_WAITING_MESSAGE);
    });
  const replacesBuild = () => container.controller !== null;

  if (registration.waiting !== null && replacesBuild()) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (worker === null) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && replacesBuild()) offer(worker);
    });
  });
  hooks.onResume(() => {
    // Fails while offline; the copy keeps working and the next resume asks again.
    registration.update().catch(() => undefined);
  });
}

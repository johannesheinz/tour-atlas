import { describe, expect, it } from 'vitest';
import { keepOfflineCopy, type UpdateHooks, type WaitingWorker, type WorkerContainer, type WorkerRegistration } from '../../src/serviceWorkerUpdates.ts';
import { SERVICE_WORKER_FILE, SKIP_WAITING_MESSAGE } from '../../src/sw/offlineCache.ts';

class FakeWorker implements WaitingWorker {
  state = 'installing';
  readonly messages: unknown[] = [];
  private readonly listeners: (() => void)[] = [];
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  addEventListener(_type: 'statechange', listener: () => void) {
    this.listeners.push(listener);
  }
  become(state: string) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

function fakeBrowser(options: { controlled: boolean; waiting?: FakeWorker; updateFails?: boolean }) {
  const updateFoundListeners: (() => void)[] = [];
  const controllerChangeListeners: (() => void)[] = [];
  const registered: { url: string; scope: string }[] = [];
  let updateChecks = 0;
  const registration: WorkerRegistration & { installing: FakeWorker | null } = {
    installing: null,
    waiting: options.waiting ?? null,
    update: () => {
      updateChecks += 1;
      return options.updateFails === true ? Promise.reject(new TypeError('Failed to update: offline')) : Promise.resolve();
    },
    addEventListener: (_type, listener) => updateFoundListeners.push(listener),
  };
  const container: WorkerContainer = {
    controller: options.controlled ? {} : null,
    register: async (url, { scope }) => {
      registered.push({ url, scope });
      return registration;
    },
    addEventListener: (_type, listener) => controllerChangeListeners.push(listener),
  };
  const offers: (() => void)[] = [];
  const resumeListeners: (() => void)[] = [];
  let reloads = 0;
  const hooks: UpdateHooks = {
    onUpdateReady: (apply) => offers.push(apply),
    reload: () => (reloads += 1),
    onResume: (listener) => resumeListeners.push(listener),
  };
  return {
    container,
    hooks,
    registered,
    offers,
    reloads: () => reloads,
    updateChecks: () => updateChecks,
    findUpdate(worker: FakeWorker) {
      registration.installing = worker;
      for (const listener of updateFoundListeners) listener();
    },
    changeController: () => controllerChangeListeners.forEach((listener) => listener()),
    resume: () => resumeListeners.forEach((listener) => listener()),
  };
}

describe('keepOfflineCopy', () => {
  it('registers sw.js for the whole site and offers nothing on the first install', async () => {
    const browser = fakeBrowser({ controlled: false });
    await keepOfflineCopy(browser.container, browser.hooks);
    const worker = new FakeWorker();
    browser.findUpdate(worker);
    worker.become('installed');
    expect(browser.registered).toEqual([{ url: SERVICE_WORKER_FILE, scope: './' }]);
    expect(browser.offers).toEqual([]);
  });

  it('offers a newer build once it is installed and reloads after the viewer applies it', async () => {
    const browser = fakeBrowser({ controlled: true });
    await keepOfflineCopy(browser.container, browser.hooks);
    const worker = new FakeWorker();
    browser.findUpdate(worker);
    expect(browser.offers).toHaveLength(0);
    worker.become('installed');
    expect(browser.offers).toHaveLength(1);

    browser.offers[0]?.();
    expect(worker.messages).toEqual([SKIP_WAITING_MESSAGE]);
    expect(browser.reloads()).toBe(0);
    browser.changeController();
    expect(browser.reloads()).toBe(1);
  });

  it('offers a build that was already waiting when the page loaded', async () => {
    const waiting = new FakeWorker();
    waiting.state = 'installed';
    const browser = fakeBrowser({ controlled: true, waiting });
    await keepOfflineCopy(browser.container, browser.hooks);
    expect(browser.offers).toHaveLength(1);
  });

  it('keeps running when another tab switched builds', async () => {
    const browser = fakeBrowser({ controlled: true });
    await keepOfflineCopy(browser.container, browser.hooks);
    browser.changeController();
    expect(browser.reloads()).toBe(0);
  });

  it('asks for a newer build on each resume and shrugs off failing while offline', async () => {
    const browser = fakeBrowser({ controlled: true, updateFails: true });
    await keepOfflineCopy(browser.container, browser.hooks);
    browser.resume();
    browser.resume();
    await Promise.resolve();
    expect(browser.updateChecks()).toBe(2);
  });
});

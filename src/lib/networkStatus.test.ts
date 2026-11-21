import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_NETWORK_STATUS,
  completeRestoredAnimation,
  createInitialNetworkStatus,
  probeConnectivity,
  transitionToOffline,
  transitionToOnline,
} from './networkStatus.js';

test('createInitialNetworkStatus starts online when navigator.onLine is true and offline when false', () => {
  assert.deepEqual(createInitialNetworkStatus(true), {
    phase: 'online',
    hasBeenOffline: false,
  });
  assert.deepEqual(createInitialNetworkStatus(false), {
    phase: 'offline',
    hasBeenOffline: true,
  });
});

test('transitionToOnline ignores spurious online event when user was never offline', () => {
  const next = transitionToOnline(INITIAL_NETWORK_STATUS);
  assert.deepEqual(next, {
    phase: 'online',
    hasBeenOffline: false,
  });
});

test('offline -> online -> completeRestoredAnimation cycles cleanly through restored phase', () => {
  const offlineState = transitionToOffline(INITIAL_NETWORK_STATUS);
  assert.deepEqual(offlineState, {
    phase: 'offline',
    hasBeenOffline: true,
  });

  const restoredState = transitionToOnline(offlineState);
  assert.deepEqual(restoredState, {
    phase: 'restored',
    hasBeenOffline: true,
  });

  const backToNormal = completeRestoredAnimation(restoredState);
  assert.deepEqual(backToNormal, {
    phase: 'online',
    hasBeenOffline: false,
  });
});

test('completeRestoredAnimation does not clear state if browser dropped offline again mid-celebration', () => {
  const offlineAgain = transitionToOffline(transitionToOnline(transitionToOffline(INITIAL_NETWORK_STATUS)));
  assert.deepEqual(completeRestoredAnimation(offlineAgain), {
    phase: 'offline',
    hasBeenOffline: true,
  });
});

test('probeConnectivity returns false immediately when navigator is offline without calling fetch', async () => {
  let called = false;
  const ok = await probeConnectivity({
    isNavigatorOnline: () => false,
    fetchFn: async () => {
      called = true;
      return new Response('ok', { status: 200 });
    },
  });
  assert.equal(ok, false);
  assert.equal(called, false);
});

test('probeConnectivity returns true on 200 OK and false on network failure or 5xx', async () => {
  const ok = await probeConnectivity({
    isNavigatorOnline: () => true,
    fetchFn: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  });
  assert.equal(ok, true);

  const failedStatus = await probeConnectivity({
    isNavigatorOnline: () => true,
    fetchFn: async () => new Response('down', { status: 503 }),
  });
  assert.equal(failedStatus, false);

  const threw = await probeConnectivity({
    isNavigatorOnline: () => true,
    fetchFn: async () => {
      throw new Error('Failed to fetch');
    },
  });
  assert.equal(threw, false);
});

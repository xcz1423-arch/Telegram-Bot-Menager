export type NetworkOverlayPhase = 'online' | 'offline' | 'restored';

export interface NetworkStatusState {
  phase: NetworkOverlayPhase;
  hasBeenOffline: boolean;
}

export const INITIAL_NETWORK_STATUS: NetworkStatusState = {
  phase: 'online',
  hasBeenOffline: false,
};

export function createInitialNetworkStatus(isNavigatorOnline: boolean): NetworkStatusState {
  if (!isNavigatorOnline) {
    return {
      phase: 'offline',
      hasBeenOffline: true,
    };
  }
  return INITIAL_NETWORK_STATUS;
}

export function transitionToOffline(state: NetworkStatusState): NetworkStatusState {
  if (state.phase === 'offline' && state.hasBeenOffline) {
    return state;
  }
  return {
    phase: 'offline',
    hasBeenOffline: true,
  };
}

export function transitionToOnline(state: NetworkStatusState): NetworkStatusState {
  // Never flash "You're Back Online!" on initial boot if the browser was never offline.
  if (!state.hasBeenOffline && state.phase !== 'offline') {
    return INITIAL_NETWORK_STATUS;
  }
  return {
    phase: 'restored',
    hasBeenOffline: true,
  };
}

export function completeRestoredAnimation(state: NetworkStatusState): NetworkStatusState {
  if (state.phase === 'offline') {
    return state;
  }
  return INITIAL_NETWORK_STATUS;
}

export interface ProbeConnectivityOptions {
  fetchFn?: typeof fetch;
  isNavigatorOnline?: () => boolean;
  endpoint?: string;
  timeoutMs?: number;
}

export async function probeConnectivity(options: ProbeConnectivityOptions = {}): Promise<boolean> {
  const {
    fetchFn = fetch,
    isNavigatorOnline = () => (typeof navigator !== 'undefined' ? navigator.onLine : true),
    endpoint = '/api/health',
    timeoutMs = 3500,
  } = options;

  if (!isNavigatorOnline()) {
    return false;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetchFn(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
      signal: controller?.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

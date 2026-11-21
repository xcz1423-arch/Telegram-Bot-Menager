import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeRestoredAnimation,
  createInitialNetworkStatus,
  probeConnectivity,
  transitionToOffline,
  transitionToOnline,
  type NetworkStatusState,
} from '../../lib/networkStatus';

const OFFLINE_IMAGE_PATH = '/assets/aistudio/IMG_20261121_232703_289_05198686.jpg';
const ONLINE_IMAGE_PATH = '/assets/aistudio/IMG_20261121_232704_010_ef36d007.jpg';

interface OfflineDetectionOverlayProps {
  onRestored?: () => void;
}

export const OfflineDetectionOverlay: React.FC<OfflineDetectionOverlayProps> = ({ onRestored }) => {
  const [status, setStatus] = useState<NetworkStatusState>(() =>
    createInitialNetworkStatus(typeof navigator !== 'undefined' ? navigator.onLine : true)
  );
  const [checking, setChecking] = useState(false);
  const [cachedOfflineSrc, setCachedOfflineSrc] = useState<string>(OFFLINE_IMAGE_PATH);
  const [cachedOnlineSrc, setCachedOnlineSrc] = useState<string>(ONLINE_IMAGE_PATH);

  const onRestoredRef = useRef(onRestored);
  onRestoredRef.current = onRestored;

  // Preload both local images into memory as data URLs so they render reliably even when offline
  useEffect(() => {
    let active = true;

    const preloadAsDataUrl = async (url: string, apply: (dataUrl: string) => void) => {
      try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) return;
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (active && typeof reader.result === 'string') {
            apply(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } catch {
        // Fallback stays on direct local asset path
      }
    };

    void preloadAsDataUrl(OFFLINE_IMAGE_PATH, setCachedOfflineSrc);
    void preloadAsDataUrl(ONLINE_IMAGE_PATH, setCachedOnlineSrc);

    return () => {
      active = false;
    };
  }, []);

  const triggerRestoredFlow = useCallback(() => {
    setStatus((prev) => transitionToOnline(prev));
    onRestoredRef.current?.();
  }, []);

  useEffect(() => {
    const onOffline = () => {
      setStatus((prev) => transitionToOffline(prev));
    };

    const onOnline = () => {
      setStatus((prev) => {
        if (!prev.hasBeenOffline && prev.phase !== 'offline') {
          return prev;
        }
        onRestoredRef.current?.();
        return transitionToOnline(prev);
      });
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      onOffline();
    }

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Periodic connectivity check while offline
  useEffect(() => {
    if (status.phase !== 'offline') return;

    const interval = window.setInterval(async () => {
      const ok = await probeConnectivity();
      if (ok) {
        triggerRestoredFlow();
      }
    }, 6000);

    return () => window.clearInterval(interval);
  }, [status.phase, triggerRestoredFlow]);

  // Return cleanly to the app page after displaying the Online image
  useEffect(() => {
    if (status.phase !== 'restored') return;

    const doneTimer = window.setTimeout(() => {
      setStatus((prev) => completeRestoredAnimation(prev));
    }, 2000);

    return () => {
      window.clearTimeout(doneTimer);
    };
  }, [status.phase]);

  const handleRetry = async () => {
    if (checking) return;
    setChecking(true);
    const ok = await probeConnectivity();
    setChecking(false);
    if (ok) {
      triggerRestoredFlow();
    }
  };

  if (status.phase === 'online') {
    return null;
  }

  const isRestored = status.phase === 'restored';

  return (
    <div
      data-no-smallcaps="true"
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-label={isRestored ? "You're Online!" : 'No Internet Connection'}
      className="fixed inset-0 z-[9999] flex items-center justify-center select-none"
      style={{ backgroundColor: isRestored ? '#02070D' : '#020206' }}
    >
      {isRestored ? (
        <div
          className="relative inline-flex items-center justify-center"
          style={{
            WebkitMaskImage: 'radial-gradient(ellipse 94% 94% at 50% 50%, #000 78%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 94% 94% at 50% 50%, #000 78%, transparent 100%)',
          }}
        >
          <img
            src={cachedOnlineSrc}
            alt="You're Online! Internet connection is active."
            className="max-w-full max-h-screen w-auto h-auto object-contain block"
            draggable={false}
          />
        </div>
      ) : (
        <div
          className="relative inline-flex items-center justify-center"
          style={{
            WebkitMaskImage: 'radial-gradient(ellipse 94% 94% at 50% 50%, #000 78%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 94% 94% at 50% 50%, #000 78%, transparent 100%)',
          }}
        >
          <img
            src={cachedOfflineSrc}
            alt="No Internet Connection. Looks like you're offline. Please check your internet connection and try again."
            className="max-w-full max-h-screen w-auto h-auto object-contain block"
            draggable={false}
          />
          <button
            type="button"
            onClick={handleRetry}
            disabled={checking}
            aria-label="Retry"
            title="Retry"
            className="absolute bottom-[6%] left-1/2 -translate-x-1/2 w-[26%] h-[13%] rounded-full bg-transparent cursor-pointer focus:outline-none"
          />
        </div>
      )}
    </div>
  );
};

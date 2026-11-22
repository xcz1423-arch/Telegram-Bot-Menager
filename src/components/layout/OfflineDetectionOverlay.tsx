import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
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
  const [retryFeedback, setRetryFeedback] = useState(false);
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
    setRetryFeedback(false);
    setStatus((prev) => transitionToOnline(prev));
    onRestoredRef.current?.();
  }, []);

  useEffect(() => {
    const onOffline = () => {
      setRetryFeedback(false);
      setStatus((prev) => transitionToOffline(prev));
    };

    const onOnline = () => {
      setStatus((prev) => {
        if (!prev.hasBeenOffline && prev.phase !== 'offline') {
          return prev;
        }
        setRetryFeedback(false);
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
    setRetryFeedback(false);

    const start = Date.now();
    const ok = await probeConnectivity();
    const elapsed = Date.now() - start;
    if (elapsed < 350) {
      await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
    }

    setChecking(false);
    if (ok) {
      triggerRestoredFlow();
    } else {
      setRetryFeedback(true);
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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 select-none overflow-y-auto"
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
            className="max-w-full max-h-[94vh] w-auto h-auto object-contain block"
            draggable={false}
          />
        </div>
      ) : (
        <div className="relative flex flex-col items-center justify-center w-full max-w-[760px]">
          <div
            className="w-full aspect-[1280/690] overflow-hidden"
            style={{
              WebkitMaskImage:
                'radial-gradient(ellipse 96% 98% at 50% 48%, #000 84%, transparent 100%)',
              maskImage:
                'radial-gradient(ellipse 96% 98% at 50% 48%, #000 84%, transparent 100%)',
            }}
          >
            <img
              src={cachedOfflineSrc}
              alt="No Internet Connection. Looks like you're offline. Please check your internet connection and try again."
              className="w-full h-full object-cover object-top block"
              draggable={false}
            />
          </div>

          <div className="mt-3 sm:mt-4 w-full max-w-[540px] flex items-center justify-center gap-4 px-2">
            <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent to-[#6E49FF]/75" />
            <button
              type="button"
              onClick={handleRetry}
              disabled={checking}
              className="inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#724CFF] to-[#7D4AFF] hover:from-[#805CFF] hover:to-[#8B5CF6] active:scale-[0.97] disabled:opacity-75 px-9 sm:px-11 py-3 text-base sm:text-lg font-semibold text-white shadow-[0_8px_28px_rgba(114,76,255,0.45)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
            >
              <RotateCw className={`w-5 h-5 ${checking ? 'animate-spin' : ''}`} strokeWidth={2.4} />
              <span>{checking ? 'Checking...' : 'Retry'}</span>
            </button>
            <div className="h-[1.5px] flex-1 bg-gradient-to-l from-transparent to-[#6E49FF]/75" />
          </div>

          {retryFeedback && (
            <p className="mt-3 text-xs sm:text-sm text-rose-300/90 font-medium text-center">
              Still offline — please check your internet connection.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

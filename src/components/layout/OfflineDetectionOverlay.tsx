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

interface OfflineDetectionOverlayProps {
  onRestored?: () => void;
}

function OfflineAstronautScene() {
  return (
    <div className="relative mx-auto w-[300px] sm:w-[390px] h-[200px] sm:h-[240px] select-none pointer-events-none">
      {/* Subtle violet ambient glow behind astronaut & Wi-Fi */}
      <div
        className="absolute inset-x-8 top-4 bottom-2 rounded-full blur-3xl opacity-75"
        style={{
          background:
            'radial-gradient(circle at 48% 52%, rgba(124, 58, 237, 0.24) 0%, rgba(79, 70, 229, 0.1) 52%, transparent 76%)',
        }}
      />

      <svg
        viewBox="0 0 420 255"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 w-full h-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="xcSadMoonGrad" cx="50%" cy="18%" r="82%">
            <stop offset="0%" stopColor="#3B3F6E" />
            <stop offset="55%" stopColor="#1E2242" />
            <stop offset="100%" stopColor="#090B17" stopOpacity="0.95" />
          </radialGradient>
          <linearGradient id="xcSadSuitGrad" x1="110" y1="65" x2="188" y2="195" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F5F3FF" />
            <stop offset="55%" stopColor="#D6D9F8" />
            <stop offset="100%" stopColor="#8992C7" />
          </linearGradient>
          <linearGradient id="xcSadVisorGrad" x1="142" y1="74" x2="188" y2="122" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#141831" />
            <stop offset="70%" stopColor="#080A18" />
            <stop offset="100%" stopColor="#04050D" />
          </linearGradient>
          <linearGradient id="xcSadWifiGrad" x1="230" y1="70" x2="310" y2="175" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#C4C9EE" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#7C83B8" stopOpacity="0.72" />
          </linearGradient>
        </defs>

        {/* Soft dark space clouds */}
        <path
          d="M18 190 C28 168, 56 164, 70 176 C84 156, 114 162, 122 184 L18 196 Z"
          fill="#121528"
          opacity="0.75"
        />
        <path
          d="M312 188 C326 168, 356 170, 366 184 C380 170, 404 176, 412 196 L308 198 Z"
          fill="#121528"
          opacity="0.75"
        />

        {/* Twinkling purple 4-point stars */}
        <g className="xc-star-twinkle" style={{ animationDelay: '0s' }}>
          <path d="M98 46 L101 52.5 L107.5 55.5 L101 58.5 L98 65 L95 58.5 L88.5 55.5 L95 52.5 Z" fill="#8B5CF6" />
        </g>
        <g className="xc-star-twinkle" style={{ animationDelay: '0.8s' }}>
          <path d="M352 72 L354.5 77.5 L360 80 L354.5 82.5 L352 88 L349.5 82.5 L344 80 L349.5 77.5 Z" fill="#8B5CF6" />
        </g>
        <g className="xc-star-twinkle" style={{ animationDelay: '1.4s' }}>
          <path d="M68 124 L69.8 128 L74 129.8 L69.8 131.6 L68 135.8 L66.2 131.6 L62 129.8 L66.2 128 Z" fill="#A78BFA" />
        </g>
        <circle cx="290" cy="48" r="1.8" fill="#8B5CF6" opacity="0.75" />
        <circle cx="216" cy="40" r="1.5" fill="#A78BFA" opacity="0.65" />
        <circle cx="34" cy="96" r="1.4" fill="#6366F1" opacity="0.55" />

        {/* Worried floating squiggle swirl above helmet */}
        <path
          d="M198 18 C210 16, 214 25, 202 29 C191 33, 214 38, 205 46 C196 51, 211 55, 203 61"
          stroke="#94A3B8"
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
          className="xc-swirl-float"
        />

        {/* Moon dome & craters */}
        <path
          d="M28 228 C110 176, 310 176, 392 228 L392 246 L28 246 Z"
          fill="url(#xcSadMoonGrad)"
        />
        <ellipse cx="148" cy="204" rx="22" ry="6" fill="#0B0E1D" opacity="0.55" />
        <ellipse cx="222" cy="212" rx="14" ry="4.2" fill="#0B0E1D" opacity="0.5" />
        <ellipse cx="322" cy="214" rx="18" ry="5" fill="#0B0E1D" opacity="0.5" />
        <ellipse cx="96" cy="222" rx="12" ry="3.5" fill="#0B0E1D" opacity="0.45" />
        {/* Small moon rocks */}
        <path d="M58 212 L72 200 L86 208 L90 218 L54 218 Z" fill="#464A7A" />
        <path d="M72 200 L86 208 L78 216 L66 216 Z" fill="#2A2E54" />
        <path d="M274 195 L292 178 L314 188 L318 202 L268 202 Z" fill="#464A7A" />
        <path d="M292 178 L314 188 L302 200 L286 200 Z" fill="#282B4E" />

        {/* Disconnected tilted Wi-Fi icon with Red Cross Badge */}
        <g className="xc-wifi-wave" transform="rotate(8 280 120)">
          <path
            d="M226 94 C256 64, 304 64, 334 94"
            stroke="url(#xcSadWifiGrad)"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M244 116 C264 96, 296 96, 316 116"
            stroke="url(#xcSadWifiGrad)"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M262 138 C272 128, 288 128, 298 138"
            stroke="url(#xcSadWifiGrad)"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <circle cx="280" cy="158" r="9.5" fill="#A5ACE0" opacity="0.9" />
        </g>

        {/* Vibrant Red Circle Badge with Crisp White X */}
        <g style={{ filter: 'drop-shadow(0 0 12px rgba(239, 68, 68, 0.72))' }}>
          <circle cx="298" cy="156" r="20" fill="#EF4444" stroke="#090B17" strokeWidth="2.5" />
          <path
            d="M291 149 L305 163 M305 149 L291 163"
            stroke="#FFFFFF"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
        </g>

        {/* Sad curled-up Astronaut hugging knees */}
        <g className="xc-astro-float">
          {/* Contact shadow */}
          <ellipse cx="164" cy="202" rx="40" ry="7" fill="#060812" opacity="0.7" />

          {/* Backpack */}
          <rect x="108" y="114" width="26" height="48" rx="9" transform="rotate(-10 108 114)" fill="#7A83BA" stroke="#1E1B4B" strokeWidth="2" />
          <rect x="114" y="122" width="12" height="16" rx="4" transform="rotate(-10 114 122)" fill="#A5B0E6" />
          <circle cx="122" cy="147" r="2.5" fill="#1E1B4B" />

          {/* Curled torso */}
          <path
            d="M124 134 C122 158, 128 186, 152 194 L182 194 C190 194, 194 182, 186 172 C176 154, 162 132, 140 128 Z"
            fill="url(#xcSadSuitGrad)"
            stroke="#1E1B4B"
            strokeWidth="2.4"
          />

          {/* Raised knees */}
          <path
            d="M156 156 C168 148, 186 154, 192 172 C196 184, 188 196, 174 196 L154 196 Z"
            fill="#DCE1FA"
            stroke="#1E1B4B"
            strokeWidth="2.2"
          />
          {/* Boots */}
          <rect x="172" y="184" width="24" height="13" rx="6.5" fill="#9AA3D8" stroke="#1E1B4B" strokeWidth="2" />
          <rect x="150" y="188" width="24" height="12" rx="6" fill="#7D86BF" stroke="#1E1B4B" strokeWidth="2" />

          {/* Wrapped arms hugging knees */}
          <path
            d="M144 138 C162 140, 178 148, 186 164 C189 170, 180 175, 172 172 C160 166, 150 158, 138 152 Z"
            fill="#EEF1FF"
            stroke="#1E1B4B"
            strokeWidth="2.2"
          />
          {/* XC Shoulder Patch */}
          <circle cx="142" cy="136" r="9.5" fill="#1E2448" stroke="#8B95D1" strokeWidth="1.5" />
          <text
            x="142"
            y="139.5"
            textAnchor="middle"
            fill="#E2E8F0"
            fontSize="8.5"
            fontWeight="800"
            fontFamily="sans-serif"
          >
            XC
          </text>

          {/* Helmet tilted slightly down */}
          <circle cx="164" cy="96" r="38" fill="url(#xcSadSuitGrad)" stroke="#1E1B4B" strokeWidth="2.5" />
          {/* Left ear cap */}
          <ellipse cx="128" cy="92" rx="8" ry="12" fill="#9AA4DA" stroke="#1E1B4B" strokeWidth="2" />
          {/* Dark Visor */}
          <ellipse cx="172" cy="100" rx="26" ry="24" fill="url(#xcSadVisorGrad)" stroke="#3F487A" strokeWidth="2" />
          {/* Visor subtle top shine */}
          <path
            d="M156 85 C164 78, 178 78, 185 84"
            stroke="#64748B"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.5"
          />
          {/* Sad downcast closed crescent eyes */}
          <path d="M156 99 C158 104, 165 104, 167 99" stroke="#F8FAFC" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M178 99 C180 104, 187 104, 189 99" stroke="#F8FAFC" strokeWidth="2.4" strokeLinecap="round" />
          {/* Tiny sad frown */}
          <path d="M168 111 C171 108.5, 175 108.5, 178 111" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

function OnlineAstronautScene() {
  return (
    <div className="relative mx-auto w-[310px] sm:w-[400px] h-[200px] sm:h-[235px] select-none pointer-events-none">
      {/* Emerald radial aura */}
      <div
        className="absolute inset-x-8 top-2 bottom-2 rounded-full blur-3xl opacity-80"
        style={{
          background:
            'radial-gradient(circle at 52% 46%, rgba(34, 197, 94, 0.28) 0%, rgba(16, 185, 129, 0.12) 55%, transparent 78%)',
        }}
      />

      <svg
        viewBox="0 0 420 245"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 w-full h-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="xcOnlineMoonGrad" cx="50%" cy="15%" r="85%">
            <stop offset="0%" stopColor="#264C6E" />
            <stop offset="55%" stopColor="#122742" />
            <stop offset="100%" stopColor="#07101F" stopOpacity="0.96" />
          </radialGradient>
          <linearGradient id="xcOnlineSuitGrad" x1="140" y1="50" x2="215" y2="180" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="58%" stopColor="#D7E3F8" />
            <stop offset="100%" stopColor="#7C96C2" />
          </linearGradient>
          <linearGradient id="xcOnlineVisorGrad" x1="162" y1="62" x2="206" y2="104" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#162238" />
            <stop offset="70%" stopColor="#070C18" />
            <stop offset="100%" stopColor="#03060E" />
          </linearGradient>
          <linearGradient id="xcEmeraldBadge" x1="255" y1="58" x2="310" y2="122" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#16A34A" />
          </linearGradient>
        </defs>

        {/* Background soft dark clouds */}
        <path
          d="M14 185 C28 158, 62 158, 76 172 C92 152, 124 160, 132 184 L14 192 Z"
          fill="#0E1B2E"
          opacity="0.72"
        />
        <path
          d="M312 185 C326 164, 358 164, 370 178 C384 164, 408 172, 416 192 L308 194 Z"
          fill="#0E1B2E"
          opacity="0.72"
        />

        {/* Twinkling green 4-point stars */}
        <g className="xc-star-twinkle" style={{ animationDelay: '0s' }}>
          <path d="M126 30 L128.5 36.5 L135 39 L128.5 41.5 L126 48 L123.5 41.5 L117 39 L123.5 36.5 Z" fill="#4ADE80" />
        </g>
        <g className="xc-star-twinkle" style={{ animationDelay: '0.6s' }}>
          <path d="M100 66 L102 71.5 L107.5 73.5 L102 75.5 L100 81 L98 75.5 L92.5 73.5 L98 71.5 Z" fill="#34D399" />
        </g>
        <g className="xc-star-twinkle" style={{ animationDelay: '1.1s' }}>
          <path d="M342 46 L344.2 51.2 L349.5 53.5 L344.2 55.8 L342 61 L339.8 55.8 L334.5 53.5 L339.8 51.2 Z" fill="#4ADE80" />
        </g>
        <g className="xc-star-twinkle" style={{ animationDelay: '1.5s' }}>
          <path d="M48 148 L50 153 L55 155 L50 157 L48 162 L46 157 L41 155 L46 153 Z" fill="#22C55E" />
        </g>
        <circle cx="236" cy="36" r="1.6" fill="#4ADE80" opacity="0.75" />
        <circle cx="378" cy="96" r="1.6" fill="#34D399" opacity="0.75" />
        <circle cx="370" cy="144" r="2" fill="#4ADE80" opacity="0.8" />

        {/* Back arc of glowing green orbital ribbon */}
        <path
          d="M112 138 C70 150, 92 114, 160 88 C236 60, 326 42, 344 64 C354 78, 324 98, 286 112"
          stroke="#22C55E"
          strokeWidth="4.2"
          strokeLinecap="round"
          fill="none"
          className="xc-orbit-glow"
        />

        {/* Curved Moon Dome with craters */}
        <path
          d="M26 226 C118 164, 302 164, 394 226 L394 244 L26 244 Z"
          fill="url(#xcOnlineMoonGrad)"
        />
        <ellipse cx="144" cy="196" rx="22" ry="6.5" fill="#0B1628" opacity="0.55" />
        <ellipse cx="268" cy="198" rx="20" ry="6" fill="#0B1628" opacity="0.55" />
        <ellipse cx="104" cy="212" rx="14" ry="4" fill="#0B1628" opacity="0.48" />
        <ellipse cx="322" cy="215" rx="14" ry="4" fill="#0B1628" opacity="0.48" />

        {/* Happy Thumbs-Up Astronaut */}
        <g className="xc-astro-float">
          {/* Contact shadow */}
          <ellipse cx="192" cy="176" rx="34" ry="6.5" fill="#060D1A" opacity="0.65" />

          {/* Backpack */}
          <rect x="142" y="102" width="24" height="44" rx="8" fill="#7D96C4" stroke="#0F172A" strokeWidth="2.2" />
          <circle cx="152" cy="116" r="4" fill="#22C55E" />

          {/* Left stabilizing arm */}
          <path
            d="M158 118 C148 130, 144 146, 146 158 C148 164, 158 164, 160 156 L168 134 Z"
            fill="#DCE6FA"
            stroke="#0F172A"
            strokeWidth="2.2"
          />

          {/* Sitting legs */}
          <path
            d="M168 140 C166 156, 174 168, 190 174 L204 174 C210 174, 210 162, 200 158 L188 150 L188 134 Z"
            fill="url(#xcOnlineSuitGrad)"
            stroke="#0F172A"
            strokeWidth="2.2"
          />
          <path
            d="M190 138 C194 154, 204 166, 220 170 L234 170 C238 170, 238 158, 228 154 L212 146 L208 132 Z"
            fill="#C7D7F5"
            stroke="#0F172A"
            strokeWidth="2.2"
          />
          {/* Boots */}
          <rect x="190" y="164" width="22" height="12" rx="6" fill="#94A8D1" stroke="#0F172A" strokeWidth="2" />
          <rect x="218" y="159" width="22" height="12" rx="6" fill="#B6C8EB" stroke="#0F172A" strokeWidth="2" />

          {/* Torso */}
          <rect x="164" y="102" width="44" height="42" rx="14" fill="url(#xcOnlineSuitGrad)" stroke="#0F172A" strokeWidth="2.4" />
          {/* Glowing Green Chest Wi-Fi Badge */}
          <rect x="176" y="112" width="22" height="18" rx="4" fill="#0B192C" stroke="#64748B" strokeWidth="1.5" />
          <path d="M181 119 C185 115.5, 190 115.5, 194 119" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" />
          <path d="M183.5 123 C186 121, 189 121, 191.5 123" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" />
          <circle cx="187.5" cy="126.5" r="1.4" fill="#86EFAC" />

          {/* Right Arm Raised giving Thumbs Up! */}
          <path
            d="M204 112 C218 110, 228 100, 232 86 C234 80, 224 76, 220 82 L212 96 L202 98 Z"
            fill="#EEF4FF"
            stroke="#0F172A"
            strokeWidth="2.2"
          />
          {/* Thumb up */}
          <path
            d="M225 79 C225 71, 232 70, 232 78 L234 86 C234 90, 224 91, 223 86 Z"
            fill="#F8FAFC"
            stroke="#0F172A"
            strokeWidth="2"
          />

          {/* Helmet */}
          <circle cx="186" cy="74" r="34" fill="url(#xcOnlineSuitGrad)" stroke="#0F172A" strokeWidth="2.4" />
          {/* Left glowing green helmet comms ring */}
          <ellipse cx="151" cy="74" rx="8" ry="12" fill="#9BB1DA" stroke="#0F172A" strokeWidth="2" />
          <ellipse cx="151" cy="74" rx="4" ry="7" fill="#0F172A" stroke="#22C55E" strokeWidth="2" />
          {/* Dark Visor */}
          <ellipse cx="192" cy="76" rx="24" ry="21" fill="url(#xcOnlineVisorGrad)" stroke="#475569" strokeWidth="2" />
          {/* Happy curved smiling eyes (^ ^) */}
          <path d="M176 74 C178 68, 185 68, 187 74" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M198 74 C200 68, 207 68, 209 74" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
        </g>

        {/* Front orbital arc swooping forward */}
        <path
          d="M112 138 C134 156, 212 132, 286 112"
          stroke="#4ADE80"
          strokeWidth="4.2"
          strokeLinecap="round"
          fill="none"
          className="xc-orbit-glow"
        />

        {/* Glowing Green Circle with Checkmark */}
        <g style={{ filter: 'drop-shadow(0 0 18px rgba(34, 197, 94, 0.72))' }}>
          <circle cx="282" cy="90" r="32" fill="url(#xcEmeraldBadge)" stroke="#86EFAC" strokeWidth="2.5" />
          <path
            d="M268 91 L278 101 L297 79"
            stroke="#FFFFFF"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}

export const OfflineDetectionOverlay: React.FC<OfflineDetectionOverlayProps> = ({ onRestored }) => {
  const [status, setStatus] = useState<NetworkStatusState>(() =>
    createInitialNetworkStatus(typeof navigator !== 'undefined' ? navigator.onLine : true)
  );
  const [checking, setChecking] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [retryFeedback, setRetryFeedback] = useState(false);

  const onRestoredRef = useRef(onRestored);
  onRestoredRef.current = onRestored;

  const triggerRestoredFlow = useCallback(() => {
    setExiting(false);
    setRetryFeedback(false);
    setStatus((prev) => transitionToOnline(prev));
    onRestoredRef.current?.();
  }, []);

  useEffect(() => {
    const onOffline = () => {
      setExiting(false);
      setRetryFeedback(false);
      setStatus((prev) => transitionToOffline(prev));
    };

    const onOnline = () => {
      setStatus((prev) => {
        if (!prev.hasBeenOffline && prev.phase !== 'offline') {
          return prev;
        }
        onRestoredRef.current?.();
        setExiting(false);
        setRetryFeedback(false);
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

  // Auto-dismiss "You're Online!" animation cleanly and return to current app page
  useEffect(() => {
    if (status.phase !== 'restored') return;

    const fadeTimer = window.setTimeout(() => {
      setExiting(true);
    }, 1850);

    const doneTimer = window.setTimeout(() => {
      setExiting(false);
      setStatus((prev) => completeRestoredAnimation(prev));
    }, 2100);

    return () => {
      window.clearTimeout(fadeTimer);
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
    if (elapsed < 420) {
      await new Promise((resolve) => setTimeout(resolve, 420 - elapsed));
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
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-5 py-8 text-white overflow-hidden ${
        exiting ? 'xc-offline-exit' : 'xc-offline-enter'
      }`}
      style={{
        background: isRestored
          ? 'radial-gradient(circle at 50% 34%, #091B26 0%, #050B14 55%, #03060B 100%)'
          : 'radial-gradient(circle at 50% 34%, #101228 0%, #070913 55%, #030409 100%)',
      }}
    >
      {/* Subtle starfield particles */}
      <div
        className="pointer-events-none fixed inset-0 opacity-45"
        style={{
          backgroundImage:
            'radial-gradient(1.5px 1.5px at 14% 22%, rgba(255,255,255,0.6) 50%, transparent 100%), radial-gradient(1.2px 1.2px at 84% 18%, rgba(167,139,250,0.65) 50%, transparent 100%), radial-gradient(1.5px 1.5px at 78% 76%, rgba(255,255,255,0.45) 50%, transparent 100%), radial-gradient(1.2px 1.2px at 22% 78%, rgba(74,222,128,0.5) 50%, transparent 100%)',
        }}
      />

      {/* Emerald bottom corner mist clouds for "You're Online!" state */}
      {isRestored && (
        <>
          <div
            className="pointer-events-none fixed -bottom-12 -left-12 w-72 h-48 rounded-full blur-3xl opacity-45"
            style={{ background: 'radial-gradient(circle, #22C55E 0%, transparent 72%)' }}
          />
          <div
            className="pointer-events-none fixed -bottom-12 -right-12 w-72 h-48 rounded-full blur-3xl opacity-45"
            style={{ background: 'radial-gradient(circle, #10B981 0%, transparent 72%)' }}
          />
        </>
      )}

      {isRestored ? (
        <div className="relative z-10 w-full max-w-lg text-center flex flex-col items-center">
          <OnlineAstronautScene />

          <h2 className="mt-1 text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            You&rsquo;re <span className="text-[#22C55E]">Online!</span>
          </h2>
          <p className="mt-3 text-sm sm:text-lg text-slate-200/90 leading-relaxed max-w-md">
            Internet connection is active.
            <br />
            <span className="inline-flex items-center gap-1.5">
              Enjoy your browsing!
              <span aria-hidden="true">🚀</span>
            </span>
          </p>

          {/* Connected Pill with flanking emerald lines */}
          <div className="mt-7 w-full max-w-md flex items-center justify-center gap-4">
            <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent to-[#22C55E]/70" />
            <div className="inline-flex items-center gap-2.5 rounded-full border border-[#22C55E]/80 bg-[#061811]/85 px-6 py-2 shadow-[0_0_24px_rgba(34,197,94,0.3)]">
              <span className="h-3 w-3 rounded-full bg-[#34D399] shadow-[0_0_10px_#34D399] animate-pulse" />
              <span className="text-sm sm:text-base font-semibold text-white tracking-wide">
                Connected
              </span>
            </div>
            <div className="h-[1.5px] flex-1 bg-gradient-to-l from-transparent to-[#22C55E]/70" />
          </div>
        </div>
      ) : (
        <div className="relative z-10 w-full max-w-2xl text-center flex flex-col items-center">
          <OfflineAstronautScene />

          <h2 className="mt-1 text-3xl sm:text-[42px] sm:leading-tight font-extrabold tracking-tight text-white">
            No Internet{' '}
            <span className="bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] bg-clip-text text-transparent">
              Connection
            </span>
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-300/85 max-w-md leading-relaxed">
            Looks like you&rsquo;re offline. Please check your internet connection and try again.
          </p>

          {/* Retry Capsule Button with flanking violet lines */}
          <div className="mt-7 w-full max-w-md flex items-center justify-center gap-4">
            <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent to-[#7C3AED]/65" />
            <button
              type="button"
              onClick={handleRetry}
              disabled={checking}
              className="inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#6D4AFF] to-[#7C3AED] hover:from-[#7C5CFF] hover:to-[#8B5CF6] active:scale-[0.98] disabled:opacity-75 px-9 py-3 text-base font-semibold text-white shadow-[0_10px_28px_rgba(124,58,237,0.45)] transition-all cursor-pointer"
            >
              <RotateCw className={`w-4 h-4 sm:w-[18px] sm:h-[18px] ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Checking...' : 'Retry'}</span>
            </button>
            <div className="h-[1.5px] flex-1 bg-gradient-to-l from-transparent to-[#7C3AED]/65" />
          </div>

          {retryFeedback && (
            <p className="mt-3 text-xs text-rose-300/90 font-medium">
              Still offline — waiting for network connection.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

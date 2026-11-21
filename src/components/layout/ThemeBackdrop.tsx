import React from 'react';

export const DARK_SKY_THEME_URL = '/assets/aistudio/xc_dark_sky_opt.webp';
export const LIGHT_THEME_URL = '/assets/aistudio/xc_light_theme_opt.webp';

export function ThemeBackdrop({ variant = 'workspace' }: { variant?: 'auth' | 'workspace' }) {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden bg-[#F4F6FD] dark:bg-[#070815]"
    >
      {/* Light Theme Wallpaper */}
      <img
        src={LIGHT_THEME_URL}
        alt=""
        loading="eager"
        decoding="async"
        className="block dark:hidden w-full h-full object-cover object-center"
      />
      <div
        className={`block dark:hidden absolute inset-0 ${
          variant === 'auth'
            ? 'bg-gradient-to-b from-white/10 via-transparent to-[#EEF1FC]/25'
            : 'bg-white/24'
        }`}
      />

      {/* Dark Sky Wallpaper */}
      <img
        src={DARK_SKY_THEME_URL}
        alt=""
        loading="eager"
        decoding="async"
        className="hidden dark:block w-full h-full object-cover object-center"
      />
      <div
        className={`hidden dark:block absolute inset-0 ${
          variant === 'auth'
            ? 'bg-gradient-to-b from-[#060714]/25 via-[#070918]/20 to-[#04050F]/55'
            : 'bg-gradient-to-b from-[#060714]/45 via-[#080A1B]/40 to-[#050612]/60'
        }`}
      />
    </div>
  );
}

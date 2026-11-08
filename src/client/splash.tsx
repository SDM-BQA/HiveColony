import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SplashResponse } from '../shared/api';

const STATUS_TEXT: Record<SplashResponse['status'], string> = {
  victorious: '🏆 This colony built the Great Hive!',
  thriving: '✨ The colony is thriving',
  stable: '🙂 The colony is holding on',
  struggling: '⚠️ The colony is struggling — help!',
  starving: '🆘 The colony is STARVING!',
  collapsed: '☠️ The colony has collapsed',
};

export const Splash = () => {
  const [info, setInfo] = useState<SplashResponse | null>(null);

  useEffect(() => {
    fetch('/api/splash')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SplashResponse | null) => setInfo(d))
      .catch(() => setInfo(null));
  }, []);

  return (
    <div className="hive-bg relative flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center text-amber-50">
      <div className="text-6xl drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]">
        🐝
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-amber-300">
        Hive Colony
      </h1>
      <p className="max-w-xs text-sm text-amber-100/70">
        This whole subreddit runs one colony. Pick a role, work shifts, and keep
        everyone alive.
      </p>
      {info && (
        <div className="rounded-xl bg-black/40 px-4 py-2 text-sm ring-1 ring-amber-400/30">
          <div className="font-semibold">{STATUS_TEXT[info.status]}</div>
          <div className="text-amber-100/60">
            Colony #{info.generation} · Day {info.day} · 👥 {info.population}{' '}
            colonists
          </div>
        </div>
      )}
      <button
        className="mt-1 rounded-full bg-amber-400 px-8 py-3 text-lg font-extrabold text-amber-950 shadow-lg shadow-amber-500/30 transition active:scale-95"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        {info?.status === 'collapsed'
          ? '🚀 Rebuild the Colony'
          : `Join the Hive${context.username ? `, ${context.username}` : ''}`}
      </button>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);

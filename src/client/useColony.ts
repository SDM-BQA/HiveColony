import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActionResponse,
  ErrorResponse,
  StateResponse,
} from '../shared/api';
import type { BuildingId, RoleId } from '../shared/game';
import { sfx } from './sound';

const POLL_MS = 20_000;

type Flash = { ok: boolean; text: string } | null;

const readError = async (res: Response): Promise<string> => {
  try {
    const body: Partial<ErrorResponse> = await res.json();
    return body.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
};

export const useColony = () => {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const flashTimer = useRef<number | undefined>(undefined);
  const seen = useRef<{ eventAt: number | null; won: boolean | null }>({
    eventAt: null,
    won: null,
  });

  const accept = useCallback((s: StateResponse) => {
    // Sounds for things that happened in the world since we last looked.
    const latestEvent = s.colony.log.find((e) => e.kind === 'event');
    const won = s.colony.wonderDoneAt !== null;
    const prev = seen.current;
    if (prev.won === false && won) sfx.victory();
    else if (
      latestEvent &&
      prev.eventAt !== null &&
      latestEvent.at > prev.eventAt
    )
      sfx.event(latestEvent.text);
    seen.current = { eventAt: latestEvent?.at ?? prev.eventAt ?? 0, won };
    setState(s);
    setClockOffset(s.serverNow - Date.now());
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(await readError(res));
      const data: StateResponse = await res.json();
      accept(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load colony');
    }
  }, [accept]);

  // Initial load + polling.
  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [refresh]);

  // 1-second clock for countdowns.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const showFlash = useCallback((f: Flash) => {
    setFlash(f);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 4000);
  }, []);

  const post = useCallback(
    async (
      path: string,
      body: object = {},
      onSuccess: () => void = sfx.shift
    ): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await readError(res));
        const data: ActionResponse = await res.json();
        accept(data.state);
        showFlash({ ok: data.ok, text: data.message });
        if (data.ok) onSuccess();
        else sfx.error();
        return data.ok;
      } catch (err) {
        sfx.error();
        showFlash({
          ok: false,
          text: err instanceof Error ? err.message : 'Something went wrong',
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accept, showFlash]
  );

  const chooseRole = useCallback(
    (role: RoleId) => post('/api/role', { role }, sfx.click),
    [post]
  );
  const workShift = useCallback(
    (
      opts: {
        build?:
          | { kind: 'build'; building: BuildingId; tile: number }
          | { kind: 'upgrade'; tile: number }
          | { kind: 'expand' }
          | { kind: 'wonder'; tile?: number };
        score?: number;
      } = {}
    ) => {
      const kind = opts.build?.kind;
      const sound =
        kind === 'build'
          ? sfx.build
          : kind === 'upgrade'
            ? sfx.upgrade
            : kind === 'expand'
              ? sfx.expand
              : kind === 'wonder'
                ? sfx.wonder
                : sfx.shift;
      return post('/api/shift', opts, sound);
    },
    [post]
  );
  const vote = useCallback(
    (proposalId: number, yes: boolean) =>
      post('/api/vote', { proposalId, yes }, sfx.vote),
    [post]
  );
  const refound = useCallback(
    () => post('/api/refound', {}, sfx.expand),
    [post]
  );

  return {
    state,
    error,
    busy,
    flash,
    now: now + clockOffset,
    refresh,
    chooseRole,
    workShift,
    vote,
    refound,
  } as const;
};

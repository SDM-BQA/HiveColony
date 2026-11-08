import type { Colony, ColonyStatus, Player, RoleId } from './game';

export type LeaderEntry = {
  username: string;
  score: number;
  badges: number;
};

export type HallEntry = {
  generation: number;
  days: number;
  at: number;
};

export type StateResponse = {
  type: 'state';
  serverNow: number;
  username: string | null;
  colony: Colony;
  status: ColonyStatus;
  capacity: number;
  multiplier: number;
  me: Player | null;
  myVote: 'yes' | 'no' | null;
  leaders: LeaderEntry[];
  records: HallEntry[];
  myBadges: number;
};

export type ActionResponse = {
  type: 'action';
  ok: boolean;
  message: string;
  state: StateResponse;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

export type RoleRequest = {
  role: RoleId;
};

export type SplashResponse = {
  type: 'splash';
  generation: number;
  day: number;
  population: number;
  status: ColonyStatus;
};

import { createHttpApi } from './client';
import { createMockApi } from './mock';
import type { StateMintApi } from './types';

export const isMock =
  import.meta.env.VITE_API_MODE === 'mock' || import.meta.env.MODE === 'mock';

export const api: StateMintApi = isMock
  ? createMockApi()
  : createHttpApi(import.meta.env.VITE_API_BASE_URL ?? '');

export * from './types';

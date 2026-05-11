'use client';

import type { AppRouter } from '@auto-nomos/control-plane/router-types';
import { type CreateTRPCReact, createTRPCReact } from '@trpc/react-query';

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

'use client';

import type { AppRouter } from '@credential-broker/control-plane/router-types';
import { type CreateTRPCReact, createTRPCReact } from '@trpc/react-query';

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

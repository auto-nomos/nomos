function need(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`missing env: ${name}`);
  }
  return value;
}

export const clientEnv = {
  controlPlaneUrl: need(
    'NEXT_PUBLIC_CONTROL_PLANE_URL',
    process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? 'http://localhost:8788',
  ),
  pdpUrl: process.env.NEXT_PUBLIC_PDP_URL ?? 'http://localhost:8787',
  workosEnabled: (process.env.NEXT_PUBLIC_WORKOS_ENABLED ?? 'false') === 'true',
};

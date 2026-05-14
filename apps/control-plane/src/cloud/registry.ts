/**
 * Cloud provider registry — parallel to oauth/connectors/index.ts.
 *
 * M1 ships Azure. AWS + GCP land in M5 / M7.
 */
import type { CloudConnectorId, CloudProvider } from '@auto-nomos/core';
import { AwsCloudProvider, type AwsProviderOptions } from './providers/aws.js';
import { AzureCloudProvider, type AzureProviderOptions } from './providers/azure.js';
import { GcpCloudProvider, type GcpProviderOptions } from './providers/gcp.js';

export interface CloudProviderRegistryOptions {
  azure?: AzureProviderOptions;
  aws?: AwsProviderOptions;
  gcp?: GcpProviderOptions;
}

export function createCloudProviderRegistry(
  opts: CloudProviderRegistryOptions = {},
): Map<CloudConnectorId, CloudProvider> {
  const reg = new Map<CloudConnectorId, CloudProvider>();
  reg.set('azure', new AzureCloudProvider(opts.azure ?? {}));
  reg.set('aws', new AwsCloudProvider(opts.aws ?? {}));
  reg.set('gcp', new GcpCloudProvider(opts.gcp ?? {}));
  return reg;
}

export function getCloudProvider(
  registry: Map<CloudConnectorId, CloudProvider>,
  id: CloudConnectorId,
): CloudProvider {
  const p = registry.get(id);
  if (!p) {
    throw new Error(`cloud_provider_not_registered: ${id}`);
  }
  return p;
}

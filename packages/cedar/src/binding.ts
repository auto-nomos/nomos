import {
  checkParsePolicySet,
  checkParseSchema,
  formatPolicies,
  isAuthorized,
} from '@cedar-policy/cedar-wasm/nodejs';

export const cedarBinding = {
  checkParsePolicySet,
  checkParseSchema,
  formatPolicies,
  isAuthorized,
};

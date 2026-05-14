/**
 * Mapping from `packages/adapters/spec/google_contacts.yaml` action ids to
 * canonical Cedar commands. Commands live under `/google/contacts/...` to
 * stay consistent with existing google-namespaced templates and the shared
 * google OAuth connector.
 */

export const actionToCommand: Record<string, string> = {
  list_contacts: '/google/contacts/list',
  search_contacts: '/google/contacts/search',
  get_contact: '/google/contacts/read',
  create_contact: '/google/contacts/create',
  update_contact: '/google/contacts/update',
  delete_contact: '/google/contacts/delete',
  list_contact_groups: '/google/contacts/group/list',
  get_contact_group: '/google/contacts/group/read',
  batch_get_contacts: '/google/contacts/batch_get',
};

export function resourceFor(
  actionId: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const resourceName =
    typeof params.resourceName === 'string'
      ? params.resourceName
      : typeof params.resource_name === 'string'
        ? params.resource_name
        : undefined;
  switch (actionId) {
    case 'list_contacts':
    case 'search_contacts':
    case 'create_contact':
    case 'list_contact_groups':
    case 'batch_get_contacts':
      return {};
    case 'get_contact':
    case 'update_contact':
    case 'delete_contact':
    case 'get_contact_group':
      return resourceName ? { resource_name: resourceName } : {};
    default:
      return {};
  }
}

# @auto-nomos/schema-packs

Per-integration schema packs. Sprint 7 ships 20 starter policy templates
(5 each × 4 integrations: github / slack / google / notion). Sprint 10
fills in the rest of the pack — resource model, action vocabulary,
default policies, connector module.

## API

```ts
import {
  PACKS,
  listTemplates,
  templateById,
  templatesFor,
} from '@auto-nomos/schema-packs';
```

- `PACKS` — every `IntegrationPack` (id, name, templates).
- `listTemplates()` — flat list, all 20.
- `templatesFor('github')` — 5 templates for that integration.
- `templateById('github:read-only')` — lookup helper.

Each template carries a `visualReady` flag. `true` means the visual
builder can render it losslessly; `false` means the dashboard's visual
tab will fall back to "edit in Cedar" because the template uses shapes
outside the IR (path-to-path comparisons, set operations,
extension functions).

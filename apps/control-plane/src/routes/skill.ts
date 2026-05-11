import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';

export interface SkillRoutesDeps {
  controlPlanePublicUrl: string;
  pdpPublicUrl: string;
  dashboardPublicUrl: string;
  skillsDir?: string;
}

function defaultSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [resolve(here, '..', '..', 'skills'), resolve(here, '..', 'skills')]) {
    if (existsSync(candidate)) return candidate;
  }
  return resolve(here, '..', '..', 'skills');
}

function substitute(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`);
}

export function createSkillRoutes(deps: SkillRoutesDeps): Hono {
  const app = new Hono();
  const dir = deps.skillsDir ?? defaultSkillsDir();
  const vars: Record<string, string> = {
    controlPlaneUrl: deps.controlPlanePublicUrl,
    pdpUrl: deps.pdpPublicUrl,
    dashboardPublicUrl: deps.dashboardPublicUrl,
  };

  app.get('/skill', (c) => {
    if (!existsSync(dir)) return c.json({ skills: [] });
    const skills = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
    return c.json({ skills });
  });

  app.get('/skill/:id', (c) => {
    const id = c.req.param('id').replace(/\.md$/, '');
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(id)) {
      return c.json({ error: 'invalid_id' }, 400);
    }
    const filePath = join(dir, `${id}.md`);
    if (!existsSync(filePath)) return c.json({ error: 'not_found' }, 404);
    const body = readFileSync(filePath, 'utf8');
    return c.body(substitute(body, vars), 200, {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=60',
    });
  });

  return app;
}

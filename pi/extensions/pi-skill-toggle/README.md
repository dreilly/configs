# Pi Skill Toggle

Persistent per-skill invocation policy for Pi.

## Commands

- `/toggle-skills` opens an interactive picker. Space toggles the selected skill; Ctrl-S saves and reloads Pi.
- `/sync-skill-modes` reapplies saved policies and reloads Pi when files changed.

Pi treats a skill as manual-only when its `SKILL.md` frontmatter contains:

```yaml
disable-model-invocation: true
```

Without that field, the skill is advertised to the model and may be invoked automatically.

## Persistent policy

The extension stores policy separately from externally managed skills:

```text
~/.agents/skill-invocation.json
```

The default file is tracked at `agents/skill-invocation.json` in the configs repo because `~/.agents` is symlinked there by `setup.sh`. Set `PI_SKILL_INVOCATION_CONFIG` to override the path.

Keys include Pi's source scope so a global and project skill with the same name can have different policies. Project keys also contain the absolute skill root to prevent same-named skills in separate projects from colliding:

```json
{
  "version": 1,
  "modes": {
    "global:handoff": "manual-only",
    "global:visual-explainer": "agent-invocable",
    "project:/path/to/repo/.pi/skills:repo-helper": "manual-only"
  }
}
```

Supported modes are `manual-only` and `agent-invocable`.

## External updates

The `resources_discover` hook reconciles saved policy before Pi scans skills on startup and `/reload`. If `npx skills update` replaces a managed `SKILL.md`, the desired frontmatter is restored the next time Pi starts or reloads.

The preference file is authoritative. Externally managed `SKILL.md` files contain generated invocation state and may be overwritten safely.

## Discovery

The extension follows Pi's normal skill roots:

- `~/.pi/agent/skills`
- `~/.agents/skills`
- `.pi/skills`
- `.agents/skills`

The source prefixes used in policy keys are `user`, `global`, `project`, and `project-legacy`, respectively.

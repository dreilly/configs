# Shared dotfiles: home + work

Use **one branch on both machines**. Shared config lives in the existing app directories;
`profiles/home/` and `profiles/work/` contain environment-specific additions and overrides.
There is no hostname, network, or VPN detection.

## Install

Requires Bash and Python 3. Normal dependency installation also uses npm, Git, and (on
macOS, if `dark-notify` is missing) Homebrew.

```bash
# On your home machine:
./setup.sh --profile home

# On your work machine, from the SAME branch:
./setup.sh --profile work
```

The choice is saved in `~/.config/dotfiles/profile`, outside Git. After that:

```bash
./setup.sh                       # reuse this machine's saved profile
./setup.sh --profile work        # explicitly switch this machine to work
./setup.sh --profile home        # switch back to home
./setup.sh --profile work --dry-run
./setup.sh --profile home --skip-deps
```

A first interactive install asks which profile to use. A first noninteractive install
requires `--profile`; it never silently defaults to work. `--dry-run` does not write files,
save a profile, or install dependencies. `--skip-deps` installs the config but skips npm,
TPM, and Homebrew.

**Restart Pi after switching profiles.** Existing sessions can retain tools and instructions
from their old environment; changing files does not retroactively isolate a running session.
Restart/reload your other applications as appropriate. Switching away from the home profile
also requires a new shell to stop using home-only shell settings.

## What loads

**Shared:** Neovim, tmux, WezTerm, i3/i3status, Herdr, base Ghostty and OpenCode config;
Pi web-tools, role-agents, skill toggle, fuzzy file finder, Git guard and general Git
instructions; general `/commit` prompts; shared skills including `dex` and `dex-plan`.

**Home:** OpenAI Codex Pi model defaults, home roles, ordinary Chrome DevTools MCP,
Hibber/JSON QA OpenCode references, and the managed Zsh configuration.

**Work:** the `rt-harn` Pi model defaults and role overrides, RealTime browser/worktree
extensions (`rt-browser`, `/rtw`), Yaak MCP, database guard and instructions, `rt-tickets`,
`/commit-rt`, OpenCode's `/open-realtime` and RealTime repository references, and Ghostty
font size 15. Work leaves an existing, unmanaged `.zshrc` alone, matching the old work
branch. If switching from a managed home `.zshrc`, that managed file is removed; an older
backed-up work shell is not automatically restored.

Work Pi deliberately has **no static `chrome-devtools` entry in `mcp.json`**: `rt-browser`
registers the correct server for each worktree. Do not add a static entry to the work
Pi config. OpenCode has its own independent Chrome MCP configuration.

Home defaults use `openai-codex/gpt-5.6-sol` with Luna/Terra available for cycling.
Work retains the `rt-harn` Copilot selections. These require the corresponding provider
login; they are not a guarantee that every machine exposes those model IDs. Machine-specific
model changes can be made with local overrides below.

## Layout and precedence

Configuration layers, from lowest to highest priority:

1. Shared directories (`pi/`, `agents/`, `opencode/`, etc.).
2. `profiles/<home|work>/`, mirroring those directory names.
3. `~/.config/dotfiles/local/`, also mirroring the directory names.

For example:

- `pi/settings.json`: shared Pi settings.
- `profiles/home/pi/settings.json`: home model selections.
- `profiles/work/pi/settings.json`: work model selections.
- `profiles/work/pi/extensions/`: work-only executable extensions.
- `profiles/work/agents/skills/`: work-only shared agent skills.
- `profiles/work/opencode/commands/`: work-only OpenCode commands.
- `profiles/<name>/profile.json`: installer preferences (`manageZsh`).

**JSON:** objects merge recursively, arrays replace rather than concatenate, and `null`
removes an inherited key. This applies to Pi settings/keybindings/MCP, shared agents MCP,
OpenCode settings, and installer preferences.

**Resources:** extension directories/files, skills, roles, prompts, themes, and OpenCode
commands overlay by direct-child name. A selected profile's `worker.md`, for example,
replaces the shared `worker.md`. Each resource directory is linked as a unit, so package
imports and sibling imports retain their normal layout.

**Text:** Ghostty config, Pi `AGENTS.md`, and the managed `.zshrc` concatenate shared,
profile, and local text in that order. Pi's RealTime database instructions are therefore
absent at home. OpenCode's `AGENTS.md` and `tui.json` use the highest-priority file.
Ordinary app directories (Neovim, WezTerm, i3/i3status, Herdr) overlay per file.

Run `./setup.sh` after changing layered JSON/text or adding/removing resources. Existing
symlinked resource edits are visible immediately, subject to each application's reload
behavior. Profile switching is machine-wide, not a per-project sandbox: two simultaneously
running home/work sessions are not independently configured by this installer.

## Local preferences, not in Git

For example, create `~/.config/dotfiles/local/pi/settings.json`:

```json
{
  "defaultModel": "your-preferred-model-id",
  "enabledModels": ["github-copilot/your-preferred-model-id"]
}
```

Then run `./setup.sh` again. Other examples:

- `local/ghostty/config`: machine-specific font/display settings.
- `local/pi/mcp.json`: private/local MCP configuration; `null` can remove an inherited server.
- `local/pi/extensions/my-extension.ts`: a machine-local extension.
- `local/agents/skills/my-skill/`: a machine-local skill.
- `local/profile.json` containing `{"manageZsh": true}`: opt a work machine into managed Zsh.

Local overrides apply on this machine regardless of the selected profile. Keep work-only
resources in the work profile rather than common local overrides if you switch this machine
between home and work.

Per-role model overrides continue to work in `~/.pi/agent/agent-models.local.json`.
The installer migrates the older, gitignored `pi/agent-models.local.json` there only if no
machine-local model file exists. An existing local override wins over profile role models.

Generated settings are regular files, so Pi can save runtime preferences without changing
tracked files. **Reinstalling reapplies managed settings**; put durable personal preferences
in `local/`, not just in generated output. Pi's existing `deviceId` and changelog version are
preserved across reinstalls and profile switches, but are not tracked or copied to other
machines. Skill invocation preferences and the skill installer lock are seeded once as local
files, then left alone. Shared skill contents themselves remain symlinked into this repo;
editing a skill (including invocation-frontmatter reconciliation) can still modify that
tracked skill.

## Migration and safety

This layout consolidates the useful contents of `harn` and `rt-harn` without merging,
rebasing, deleting, or otherwise rewriting their histories. Use the consolidated branch
on both machines once these changes have been committed and transferred there; don't
switch back to `rt-harn` to select work settings.

The installer replaces the old whole-directory `~/.agents` and Pi resource symlinks with
real directories containing only selected resources. It detaches directory symlinks before
editing children, so migration cannot delete files through a link into the old checkout.

- Existing conflicting files/links are backed up under
  `~/.local/state/dotfiles/backups/<timestamp>/`, preserving their home-relative paths.
- Backups stay **outside auto-discovery directories** so old extensions/skills cannot load.
- A local manifest records managed files; switching removes obsolete managed resources.
  Modified managed files are backed up instead of discarded.
- Known inactive profile resources left by an older install are backed up, even without
  an existing manifest. Unrelated files in real config/resource directories are left alone.
- Contents of an old whole-directory symlink remain available at its original target and
  through the backed-up link. Private additions in that old directory aren't automatically
  activated: move them into `local/` or the new real resource directories if wanted.
- Pi credentials, sessions, caches, and realtime-test credentials are not read or installed.
  Keep the work browser credentials outside this repo as described in
  `profiles/work/pi/extensions/rt-browser/README.md`.
- Work runtime dependencies are installed only for work; switching home doesn't uninstall
  their source dependencies, but their extensions are no longer linked into discovery paths.

`XDG_CONFIG_HOME` and `XDG_STATE_HOME` are respected, including for the saved profile,
local overrides, manifest, and backups. `~/.pi/agent` and `~/.agents` retain their normal
locations. Run from the repository directory; the script also handles repository/home paths
containing spaces.

## Tests

```bash
python3 -m unittest discover -s tests -v
bash -n setup.sh
```

The integration suite uses temporary home directories and skips dependency installation.
It covers profile isolation, switching, legacy symlink migration, backups, idempotence,
local overrides, runtime state, XDG paths, and side-effect-free dry runs.

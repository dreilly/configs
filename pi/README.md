# Pi profiles: home and work

Use the same dotfiles branch on both machines. Select a profile explicitly; the installer
remembers it locally. You do **not** need to switch Git branches when switching environments.

## Set up a machine

Install Pi, Bash, Python 3, and npm first. Run these commands from the **repository root**
(the directory containing `setup.sh`, one level above this README):

```bash
# Home machine:
./setup.sh --profile home

# Work machine:
./setup.sh --profile work
```

The installer also configures the other apps in this repository; this is not a Pi-only
install. It installs the shared web-tools runtime dependencies and, for work only, the
RealTime browser dependencies. See the [repository README](../README.md) for prerequisites
and the other applications it manages.

Start Pi and sign in to the provider for your profile using `/login`:

- **Home:** OpenAI Codex. Default model: `openai-codex/gpt-5.6-sol`, with Luna and Terra in
  the model cycle.
- **Work:** GitHub Copilot. Default model: `github-copilot/claude-opus-5.5`, with
  `github-copilot/gpt-6.1-sol` also in the model cycle.

Provider access and model availability can differ between machines. Run `pi --list-models`
or use `/model` to see what your signed-in providers actually expose. Credentials stay local;
the installer does not copy provider logins between machines.

## What each profile loads

**Both:** web-tools, role-agents, skill toggle, fuzzy file finder, general Git
instructions, `/commit`, and shared skills from `~/.agents/skills/`.

**Home only:** ordinary Chrome DevTools MCP and the home model selections. No Yaak,
RealTime browser/worktree extensions, Git guard, database guard, RealTime database instructions,
`rt-tickets`, or `/commit-rt`.

**Work only:** Yaak MCP, `rt-browser`, `/rtw`, Git guard, database guard and RealTime database
instructions, `rt-tickets`, `/commit-rt`, and the work role overrides.

For RealTime browser credentials and the local worktree/container prerequisites, read the
[rt-browser guide](../profiles/work/pi/extensions/rt-browser/README.md) and
[/rtw guide](../profiles/work/pi/extensions/rtw/README.md). Keep credentials outside this repo.

**Do not add a static `chrome-devtools` server to the work Pi MCP config.** `rt-browser`
registers it dynamically so each worktree gets the correct browser. A file entry would take
precedence over that registration.

## Reapply, switch, or preview

```bash
./setup.sh                         # reapply the remembered profile
./setup.sh --profile home          # switch this machine to home
./setup.sh --profile work          # switch this machine to work
./setup.sh --profile work --dry-run # preview without changing anything
./setup.sh --skip-deps             # reapply config without dependency installation
```

The saved selection is `~/.config/dotfiles/profile`. On a first interactive run without
`--profile`, setup asks you to choose. Noninteractive first installs require `--profile`.

**Restart Pi after switching profiles.** An existing session can retain the previous
profile's tools and instructions. Profiles are machine-wide, not isolated per-project or
per-session environments. Simply moving between home/work networks does not switch them.

## Where to edit configuration

Layers apply in this order, with later layers taking precedence:

1. Shared files in this `pi/` directory.
2. `profiles/home/pi/` or `profiles/work/pi/` at the repository root.
3. Machine-local files in `~/.config/dotfiles/local/pi/`.

For shared agent skills and MCP settings, the corresponding paths are `agents/`,
`profiles/<profile>/agents/`, and `~/.config/dotfiles/local/agents/`.

- JSON objects merge recursively; arrays replace; `null` removes an inherited key.
- Resources such as extensions, roles, prompts, and skills overlay by direct-child name.
- Pi `AGENTS.md` instructions concatenate shared, selected-profile, and local text.

Rerun `./setup.sh` after changing layered JSON/instructions or adding/removing resources.
The installer writes merged config into `~/.pi/agent/` and links only the selected resources
into its discovery directories.

### Machine-specific model preferences

Create `~/.config/dotfiles/local/pi/settings.json`, for example:

```json
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.6-sol",
  "enabledModels": [
    "openai-codex/gpt-5.6-sol",
    "openai-codex/gpt-5.6-luna"
  ]
}
```

Then run `./setup.sh` and restart Pi. Choose IDs from `pi --list-models`, and use the provider
you actually sign into. Local overrides apply regardless of the selected profile, so do not
put work-only resources there if you switch the same machine between home and work.

Role-agent models have a separate override file: `~/.pi/agent/agent-models.local.json`.
Existing overrides there take precedence over profile role definitions; check them too if
a scout, researcher, or worker reports an unavailable model. See the
[role-agents README](extensions/role-agents/README.md) for its format.

## Troubleshooting and safety

- **“No models match pattern”:** check `pi --list-models`, your `/login` provider, and the
  selected profile/local settings. Do not copy work's Copilot model IDs into a Codex-only
  home setup.
- **“yaak: failed: fetch failed”:** Yaak belongs only to work. At work, start Yaak with its
  MCP service available, or disable it in `/mcp`. For a durable machine-local exclusion,
  put `{"mcpServers":{"yaak":null}}` in `~/.config/dotfiles/local/pi/mcp.json` and rerun
  setup. At home, check the saved profile and restart Pi after applying it.
- **Changes to `/settings` disappear after setup:** generated settings are reapplied by the
  installer. Put durable preferences in `local/pi/settings.json` instead of editing only
  `~/.pi/agent/settings.json`.
- **Old work tools remain:** restart Pi; setup removes obsolete managed resource links,
  but cannot remove tools/instructions already loaded into a running session.

Existing conflicting or modified managed files are backed up outside discovery directories
under `~/.local/state/dotfiles/backups/`. Auth files and sessions are left alone. Pi's
existing device ID and changelog version are preserved locally; skill invocation preferences
and the skill installer lock are seeded once and then left local.

`XDG_CONFIG_HOME` and `XDG_STATE_HOME` override the `.config` and `.local/state` locations
above. `~/.pi/agent` and `~/.agents` keep their normal locations.

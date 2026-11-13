#!/usr/bin/env python3
"""Install shared dotfiles plus one explicit machine profile (stdlib only)."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
PROFILES = ("home", "work")


def read_json(path):
    if not path.exists():
        return {}
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def merge(base, override):
    """Objects merge recursively, arrays replace, and null removes a key."""
    result = dict(base)
    for key, value in override.items():
        if value is None:
            result.pop(key, None)
        elif isinstance(value, dict):
            inherited = result.get(key, {})
            result[key] = merge(inherited if isinstance(inherited, dict) else {}, value)
        else:
            result[key] = value
    return result


def json_text(value):
    return json.dumps(value, indent=2) + "\n"


def digest(content):
    return hashlib.sha256(content.encode()).hexdigest()


def present(path):
    return path.exists() or path.is_symlink()


class Installer:
    def __init__(self, home, config, state, profile, dry_run=False):
        self.home = home
        self.config = config
        self.state = state
        self.profile = profile
        self.dry_run = dry_run
        self.local = config / "dotfiles/local"
        self.layers = [ROOT, ROOT / "profiles" / profile, self.local]
        self.manifest_path = state / "dotfiles/manifest.json"
        self.previous = read_json(self.manifest_path).get("files", {})
        self.files = {}
        self.inactive = set()
        self.directories = set()
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid4().hex[:8]
        self.backups = state / "dotfiles/backups" / stamp

    def layered_json(self, relative):
        result = {}
        for layer in self.layers:
            result = merge(result, read_json(layer / relative))
        return result

    def combined_text(self, relative):
        parts = [(layer / relative).read_text().rstrip() for layer in self.layers
                 if (layer / relative).is_file()]
        return "\n\n".join(part for part in parts if part) + "\n"

    def link(self, source, dest):
        if not source.exists():
            raise ValueError(f"Missing config source: {source}")
        self.files[dest] = {"kind": "link", "source": str(source.absolute())}

    def generated(self, dest, content):
        self.files[dest] = {"kind": "file", "content": content, "sha256": digest(content)}

    def seed(self, dest, source):
        # Mutable preferences belong to this machine, not a symlink into Git.
        linked_parent = any(parent.is_symlink() for parent in dest.parents
                            if parent == self.home or self.home in parent.parents)
        if not dest.exists() or dest.is_symlink() or linked_parent:
            existing = dest.read_text() if dest.is_file() else source.read_text()
            self.generated(dest, existing)

    def resources(self, relative, dest):
        """Overlay direct children, linking whole resource dirs (not node_modules)."""
        self.directories.add(dest)
        selected = {}
        for layer in self.layers:
            source = layer / relative
            if source.is_dir():
                for entry in sorted(source.iterdir()):
                    if not entry.name.startswith("."):
                        selected[entry.name] = entry
        for name, source in selected.items():
            self.link(source, dest / name)
        # Also recognize legacy profile files on a machine without a manifest.
        for profile in PROFILES:
            source = ROOT / "profiles" / profile / relative
            if source.is_dir():
                for entry in source.iterdir():
                    if not entry.name.startswith(".") and entry.name not in selected:
                        self.inactive.add(dest / entry.name)

    def tree(self, relative, dest):
        """File-level overlays for ordinary app directories."""
        selected = {}
        for layer in self.layers:
            source = layer / relative
            if source.is_dir():
                for entry in sorted(source.rglob("*")):
                    if entry.is_file() and not any(p.startswith(".") for p in entry.relative_to(source).parts):
                        selected[entry.relative_to(source)] = entry
        for name, source in selected.items():
            self.link(source, dest / name)
        self.directories.add(dest)

    def plan(self):
        pi = self.home / ".pi/agent"
        agents = self.home / ".agents"
        options = self.layered_json("profile.json")
        if not isinstance(options.get("manageZsh"), bool):
            raise ValueError("profile.json must specify a boolean manageZsh")
        if options["manageZsh"]:
            self.generated(self.home / ".zshrc", self.combined_text("zsh/zshrc"))

        for app in ("nvim", "wezterm", "i3", "i3status"):
            self.tree(app, self.config / app)
        for name in ("dark.conf", "light.conf", "switch-theme.sh"):
            self.link(ROOT / "tmux" / name, self.home / ".tmux" / name)
        self.link(ROOT / "tmux/tmux.conf", self.home / ".tmux.conf")
        self.tree("herdr", self.config / "herdr")
        self.generated(self.config / "ghostty/config", self.combined_text("ghostty/config"))

        opencode = self.layered_json("opencode/opencode.json")
        # Resolve from the actual destination, not a username or a fixed XDG path.
        opencode["instructions"] = [
            str(self.config / "opencode/AGENTS.md") if value == "~/.config/opencode/AGENTS.md" else value
            for value in opencode.get("instructions", [])
        ]
        self.generated(self.config / "opencode/opencode.json", json_text(opencode))
        self.resources("opencode/commands", self.config / "opencode/commands")
        for name in ("tui.json", "AGENTS.md"):
            source = next(layer / "opencode" / name for layer in reversed(self.layers)
                          if (layer / "opencode" / name).is_file())
            self.link(source, self.config / "opencode" / name)

        # Do NOT link ~/.agents or extensions/ wholesale: inactive resources would load.
        self.directories.add(agents)
        self.resources("agents/skills", agents / "skills")
        self.generated(agents / "mcp.json", json_text(self.layered_json("agents/mcp.json")))
        self.seed(agents / "skill-invocation.json", ROOT / "agents/skill-invocation.json")
        self.seed(agents / ".skill-lock.json", ROOT / "agents/.skill-lock.json")

        settings = self.layered_json("pi/settings.json")
        existing = read_json(pi / "settings.json")
        for key in ("deviceId", "lastChangelogVersion"):
            if key in existing:
                settings[key] = existing[key]
        self.generated(pi / "settings.json", json_text(settings))
        self.generated(pi / "mcp.json", json_text(self.layered_json("pi/mcp.json")))
        self.generated(pi / "AGENTS.md", self.combined_text("pi/AGENTS.md"))
        for name in ("extensions", "prompts", "agents", "themes", "skills"):
            self.resources(f"pi/{name}", pi / name)
        self.generated(pi / "keybindings.json", json_text(self.layered_json("pi/keybindings.json")))
        legacy_models = ROOT / "pi/agent-models.local.json"
        if legacy_models.exists():
            self.seed(pi / "agent-models.local.json", legacy_models)
        # These mutable files are seeded once, then left entirely to their tools.
        self.mutable = {agents / "skill-invocation.json", agents / ".skill-lock.json",
                        pi / "agent-models.local.json"}
        return self

    def backup(self, path):
        # Keep backups OUTSIDE discovery dirs, so old extensions/skills cannot load.
        try:
            relative = path.relative_to(self.home)
        except ValueError:
            relative = Path("external") / str(path).lstrip("/")
        target = self.backups / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if present(target):
            target = target.with_name(target.name + "-" + uuid4().hex[:8])
        if path.is_symlink() and not os.path.isabs(os.readlink(path)):
            # A relative link would point somewhere else after moving it.
            original_target = os.path.abspath(path.parent / os.readlink(path))
            target.symlink_to(original_target, target_is_directory=path.is_dir())
            path.unlink()
        else:
            shutil.move(str(path), str(target))
        print(f"  Backed up {path} -> {target}")

    def ensure_dir(self, path):
        if path.is_dir() and not path.is_symlink():
            return
        self.ensure_dir(path.parent)
        if present(path):
            self.backup(path)
        path.mkdir()

    @staticmethod
    def matches(path, entry):
        if entry.get("kind") == "link":
            return path.is_symlink() and os.readlink(path) == entry["source"]
        return (path.is_file() and not path.is_symlink()
                and digest(path.read_text()) == entry.get("sha256"))

    def write_text(self, path, content):
        # Atomic replace also prevents following a legacy symlink back into Git.
        fd, temporary = tempfile.mkstemp(prefix=".dotfiles-", dir=path.parent)
        try:
            with os.fdopen(fd, "w") as stream:
                stream.write(content)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def apply(self):
        print(f"{'Would install' if self.dry_run else 'Installing'} {self.profile} profile from {ROOT}")
        stale = (set(Path(p) for p in self.previous) | self.inactive) - set(self.files) - self.mutable
        if self.dry_run:
            for dest in sorted(self.files):
                item = self.files[dest]
                print(f"  {dest} <- {item.get('source', '[generated]')}")
            for dest in sorted(stale):
                if present(dest):
                    print(f"  Remove managed/inactive resource (back up if modified): {dest}")
            print("Dry run: no files changed, profile not saved, dependencies not installed.")
            return

        # Detach old whole-directory symlinks BEFORE touching any child. This must
        # not unlink files in the old configs checkout through ~/.agents, etc.
        parents = self.directories | {dest.parent for dest in self.files}
        parents |= {dest.parent for dest in stale if present(dest.parent)}
        for parent in sorted(parents, key=lambda p: (len(p.parts), str(p))):
            self.ensure_dir(parent)

        for dest in sorted(stale):
            if not present(dest):
                continue
            old = self.previous.get(str(dest))
            if old and self.matches(dest, old):
                dest.unlink()
                print(f"  Removed {dest}")
            else:
                self.backup(dest)

        for dest, item in sorted(self.files.items()):
            if self.matches(dest, item):
                continue
            old = self.previous.get(str(dest))
            if present(dest):
                if old and self.matches(dest, old):
                    dest.unlink()
                else:
                    self.backup(dest)
            if item["kind"] == "link":
                dest.symlink_to(item["source"], target_is_directory=Path(item["source"]).is_dir())
            else:
                self.write_text(dest, item["content"])
            print(f"  Installed {dest}")

        manifest = {str(dest): {k: v for k, v in item.items() if k != "content"}
                    for dest, item in self.files.items() if dest not in self.mutable}
        self.ensure_dir(self.manifest_path.parent)
        self.write_text(self.manifest_path, json_text({"version": 1, "profile": self.profile, "files": manifest}))
        profile_file = self.config / "dotfiles/profile"
        self.ensure_dir(profile_file.parent)
        self.write_text(profile_file, self.profile + "\n")
        print(f"Saved profile: {profile_file}")

    def dependencies(self):
        for relative in ("pi/extensions/web-tools", "profiles/work/pi/extensions/rt-browser"):
            if relative.startswith("profiles/work") and self.profile != "work":
                continue
            source = ROOT / relative
            subprocess.run(["npm", "install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund",
                            "--prefix", str(source)], check=True)
        tpm = self.home / ".tmux/plugins/tpm"
        if not tpm.is_dir():
            tpm.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "clone", "https://github.com/tmux-plugins/tpm", str(tpm)], check=True)
            print("TPM installed. Open tmux and press prefix + I to install plugins.")
        if sys.platform == "darwin" and not shutil.which("dark-notify"):
            subprocess.run(["brew", "install", "cormacrelf/tap/dark-notify"], check=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=PROFILES, help="machine profile (remembered locally)")
    parser.add_argument("--dry-run", action="store_true", help="show plan without changing anything")
    parser.add_argument("--skip-deps", action="store_true", help="skip npm, TPM, and Homebrew installs")
    args = parser.parse_args(argv)
    home = Path.home().absolute()
    config = Path(os.environ.get("XDG_CONFIG_HOME", str(home / ".config"))).absolute()
    state = Path(os.environ.get("XDG_STATE_HOME", str(home / ".local/state"))).absolute()
    profile_file = config / "dotfiles/profile"
    profile = args.profile
    if not profile and profile_file.exists():
        profile = profile_file.read_text().strip()
    if not profile:
        if not sys.stdin.isatty():
            parser.error("No profile selected. Run with --profile home or --profile work.")
        profile = input("Choose this machine's profile [home/work]: ").strip()
    if profile not in PROFILES:
        parser.error(f"Invalid saved/selected profile {profile!r}; use --profile home or --profile work.")
    try:
        installer = Installer(home, config, state, profile, args.dry_run).plan()
        installer.apply()
        if not args.dry_run and not args.skip_deps:
            installer.dependencies()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Setup failed: {error}", file=sys.stderr)
        return 1
    if not args.dry_run:
        print("Done. Restart Pi and other apps after switching profiles.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

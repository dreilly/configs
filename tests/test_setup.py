"""Integration tests use isolated homes and never install dependencies."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("dotfiles_setup", ROOT / "scripts/setup.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="dotfiles test ")
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name) / "home"
        self.home.mkdir()
        self.config = self.home / ".config"
        self.state = self.home / ".local/state"
        self.env = dict(os.environ, HOME=str(self.home), XDG_CONFIG_HOME=str(self.config),
                        XDG_STATE_HOME=str(self.state))
        self.pi = self.home / ".pi/agent"

    def run_setup(self, *args, success=True):
        result = subprocess.run([str(ROOT / "setup.sh"), "--skip-deps", *args], env=self.env,
                                text=True, input="", capture_output=True)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def put(self, path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def local_json(self, relative, value):
        self.put(self.config / "dotfiles/local" / relative, json.dumps(value))

    def load(self, path):
        return json.loads(path.read_text())

    def backups(self):
        return self.state / "dotfiles/backups"

    def test_home_only_loads_home_and_shared(self):
        self.run_setup("--profile", "home")
        settings = self.load(self.pi / "settings.json")
        self.assertEqual(settings["defaultModel"], "gpt-5.6-sol")
        self.assertEqual(settings["defaultProvider"], "openai-codex")
        self.assertEqual(settings["enabledModels"], [
            "openai-codex/gpt-5.6-sol", "openai-codex/gpt-5.6-luna", "openai-codex/gpt-5.6-terra"
        ])
        self.assertEqual(settings["defaultTools"], ["+codemode"])
        self.assertNotIn("deviceId", settings)
        self.assertTrue((self.home / ".zshrc").is_file())
        self.assertFalse((self.pi / "extensions/git-guard.ts").exists())
        self.assertNotIn("git-guard", (self.pi / "AGENTS.md").read_text())
        self.assertTrue((self.pi / "extensions/web-tools").is_symlink())
        for name in ("rtw", "rt-browser", "db-guard.ts"):
            self.assertFalse((self.pi / "extensions" / name).exists())
        self.assertTrue((self.home / ".agents/skills/dex").is_symlink())
        self.assertFalse((self.home / ".agents/skills/rt-tickets").exists())
        self.assertFalse((self.pi / "prompts/commit-rt.md").exists())
        self.assertNotIn("Databases", (self.pi / "AGENTS.md").read_text())
        self.assertIn("chrome-devtools", self.load(self.pi / "mcp.json")["mcpServers"])
        self.assertNotIn("yaak", self.load(self.pi / "mcp.json")["mcpServers"])
        self.assertNotIn("yaak", self.load(self.home / ".agents/mcp.json")["mcpServers"])
        opencode = self.load(self.config / "opencode/opencode.json")
        self.assertIn("hibber", opencode["references"])
        self.assertNotIn("realtime", opencode["references"])
        self.assertEqual(opencode["instructions"], [str(self.config / "opencode/AGENTS.md")])
        self.assertNotIn("dreilly", json.dumps(opencode))
        self.assertNotIn("yaak", opencode["mcp"])
        self.assertFalse((self.config / "opencode/commands/open-realtime.md").exists())
        self.assertFalse((self.pi / "settings.json").is_symlink())
        self.assertFalse((self.home / ".agents").is_symlink())
        self.assertFalse((self.pi / "extensions").is_symlink())

    def test_work_defaults_and_existing_shell_are_preserved(self):
        self.put(self.home / ".zshrc", "# Work machine's own shell\n")
        self.run_setup("--profile", "work")
        self.assertEqual((self.home / ".zshrc").read_text(), "# Work machine's own shell\n")
        self.assertEqual(self.load(self.pi / "settings.json")["defaultModel"], "claude-opus-5.5")
        self.assertTrue((self.pi / "extensions/rt-browser").is_symlink())
        self.assertTrue((self.pi / "extensions/rtw").is_symlink())
        self.assertTrue((self.pi / "extensions/db-guard.ts").is_symlink())
        self.assertTrue((self.pi / "extensions/git-guard.ts").is_symlink())
        self.assertIn("git-guard", (self.pi / "AGENTS.md").read_text())
        self.assertTrue((self.home / ".agents/skills/rt-tickets").is_symlink())
        self.assertIn("Databases", (self.pi / "AGENTS.md").read_text())
        self.assertIn("gpt-6.1-sol", (self.pi / "agents/worker.md").read_text())
        self.assertIn("font-size = 15", (self.config / "ghostty/config").read_text())
        self.assertNotIn("chrome-devtools", self.load(self.pi / "mcp.json")["mcpServers"])
        self.assertIn("yaak", self.load(self.pi / "mcp.json")["mcpServers"])
        self.assertIn("yaak", self.load(self.home / ".agents/mcp.json")["mcpServers"])
        self.assertTrue((self.config / "opencode/commands/open-realtime.md").exists())
        self.assertIn("realtime", self.load(self.config / "opencode/opencode.json")["references"])
        self.assertIn("yaak", self.load(self.config / "opencode/opencode.json")["mcp"])

    def test_switching_profiles_removes_all_inactive_managed_resources(self):
        self.run_setup("--profile", "home")
        self.run_setup("--profile", "work")
        self.assertFalse((self.home / ".zshrc").exists())
        self.assertTrue((self.pi / "extensions/git-guard.ts").is_symlink())
        self.assertIn("git-guard", (self.pi / "AGENTS.md").read_text())
        self.assertTrue((self.pi / "prompts/commit-rt.md").exists())
        self.run_setup("--profile", "home")
        for name in ("rtw", "rt-browser", "db-guard.ts"):
            self.assertFalse((self.pi / "extensions" / name).exists())
        self.assertFalse((self.pi / "prompts/commit-rt.md").exists())
        self.assertFalse((self.pi / "extensions/git-guard.ts").is_symlink())
        self.assertFalse((self.pi / "extensions/git-guard.ts").exists())
        self.assertNotIn("git-guard", (self.pi / "AGENTS.md").read_text())
        self.assertFalse((self.home / ".agents/skills/rt-tickets").exists())
        self.assertFalse((self.config / "opencode/commands/commit-rt.md").exists())
        self.assertFalse((self.config / "opencode/commands/open-realtime.md").exists())
        self.assertNotIn("Databases", (self.pi / "AGENTS.md").read_text())
        self.assertNotIn("yaak", self.load(self.pi / "mcp.json")["mcpServers"])
        self.assertNotIn("yaak", self.load(self.home / ".agents/mcp.json")["mcpServers"])
        self.assertNotIn("font-size = 15", (self.config / "ghostty/config").read_text())
        self.assertIn("gpt-5.6-sol", (self.pi / "agents/worker.md").read_text())
        self.assertEqual((self.config / "dotfiles/profile").read_text().strip(), "home")
        self.assertIn("chrome-devtools", self.load(self.pi / "mcp.json")["mcpServers"])

    def test_remembers_profile_and_is_idempotent(self):
        self.run_setup("--profile", "home")
        settings = self.pi / "settings.json"
        before = settings.stat().st_mtime_ns
        result = self.run_setup()
        self.assertIn("Installing home profile", result.stdout)
        self.assertEqual(before, settings.stat().st_mtime_ns)
        self.assertFalse(self.backups().exists())

    def test_first_install_needs_explicit_profile_noninteractively(self):
        self.run_setup(success=False)
        self.assertEqual(list(self.home.iterdir()), [])

    def test_invalid_profile_does_not_write(self):
        self.put(self.config / "dotfiles/profile", "office\n")
        result = self.run_setup(success=False)
        self.assertIn("Invalid saved/selected profile", result.stderr)
        self.assertFalse(self.pi.exists())

    def test_dry_run_has_no_side_effects(self):
        result = self.run_setup("--profile", "work", "--dry-run")
        self.assertIn("Dry run", result.stdout)
        self.assertEqual(list(self.home.iterdir()), [])

    def test_dry_run_does_not_change_saved_profile(self):
        self.run_setup("--profile", "home")
        original = (self.pi / "settings.json").read_text()
        self.run_setup("--profile", "work", "--dry-run")
        self.assertEqual((self.config / "dotfiles/profile").read_text(), "home\n")
        self.assertEqual((self.pi / "settings.json").read_text(), original)

    def test_local_json_deep_merge_array_replace_and_null_delete(self):
        self.local_json("pi/settings.json", {"defaultModel": "personal-model", "enabledModels": ["a/b"],
                                             "codemode": {"inlineBudget": 100}})
        self.local_json("pi/mcp.json", {"mcpServers": {"chrome-devtools": None, "example": {"url": "http://localhost:1/mcp"}}})
        self.local_json("profile.json", {"manageZsh": False})
        self.run_setup("--profile", "home")
        settings = self.load(self.pi / "settings.json")
        self.assertEqual(settings["defaultModel"], "personal-model")
        self.assertEqual(settings["enabledModels"], ["a/b"])
        self.assertEqual(settings["defaultTools"], ["+codemode"])
        mcp = self.load(self.pi / "mcp.json")["mcpServers"]
        self.assertNotIn("yaak", mcp)
        self.assertNotIn("chrome-devtools", mcp)
        self.assertIn("example", mcp)
        self.assertFalse((self.home / ".zshrc").exists())

    def test_local_resources_and_text_override(self):
        self.put(self.config / "dotfiles/local/pi/agents/worker.md", "# Local worker\n")
        self.put(self.config / "dotfiles/local/pi/extensions/personal.ts", "// local\n")
        self.put(self.config / "dotfiles/local/ghostty/config", "font-size = 18\n")
        self.put(self.config / "dotfiles/local/pi/AGENTS.md", "## Personal instructions\n")
        self.run_setup("--profile", "work")
        self.assertEqual((self.pi / "agents/worker.md").read_text(), "# Local worker\n")
        self.assertTrue((self.pi / "extensions/personal.ts").is_symlink())
        self.assertTrue((self.config / "ghostty/config").read_text().endswith("font-size = 18\n"))
        self.assertIn("Personal instructions", (self.pi / "AGENTS.md").read_text())

    def test_invalid_local_json_fails_before_changing_files(self):
        self.put(self.config / "dotfiles/local/pi/settings.json", "{invalid")
        self.run_setup("--profile", "home", success=False)
        self.assertFalse((self.home / ".zshrc").exists())
        self.assertFalse(self.pi.exists())
        self.assertFalse((self.config / "dotfiles/profile").exists())

    def test_migration_does_not_modify_symlink_targets(self):
        legacy = Path(self.temporary.name) / "old checkout"
        self.put(legacy / "agents/skill-invocation.json", '{"version":1,"modes":{"custom":"manual-only"}}')
        self.put(legacy / "agents/.skill-lock.json", '{"skills":{"custom":{}}}')
        self.put(legacy / "agents/skills/old-work/SKILL.md", "# old\n")
        self.put(legacy / "extensions/rt-browser/index.ts", "// legacy work\n")
        self.put(legacy / "settings.json", '{"defaultModel":"old", "deviceId":"machine-id", "lastChangelogVersion":"9.9"}')
        self.pi.mkdir(parents=True)
        (self.home / ".agents").symlink_to(legacy / "agents")
        (self.pi / "extensions").symlink_to(legacy / "extensions")
        (self.pi / "settings.json").symlink_to(legacy / "settings.json")
        originals = {p: p.read_bytes() for p in legacy.rglob("*") if p.is_file()}
        self.run_setup("--profile", "home")
        for path, content in originals.items():
            self.assertEqual(path.read_bytes(), content)
        self.assertFalse((self.pi / "extensions/rt-browser").exists())
        self.assertFalse((self.home / ".agents/skills/old-work").exists())
        settings = self.load(self.pi / "settings.json")
        self.assertEqual(settings["deviceId"], "machine-id")
        self.assertEqual(settings["lastChangelogVersion"], "9.9")
        policy = self.home / ".agents/skill-invocation.json"
        self.assertFalse(policy.is_symlink())
        self.assertEqual(self.load(policy)["modes"], {"custom": "manual-only"})
        self.assertTrue(self.backups().exists())

    def test_auth_sessions_and_unmanaged_resources_are_untouched(self):
        self.put(self.pi / "auth.json", "DO NOT TOUCH")
        self.put(self.pi / "sessions/session.jsonl", "DO NOT TOUCH")
        self.put(self.pi / "extensions/personal.ts", "// custom\n")
        self.put(self.home / ".agents/skills/personal/SKILL.md", "# personal\n")
        self.put(self.pi / "agent-models.local.json", '{"agents":{"worker":"custom/model"}}')
        self.run_setup("--profile", "work")
        self.run_setup("--profile", "home")
        self.assertEqual((self.pi / "auth.json").read_text(), "DO NOT TOUCH")
        self.assertEqual((self.pi / "sessions/session.jsonl").read_text(), "DO NOT TOUCH")
        self.assertEqual((self.pi / "extensions/personal.ts").read_text(), "// custom\n")
        self.assertTrue((self.home / ".agents/skills/personal/SKILL.md").exists())
        self.assertEqual(self.load(self.pi / "agent-models.local.json")["agents"]["worker"], "custom/model")

    def test_modified_managed_file_is_backed_up_outside_discovery(self):
        self.run_setup("--profile", "home")
        self.put(self.home / ".zshrc", "# custom edit\n")
        self.run_setup("--profile", "work")
        matches = list(self.backups().rglob(".zshrc"))
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].read_text(), "# custom edit\n")
        self.assertFalse((self.home / ".zshrc").exists())
        self.assertFalse(any("backup" in p.name for p in (self.pi / "extensions").iterdir()))

    def test_legacy_inactive_resource_is_backed_up(self):
        self.put(self.pi / "extensions/rt-browser/index.ts", "// not manifest-managed\n")
        self.run_setup("--profile", "home")
        self.assertFalse((self.pi / "extensions/rt-browser").exists())
        self.assertTrue(list(self.backups().rglob("rt-browser/index.ts")))

    def test_relative_symlink_backup_still_points_at_original_target(self):
        self.put(self.home / "old-shell", "# original\n")
        (self.home / ".zshrc").symlink_to("old-shell")
        self.run_setup("--profile", "home")
        backups = list(self.backups().rglob(".zshrc"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), "# original\n")
        self.assertEqual((self.home / "old-shell").read_text(), "# original\n")

    def test_mutable_skill_preferences_remain_local_and_persist(self):
        self.run_setup("--profile", "home")
        path = self.home / ".agents/skill-invocation.json"
        self.assertFalse(path.is_symlink())
        self.put(path, '{"version":1,"modes":{"custom":"manual-only"}}')
        self.run_setup("--profile", "work")
        self.assertEqual(self.load(path)["modes"], {"custom": "manual-only"})
        self.assertFalse((self.home / ".agents/.skill-lock.json").is_symlink())

    def test_runtime_settings_survive_rerun_and_switch(self):
        self.run_setup("--profile", "home")
        settings = self.load(self.pi / "settings.json")
        settings.update(deviceId="local-id", lastChangelogVersion="123")
        self.put(self.pi / "settings.json", json.dumps(settings))
        self.run_setup("--profile", "work")
        self.assertEqual(self.load(self.pi / "settings.json")["deviceId"], "local-id")
        self.assertEqual(self.load(self.pi / "settings.json")["lastChangelogVersion"], "123")

    def test_xdg_paths_are_honored(self):
        self.config = Path(self.temporary.name) / "config elsewhere"
        self.state = Path(self.temporary.name) / "state elsewhere"
        self.env.update(XDG_CONFIG_HOME=str(self.config), XDG_STATE_HOME=str(self.state))
        self.run_setup("--profile", "home")
        self.assertTrue((self.config / "dotfiles/profile").exists())
        self.assertTrue((self.state / "dotfiles/manifest.json").exists())
        self.assertEqual(self.load(self.config / "opencode/opencode.json")["instructions"],
                         [str(self.config / "opencode/AGENTS.md")])

    def test_dependency_installation_is_profile_specific(self):
        for profile in ("home", "work"):
            installer = setup.Installer(self.home, self.config, self.state, profile)
            with patch.object(setup.subprocess, "run") as run, patch.object(setup.shutil, "which", return_value="yes"):
                installer.dependencies()
            npm_calls = [call.args[0] for call in run.call_args_list if call.args[0][0] == "npm"]
            self.assertEqual(len(npm_calls), 1 if profile == "home" else 2)
            self.assertEqual(any("rt-browser" in str(call) for call in npm_calls), profile == "work")

    def test_json_merge_handles_object_replacing_scalar(self):
        self.assertEqual(setup.merge({"a": 1}, {"a": {"b": 2}}), {"a": {"b": 2}})


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Exercises mini-app metadata validation with disposable fixtures."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VALIDATOR = ROOT / "scripts" / "validate-mini-app.py"
TEMPLATE = ROOT / "templates" / "mini-app"
STATUSES = ("idea", "wip", "testing", "live", "archived")


def run_validator(folder):
    return subprocess.run(
        [sys.executable, str(VALIDATOR), str(folder)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


class ValidatorTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def make_app(self, name, update=None):
        folder = self.root / "apps" / name
        shutil.copytree(TEMPLATE, folder)
        manifest_path = folder / "app.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["id"] = name
        if update:
            update(manifest)
        manifest_path.write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        return folder

    def assert_failure(self, folder, message):
        result = run_validator(folder)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("FAIL: " + message, result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_template_still_passes_without_directory_name_rule(self):
        result = run_validator(TEMPLATE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PASS:", result.stdout)

    def test_matching_app_id_passes(self):
        folder = self.make_app("alpha")
        result = run_validator(folder)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PASS:", result.stdout)

    def test_id_must_match_app_directory(self):
        folder = self.make_app("alpha")

        def mismatch(manifest):
            manifest["id"] = "totally-different-id"

        manifest_path = folder / "app.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        mismatch(manifest)
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        self.assert_failure(folder, "id must match app directory name 'alpha'")

    def test_all_documented_statuses_pass(self):
        for status in STATUSES:
            with self.subTest(status=status):
                folder = self.make_app(
                    "status-" + status,
                    lambda manifest, value=status: manifest.__setitem__(
                        "status", value
                    ),
                )
                result = run_validator(folder)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("PASS:", result.stdout)

    def test_non_string_statuses_fail_without_traceback(self):
        cases = (
            ("list", ["wip"]),
            ("object", {"value": "wip"}),
            ("null", None),
            ("number", 1),
            ("boolean", True),
        )
        for label, value in cases:
            with self.subTest(status=label):
                folder = self.make_app(
                    "status-" + label,
                    lambda manifest, value=value: manifest.__setitem__(
                        "status", value
                    ),
                )
                self.assert_failure(folder, "invalid status")

    def test_missing_status_fails_without_traceback(self):
        folder = self.make_app(
            "status-missing", lambda manifest: manifest.pop("status")
        )
        self.assert_failure(folder, "invalid status")


if __name__ == "__main__":
    unittest.main(verbosity=2)

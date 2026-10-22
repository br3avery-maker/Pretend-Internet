#!/usr/bin/env python3
"""Checks metadata shape and entry file; does not verify runtime or APK."""
import json
import re
import sys
from pathlib import Path

STATUS = {"idea", "wip", "testing", "live", "archived"}
ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?\Z")

def validate(folder):
    errors = []
    path = folder / "app.json"
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"{path}: {exc}"]
    if not isinstance(obj, dict):
        return ["app.json must be a JSON object"]
    def required_text(key):
        x = obj.get(key)
        if not isinstance(x, str) or not x.strip():
            errors.append(key + " must be nonempty text")
            return ""
        return x
    if obj.get("schemaVersion") != "0.1": errors.append("schemaVersion must be 0.1")
    if not ID.fullmatch(required_text("id")): errors.append("id must be lowercase kebab-case")
    required_text("name")
    if not VERSION.fullmatch(required_text("version")): errors.append("version must be X.Y.Z")
    if obj.get("status") not in STATUS: errors.append("invalid status")
    required_text("summary")
    entry = required_text("entry")
    if entry:
        target = (folder / entry).resolve()
        if not target.is_relative_to(folder.resolve()) or not target.is_file():
            errors.append("entry must exist inside app directory")
    if not isinstance(obj.get("offline"), bool): errors.append("offline must be boolean")
    required_text("storage")
    p = obj.get("permissions")
    if not isinstance(p, list) or any(not isinstance(x, str) for x in p):
        errors.append("permissions must be an array of strings")
    helpdata = obj.get("help")
    if not isinstance(helpdata, dict): errors.append("help must be an object")
    else:
        for field in ("purpose", "start", "limitations", "data"):
            if not isinstance(helpdata.get(field), str) or not helpdata[field].strip():
                errors.append("help." + field + " must be nonempty text")
    if not (folder / "README.md").is_file(): errors.append("README.md is missing")
    return errors

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/validate-mini-app.py DIRECTORY", file=sys.stderr)
        sys.exit(2)
    folder=Path(sys.argv[1])
    errors=validate(folder)
    if errors:
        for error in errors: print("FAIL:", error, file=sys.stderr)
        sys.exit(1)
    print("PASS: metadata and file paths for", folder, "(NOT runtime or APK)")

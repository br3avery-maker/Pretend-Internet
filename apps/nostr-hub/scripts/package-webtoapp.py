#!/usr/bin/env python3
"""Package this app as a one-app WebToApp v5 data import ZIP."""
import argparse
import hashlib
import json
from pathlib import Path
from struct import unpack
from zipfile import ZIP_DEFLATED, ZipFile

APP = Path(__file__).resolve().parents[1]
NAME = "Pretend Internet"
PACKAGE = "xyz.chaoticka.pretendinternet"
ICON_PATH = "resources/icons/1_pretend-internet.png"
FILE_TYPES = {
    ".html": "HTML", ".css": "CSS", ".js": "JS", ".mjs": "JS",
    ".png": "IMAGE", ".webp": "IMAGE", ".svg": "IMAGE", ".woff2": "FONT",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dist", type=Path, help="Compiled app directory")
    parser.add_argument("icon", type=Path, help="512 × 512 launcher PNG")
    parser.add_argument("output", type=Path, help="New WebToApp import ZIP")
    args = parser.parse_args()
    dist = args.dist.resolve()
    if args.output.resolve().is_relative_to(dist):
        parser.error("The ZIP must be outside the build directory.")
    files = {
        path.relative_to(dist).as_posix(): path.read_bytes()
        for path in sorted(dist.rglob("*")) if path.is_file()
    }
    if not {"index.html", "sw.js", "books/loopy-library.json", "manifest.webmanifest"} <= files.keys():
        parser.error("Run the production build before packaging.")

    icon = args.icon.read_bytes()
    if icon[:16] != b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" or unpack(">II", icon[16:24]) != (512, 512):
        parser.error("The launcher icon must be a 512 × 512 PNG.")
    prefs = json.loads((APP / "webtoapp/common.json").read_text())
    version = json.loads((APP / "package.json").read_text())["version"]
    digest = hashlib.sha256()
    for path, body in files.items():
        digest.update(path.encode())
        digest.update(hashlib.sha256(body).digest())
    project_id = "pretend-internet-" + digest.hexdigest()[:16]
    project_root = f"local/files/html_projects/{project_id}/"
    resource_root = "resources/html/1/"
    app = {
        "id": 1,
        "name": NAME,
        "url": "",
        "iconPath": ICON_PATH,
        "packageName": PACKAGE,
        "appType": "HTML",
        "htmlConfig": {
            "projectId": project_id,
            "entryFile": "index.html",
            "files": [
                {"name": path, "path": resource_root + path,
                 "type": FILE_TYPES.get(Path(path).suffix, "OTHER")}
                for path in files
            ],
            "enableJavaScript": True,
            "enableLocalStorage": True,
            "allowFileAccess": False,
            "backgroundColor": "#000000",
            "loadMode": "LOCAL_HTTP",
            "port": 17886,
            "portConflictMode": "ALERT",
        },
        "webViewConfig": prefs,
        "apkExportConfig": {
            "customPackageName": PACKAGE,
            "customVersionName": version,
            "customVersionCode": 1,
            "engineType": "SYSTEM_WEBVIEW",
            "iconBackgroundColor": "#000000",
        },
    }
    backup = {"version": 5, "appCount": 1, "apps": [app], "categories": [],
              "usageStats": [], "healthRecords": []}
    with ZipFile(args.output, "x", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("apps.json", json.dumps(backup, indent=2) + "\n")
        archive.writestr(ICON_PATH, icon)
        for path, body in files.items():
            # The restore path maps both HtmlFile paths and the HTML project root.
            archive.writestr(resource_root + path, body)
            archive.writestr(project_root + path, body)
    with ZipFile(args.output) as archive:
        if archive.testzip() is not None:
            raise SystemExit("ZIP integrity check failed.")
        assert archive.read(ICON_PATH) == icon
        for path, body in files.items():
            assert archive.read(project_root + path) == archive.read(resource_root + path) == body
    print(f"{args.output} contains one app, one launcher icon and {len(files)} verified app files.")


if __name__ == "__main__":
    main()

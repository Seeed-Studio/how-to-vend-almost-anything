#!/usr/bin/env python3
"""Local site preview. Serves docs/ and writes contributions into the repo."""

import json
import re
import time
from email.parser import BytesParser
from email.policy import default
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"
SUBMISSIONS = DOCS / "submissions.json"
IDEAS = DOCS / "ideas.json"
INTEREST = DOCS / "interest.json"
SYSTEMS = {"full", "dispensing", "storage", "enclosure", "control", "vending", "operator"}
VERSIONS = {"V0", "V1"}
IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_IMAGE = 5 * 1024 * 1024
MAX_BODY = 12 * 1024 * 1024


def slug(value):
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return text[:40] or "contribution"


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        rel = unquote(urlparse(path).path).lstrip("/")
        base = ROOT if rel.startswith(("xiao-vending-machine-v0/", "xiao-vending-machine-v1/")) else DOCS
        target = (base / rel).resolve()
        if not str(target).startswith(str(base)):
            return str(DOCS / "__missing__")
        return str(target)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/votes":
            self.vote()
            return
        if path == "/api/interest":
            self.interest()
            return
        if path not in ("/api/contributions", "/api/ideas"):
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self.reply(413, {"error": "The upload is empty or too large."})
            return
        raw = self.rfile.read(length)
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            self.reply(400, {"error": "Expected a multipart form."})
            return
        message = BytesParser(policy=default).parsebytes(
            f"Content-Type: {ctype}\r\nMIME-Version: 1.0\r\n\r\n".encode() + raw
        )
        if not message.is_multipart():
            self.reply(400, {"error": "Expected a multipart form."})
            return
        fields = {}
        files = {}
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if not name:
                continue
            payload = part.get_payload(decode=True) or b""
            filename = part.get_filename()
            if filename:
                entry = (filename, part.get_content_type(), payload)
                if name == "images":
                    files.setdefault(name, []).append(entry)
                else:
                    files[name] = entry
            else:
                fields[name] = payload.decode("utf-8", "replace").strip()
        try:
            if path == "/api/ideas":
                item = save_idea(fields, files)
            else:
                item = save_contribution(fields, files)
        except ValueError as error:
            self.reply(400, {"error": str(error)})
            return
        self.reply(200, {"ok": True, "item": item})

    def interest(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 20000:
            self.reply(400, {"error": "Missing interest."})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            self.reply(400, {"error": "Missing interest."})
            return
        try:
            item = save_interest(payload)
        except ValueError as error:
            self.reply(400, {"error": str(error)})
            return
        self.reply(200, {"ok": True, "item": item})

    def vote(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 10000:
            self.reply(400, {"error": "Missing vote."})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            self.reply(400, {"error": "Missing vote."})
            return
        kind = payload.get("kind")
        item_id = payload.get("id")
        path = SUBMISSIONS if kind == "submission" else IDEAS if kind == "idea" else None
        if path is None or not item_id:
            self.reply(400, {"error": "Unknown vote."})
            return
        current = json.loads(path.read_text()) if path.exists() else {"items": []}
        found = None
        for item in current.get("items") or []:
            if item.get("id") == item_id:
                item["upvotes"] = int(item.get("upvotes") or 0) + 1
                found = item
                break
        if not found:
            self.reply(404, {"error": "That item is not in the list."})
            return
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(current, indent=2) + "\n")
        temporary.replace(path)
        self.reply(200, {"ok": True, "upvotes": found["upvotes"]})

    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def save_contribution(fields, files):
    system = fields.get("system", "")
    version = fields.get("version", "")
    title = fields.get("title", "")
    description = fields.get("description", "")
    name = fields.get("contributor", "")
    lab_id = fields.get("contributor_kind", "")
    lab = fields.get("lab_name", "")
    if system not in SYSTEMS:
        raise ValueError("Choose a system.")
    if version not in VERSIONS:
        raise ValueError("Choose V0 or V1.")
    if len(title) < 5:
        raise ValueError("The title needs at least 5 characters.")
    if len(description) < 15:
        raise ValueError("The description needs at least 15 characters.")
    if not name:
        raise ValueError("Add the contributor name.")
    if lab_id == "individual" or not lab or lab == "Individual contributor":
        lab = ""
        lab_id = "individual"
    sketch = image_file(files.get("sketch"), "sketch")
    actual = image_file(files.get("actual"), "actual")
    if sketch is None or actual is None:
        raise ValueError("Add both the sketch diagram and the actual diagram.")
    folder_name = f"{slug(name)}-{slug(lab or 'individual')}-{int(time.time())}"
    folder = (DOCS / "submissions" / system / folder_name).resolve()
    if not str(folder).startswith(str((DOCS / "submissions").resolve())):
        raise ValueError("That folder is not allowed.")
    folder.mkdir(parents=True, exist_ok=False)
    sketch_name = "sketch" + sketch[0]
    actual_name = "actual" + actual[0]
    (folder / sketch_name).write_bytes(sketch[1])
    (folder / actual_name).write_bytes(actual[1])
    item = {
        "id": f"{system}-{version.lower()}-{folder_name}",
        "system": system,
        "version": version,
        "lab": lab,
        "lab_id": lab_id,
        "name": name,
        "title": title,
        "description": description,
        "sketch": f"submissions/{system}/{folder_name}/{sketch_name}",
        "actual": f"submissions/{system}/{folder_name}/{actual_name}",
        "created_at": int(time.time()),
        "upvotes": 0,
    }
    current = {"items": []}
    if SUBMISSIONS.exists():
        current = json.loads(SUBMISSIONS.read_text())
    items = list(current.get("items") or [])
    items.append(item)
    temporary = SUBMISSIONS.with_suffix(".json.tmp")
    temporary.write_text(json.dumps({"items": items}, indent=2) + "\n")
    temporary.replace(SUBMISSIONS)
    return item


def save_interest(payload):
    lab_id = str(payload.get("lab_id") or "").strip()
    note = str(payload.get("note") or "").strip()
    if len(note) > 2500:
        raise ValueError("The note is too long.")
    directory = json.loads((DOCS / "en" / "data" / "directory-labs.json").read_text())
    lab = next((item for item in directory.get("labs") or [] if item.get("lab_id") == lab_id), None)
    if not lab:
        raise ValueError("Choose a lab from the directory.")
    item = {
        "id": f"interest-{slug(lab_id)}-{int(time.time())}",
        "lab_id": lab_id,
        "name": lab.get("name") or "",
        "city": lab.get("city") or "",
        "country": lab.get("country") or "",
        "note": note,
        "created_at": int(time.time()),
    }
    write_items(INTEREST, item)
    return item


def save_idea(fields, files):
    description = fields.get("description", "")
    name = fields.get("contributor", "")
    lab_id = fields.get("contributor_kind", "")
    lab = fields.get("lab_name", "")
    if len(description) < 15:
        raise ValueError("The idea needs at least 15 characters.")
    if not name:
        raise ValueError("Add the contributor name.")
    system = fields.get("system", "")
    if system not in SYSTEMS:
        raise ValueError("Choose a system.")
    if lab_id == "individual" or not lab or lab in ("Individual contributor", "个人贡献者"):
        lab = ""
        lab_id = "individual"
    images = files.get("images") or []
    if len(images) > 4:
        raise ValueError("Maximum four images.")
    folder_name = f"{slug(name)}-{slug(lab or 'individual')}-{int(time.time())}"
    saved = []
    if images:
        folder = (DOCS / "ideas" / folder_name).resolve()
        if not str(folder).startswith(str((DOCS / "ideas").resolve())):
            raise ValueError("That folder is not allowed.")
        folder.mkdir(parents=True, exist_ok=False)
        for index, entry in enumerate(images, start=1):
            parsed = image_file(entry, "image")
            if not parsed:
                raise ValueError("That image is not accepted.")
            filename = f"image-{index}{parsed[0]}"
            (folder / filename).write_bytes(parsed[1])
            saved.append(f"ideas/{folder_name}/{filename}")
    item = {
        "id": f"idea-{folder_name}",
        "system": system,
        "lab": lab,
        "lab_id": lab_id,
        "name": name,
        "description": description,
        "images": saved,
        "created_at": int(time.time()),
        "upvotes": 0,
    }
    write_items(IDEAS, item)
    return item


def write_items(path, item):
    current = {"items": []}
    if path.exists():
        current = json.loads(path.read_text())
    items = list(current.get("items") or [])
    items.append(item)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps({"items": items}, indent=2) + "\n")
    temporary.replace(path)


def image_file(entry, label):
    if not entry:
        return None
    filename, content_type, payload = entry
    if len(payload) > MAX_IMAGE:
        raise ValueError(f"The {label} diagram must be 5 MB or smaller.")
    suffix = IMAGE_TYPES.get(content_type)
    if not suffix:
        extension = Path(filename).suffix.lower()
        suffix = {".png": ".png", ".jpg": ".jpg", ".jpeg": ".jpg", ".webp": ".webp", ".gif": ".gif"}.get(extension)
    if not suffix:
        raise ValueError(f"The {label} diagram must be a PNG, JPEG, WebP, or GIF.")
    return suffix, payload


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8080), Handler).serve_forever()

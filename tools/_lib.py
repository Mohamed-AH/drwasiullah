"""Shared by the tools: load site/data/library.json plus its companion site/data/makkah.json (lessons imported from makkahscholars.org)."""
import json
from pathlib import Path


def load_library(path):
    path = Path(path)
    lib = json.loads(path.read_text(encoding="utf-8"))
    extra = path.with_name("makkah.json")
    if extra.exists():
        x = json.loads(extra.read_text(encoding="utf-8"))
        lib = {**lib, "series": lib["series"] + x.get("series", []), "lessons": lib["lessons"] + x.get("lessons", [])}
    return lib

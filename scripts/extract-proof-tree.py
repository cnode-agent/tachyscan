#!/usr/bin/env python3
"""Extract the diagram's contract from a pinned Tachyon Git revision.

Usage: python3 scripts/extract-proof-tree.py /path/to/tachyon
Reads Git objects, not potentially modified checkout files. No network needed.
Fail on unfamiliar declarations rather than silently inventing diagram edges.
"""
import json
from pathlib import Path
import re
import subprocess
import sys

REVISION = "fc47e94846ee6f9f3f30a32f884b098e51e30620"
ROOT = "crates/tachyon/src/stamp/proof"


def read(path):
    return subprocess.check_output(
        ["git", "-C", sys.argv[1], "show", f"{REVISION}:{path}"], text=True
    )


def tuple_parts(text):
    text = text.strip()
    if not text.startswith("("):
        return [text]
    assert text.endswith(")"), text
    parts, start, depth = [], 0, 0
    text = text[1:-1]
    for i, char in enumerate(text):
        if char in "(<[":
            depth += 1
        elif char in ")>]":
            depth -= 1
        elif char == "," and depth == 0:
            if text[start:i].strip():
                parts.append(text[start:i].strip())
            start = i + 1
    if text[start:].strip():
        parts.append(text[start:].strip())
    return parts


def flatten(names, types):
    names, types = tuple_parts(names), tuple_parts(types)
    assert len(names) == len(types), (names, types)
    result = []
    for name, ty in zip(names, types):
        if name.startswith("("):
            result.extend(flatten(name, ty))
        else:
            result.append({"name": name, "type": ty, "polynomial": ty.endswith("Poly")})
    return result


steps, headers = [], []
registry = re.findall(r"\.register\((\w+)::(\w+)\)", read(ROOT + ".rs"))
for module in sorted({module for module, _ in registry}):
    path = f"{ROOT}/{module}.rs"
    source = read(path)
    for match in re.finditer(r"impl (Step<Pasta>|Header<Fp>) for (\w+) \{", source):
        kind, name = match.groups()
        block = source[match.end():source.index("\n    fn ", match.end())]
        # Array lengths contain semicolons: type declarations end at a newline.
        types = dict(re.findall(r"type (\w+)(?:<'source>)? = (.*?);\n", block, re.S))
        types = {key: re.sub(r"\s+", " ", value).strip() for key, value in types.items()}
        field_type = "Witness" if kind.startswith("Step") else "Data"
        comment = re.search(r"/// `([^`]+)`\.?\s+type " + field_type, block)
        fields = re.sub(r"\s*///\s*", " ", comment[1]).strip() if comment else "()"
        item = {"name": name, "module": module, "line": source[:match.start()].count("\n") + 1}
        if kind.startswith("Step"):
            index = int(re.search(r"Index::new\((\d+)\)", block)[1])
            assert registry[index] == (module, name)
            item.update(index=index, left=types["Left"], right=types["Right"], output=types["Output"],
                        witness=flatten(fields, types["Witness"]), witnessType=types["Witness"])
            steps.append(item)
        else:
            slots = tuple_parts(types["OnlinePolyCommit"])
            assert len(slots) == 2
            item.update(fields=tuple_parts(fields), dataType=types["Data"], slots=slots)
            headers.append(item)

assert len(steps) == len(registry)
assert len({step["name"] for step in steps}) == len(registry)
header_names = {header["name"] for header in headers}
for step in steps:
    assert {step["left"], step["right"], step["output"]} <= header_names | {"()"}

output = {"revision": REVISION, "repository": "https://github.com/tachyon-zcash/tachyon",
          "steps": sorted(steps, key=lambda step: step["index"]),
          "headers": sorted(headers, key=lambda header: header["name"])}
Path("src/proof-tree/contracts.json").write_text(json.dumps(output, indent=2) + "\n")
print(f"Extracted {len(steps)} steps and {len(headers)} headers at {REVISION}")

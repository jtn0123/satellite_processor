#!/usr/bin/env python3
"""Merge multiple coverage XML shard files into a single coverage.xml.

Properly combines line hits across shards so that a line covered by any
shard is marked as covered in the output.  Rewrites <source> paths so
SonarQube can resolve files from the repo root.
"""

import glob
import sys
import xml.etree.ElementTree as ET

files = sorted(glob.glob("coverage-shard*.xml"))
if not files:
    print("No coverage files found")
    sys.exit(0)

# Collect per-file line hit data across all shards.
# Key: (package_name, class_filename) -> {line_number: total_hits}
merged: dict[tuple[str, str], dict[int, int]] = {}
# Keep class attributes from the first occurrence
class_attrs: dict[tuple[str, str], dict[str, str]] = {}
# Track all package names
package_names: set[str] = set()

for f in files:
    tree = ET.parse(f)
    for pkg in tree.getroot().findall(".//package"):
        pkg_name = pkg.get("name", "")
        package_names.add(pkg_name)
        for cls in pkg.findall("classes/class"):
            fname = cls.get("filename", "")
            key = (pkg_name, fname)
            if key not in merged:
                merged[key] = {}
                class_attrs[key] = dict(cls.attrib)
            for line in cls.findall(".//line"):
                ln = int(line.get("number", 0))
                hits = int(line.get("hits", 0))
                merged[key][ln] = merged[key].get(ln, 0) + hits

# Build the output XML
root = ET.Element("coverage")
root.set("version", "6")

sources = ET.SubElement(root, "sources")
s = ET.SubElement(sources, "source")
s.text = "backend/app"

packages_el = ET.SubElement(root, "packages")

# Group by package
by_pkg: dict[str, list[tuple[str, str]]] = {}
for key in merged:
    by_pkg.setdefault(key[0], []).append(key)

total_lines = 0
total_covered = 0

for pkg_name in sorted(by_pkg):
    pkg_el = ET.SubElement(packages_el, "package", name=pkg_name)
    classes_el = ET.SubElement(pkg_el, "classes")
    for key in sorted(by_pkg[pkg_name]):
        attrs = class_attrs[key].copy()
        cls_el = ET.SubElement(classes_el, "class", **attrs)
        lines_el = ET.SubElement(cls_el, "lines")
        line_data = merged[key]
        file_lines = 0
        file_covered = 0
        for ln in sorted(line_data):
            hits = line_data[ln]
            ET.SubElement(lines_el, "line", number=str(ln), hits=str(hits))
            file_lines += 1
            if hits > 0:
                file_covered += 1
        total_lines += file_lines
        total_covered += file_covered
        if file_lines > 0:
            cls_el.set("line-rate", f"{file_covered / file_lines:.4f}")

root.set("lines-valid", str(total_lines))
root.set("lines-covered", str(total_covered))
if total_lines > 0:
    root.set("line-rate", f"{total_covered / total_lines:.4f}")

tree = ET.ElementTree(root)
tree.write("coverage.xml", xml_declaration=True)
print(f"Merged {len(files)} coverage files: {total_covered}/{total_lines} lines covered")

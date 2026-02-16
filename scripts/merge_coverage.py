#!/usr/bin/env python3
"""Merge multiple coverage XML shard files into a single coverage.xml.

Rewrites <source> paths so SonarQube can resolve files from the repo root.
"""
import glob
import os
import sys
import xml.etree.ElementTree as ET

files = sorted(glob.glob("coverage-shard*.xml"))
if not files:
    print("No coverage files found")
    sys.exit(0)

base = ET.parse(files[0])
root = base.getroot()

for f in files[1:]:
    tree = ET.parse(f)
    for pkg in tree.getroot().findall(".//package"):
        name = pkg.get("name")
        existing = root.find(f".//package[@name='{name}']")
        if existing is not None:
            for cls in pkg.findall("classes/class"):
                existing.find("classes").append(cls)
        else:
            packages = root.find(".//packages")
            if packages is not None:
                packages.append(pkg)

# Fix paths for SonarQube: filenames must be relative to repo root.
# pytest-cov generates filenames like "app/tasks/foo.py" with <source> pointing
# to the CI runner's absolute backend/ path. SonarQube runs on a different
# machine, so absolute paths won't resolve. Fix: prepend "backend/" to filenames
# and set <source> to "." (repo root).
for cls in root.findall(".//class"):
    filename = cls.get("filename", "")
    if filename and not filename.startswith("backend/"):
        cls.set("filename", f"backend/{filename}")

# Point source to current working directory (repo root when run from there)
sources = root.find(".//sources")
if sources is not None:
    for source in sources.findall("source"):
        sources.remove(source)
    s = ET.SubElement(sources, "source")
    s.text = "."
else:
    sources = ET.SubElement(root, "sources")
    s = ET.SubElement(sources, "source")
    s.text = "."

base.write("coverage.xml", xml_declaration=True)
print(f"Merged {len(files)} coverage files")

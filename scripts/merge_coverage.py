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

# Fix source paths for SonarQube: replace absolute CI runner paths with
# relative path from repo root. pytest-cov with --cov=app sets source to
# an absolute path like /home/runner/.../backend/app. SonarQube runs on a
# different machine, so we replace with "backend/app" (relative to repo root).
sources = root.find(".//sources")
if sources is not None:
    for source in sources.findall("source"):
        sources.remove(source)
    s = ET.SubElement(sources, "source")
    s.text = "backend/app"
else:
    sources = ET.SubElement(root, "sources")
    s = ET.SubElement(sources, "source")
    s.text = "backend/app"

base.write("coverage.xml", xml_declaration=True)
print(f"Merged {len(files)} coverage files")

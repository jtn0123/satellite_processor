#!/usr/bin/env python3
"""Merge multiple coverage XML shard files into a single coverage.xml."""
import glob
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
            root.find(".//packages").append(pkg)

base.write("coverage.xml", xml_declaration=True)
print(f"Merged {len(files)} coverage files")

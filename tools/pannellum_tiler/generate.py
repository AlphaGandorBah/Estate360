#!/usr/bin/env python
"""
Vendored Pannellum multires tile generator stub.

Replace this with the real pannellum/utils/multires/generate.py from:
  https://github.com/mpetroff/pannellum

Usage:
  python generate.py <source_image> --output <output_dir>

This stub creates a minimal config.json so the pipeline does not fail
in development. In production, replace with the real generator.
"""
import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="Source equirectangular image")
    parser.add_argument("--output", required=True, help="Output directory for tiles")
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)

    config = {
        "type": "multires",
        "multiRes": {
            "path": "%l/%s%y_%x",
            "fallbackPath": "fallback/%s",
            "extension": "jpg",
            "tileResolution": 512,
            "maxLevel": 3,
            "cubeResolution": 4096,
        },
    }

    with open(os.path.join(args.output, "config.json"), "w") as f:
        json.dump(config, f, indent=2)

    print(f"[stub] Tile config written to {args.output}/config.json")


if __name__ == "__main__":
    main()

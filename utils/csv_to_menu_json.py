#!/usr/bin/env python3
"""Convert a menu CSV file into the frontend menu.json structure.

Expected CSV columns:
  section_title, name, price

Optional CSV columns:
  subsection_title, subsection_id, item_id, description, image

Aliases are also accepted:
  item_name -> name
  item_description -> description

Example:
  python3 utils/csv_to_menu_json.py
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

MENU_JSON_PATH = Path("src/data/menu.json")
DEFAULT_CSV_PATH = Path("utils/parkdale_menu.csv")


def clean(value: str | None) -> str:
  return (value or "").strip()


def slugify(value: str) -> str:
  slug = value.lower().replace("&", "and")
  slug = re.sub(r"[^a-z0-9]+", "-", slug)
  return slug.strip("-")


def get_value(row: dict[str, str], *names: str) -> str:
  for name in names:
    if name in row and clean(row[name]):
      return clean(row[name])
  return ""


def normalize_image_path(value: str) -> str:
  return value.replace("\\", "/")


def append_item_id(item: dict, next_id: int) -> int:
  if item.get("id"):
    return next_id

  item["id"] = next_id
  return next_id + 1


def parse_item_id(value: str) -> int | str:
  return int(value) if value.isdigit() else value


def parse_menu_csv(csv_path: Path) -> dict[str, list[dict]]:
  sections_by_id: dict[str, dict] = {}
  next_item_id = 1

  with csv_path.open(newline="", encoding="utf-8-sig") as csv_file:
    reader = csv.DictReader(csv_file)
    if not reader.fieldnames:
      raise ValueError("CSV file is empty or missing a header row.")

    for line_number, row in enumerate(reader, start=2):
      section_title = get_value(row, "section_title")
      item_name = get_value(row, "name", "item_name")
      price = get_value(row, "price")

      if not section_title:
        raise ValueError(f"Line {line_number}: section_title is required.")
      if not item_name:
        raise ValueError(f"Line {line_number}: name or item_name is required.")
      if not price:
        raise ValueError(f"Line {line_number}: price is required.")

      section_id = slugify(section_title)
      subsection_title = get_value(row, "subsection_title")
      subsection_id = get_value(row, "subsection_id") or (slugify(subsection_title) if subsection_title else "")

      section = sections_by_id.setdefault(
        section_id,
        {
          "id": section_id,
          "title": section_title,
          "_items": [],
          "_subsections": {},
        },
      )

      item = {
        "name": item_name,
        "price": price,
      }

      item_id = get_value(row, "id", "item_id")
      description = get_value(row, "description", "item_description")
      image = get_value(row, "image")

      if item_id:
        item["id"] = parse_item_id(item_id)
      if description:
        item["description"] = description
      if image:
        item["image"] = normalize_image_path(image)

      if subsection_title:
        subsection = section["_subsections"].setdefault(
          subsection_id,
          {
            "id": subsection_id,
            "title": subsection_title,
            "items": [],
          },
        )
        next_item_id = append_item_id(item, next_item_id)
        subsection["items"].append(item)
      else:
        next_item_id = append_item_id(item, next_item_id)
        section["_items"].append(item)

  sections = []
  for section in sections_by_id.values():
    output_section = {
      "id": section["id"],
      "title": section["title"],
    }

    subsections = list(section["_subsections"].values())
    direct_items = section["_items"]

    if subsections:
      if direct_items:
        subsections.insert(
          0,
          {
            "id": "items",
            "title": "Items",
            "items": direct_items,
          },
        )
      output_section["subsections"] = subsections
    else:
      output_section["items"] = direct_items

    sections.append(output_section)

  return {"sections": sections}


def main() -> None:
  parser = argparse.ArgumentParser(description="Convert a menu CSV file and update src/data/menu.json.")
  parser.add_argument(
    "csv_file",
    nargs="?",
    type=Path,
    default=DEFAULT_CSV_PATH,
    help=f"Input CSV file. Defaults to {DEFAULT_CSV_PATH}.",
  )
  parser.add_argument(
    "--compact",
    action="store_true",
    help="Write compact JSON instead of pretty-printed JSON.",
  )
  args = parser.parse_args()

  menu = parse_menu_csv(args.csv_file)
  MENU_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)

  if args.compact:
    json_text = json.dumps(menu, separators=(",", ":"))
  else:
    json_text = json.dumps(menu, indent=2)

  MENU_JSON_PATH.write_text(json_text + "\n", encoding="utf-8")
  print(f"Updated {MENU_JSON_PATH}")


if __name__ == "__main__":
  main()

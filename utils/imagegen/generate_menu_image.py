#!/usr/bin/env python3
"""Generate standardized restaurant menu images with OpenAI's Image API."""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import os
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[2]
UPDATE_MENU_DIR = ROOT / "utils" / "update_menu_from_csv"
sys.path.insert(0, str(UPDATE_MENU_DIR))

from csv_to_menu_json import parse_menu_csv


CONFIG_PATH = Path(__file__).with_name("image_generation_profiles.json")
CSV_PATH = UPDATE_MENU_DIR / "parkdale_menu.csv"
MENU_JSON_PATH = ROOT / "src" / "data" / "menu.json"
MENU_IMAGE_DIR = ROOT / "public" / "images" / "menu"
MAX_INPUT_BYTES = 50 * 1024 * 1024
TRANSIENT_ATTEMPTS = 3


class GeneratorError(RuntimeError):
  """A user-facing image generation failure."""


@dataclass(frozen=True)
class MenuItem:
  item_id: str
  section: str
  subsection: str
  name: str
  description: str


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
  try:
    return json.loads(path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError) as error:
    raise GeneratorError(f"Could not load image profile configuration: {error}") from error


def find_menu_item(item_id: str, csv_path: Path = CSV_PATH) -> MenuItem:
  try:
    with csv_path.open(newline="", encoding="utf-8-sig") as csv_file:
      rows = list(csv.DictReader(csv_file))
  except OSError as error:
    raise GeneratorError(f"Could not read menu CSV: {error}") from error

  matches = [row for row in rows if (row.get("item_id") or "").strip() == str(item_id)]
  if len(matches) != 1:
    detail = "was not found" if not matches else "is duplicated"
    raise GeneratorError(f"Menu item ID {item_id} {detail} in {csv_path}.")

  row = matches[0]
  return MenuItem(
    item_id=str(item_id),
    section=(row.get("section_title") or "").strip(),
    subsection=(row.get("subsection_title") or "").strip(),
    name=(row.get("name") or "").strip(),
    description=(row.get("description") or "").strip(),
  )


def select_profile(requested: str, item: MenuItem) -> str:
  if requested != "auto":
    return requested
  return "drink" if item.section.casefold() == "drinks" else "food"


def resolve_reference(profile: dict[str, Any]) -> Path:
  path = Path(profile["reference"])
  if not path.is_absolute():
    path = CONFIG_PATH.parent / path
  if not path.is_file():
    raise GeneratorError(f"Style reference image is missing: {path}")
  return path


def validate_input_image(path: Path) -> None:
  if not path.is_file():
    raise GeneratorError(f"Input image does not exist: {path}")
  if path.stat().st_size > MAX_INPUT_BYTES:
    raise GeneratorError("Input image exceeds the 50 MB Image API limit.")

  try:
    with Image.open(path) as image:
      image.verify()
    with Image.open(path) as image:
      if image.format not in {"JPEG", "PNG", "WEBP"}:
        raise GeneratorError("Input image must be JPEG, PNG, or WebP.")
      if image.width < 64 or image.height < 64:
        raise GeneratorError("Input image must be at least 64x64 pixels.")
  except (UnidentifiedImageError, OSError) as error:
    raise GeneratorError(f"Input is not a valid image: {path}") from error


def build_prompt(item: MenuItem, profile: dict[str, Any], extra_prompt: str = "") -> str:
  description = item.description or "No written description; rely on Image 1 for the exact contents."
  extra = extra_prompt.strip() or "No additional direction."
  return f"""Use case: precise-object-edit
Asset type: standardized 16:9 restaurant menu photograph
Input images:
- Image 1 is the authoritative edit target. Preserve its actual menu item.
- Image 2 is a style reference only. Match its backdrop, lighting, and presentation; do not copy its subject.
Menu item: {item.name}
Menu description: {description}
Additional direction: {extra}
Scene/backdrop: {profile['scene']}
Style/medium: photorealistic professional restaurant menu photography
Composition/framing: {profile['composition']}
Lighting/mood: {profile['lighting']}
Color palette: {profile['palette']}
Constraints:
- Faithfully preserve the item identity, ingredients, quantities, plating identity, bottle shapes, and existing product labels from Image 1.
- Change only the presentation, framing, lighting, and background needed to match Image 2.
- Do not add, remove, substitute, or invent food, beverages, garnishes, brands, or labels.
- Preserve existing label text; add no captions, prices, logos, decorative text, or watermarks.
- Keep the complete subject visible, centered, naturally grounded, and comfortably inside a 16:9 canvas.
- Produce one polished website menu image with realistic texture and no collage layout."""


def _error_details(error: Exception) -> tuple[int | None, str | None, str | None]:
  status = getattr(error, "status_code", None)
  code = getattr(error, "code", None)
  request_id = getattr(error, "request_id", None)
  body = getattr(error, "body", None)
  if isinstance(body, dict):
    nested = body.get("error") if isinstance(body.get("error"), dict) else body
    code = code or nested.get("code")
  return status, code, request_id


def _api_error_message(error: Exception) -> str:
  status, code, request_id = _error_details(error)
  suffix = f" Request ID: {request_id}." if request_id else ""
  if status == 401:
    return f"OpenAI authentication failed. Check OPENAI_API_KEY.{suffix}"
  if code in {"insufficient_quota", "billing_hard_limit_reached"}:
    return f"OpenAI quota or billing limit reached.{suffix}"
  if code == "moderation_blocked":
    return f"The image edit was blocked by OpenAI moderation. Revise the input or prompt.{suffix}"
  if status == 429:
    return f"OpenAI rate limit persisted after retries.{suffix}"
  if status and status >= 500:
    return f"OpenAI server error persisted after retries (HTTP {status}).{suffix}"
  detail = f"HTTP {status}" if status else error.__class__.__name__
  return f"OpenAI image edit failed ({detail}).{suffix}"


def call_image_api(
  source_path: Path,
  reference_path: Path,
  prompt: str,
  api_config: dict[str, Any],
  client: Any | None = None,
  sleep: Callable[[float], None] = time.sleep,
) -> bytes:
  if client is None:
    if not os.environ.get("OPENAI_API_KEY"):
      raise GeneratorError("OPENAI_API_KEY is not set. Set it in your environment before running a live edit.")
    try:
      from openai import OpenAI
    except ImportError as error:
      raise GeneratorError(
        "The OpenAI SDK is not installed. Run: pip install -r utils/imagegen/requirements-imagegen.txt"
      ) from error
    client = OpenAI(max_retries=0)

  for attempt in range(TRANSIENT_ATTEMPTS):
    try:
      with source_path.open("rb") as source, reference_path.open("rb") as reference:
        response = client.images.edit(
          model=api_config["model"],
          image=[source, reference],
          prompt=prompt,
          size=api_config["size"],
          quality=api_config["quality"],
          output_format="webp",
          output_compression=api_config["output_compression"],
        )
      encoded = response.data[0].b64_json
      if not encoded:
        raise GeneratorError("OpenAI returned an empty image response.")
      try:
        return base64.b64decode(encoded, validate=True)
      except (ValueError, TypeError) as error:
        raise GeneratorError("OpenAI returned invalid base64 image data.") from error
    except GeneratorError:
      raise
    except Exception as error:  # SDK exception types are optional until live use.
      status, code, _ = _error_details(error)
      transient = status == 429 or (status is not None and status >= 500)
      quota = code in {"insufficient_quota", "billing_hard_limit_reached"}
      if transient and not quota and attempt < TRANSIENT_ATTEMPTS - 1:
        sleep(2**attempt)
        continue
      raise GeneratorError(_api_error_message(error)) from error

  raise GeneratorError("OpenAI image edit failed unexpectedly.")


def optimize_webp(
  image_bytes: bytes,
  width: int,
  height: int,
  max_bytes: int,
  minimum_quality: int = 45,
  maximum_quality: int = 88,
) -> bytes:
  try:
    with Image.open(io.BytesIO(image_bytes)) as source:
      image = ImageOps.fit(
        source.convert("RGB"),
        (width, height),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
      )
  except (UnidentifiedImageError, OSError) as error:
    raise GeneratorError("The generated output is not a valid image.") from error

  best: bytes | None = None
  low, high = minimum_quality, maximum_quality
  while low <= high:
    quality = (low + high) // 2
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=quality, method=6, optimize=True)
    candidate = buffer.getvalue()
    if len(candidate) <= max_bytes:
      best = candidate
      low = quality + 1
    else:
      high = quality - 1

  if best is None:
    raise GeneratorError(
      f"Could not compress the generated image below {max_bytes:,} bytes without dropping below WebP quality {minimum_quality}."
    )
  validate_output_bytes(best, width, height, max_bytes)
  return best


def validate_output_bytes(data: bytes, width: int, height: int, max_bytes: int) -> None:
  if len(data) > max_bytes:
    raise GeneratorError(f"Generated WebP exceeds the {max_bytes:,}-byte limit.")
  try:
    with Image.open(io.BytesIO(data)) as image:
      if image.format != "WEBP":
        raise GeneratorError("Generated output is not WebP.")
      if image.size != (width, height):
        raise GeneratorError(f"Generated WebP is {image.width}x{image.height}; expected {width}x{height}.")
      image.load()
  except (UnidentifiedImageError, OSError) as error:
    raise GeneratorError("Generated WebP could not be validated.") from error


def prepare_menu_updates(
  item_id: str,
  image_path: str,
  csv_path: Path = CSV_PATH,
  menu_json_path: Path = MENU_JSON_PATH,
) -> dict[Path, bytes]:
  raw = csv_path.read_bytes()
  has_bom = raw.startswith(b"\xef\xbb\xbf")
  text = raw.decode("utf-8-sig")
  newline = "\r\n" if "\r\n" in text else "\n"
  reader = csv.DictReader(io.StringIO(text, newline=""))
  if not reader.fieldnames or "image" not in reader.fieldnames:
    raise GeneratorError("Menu CSV is missing the image column.")

  rows = list(reader)
  matches = [row for row in rows if (row.get("item_id") or "").strip() == str(item_id)]
  if len(matches) != 1:
    raise GeneratorError(f"Could not update menu item ID {item_id}; expected exactly one CSV row.")
  matches[0]["image"] = image_path

  output = io.StringIO(newline="")
  writer = csv.DictWriter(output, fieldnames=reader.fieldnames, lineterminator=newline)
  writer.writeheader()
  writer.writerows(rows)
  csv_bytes = output.getvalue().encode("utf-8")
  if has_bom:
    csv_bytes = b"\xef\xbb\xbf" + csv_bytes

  with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as temp_csv:
    temp_path = Path(temp_csv.name)
    temp_csv.write(csv_bytes)
  try:
    menu = parse_menu_csv(temp_path)
  finally:
    temp_path.unlink(missing_ok=True)

  menu_bytes = (json.dumps(menu, indent=2) + "\n").encode("utf-8")
  return {csv_path: csv_bytes, menu_json_path: menu_bytes}


def atomic_commit(artifacts: dict[Path, bytes]) -> None:
  temporary: dict[Path, Path] = {}
  originals = {path: path.read_bytes() if path.exists() else None for path in artifacts}
  replaced: list[Path] = []
  try:
    for path, data in artifacts.items():
      path.parent.mkdir(parents=True, exist_ok=True)
      with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
        temporary[path] = Path(handle.name)
    for path in artifacts:
      os.replace(temporary[path], path)
      replaced.append(path)
  except Exception as error:
    rollback_errors = []
    for path in reversed(replaced):
      try:
        original = originals[path]
        if original is None:
          path.unlink(missing_ok=True)
        else:
          with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.rollback.", delete=False) as handle:
            handle.write(original)
            rollback_path = Path(handle.name)
          os.replace(rollback_path, path)
      except Exception as rollback_error:  # pragma: no cover - catastrophic filesystem failure.
        rollback_errors.append(str(rollback_error))
    detail = f" Rollback errors: {'; '.join(rollback_errors)}" if rollback_errors else ""
    raise GeneratorError(f"Could not commit generated artifacts: {error}.{detail}") from error
  finally:
    for path in temporary.values():
      path.unlink(missing_ok=True)


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Generate a standardized WebP menu image from an original photo.")
  parser.add_argument("--input", required=True, type=Path, help="Original JPEG, PNG, or WebP menu photo.")
  parser.add_argument("--item-id", required=True, help="Existing item_id from the Parkdale menu CSV.")
  parser.add_argument("--profile", choices=("auto", "food", "drink"), default="auto")
  parser.add_argument("--prompt", default="", help="Optional item-specific direction.")
  parser.add_argument("--update-menu", action="store_true", help="Update the CSV image path and regenerate menu.json.")
  parser.add_argument("--dry-run", action="store_true", help="Validate and print the request without calling OpenAI.")
  parser.add_argument("--force", action="store_true", help="Replace an existing <item-id>.webp output.")
  return parser


def run(args: argparse.Namespace, client: Any | None = None) -> Path:
  config = load_config()
  item = find_menu_item(str(args.item_id))
  profile_name = select_profile(args.profile, item)
  profile = config["profiles"][profile_name]
  source_path = args.input.expanduser().resolve()
  reference_path = resolve_reference(profile)
  output_path = MENU_IMAGE_DIR / f"{item.item_id}.webp"

  validate_input_image(source_path)
  validate_input_image(reference_path)
  if output_path.exists() and not args.force:
    raise GeneratorError(f"Output already exists: {output_path}. Pass --force to replace it.")

  prompt = build_prompt(item, profile, args.prompt)
  if args.dry_run:
    print(json.dumps({
      "input": str(source_path),
      "item_id": item.item_id,
      "item_name": item.name,
      "profile": profile_name,
      "reference": str(reference_path),
      "output": str(output_path),
      "api": config["api"],
      "web": config["output"],
      "update_menu": args.update_menu,
      "prompt": prompt,
    }, indent=2))
    return output_path

  generated = call_image_api(source_path, reference_path, prompt, config["api"], client=client)
  output_config = config["output"]
  optimized = optimize_webp(
    generated,
    width=output_config["width"],
    height=output_config["height"],
    max_bytes=output_config["max_bytes"],
  )
  artifacts = {output_path: optimized}
  if args.update_menu:
    menu_path = f"\\images\\menu\\{item.item_id}.webp"
    artifacts.update(prepare_menu_updates(item.item_id, menu_path))
  atomic_commit(artifacts)

  print(f"Saved {output_path} ({len(optimized):,} bytes, {output_config['width']}x{output_config['height']} WebP)")
  if args.update_menu:
    print(f"Updated {CSV_PATH} and {MENU_JSON_PATH}")
  return output_path


def main() -> int:
  parser = build_parser()
  args = parser.parse_args()
  try:
    run(args)
    return 0
  except GeneratorError as error:
    print(f"error: {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())

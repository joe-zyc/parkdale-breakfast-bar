from __future__ import annotations

import argparse
import base64
import csv
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from PIL import Image


UTILS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(UTILS_DIR))

import generate_menu_image as generator


def image_bytes(size=(1280, 720), image_format="PNG") -> bytes:
  image = Image.new("RGB", size)
  for y in range(size[1]):
    color = (210 + y % 25, 165 + y % 30, 115 + y % 35)
    for x in range(size[0]):
      image.putpixel((x, y), color)
  output = io.BytesIO()
  image.save(output, format=image_format)
  return output.getvalue()


class FakeImages:
  def __init__(self, output: bytes, failures=None):
    self.output = output
    self.failures = list(failures or [])
    self.calls = []

  def edit(self, **kwargs):
    self.calls.append(kwargs)
    for handle in kwargs["image"]:
      self.assert_open(handle)
      handle.read(1)
      handle.seek(0)
    if self.failures:
      raise self.failures.pop(0)
    return SimpleNamespace(data=[SimpleNamespace(b64_json=base64.b64encode(self.output).decode("ascii"))])

  @staticmethod
  def assert_open(handle):
    if handle.closed:
      raise AssertionError("Image handle was closed before the API call")


class FakeClient:
  def __init__(self, output: bytes, failures=None):
    self.images = FakeImages(output, failures)


class ApiFailure(Exception):
  def __init__(self, status_code, code=None):
    super().__init__(f"HTTP {status_code}")
    self.status_code = status_code
    self.code = code
    self.request_id = "req_test"


class MenuImageGeneratorTests(unittest.TestCase):
  def setUp(self):
    self.temp_dir = tempfile.TemporaryDirectory()
    self.root = Path(self.temp_dir.name)
    self.source = self.root / "source.png"
    self.reference = self.root / "reference.webp"
    self.source.write_bytes(image_bytes(size=(640, 480)))
    self.reference.write_bytes(image_bytes(size=(800, 450), image_format="WEBP"))

  def tearDown(self):
    self.temp_dir.cleanup()

  def test_profile_selection(self):
    food = generator.MenuItem("1", "Mains", "Platter", "Rice", "")
    drink = generator.MenuItem("2", "Drinks", "Beer", "Beer", "")
    self.assertEqual(generator.select_profile("auto", food), "food")
    self.assertEqual(generator.select_profile("auto", drink), "drink")
    self.assertEqual(generator.select_profile("food", drink), "food")

  def test_prompt_preserves_source_and_labels(self):
    item = generator.MenuItem("17", "Mains", "Curry", "Fish Curry", "Fish, mango, and okra")
    profile = {
      "scene": "warm beige",
      "composition": "centered",
      "lighting": "soft",
      "palette": "warm",
    }
    prompt = generator.build_prompt(item, profile, "Keep the mango visible")
    self.assertIn("Image 1 is the authoritative edit target", prompt)
    self.assertIn("Fish, mango, and okra", prompt)
    self.assertIn("Do not add, remove, substitute, or invent", prompt)
    self.assertIn("Preserve existing label text", prompt)

  def test_input_validation(self):
    generator.validate_input_image(self.source)
    invalid = self.root / "bad.jpg"
    invalid.write_text("not an image", encoding="utf-8")
    with self.assertRaisesRegex(generator.GeneratorError, "not a valid image"):
      generator.validate_input_image(invalid)

    huge = self.root / "huge.png"
    with huge.open("wb") as handle:
      handle.truncate(generator.MAX_INPUT_BYTES + 1)
    with self.assertRaisesRegex(generator.GeneratorError, "exceeds the 50 MB"):
      generator.validate_input_image(huge)

  def test_missing_api_key_is_clear(self):
    with mock.patch.dict(os.environ, {}, clear=True):
      with self.assertRaisesRegex(generator.GeneratorError, "OPENAI_API_KEY is not set"):
        generator.call_image_api(self.source, self.reference, "prompt", {}, client=None)

  def test_api_payload_and_transient_retry(self):
    client = FakeClient(image_bytes(), failures=[ApiFailure(500)])
    sleeps = []
    result = generator.call_image_api(
      self.source,
      self.reference,
      "preserve the dish",
      {"model": "gpt-image-2", "size": "1280x720", "quality": "medium", "output_compression": 90},
      client=client,
      sleep=sleeps.append,
    )
    self.assertTrue(result.startswith(b"\x89PNG"))
    self.assertEqual(sleeps, [1])
    self.assertEqual(len(client.images.calls), 2)
    payload = client.images.calls[-1]
    self.assertEqual(payload["model"], "gpt-image-2")
    self.assertEqual(payload["output_format"], "webp")
    self.assertEqual(payload["output_compression"], 90)
    self.assertEqual(len(payload["image"]), 2)

  def test_quota_failure_is_not_retried(self):
    client = FakeClient(image_bytes(), failures=[ApiFailure(429, "insufficient_quota")])
    with self.assertRaisesRegex(generator.GeneratorError, "quota or billing"):
      generator.call_image_api(
        self.source,
        self.reference,
        "prompt",
        {"model": "gpt-image-2", "size": "1280x720", "quality": "medium", "output_compression": 90},
        client=client,
        sleep=lambda _: None,
      )
    self.assertEqual(len(client.images.calls), 1)

  def test_optimizer_enforces_web_standard(self):
    result = generator.optimize_webp(image_bytes(), 800, 450, 153_600)
    self.assertLessEqual(len(result), 153_600)
    with Image.open(io.BytesIO(result)) as image:
      self.assertEqual(image.format, "WEBP")
      self.assertEqual(image.size, (800, 450))
      self.assertEqual(image.mode, "RGB")

  def test_prepare_menu_updates_changes_only_matching_item(self):
    csv_path = self.root / "menu.csv"
    json_path = self.root / "menu.json"
    csv_path.write_text(
      "section_title,subsection_title,item_id,name,description,price,image\n"
      "Mains,Platter,17,Fish Curry,With mango,$16.50,old.png\n"
      "Mains,Platter,18,Chicken Curry,With potato,$13.95,keep.png\n",
      encoding="utf-8",
    )
    updates = generator.prepare_menu_updates("17", "\\images\\menu\\17.webp", csv_path, json_path)
    generator.atomic_commit(updates)

    with csv_path.open(newline="", encoding="utf-8") as handle:
      rows = list(csv.DictReader(handle))
    self.assertEqual(rows[0]["image"], "\\images\\menu\\17.webp")
    self.assertEqual(rows[1]["image"], "keep.png")
    menu = json.loads(json_path.read_text(encoding="utf-8"))
    first_item = menu["sections"][0]["subsections"][0]["items"][0]
    self.assertEqual(first_item["image"], "/images/menu/17.webp")

  def test_existing_output_requires_force_even_for_dry_run(self):
    output_dir = self.root / "menu"
    output_dir.mkdir()
    existing = output_dir / "17.webp"
    existing.write_bytes(b"existing")
    args = argparse.Namespace(
      input=self.source,
      item_id="17",
      profile="auto",
      prompt="",
      update_menu=False,
      dry_run=True,
      force=False,
    )
    item = generator.MenuItem("17", "Mains", "Curry", "Fish Curry", "")
    config = {
      "api": {},
      "output": {},
      "profiles": {
        "food": {
          "reference": "unused",
          "scene": "beige",
          "composition": "centered",
          "lighting": "soft",
          "palette": "warm",
        }
      },
    }
    with (
      mock.patch.object(generator, "MENU_IMAGE_DIR", output_dir),
      mock.patch.object(generator, "load_config", return_value=config),
      mock.patch.object(generator, "find_menu_item", return_value=item),
      mock.patch.object(generator, "resolve_reference", return_value=self.reference),
    ):
      with self.assertRaisesRegex(generator.GeneratorError, "Pass --force"):
        generator.run(args)
      args.force = True
      with contextlib.redirect_stdout(io.StringIO()):
        generator.run(args)
    self.assertEqual(existing.read_bytes(), b"existing")

  def test_api_failure_leaves_output_untouched(self):
    output_dir = self.root / "menu"
    output_dir.mkdir()
    args = argparse.Namespace(
      input=self.source,
      item_id="17",
      profile="auto",
      prompt="",
      update_menu=False,
      dry_run=False,
      force=False,
    )
    item = generator.MenuItem("17", "Mains", "Curry", "Fish Curry", "")
    config = {
      "api": {"model": "gpt-image-2", "size": "1280x720", "quality": "medium", "output_compression": 90},
      "output": {"width": 800, "height": 450, "max_bytes": 153_600},
      "profiles": {"food": {"reference": "unused", "scene": "beige", "composition": "centered", "lighting": "soft", "palette": "warm"}},
    }
    client = FakeClient(image_bytes(), failures=[ApiFailure(400)])
    with (
      mock.patch.object(generator, "MENU_IMAGE_DIR", output_dir),
      mock.patch.object(generator, "load_config", return_value=config),
      mock.patch.object(generator, "find_menu_item", return_value=item),
      mock.patch.object(generator, "resolve_reference", return_value=self.reference),
    ):
      with self.assertRaises(generator.GeneratorError):
        generator.run(args, client=client)
    self.assertFalse((output_dir / "17.webp").exists())

  def test_optimization_failure_leaves_output_untouched(self):
    output_dir = self.root / "menu"
    output_dir.mkdir()
    args = argparse.Namespace(
      input=self.source,
      item_id="17",
      profile="auto",
      prompt="",
      update_menu=False,
      dry_run=False,
      force=False,
    )
    item = generator.MenuItem("17", "Mains", "Curry", "Fish Curry", "")
    config = {
      "api": {"model": "gpt-image-2", "size": "1280x720", "quality": "medium", "output_compression": 90},
      "output": {"width": 800, "height": 450, "max_bytes": 153_600},
      "profiles": {"food": {"reference": "unused", "scene": "beige", "composition": "centered", "lighting": "soft", "palette": "warm"}},
    }
    client = FakeClient(image_bytes())
    with (
      mock.patch.object(generator, "MENU_IMAGE_DIR", output_dir),
      mock.patch.object(generator, "load_config", return_value=config),
      mock.patch.object(generator, "find_menu_item", return_value=item),
      mock.patch.object(generator, "resolve_reference", return_value=self.reference),
      mock.patch.object(generator, "optimize_webp", side_effect=generator.GeneratorError("cannot optimize")),
    ):
      with self.assertRaisesRegex(generator.GeneratorError, "cannot optimize"):
        generator.run(args, client=client)
    self.assertFalse((output_dir / "17.webp").exists())


if __name__ == "__main__":
  unittest.main()

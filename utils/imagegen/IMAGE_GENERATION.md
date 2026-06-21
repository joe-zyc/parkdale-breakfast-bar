# Menu Image Generator

`generate_menu_image.py` turns an existing menu photo into a consistent, website-ready menu image with OpenAI's Image API. It preserves the source item while matching one of the restaurant's established visual profiles.

## Setup

```bash
python3 -m pip install -r utils/imagegen/requirements-imagegen.txt
export OPENAI_API_KEY="your-key"
```

Keep the API key in your environment. Do not add it to this repository.

## Dry run

A dry run validates the source, item ID, profile, and destination without needing the OpenAI SDK, an API key, or network access.

```bash
python3 utils/imagegen/generate_menu_image.py \
  --input public/images/menu/11.png \
  --item-id 17 \
  --dry-run
```

## Generate

```bash
python3 utils/imagegen/generate_menu_image.py \
  --input /path/to/original.jpg \
  --item-id 17 \
  --profile auto \
  --prompt "Keep the green mango visible" \
  --update-menu
```

The final image is written to `public/images/menu/<item-id>.webp`. It is always `800x450`, WebP, and no larger than 150 KiB.

### Options

- `--profile auto|food|drink`: `auto` chooses `drink` for the Drinks section and `food` otherwise.
- `--prompt TEXT`: adds item-specific direction after the CSV name and description.
- `--update-menu`: updates the matching image path in `utils/update_menu_from_csv/parkdale_menu.csv` and regenerates `src/data/menu.json`.
- `--force`: replaces an existing WebP. Older PNG files are never deleted.
- `--dry-run`: prints the complete effective request without calling OpenAI or changing files.

The original photo is Image 1 and remains authoritative. The profile reference is Image 2 and controls only the background, lighting, and presentation style.

## Tests

```bash
python3 -m unittest discover -s utils/imagegen/tests -p "test_*.py"
```

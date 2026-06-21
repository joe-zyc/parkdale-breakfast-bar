# Restaurant Bar Frontend

Minimal frontend-only restaurant/bar website built with Vite and React. Menu and business details are stored in JSON so they can be updated without changing component code.

## Run locally

```bash
npm install
npm run dev
```

Vite will print a local URL, usually `http://localhost:5173/`.

## Build

```bash
npm run build
```

The production files will be generated in `dist/`.

## Update the menu

Edit `src/data/menu.json`.

Menu sections live in the `sections` array. Each section has:

- `id`
- `title`
- `items` or `subsections`

Each menu item has:

- `id`
- `name`
- optional `description`
- `price`
- optional `image`

Example image path:

```json
"image": "/images/menu/burger.jpg"
```

Put menu images in `public/images/menu/`. Items without an `image` still render normally.

## Convert a CSV menu

Use `utils/update_menu_from_csv/csv_to_menu_json.py` to generate `src/data/menu.json` from a CSV file.

```bash
python3 utils/update_menu_from_csv/csv_to_menu_json.py
```

Example CSV:

```bash
utils/sample_menu_no_section_id.csv
```

Required CSV columns:

- `section_title`
- `name`
- `price`

Optional CSV columns:

- `subsection_title`
- `subsection_id`
- `item_id`
- `description`
- `image`

If item IDs are omitted, the script creates numeric IDs starting from `1`.

## Update restaurant information

Edit `src/data/site.json` to change:

- restaurant name
- description
- address
- phone and email
- opening hours
- map link
- Uber Eats link

After editing JSON, run `npm run dev` or `npm run build` to verify the site still loads correctly.

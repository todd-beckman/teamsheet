# Teamsheet

Teamsheet is a lightweight, browser-based tool for filling out the official
**Play! Pokémon VG Team List** for VGC tournaments. Enter your player details and
your six Pokémon, and Teamsheet exports a completed, print-ready PDF — both the
tournament-staff copy and the opponent copy (with the appropriate fields hidden).

## What it does

- **Import from Pokémon Showdown.** Paste a Showdown team export and Teamsheet
  fills in each Pokémon's name, item, ability, stat alignment (nature), moves,
  and calculated stats automatically.
- **Or enter a team by hand.** Pick Pokémon, abilities, and natures from
  searchable dropdowns, with the stats laid out per Pokémon.
- **Helpful validation.** Teamsheet flags common mistakes before you export —
  missing player info, illegal stats, duplicate held items, gaps in your move
  list, and more — but never stops you from exporting if you choose to.
- **One-click PDF export.** Download a filled-out team list that matches the
  official form, ready to print and hand in.

Everything runs entirely in your browser; no data is uploaded anywhere.

## Contributing

Teamsheet is a [Vite](https://vitejs.dev/) + TypeScript project. You'll need
[Node.js](https://nodejs.org/) (version 20 or newer).

```sh
# Install dependencies
npm install

# Start the local dev server (with hot reload)
make            # or: npm run dev

# Build the production site into dist/
make build      # or: npm run build

# Preview the production build locally
make preview    # or: npm run preview

# Run the test suite
make test       # or: npm test
```

The production build is a static site, deployed to GitHub Pages automatically on
every push to `main`.

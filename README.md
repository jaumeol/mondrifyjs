# Mondrify JS

A lightweight, dependency-free browser app for creating original geometric
compositions inspired by Mondrian. It uses HTML, CSS, SVG, and vanilla
JavaScript—no build step, external API, image model, or server is required.

Every generation creates a new composition with a recursive rectangular
partition, varied row heights and column widths, a limited red/yellow/blue/white
palette, and heavy black boundaries. Canvas dimensions remain exact, and the
result can be exported as a PNG.

## Run locally

Open `index.html` in a modern browser. For local development, you can also serve
the project directory with any static file server, for example:

```powershell
py -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

- Width and height: 300–1600 pixels
- Rows and columns: 2–12
- Line thickness: 4–20 pixels
- **Generate composition**: makes a new randomized composition
- **Download PNG**: saves the current composition at its requested pixel size

The renderer uses a fresh random seed each time. The seed is shown beneath the
artboard so a generation can be identified while testing.

## GitHub Pages

This project is a static website. Enable GitHub Pages from the repository's
**Settings → Pages**, selecting the `main` branch and root folder. The app can
then be opened using the Pages URL GitHub provides.

## Project files

- `index.html` — accessible page structure and controls
- `styles.css` — responsive studio layout
- `app.js` — partitioning, randomized grid sizing, SVG rendering, and PNG export

# Brigantaggio Presentation

A interactive historical presentation built with **React**, **Vite**, **Tailwind CSS**, and **Leaflet**. It visualizes the post‑unification Italian brigandage through animated slides, maps, and ambient audio.

## Live Demo

https://eliseyrotar.github.io/brigantaggio/

## Development

```bash
npm install          # install dependencies
npm run dev          # start the dev server (http://localhost:5173)
```

## Build

```bash
npm run build        # creates a production build in ./dist
```

## Deploy to GitHub Pages

The repository includes a GitHub Actions workflow that automatically builds and publishes the site to GitHub Pages on every push to `main`.

```bash
npm run deploy       # manually trigger a build and push to the gh‑pages branch
```

## Project Structure

- `src/` – React components and utilities.
- `public/` – Static assets (images, favicon, etc.).
- `vite.config.ts` – Vite configuration with Tailwind integration.
- `.github/workflows/gh-pages.yml` – CI workflow that deploys the `dist` folder.

## Credits

- Icons from **lucide-react**.
- Maps powered by **Leaflet** and **OpenStreetMap**.
- Audio utilities implement a simple synth and background soundtrack.

---

_Last updated: $(date '+%Y-%m-%d %H:%M:%S')_

*This project is a learning resource for creating rich, map‑driven presentations with modern web technologies.*
This is essentially vibe coded and the code quality will most likely be atrocious. I'm only making this public so I can host it as a github page and access it from everywhere - there is no value in the code. This page is just for querying multiple weather APIs and displaying their results which I use for astrophotography.

[link](https://nhauber99.github.io/weather_api_gui/)
 
 # Weather Viewer

Static site for visualizing forecasts (cloud cover, precipitation, temperature, wind) for Austrian cities, with Geosphere, Open-Meteo, Meteosource, OpenWeather, and Meteoblue overlays on all charts. Includes day/night and moonrise/moonset bands under the x-axis.

## Local run

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Structure

- `index.html` - page layout
- `styles.css` - styling
- `js/main.js` - app wiring (fetches data, builds charts)
- `js/config.js` - constants (API base, dataset id, defaults)
- `js/format.js` - date/number formatting helpers
- `js/astro.js` - sun/moon elevation calculations
- `js/bands.js` - band interpolation + zero-crossing finder
- `js/charts.js` - Chart.js configuration + band plugin
- `js/data.js` - API fetch + dataset helpers
- `js/search.js` - Austrian city search UX (Nominatim)
- `js/debug.js` - console debug table for band timings

## Notes

- The search box uses OpenStreetMap Nominatim (Austria only).
- Moonrise/set uses a small time offset (`MOON_TIME_OFFSET_MIN` in `js/config.js`) to match observed timings.
- API keys are stored in your browser localStorage (edit via the "API Keys" panel in the UI).
- Overlay providers are optional; if a provider fails the charts still render with available data.

## Quick tweaks

- Change default location in `js/config.js` (`DEFAULT_LAT`, `DEFAULT_LON`).
- Adjust band colors in `js/charts.js`.
- Turn off debug logging by removing `logBandDebug(...)` in `js/main.js`.


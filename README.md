# Weather Viewer (Traun, AT)

Static site for visualizing Geosphere Austria ensemble forecasts (cloud cover, precipitation, temperature, wind) for Austrian cities, with NWP, Open-Meteo, Meteosource, OpenWeather, and Meteoblue overlays on all charts. Includes day/night and moonrise/moonset bands under the x-axis.

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
- Meteosource requires a key in `js/meteosource-key.js` (ignored via `.gitignore`).
- OpenWeather uses the free 3-hourly forecast endpoint and requires a key in `js/openweather-key.js` (ignored via `.gitignore`).
- Meteoblue uses the basic-1h + clouds-1h package and requires a key in `js/meteoblue-key.js` (ignored via `.gitignore`).
- Overlay providers are optional; if a provider fails the charts still render with available data.

## Quick tweaks

- Change default location in `js/config.js` (`DEFAULT_LAT`, `DEFAULT_LON`).
- Adjust band colors in `js/charts.js`.
- Turn off debug logging by removing `logBandDebug(...)` in `js/main.js`.


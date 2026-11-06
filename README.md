# Chee Kung Tong Archive · 致公堂档案

An independent, offline discovery interface for the Chee Kung Tong Archive. Search catalogue entries, compare catalogue wording with linked library descriptions and selected source excerpts, and explore city associations by year.

## Open the archive

Clone or download this repository and open [site/dist/index.html](site/dist/index.html) in a browser. On Windows, double-click [Open Archive.cmd](Open%20Archive.cmd). The catalogue and maps are included. Following a link to a library record requires internet access.

The release contains 5,650 catalogue records. Search supports Chinese character-form matching while preserving archival spellings in record details and CSV. The timeline uses catalogue dates, including uncertain expressions when explicitly selected. Map points represent city-level catalogue associations. The two historical maps are independent reference images.

## Rebuild and verify

The released catalogue and gazetteer payloads are the inputs for the public build. They preserve source wording and stable identifiers. The original source workbook and the internal SQLite editing database are maintained separately. The following commands rebuild and check the public interface from the included data.

```sh
node scripts/build-site.cjs
node scripts/build-site.cjs --check
```

To run browser tests, use Node.js 20 or later.

```sh
npm ci
npx playwright install chromium
npm test
```

The browser tests check search, distinct identifiers, source labels, Chinese character forms, map and timeline filters, CSV, and narrow-screen behavior. To verify the optional historical place schema, use Python 3.11 or later with Pydantic 2.

```sh
python -m pip install -r requirements.txt
python scripts/validate_historical_places.py
python scripts/test_historical_places.py
```

## Sources and licenses

The project's original software is available under the [MIT License](LICENSE). See [Data Rights and Attribution](DATA-RIGHTS.md) for the scope of the public data release, and [Third-Party Notices](THIRD_PARTY_NOTICES.md) for bundled software and map components.

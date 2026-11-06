# Chee Kung Tong Archive · 致公堂档案 (Working Edition)

An independent research catalog for the [Chee Kung Tong Archive](https://digicoll.lib.berkeley.edu/search?cc=Tong+Archive&ln=en), held by the C. V. Starr East Asian Library at the University of California, Berkeley. Search records from the 2024 source workbook, compare them with selected UC Berkeley Library metadata and reviewed digitized excerpts, and explore city associations by year.

The project is created by Green Wang, advised by librarian Jianye He.

## Open the archive

**[Open the live catalog](https://bear1271.github.io/Chee-Kung-Tong-Archive/)** · [English](https://bear1271.github.io/Chee-Kung-Tong-Archive/?lang=en)

Clone or download this repository and open [site/dist/index.html](site/dist/index.html) in a browser. On Windows, double-click [Open Archive.cmd](Open%20Archive.cmd). The catalog and maps are included. Following a link to a library record requires internet access.

The release contains 5,650 catalog records. Search supports Chinese character-form matching while preserving archival spellings in record details and CSV. The timeline uses dates from the source workbook, including uncertain expressions when explicitly selected. Map points represent city associations derived from the workbook. The two historical maps are independent reference images.

Choose English, 简体中文, or 繁體中文 from the language menu. You can open the English interface directly by adding `?lang=en` to the site URL. English CSV exports have English headings and status labels. Titles, names, dates, excerpts, and source filenames are reproduced as recorded.

A catalog number comes from the source workbook and can repeat. A local record ID identifies a single entry in this project. A Digital Collections record ID identifies a library record.

## Rebuild and verify

The released catalog and gazetteer payloads are the inputs for the public build. They preserve source wording and stable identifiers. The source workbook and the internal SQLite editing database are maintained separately. The following commands rebuild and check the public interface from the included data.

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

The browser tests check search, distinct identifiers, source labels, interface languages, map and timeline filters, CSV, and narrow-screen behavior. To verify the optional historical place schema, use Python 3.11 or later with Pydantic 2.

```sh
python -m pip install -r requirements.txt
python scripts/validate_historical_places.py
python scripts/test_historical_places.py
```

## Sources and licenses

The project's original software is available under the [MIT License](LICENSE). See [Data Rights and Attribution](DATA-RIGHTS.md) for the scope of the public data release, and [Third-Party Notices](THIRD_PARTY_NOTICES.md) for bundled software and map components.

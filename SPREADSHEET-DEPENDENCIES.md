# Money Spreadsheet Dependencies

Locally bundled from the official npm registry on 18 October 2026:

- Jspreadsheet CE 5.0.4, MIT, https://github.com/jspreadsheet/ce
- jSuites 5.12.0, MIT, https://github.com/jsuites/jsuites

The four vendored distribution files include their original license texts. No
CDN, external persistence endpoint, telemetry, paid extensions or account is used.
The upstream packages are pinned; updates require review and fresh tests.

HTML parsing, formula evaluation, structural deletion, column insertion and row
dragging are disabled for the Money sheet. Literal text stays text. This does not
weaken the existing CSP or enable unsafe-eval. Money calculations and explicit
batch saving use the existing exact-cent ledger, not a spreadsheet formula engine.
This is not full Excel file-format or formula compatibility.

Worksheet-only zoom uses the CSS `zoom` property, with an inverse viewport height
so magnification changes cell size rather than the visible working area. Toolbar,
navigation and the cell value bar remain unscaled. Reference:
https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/zoom
The pinned CE adapter converts fill-handle coordinates back to sheet CSS pixels
and ignores legacy mouse-drag fallbacks when `buttons` is explicitly zero. These
avoid an incorrect scroll extent moving a far-right cell under the pointer at
reduced zoom; real button-held range dragging remains supported.

The worksheet has 26 columns (A-Z). A-G retain their existing financial meaning;
H-Z are literal detail cells persisted in each entry's optional `sheetCells`
metadata. They never contribute to ledger totals. These cells use the same save,
backup and conflict path as their parent entry, rather than a second ledger.
Detail-only new rows are retained as drafts and refused at Save sheet until a
valid money item and amount are entered. Old seven-column drafts remain supported.

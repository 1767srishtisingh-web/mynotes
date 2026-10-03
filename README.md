# MyNotes

A marketplace for unit-wise university notes. Students preview, unlock, read and download a unit; faculty publish PDFs, see how long each student actually reads, and withdraw their earnings.

MyNotes is a static front end: four files, no build step, no dependencies. Payments, uploads, payouts and the AI summary are simulated in the browser, and all data is kept in `localStorage`.

```
mynotes/
├── index.html   Markup for both portals, the shared modal and the reader
├── style.css    Design tokens, glass surfaces, 3D card tilt, responsive rules
├── script.js    State, rendering, payment simulator, reading tracker, analytics, PDF writer
└── README.md
```

## Run it locally

Open `index.html` in a browser, or serve the folder so the address bar shows `http://`:

```bash
npx serve .          # or: python3 -m http.server 8080
```

Any current version of Chrome, Edge, Firefox or Safari works. The app uses `<dialog>`, `structuredClone`, `:has()` and `backdrop-filter`, so browsers older than 2023 are not supported.

## Deploy to Vercel

There is nothing to build, so Vercel serves the folder as-is.

**From Git**

1. Push the four files to a GitHub, GitLab or Bitbucket repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Set **Framework Preset** to **Other**. Leave **Build Command** and **Output Directory** empty.
4. Select **Deploy**.

**From the command line**

```bash
npm i -g vercel
cd mynotes
vercel          # preview deployment
vercel --prod   # production deployment
```

No `vercel.json` is needed. The only external request the page makes is to Google Fonts; if that is blocked, the page falls back to system fonts.

## Using the app

Use the switch in the top bar to move between the **Student portal** and the **Faculty dashboard**. The role is remembered between visits. Both roles share one data store, which is what lets a student's reading show up in the faculty analytics.

### Student portal

| Task | How |
| --- | --- |
| Find a unit | Search by subject, code, title, topic or faculty. Filter by unit, semester and branch. Sort by most read, rating or price. |
| Read a sample | **Preview** opens the first two pages. |
| Unlock a unit | **Unlock** opens checkout with three methods: UPI ID, QR code and net banking. |
| Read | **Open reader** on any unlocked unit. |
| Download | The PDF downloads automatically after payment. **Download** on the card or in the reader fetches it again. |
| Change your details | Select your name in the top bar. Your email and phone are what the watermark shows. |

**Checkout.** Any well-formed UPI ID succeeds (for example `aarav@okhdfcbank`). To see the declined-payment path, use an ID that starts with `fail@`, such as `fail@upi`. After a successful payment you get a receipt, the watermarked PDF and a downloadable invoice PDF.

**Reader.** The pill in the reader's top bar is the active reading timer. It counts only while all three of these are true:

- the tab is visible (`document.visibilityState === 'visible'`),
- the window has focus,
- there has been pointer, key, wheel, touch or scroll input in the last 60 seconds.

Otherwise it turns amber and shows why it paused. The reader also has a progress bar, per-page bookmarks, Paper, Sepia and Night themes, a scratchpad that saves as you type, a simulated key-concept summary and a 1 to 5 star rating with quick tags. Your scroll position is restored the next time you open the unit.

### Faculty dashboard

You are signed in as Dr. Meera Iyer, who starts with four published units and seeded sales so the dashboard is not empty.

- **Publish notes.** Fill in subject, code, semester, branch, unit, title, description, price (₹100 by default) and choose a PDF. The page count is read from the PDF and can be corrected. Optional "Topics covered" lines become the unit outline. Units with no sales can be unpublished.
- **Reading analytics.** Pick a unit to see unique students, total and average active reading time, completion drop-off, reading time by hour of day, and how far students got. **View sessions** on a student lists each session with its start and end time, active minutes and furthest point.
- **Earnings.** Gross revenue, platform commission (15%), net earnings and the withdrawable balance, with a per-unit table, recent sales and payout history. **Request instant payout** moves the balance into payout history.

### Try the full loop

1. In the student portal, unlock "Trees, BST and AVL rotations" (one of Dr. Iyer's units).
2. Open the reader, scroll for a minute, then switch to another tab and back to watch the timer pause and resume.
3. Close the reader and switch to the faculty dashboard. Under **Reading analytics** your name appears with your reading time, and under **Earnings** the sale is included.

If the dashboard is open in a second tab, it refreshes on its own when the student tab saves (via the `storage` event).

**Reset demo data** in the footer restores the original state.

## Architecture

`script.js` is one IIFE divided into small modules. Each module owns its DOM region, exposes `init()` to attach listeners once and `render()` to redraw from state.

| Module | Responsibility |
| --- | --- |
| `Store` | Loads, saves and resets the single state object under the key `mynotes.state.v1`. Falls back to in-memory state if storage is blocked. |
| Selectors | Pure functions that derive figures from state: `ratingOf`, `engagementFor(noteId)`, `earnings()`. |
| Document content | `buildPages(note)` returns the unit as structured blocks. The reader, the sample viewer and the PDF all render from those same blocks. |
| `Pdf` | A small text-only PDF writer. Produces the watermarked unit PDF and the invoice with no library. |
| `Modal`, `Toast` | One shared `<dialog>` whose content is swapped, and a toast region that follows the topmost dialog. |
| `Catalog` | Filters, sorting and note cards. |
| `Preview`, `Checkout` | Sample viewer and the payment state machine: form → processing steps → success or failure. |
| `Reader` | Full-screen reader, the active-time tracker, bookmarks, themes and scratchpad. |
| `Summary`, `Rating`, `Profile` | Modal features. |
| `Publish`, `Engagement`, `Earnings` | The three faculty tabs. |
| `App` | Role switch, modal event delegation, cross-tab sync, startup. |

Events are delegated: containers listen once and dispatch on `data-action` attributes, so re-rendering never leaves stale handlers behind.

### State shape

```js
{
  version: 1,
  role: 'student' | 'faculty',
  student:  { name, email, phone },
  faculty:  { [id]: { name, college, uni, bank? } },
  students: { [id]: { name } },              // seeded buyers
  notes:     [{ id, facultyId, subject, code, sem, branch, unit, title,
                description, pages, price, rating, ratingCount, reads, topics, createdAt }],
  purchases: [{ id, noteId, studentId, amount, method, paymentId, invoiceNo, at }],
  sessions:  [{ id, noteId, studentId, startedAt, endedAt, activeSec, progress }],
  reviews:   [{ noteId, studentId, stars, tags, at }],
  payouts:   [{ id, amount, at, ref, to }],
  bookmarks: { [noteId]: [pageNumber] },
  scratch:   { [noteId]: text },
  readerPos: { [noteId]: 0..1 },
  readerTheme: 'paper' | 'sepia' | 'night'
}
```

### How reading time reaches the analytics

`Reader.tick()` runs once a second. If the tab is visible, focused and not idle, it adds the elapsed time (capped at 2 seconds so a throttled background tab cannot add a burst) to the session's `activeSec`. Every 5 seconds, and on tab hide, page hide and reader close, the session is upserted into `state.sessions`. `engagementFor()` reads that same list, so there is no separate analytics write.

Completion drop-off is the share of buyers whose furthest point is below 95%.

### Styling

- All colours, radii, fonts and easing live as custom properties in `:root`.
- Cards with the `tilt` class read `--rx` and `--ry`, which `attachTilt()` sets from the pointer position. Tilt is skipped on touch devices and when the visitor prefers reduced motion.
- Breakpoints: mobile below 768px, tablet 768px to 1024px, desktop above 1024px.
- Reader themes are a set of custom properties switched by `data-theme` on the reader.

## What is simulated

This is a front-end demo. Before using it with real students, these parts need a server:

| Area | In this demo | Needed for production |
| --- | --- | --- |
| Payments | Timed steps, no money moves. The QR code is decorative and not payable. | Razorpay Orders API with server-side signature verification and webhooks. |
| Uploads | The PDF is read for its name, size and page count, then discarded. The reader shows generated study pages built from the unit's title, description and topics. | Object storage and a PDF renderer such as PDF.js. |
| Watermark | A visible email and phone stamp on every reader page and PDF page. It is not cryptographic. | Server-side stamping, plus an invisible forensic watermark if required. |
| Sessions | One fixed student and one fixed faculty account, switched in the top bar. | Authentication and per-user authorisation. |
| Reading analytics | Stored in this browser only. | An API that receives session heartbeats. Client-side timers can be tampered with, so treat them as indicative. |
| AI summary | Assembled from the unit outline. No model is called. | A server route that calls a language model with the document text. |
| Payouts | Moves the balance into a local payout history. | A payouts provider and bank account verification. |

## Customising

- **Commission, idle limit, free pages:** constants at the top of `script.js` (`COMMISSION_RATE`, `IDLE_LIMIT_MS`, `FREE_PAGES`).
- **Seed catalogue:** `SEED_NOTES` and `SEED_FACULTY` in `script.js`. Use **Reset demo data** after editing to reload them.
- **Brand colours and fonts:** the token block at the top of `style.css` and the Google Fonts link in `index.html`.

# DAVID'S football website (Starter Website)

A simple multi-page website for:

- Signing up a football (soccer) team
- Posting friendly match requests
- Saving tournament entries
- Browsing everything with filters
- Exporting saved data as a JSON file

This starter version stores submissions in your browser using `localStorage` (no server needed).

## Run locally

From this folder, start a local web server (recommended so modules work correctly).

### Option A (recommended): LAN server + online counter

This option lets other people on your Wi-Fi connect, and it enables:

- Online counter
- Like button counter
- Comments page (shared on Wi-Fi)

```bash
ruby server.rb
```

It runs on `http://0.0.0.0:3000` (open using your Mac's LAN IP like `http://192.168.x.x:3000/`).

## Get found on Google (after publishing)

Your Wi-Fi link (like `http://192.168.x.x:3000/`) cannot show up on Google because it is not public on the internet.

After you publish the site to a real public URL:

1. Edit `sitemap.xml` and replace `https://YOUR-PUBLISHED-DOMAIN/` with your real URL.
2. Make sure `robots.txt` is accessible.
3. Add the site to Google Search Console and submit your sitemap.

### Option B: simple static server (this device only)

```bash
ruby -run -e httpd . -p 5173
```

Then open `http://127.0.0.1:5173` in your browser.

## Pages

- `index.html` (home)
- `team-signup.html` (team registration)
- `match-request.html` (post a friendly/tournament request)
- `browse.html` (browse + admin export)
- `tournaments.html` (tournament entry)

## Export data

Go to `browse.html#admin` and click **Export JSON**.

# Transitory Things

A quiet place to keep the things you want, for now.

Built with Next.js (the website), Supabase (logins, your things, and photos), and Vercel (hosting).

---

## Setup, step by step

You only do this once. Allow about 30 to 45 minutes.

### 1. Put the code on GitHub

1. Sign in to github.com.
2. Click **+** (top right) > **New repository**.
3. Name it `transitory-things`, choose **Private**, and leave everything else unticked. Click **Create repository**.
4. Tell Claude the repository is ready. Claude can push the code to it for you. Or, on the new repository's page, click **uploading an existing file** and drag in every file and folder from this project.

### 2. Set up Supabase (your database, logins, and photo storage)

1. Open your `transitory-things` project at supabase.com.
2. In the left sidebar, open **SQL Editor** > **New query**.
3. Open the file `supabase/schema.sql` from this project, copy all of it, paste it in, and click **Run**. It should say "Success. No rows returned." (Running it again later is safe; do that whenever the file changes.)
4. Go to **Project Settings** > **API** (some versions call it **Data API** or **API Keys**). Keep this tab open. You need two values from it in step 3:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string starting with `eyJ`)

### 3. Put the site online with Vercel

1. Sign in to vercel.com with GitHub.
2. Click **Add New…** > **Project**, find `transitory-things`, and click **Import**.
3. Open **Environment Variables** and add two:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
4. Click **Deploy**. After a minute or two you get an address like `transitory-things-xyz.vercel.app`.

### 4. Tell Supabase where the site lives (needed for sign-in emails)

1. In Supabase, open **Authentication** > **URL Configuration**.
2. Set **Site URL** to `https://transitorythings.com`. If the domain isn't connected yet, use your `vercel.app` address for now.
3. Under **Redirect URLs**, add both:
   - `https://transitorythings.com/auth/callback`
   - `https://YOUR-VERCEL-ADDRESS.vercel.app/auth/callback`
4. Save.

Now open your Vercel address, enter your email, click the link in the email, and you're in.

### 5. Connect transitorythings.com

1. In Vercel, open the project > **Settings** > **Domains**. Add `transitorythings.com`, and add `www.transitorythings.com` when it offers to.
2. Vercel shows the DNS records it wants, usually an **A** record for `transitorythings.com` and a **CNAME** for `www`. Copy the exact values Vercel shows.
3. At porkbun.com, open **Domain Management** > `transitorythings.com` > **DNS**. Delete any default parking records for the bare domain and `www`, then add the records Vercel showed you.
4. Wait a few minutes (occasionally up to an hour). Vercel's Domains page turns green when it works, and adds the security certificate on its own.

### 6. Turn on name pages (yourname.transitorythings.com)

Name pages need a wildcard address, `*.transitorythings.com`. Vercel can only make the security certificate for it if it can answer a DNS check, so pick one of these:

**Option A, keep DNS at Porkbun (nothing else moves):**
1. In Vercel, open the project > **Settings** > **Domains** and add `*.transitorythings.com`.
2. Vercel shows the records it needs. At porkbun.com, open `transitorythings.com` > **DNS** and add exactly what it shows. Usually:
   - **NS** record, host `_acme-challenge`, values `ns1.vercel-dns.com` and `ns2.vercel-dns.com`
   - **CNAME** record, host `*`, value `cname.vercel-dns.com`
3. Wait until the wildcard turns green in Vercel.

**Option B, move DNS to Vercel:** at Porkbun, change the nameservers to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`, then add `*.transitorythings.com` in Vercel. If you get email at this domain, copy its MX and TXT records into Vercel's DNS first.

Then run the latest `supabase/schema.sql` in Supabase (step 2.3) if you haven't since this was added.

---

## Using it

- **Add a thing:** paste a product link anywhere on the page. It reads the page and shows the photos it found. Choose one, check the name and price, and save. You can also paste or drop an image.
- **Framing a photo:** in Add or Edit, choose **Fill** (the photo fills the tile; drag to choose what's cropped, zoom to tighten) or **Fit** (the whole photo shows inside the tile; drag to place it, Size to add room around it). Fit is saved as a negative zoom, so it needs no database change.
- **Hover** a photo to see its name, price, and brand underneath. **Click** opens it by itself.
- **Arrange your grid:** drag a photo to a new spot (on a phone, press and hold first; with a keyboard, Alt + arrow keys). Order is set to **Your order**; choosing Newest or a price order and then dragging makes that the starting point of your order.
- **Bought or let go:** open **Edit** and choose Wanting, Bought, or Let go.
- **Bottom bar:** All, Wanting, Bought, Let go, Add +, Share, with the count and total in small type underneath, and the three layouts (the dots).
- **Settings** (the dot mark): Light, Dark, or Auto mode; the moving background (Water, Fog, Contour, Dusk, Light leak, Bokeh, or off); the title at the top of your page; and the save button.
- **Community** (the dot mark): everything people keep on their public name pages, newest first. Things kept only privately never show there. **Save +** copies a thing to your own list, and its page says who first found it and whose list it's on.
- **Chrome extension:** see `/save-button` on the site. It reads the page in your own browser, including the full-size photo gallery that Amazon and some other shops hide in page data, and also brings the brand, the color and size you picked, sale price, stock, and the photo you were looking at. Its code is in `extension/`; after changing it, rebuild `public/transitory-things-extension.zip` with `cd extension && zip -qr -X ../public/transitory-things-extension.zip . -x '.*'`.
- **Boards:** type any name in the Board field. It shows up in the top row.
- **Share:** click **Share** in the bottom bar. Two ways, both look-only, and your notes stay private:
  - **Your page:** claim a name to get `yourname.transitorythings.com`. Anyone who knows or guesses the name can see it. Change the name or turn it off any time.
  - **Private link:** a random link like `transitorythings.com/s/k7mq2xpd9wht` that only works for people you send it to. **Make a new link** turns the old one off.
  - With a board selected, links can open on that board.

## Notes

- **Some big shops block automatic reading** (Amazon most of all). For those, you'll see the name guessed from the link and can paste a photo yourself. For better results, add a `MICROLINK_API_KEY` environment variable in Vercel (from microlink.io, paid).
- **Your things are private** unless you share your link. Only you can change them. Photos are stored with long random names, so they can only be found by someone who already has the exact link.
- **Free limits:** Supabase's free tier pauses a project after a week with no visits. Opening the site wakes it, but the first load can take a few seconds. It also includes 1 GB of photo storage, which is thousands of photos.

## For developers

```bash
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev                  # http://localhost:3000
npm test                     # checks the product page reader
```

Key files: `components/Gallery.tsx` (the main page), `components/AddDialog.tsx` (adding and editing), `lib/extract.ts` (reads product pages), `lib/safe-fetch.ts` (fetches pages safely), `supabase/schema.sql` (database and storage rules).

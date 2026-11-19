import type { Metadata } from "next";
import SaveButton from "./SaveButton";

export const metadata: Metadata = { title: "Save button · Transitory Things" };

export default function Page() {
  return (
    <main className="page">
      <div>
        <h1>
          Transitory <span>Things</span>
        </h1>
        <p>
          Some shops won't let Transitory Things read their pages directly. The Chrome extension reads the page from your own browser instead, so the
          name, price, and photos come through from almost any shop.
        </p>
        <a className="bm" href="/transitory-things-extension.zip" download>
          Download the Chrome extension
        </a>
        <ol>
          <li>Unzip the download. Keep the folder somewhere it won't be deleted, like Documents.</li>
          <li>
            In Chrome, go to <strong>chrome://extensions</strong> and turn on <strong>Developer mode</strong> (top right).
          </li>
          <li>
            Click <strong>Load unpacked</strong> and choose the unzipped folder.
          </li>
          <li>Click the puzzle piece in Chrome's toolbar and pin Transitory Things.</li>
          <li>On any product page, click the button (or press Option+Shift+S). A small window opens with the thing ready to save.</li>
        </ol>
        <p>Not using Chrome? Drag this to your bookmarks bar instead, and click it on a product page.</p>
        <SaveButton />
        <p>
          <a href="/">Back to your things</a>
        </p>
      </div>
    </main>
  );
}

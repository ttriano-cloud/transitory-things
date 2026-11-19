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
          Some shops won't let Transitory Things read their pages directly. The Save button reads the page from your own browser instead, so the
          name, price, and photos come through from almost any shop.
        </p>
        <SaveButton />
        <ol>
          <li>Show your bookmarks bar (Chrome: Cmd+Shift+B).</li>
          <li>Drag the button above onto the bookmarks bar.</li>
          <li>On any product page, click it. A small window opens with the thing ready to save.</li>
        </ol>
        <p>
          <a href="/">Back to your things</a>
        </p>
      </div>
    </main>
  );
}

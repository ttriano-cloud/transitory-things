import { DotMark } from "./DotMenu";

// A quiet placeholder for parts of the app that aren't built yet.
export default function SoonPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page">
      <div>
        <DotMark className="mark" />
        <h1>Transitory <span>Things</span> · {title}</h1>
        {children}
        <a className="back" href="/">← Back to your things</a>
      </div>
    </main>
  );
}

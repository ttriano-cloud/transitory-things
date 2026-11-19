import type { Metadata } from "next";
import { Suspense } from "react";
import Clip from "./Clip";

export const metadata: Metadata = { title: "Save · Transitory Things" };

export default function Page() {
  return (
    <Suspense>
      <Clip />
    </Suspense>
  );
}

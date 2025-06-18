"use client";

import AsciiText from "./components/AsciiText";

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <AsciiText text="OBLAST" fontSize={400} fontFamily="IBM Plex Mono" />
      <AsciiText text="STUDIOS" fontSize={400} fontFamily="IBM Plex Mono" />
    </main>
  );
}

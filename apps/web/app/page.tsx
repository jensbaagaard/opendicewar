import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1>opendicewar</h1>
      <p>
        An open-source reimplementation of Taro Ito&apos;s{" "}
        <a href="https://www.gamedesign.jp/games/dicewars/" target="_blank" rel="noreferrer">
          Dicewars
        </a>
        . This project is an unaffiliated homage; all credit for the original
        design goes to the author.
      </p>
      <p>
        <Link href="/play">Play →</Link>
      </p>
      <hr style={{ margin: "2rem 0" }} />
      <p style={{ opacity: 0.6, fontSize: "0.9rem" }}>
        Source on GitHub · MIT license
      </p>
    </main>
  );
}

import Link from "next/link";

const LINKS: [string, string][] = [
  ["/", "HOME"],
  ["/fighters", "FIGHTERS"],
  ["/episodes", "EPISODES"],
  ["/storylines", "STORYLINES"],
  ["/bet", "BET"],
  ["/fantasy", "FANTASY"],
  ["/live", "LIVE"],
  ["/fan-forge", "FAN FORGE →"],
];

export default function TopNav() {
  return (
    <nav className="topnav">
      {LINKS.map(([href, label], i) => (
        <span key={href}>
          {i > 0 ? " · " : null}
          <Link href={href}>{label}</Link>
        </span>
      ))}
    </nav>
  );
}

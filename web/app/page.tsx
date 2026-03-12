import Link from "next/link";

export default function HomePage() {
  return (
    <div className="card stack">
      <div>
        <h1>Tutor Intelligence Dashboard</h1>
        <p className="helper">
          Welcome. Use the login page to access your dashboard.
        </p>
      </div>
      <Link href="/login">Go to login</Link>
    </div>
  );
}

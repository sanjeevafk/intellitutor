import Link from "next/link";

export default function HomePage() {
  return (
    <div className="landing">

      <section className="hero">
        <p className="eyebrow">Tutor Intelligence</p>
        <h1 className="hero-headline">
          Teaching,<br />made <em>visible.</em>
        </h1>
        <p className="hero-sub">
          Keep structured notes on every student, let AI surface weekly
          patterns, and spend your energy on what matters — not paperwork.
        </p>
        <Link href="/login" className="cta-link">
          Get started <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="features">
        <div className="feature">
          <span className="feature-num">01</span>
          <h3 className="feature-title">Student notes</h3>
          <p className="feature-desc">
            Capture observations after every session. Searchable, structured,
            and always to hand.
          </p>
        </div>
        <div className="feature">
          <span className="feature-num">02</span>
          <h3 className="feature-title">AI summaries</h3>
          <p className="feature-desc">
            Weekly digests surface patterns you might miss — pacing issues,
            breakthroughs, recurring gaps.
          </p>
        </div>
        <div className="feature">
          <span className="feature-num">03</span>
          <h3 className="feature-title">Progress at a glance</h3>
          <p className="feature-desc">
            A clear timeline of each student's journey, from first session to
            where they stand today.
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        © {new Date().getFullYear()} Tutor Intelligence
      </footer>

    </div>
  );
}

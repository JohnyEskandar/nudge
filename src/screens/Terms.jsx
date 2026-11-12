import { useNavigate } from 'react-router-dom'

/** Plain-English terms. A draft for the founder to review. */
export default function Terms() {
  const navigate = useNavigate()
  return (
    <article className="legal">
      <button className="back" onClick={() => navigate(-1)}>
        ← Back
      </button>
      <h1>Terms</h1>
      <p className="muted">Last updated November 12, 2026</p>

      <h2>Who can use Nudge</h2>
      <p>You need to be 13 or older.</p>

      <h2>What it is</h2>
      <p>
        Nudge reminds you, now and then, about people you want to stay in touch with. You
        decide whether and how to reach out, in your own words and your own apps. Nudge is
        new and being tested, so it may change, have gaps, or stop.
      </p>

      <h2>Your part</h2>
      <ul>
        <li>Add people you actually know, for your own use.</li>
        <li>Don&rsquo;t use Nudge to bother or harm anyone.</li>
        <li>What you write about people is yours, and you&rsquo;re responsible for it.</li>
      </ul>

      <h2>No promises</h2>
      <p>
        Nudge is offered as it is, free, without guarantees. A nudge can arrive late or not
        at all, so please don&rsquo;t rely on it for anything important.
      </p>

      <h2>Leaving</h2>
      <p>
        You can stop at any time and delete your account from Settings. If these terms
        change, you&rsquo;ll see it in the app before it applies to you.
      </p>
    </article>
  )
}

import { useNavigate } from 'react-router-dom'

/**
 * Plain-English privacy policy, written from what the code actually stores. A draft for
 * the founder to review before anyone outside the founder's friends installs Nudge.
 */
export default function Privacy() {
  const navigate = useNavigate()
  return (
    <article className="legal">
      <button className="back" onClick={() => navigate(-1)}>
        ← Back
      </button>
      <h1>Privacy</h1>
      <p className="muted">Last updated November 12, 2026</p>

      <h2>What Nudge keeps</h2>
      <ul>
        <li>Your email address, and your Google name and picture if you sign in with Google.</li>
        <li>
          The people you add, and what you choose to write about them: name, what you call
          them, who they are to you, how often you want to catch up, how you usually reach
          them, phone, city, birthday, notes, and anything you save to ask about next time.
        </li>
        <li>Your answers: when you got in touch, whether they wrote back, plans you made.</li>
        <li>Your settings, and the push subscription that lets your phone get nudges.</li>
        <li>Feedback you send, with basic details about your device and browser.</li>
        <li>
          A record of what happens in the app, like a nudge being sent or opened, or an
          answer given. These records never contain names, notes, phone numbers or messages.
        </li>
      </ul>

      <h2>What Nudge never does</h2>
      <ul>
        <li>It never contacts the people on your list, and they are never told.</li>
        <li>It never sends or reads your messages, calls or contacts.</li>
        <li>It never sells your data, shows ads, or uses an outside analytics service.</li>
      </ul>

      <h2>Who handles it</h2>
      <p>
        Nudge stores data with Supabase (database and sign-in) and is served by Vercel.
        Nudges travel through your phone or browser maker&rsquo;s push service (Apple,
        Google or Mozilla), which sees only the nudge itself.
      </p>

      <h2>A small study</h2>
      <p>
        Nudge is being tested with a small group of people to learn whether it helps. Its
        maker reads the app records above, without names, to see how often nudges lead to
        people getting in touch. To compare fairly, Nudge sometimes holds a nudge back at
        random.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Export everything from Settings at any time.</li>
        <li>Delete your account from Settings. It erases everything, for good.</li>
        <li>Turn nudges off in your phone&rsquo;s settings, or sign out on a device.</li>
        <li>Questions: send them from Settings, under Send feedback.</li>
      </ul>
    </article>
  )
}

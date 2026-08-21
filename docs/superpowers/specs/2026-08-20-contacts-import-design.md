# Contacts import — design

*20 August 2026. Phase 1 P0, the last unstarted P0 in the roadmap.*

## Why

The empty list is where Nudge loses people. The second real user went through
onboarding's one-at-a-time form and stopped after adding a single person; with one
name on the list the app has nothing to nudge about, so it never gets to prove what
it is for. Import is the feature that turns that one person into ten.

## What is actually possible on iOS

This constrains everything below, so it goes first.

An installed iOS PWA **cannot read the address book**. The Contact Picker API
(`navigator.contacts.select()`) ships by default only in Chrome on Android; on iOS
Safari it exists solely behind *Settings → Apps → Safari → Advanced → Feature Flags →
Contact Picker API*, off by default. Web Share Target, which would let Contacts.app
share into the app, is Android-only and was never implemented by WebKit.

Safari's experimental flags **do** apply to home-screen web apps in standalone mode —
service workers themselves required exactly such a flag for years — so a flag-enabled
iPhone gets a real picker inside the installed app. This is assumed, not proven, and
is listed under Verification below.

The permanent answer for iOS is the native picker in Phase 5 via Capacitor. Until
then, paste is the floor and the flag-enabled picker is a bonus.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Input | Free-text lines: a name, optionally a phone | The phone is what makes reach-out one-tap; lifting it out costs little over names-only |
| Sources | Paste + feature-detected Contact Picker | Paste works everywhere with no setup; the picker is ~15 lines and the same call on Android and flag-enabled iOS |
| Picker unavailable | In-app walkthrough, behind an explicit user choice | Help someone asked for, not friction imposed on everyone who opens import |
| Review | Batch default category + per-row override | Free-text parsing is fuzzy and must be shown before it is written; per-row category stops ten people sharing one cadence and style |
| Write | One bulk insert, all-or-nothing | Smallest code, one round trip, and no half-imported state to explain |
| Placement | New `/import` route, offered in onboarding | Puts the fast path in front of the person who stalled without rewriting a tuned, shipped flow |

### Rejected

- **`.vcf` file import.** Would be the only no-flag route to a real address book, but
  needs a computer detour (iCloud.com or Mac Contacts) to produce the file, and the
  flag-enabled picker already serves that need. Cut until someone asks. It would slot
  into the same pipeline as a third source.
- **Server-side parse/insert in an edge function.** The review step needs parse results
  before the insert, so the client parses anyway; the function would add a deployable
  and an auth surface for no gain.
- **Per-row partial-failure handling.** What can realistically fail is RLS (all rows),
  the network (all rows), or a blank name (validated client-side). Per-row failure is
  close to a fantasy scenario, and all-or-nothing leaves nothing to reconcile.
- **Due-date staggering.** A batch imported today all comes due together, but
  `daily-nudge` already coalesces a user's overdue people into one notification and
  Today caps at `TODAY_LIMIT = 3`. The general fix is the daily frequency cap in
  Phase 1 P1, which is needed regardless of whether anyone ever imports.
- **Importing emails, cities, birthdays.** The Contact Picker cannot supply birthdays
  (the spec exposes only `name`, `email`, `tel`, `address`, `icon`), and the rest is
  noise at import time.

## Architecture

```
paste text ─┐
            ├─→ Candidate[] ─→ review list ─→ addFriends() ─→ friends
picker ─────┘                                                   │
                                                                └─→ triggers seed
                                                                    reminder_settings
                                                                    + nudge_style
```

Sources are pluggable and produce an identical shape. Phase 5's native picker becomes a
third source feeding the same review-and-insert path rather than a second import feature.

### Files

| File | Status | Purpose |
| --- | --- | --- |
| `src/lib/device.js` | new | `isIOS()`, `isStandalone()`, moved verbatim out of `push.js` |
| `src/lib/contacts.js` | new | Pure. `parseContacts`, `fromPicked`, `markDuplicates`, `pickerSupport`, `pickContacts` |
| `src/lib/contacts.test.js` | new | Vitest unit tests for the parsing rules |
| `src/screens/Import.jsx` | new | Paste box, picker button, review list |
| `src/components/PickerSetup.jsx` | new | The walkthrough. Modelled on `PushOptIn.jsx` |
| `src/lib/api.js` | edit | Add `addFriends(rows)` |
| `src/screens/Onboarding.jsx` | edit | Link to import; seed `added` from `listFriends()` on mount |
| `src/screens/People.jsx` | edit | Link to import |
| `src/screens/FriendList.jsx` | edit | Link to import from the empty state; "picker is ready" notice |
| `src/App.jsx` | edit | `/import` route |
| `scripts/verify-import.mjs` | new | End-to-end Playwright check against the real database |
| `package.json` | edit | `vitest` dev dependency, `"test": "vitest run"` |

`device.js` exists so `contacts.js` does not import from `push.js` to find out what an
iPhone is. `push.js` imports the two functions back; `PushOptIn.jsx:5` is the only other
importer today.

### Data shape

```js
Candidate = {
  key,       // stable local id, for React keys only
  name,      // string, editable in the review list
  phone,     // string | null, trimmed, never reformatted
  category,  // 'friend' | 'mentor' | 'family' | 'abroad'
  include,   // boolean, the row's checkbox
  note,      // 'duplicate' | 'unlikely' | null
}
```

## The parser

`parseContacts(text) → Candidate[]`

**Splitting.** Split on newlines. If the text contains no newline but does contain
commas, split on commas instead — this catches a one-line group-chat paste without
breaking `Okonkwo, Maya` on a normal multi-line list.

After a comma split, **any segment that contains only a phone merges back into the
segment before it.** Without this, the single line `Maya Okonkwo, +1 555 010 1234`
splits into a name and a phone-only fragment, and the phone is silently lost. The merge
also makes `Maya, +1 555 010 1234, Tom, +1 555 010 9999` — a plausible paste — parse as
two people with their numbers attached.

**Per line, in order:**

1. Strip leading list markers: `-`, `*`, `•`, `1.`, `1)`, tabs. **This must happen before
   the phone is lifted**, not after: `.` and digits are both in the phone pattern's
   character class, so a marker like `1.` left in place can be swallowed into the phone
   match and turn `1. 555-0123 Maya` into a number nobody typed.
2. Extract a phone: optional `+` or `(`, then a run of digits and `()-. ` containing **at
   least 7 digits**. Remove it from the line.
3. Strip email-shaped tokens, so they cannot become names.
4. Strip stray `;` `|` `:` `<` `>`, surrounding quotes, and a **trailing** comma only.
   An interior comma survives: `Okonkwo, Maya` is a real way to write a name, and the
   splitting rule above exists precisely to protect it — stripping the comma here would
   undo that protection one step later. The trailing case is what a phone lifted off the
   end of `Maya Okonkwo, +1 555 010 1234` leaves behind.
5. Collapse runs of whitespace.

What remains is the name.

**Outcomes.** A line that is empty after step 5 is dropped — that is the only silent
drop. A name over 60 characters or of more than six words is **included but unchecked**,
tagged `'unlikely'`, so a pasted paragraph is visible and skippable rather than
silently reinterpreted.

**Limits.** Duplicates within the paste itself collapse to one row, matched on the
normalised name. The cap of 200 rows is applied **after** that collapse, keeping the
first 200.

**Note precedence.** A row that is both an existing friend and an implausible name is
tagged `'duplicate'` — it is the more actionable of the two, and both leave the row
unchecked anyway.

**Normalised name** = lowercased, whitespace-collapsed, trimmed. Used for both
within-paste dedupe and the existing-friend check.

**Phone** is trimmed and inner whitespace collapsed, never reformatted: `friends.phone`
is free text today and `ReachOutAction` builds `tel:`/`sms:` from it as-is, so
normalising here would smuggle a behaviour change in under an import feature.

### Worked examples

| Input line | Name | Phone | Note |
| --- | --- | --- | --- |
| `Maya Okonkwo` | `Maya Okonkwo` | — | — |
| `- Maya Okonkwo, +1 555 010 1234` | `Maya Okonkwo` | `+1 555 010 1234` | — |
| `3) Sam Okafor <sam@x.com>` | `Sam Okafor` | — | — |
| `"Ana Ruiz"` | `Ana Ruiz` | — | — |
| `Okonkwo, Maya` (multi-line paste) | `Okonkwo, Maya` | — | — |
| `Maya, Tom, Ana` (single-line paste) | three rows | — | — |
| `Maya Okonkwo, +1 555 010 1234` (single line) | `Maya Okonkwo` | `+1 555 010 1234` | phone-only segment merged back |
| `   ` | dropped | — | — |
| a 300-character paragraph | the paragraph | — | `unlikely`, unchecked |

`fromPicked(contacts)` maps `navigator.contacts.select` output to the same shape: first
`name` entry, first `tel` entry, everything else discarded. A picked contact with no
usable name is skipped — the picker can return entries that are a phone number only.

`markDuplicates(candidates, existingFriends)` sets `note: 'duplicate'` and
`include: false` on any candidate whose normalised name matches an existing friend.

## The review list

Each row is a checkbox, an editable name field, the phone if one was found, and a
category dropdown. Above the rows sits one **"These are mostly…"** selector.

The phone is **displayed, not editable** — it is there so you can see what was
understood, and correcting it belongs on the friend's own page afterwards. Name is the
only editable field, because that is the one the parser can plausibly get wrong in a way
you would want to fix before writing.

The batch selector moves **only rows still sitting on the batch default**; a row whose
category was set by hand keeps it. This is deliberately the rule the codebase already
applies twice — `FriendForm.jsx:17` for nudge style, `updateFriend` in `api.js:104` for
cadence — so it is a third instance of a rule the reader already holds rather than a new
one.

Duplicates arrive unchecked and labelled "already on your list". `'unlikely'` rows arrive
unchecked and labelled "doesn't look like a name". `Import.jsx` loads `listFriends()` on
mount to have an existing-friend list for `markDuplicates` to match against; the check
re-runs whenever a name is edited in the review list.

The import button is disabled when no row is checked, and names the count:
"Add 7 people".

## Picker and walkthrough

`pickerSupport()` returns a `{ state }` union, mirroring `pushSupport()` in `push.js:38`:

| State | When | UI |
| --- | --- | --- |
| `'supported'` | `navigator.contacts?.select` exists | Opens the native multi-select; results join the review list |
| `'needs-flag'` | Missing, and `isIOS()` | The Feature Flags walkthrough |
| `'unsupported'` | Missing, not iOS | Says plainly that no setting enables this here; points at paste |

The "Choose from my contacts" button is **always visible**, so the option is
discoverable; the branch happens on tap.

**No install branch.** `PushOptIn` must separate iOS-in-a-tab from iOS-installed because
`PushManager` genuinely does not exist in a tab. The Contact Picker has no such rule —
with the flag on, a tab and a home-screen app behave the same. One state fewer than the
component it is modelled on.

The walkthrough renders inline in a `.notice` on `/import`, never full-screen: the paste
box stays visible beside it, which is the whole argument that none of this is required.

### State A — the instructions

> **Picking from your contacts needs one switch turned on.**
>
> Apple keeps the contact picker behind an experimental switch in Safari's settings, so
> it's off until you turn it on. It only affects Safari, and you can turn it back off
> whenever you like.
>
> 1. Open **Settings → Apps → Safari**
> 2. Tap **Advanced → Feature Flags**
> 3. Find **Contact Picker API** and turn it on
> 4. Come back, then fully close Nudge — swipe it away in the app switcher — and open it
>    again
>
> You don't have to do any of this. Pasting a list of names works right now and ends up
> in the same place.
>
> `[ I've done this — check again ]` `[ Not now ]`

The path is confirmed against current iOS. Step 4 is the one people skip, so it is
spelled out rather than implied. The closing paragraph is load-bearing: without it the
block reads as a wall in front of the feature rather than an optional shortcut.

Tone is "experimental, and reversible" — no stronger caution. Enabling this one switch
exposes a single API and degrades nothing else, so Apple's general developers-only
framing of Feature Flags would misrepresent the specific risk here and cost people who
would otherwise finish.

### State B — checked again, still missing

`navigator.contacts` cannot say *why* it is absent, so the copy names both causes instead
of guessing:

> Still not there. It's usually one of two things: the **Contact Picker API** switch
> didn't stay on, or Nudge was only backgrounded rather than fully closed. Swipe it away
> in the app switcher and open it fresh.

### State C — available

Opens the native picker immediately. No confirmation screen: they asked to pick
contacts, they get the picker.

### Closing the restart loop

Step 4 is unavoidable — a flag cannot reach a running JS context — but it also breaks the
loop, because quitting and reopening lands on Today, not `/import`. The walkthrough is
gone and the person has to remember why they went to Settings. It also means **Check
again** is only ever tapped by someone who came back *without* quitting; it earns its
place as a diagnostic for the commonest mistake, but it cannot be what closes the loop,
since anyone who followed the instructions correctly never sees it.

So: set `nudge.picker.pending` in `localStorage` when the walkthrough is shown. On boot,
if that key is set **and** `navigator.contacts` now exists, clear it and show a one-line
notice on Today — "Your contacts picker is ready" with a button through to `/import`. It
cannot auto-open the picker, since `select()` requires a user gesture, but it puts them
one tap away instead of relying on memory. Same pattern as `ONBOARDED_KEY` and
`PushOptIn`'s `DISMISS_KEY`.

The key is also cleared when a picker import completes, so the notice cannot reappear
for someone who already used it.

## Insert

```js
addFriends(rows)  // one .insert([...]) of user_id, name, category, phone, nudge_style
```

`city` and `notes` are null. Row triggers seed `reminder_settings` and `nudge_style` per
row exactly as the single-add path relies on. All-or-nothing: on failure nothing is
written, the review list is untouched, and retry is one tap.

**On success**, navigate to `/welcome` when import came from onboarding, otherwise
`/people`. Onboarding seeds its `added` state from `listFriends()` on mount, which is
what makes the return trip work — and incidentally fixes losing the list on a refresh
mid-onboarding.

## Entry points

- **Onboarding step 1** — "Add several at once" beside the single-add form, above the
  fold. The "who are the five people you'd hate to drift from?" framing and the
  one-at-a-time form both stay exactly as they are.
- **People screen** — alongside "+ Add someone".
- **Today empty state** — in `FriendList.jsx`.

## Testing

**Unit — `vitest`, `src/lib/contacts.test.js`.** The repo's first unit test runner; free,
MIT, dev-only, reads the existing `vite.config.js`. Covers every parser rule: the
comma-vs-newline split, phone shapes and the 7-digit threshold, list markers, email
stripping, quotes, within-paste dedupe, the `'unlikely'` tag, the 200 cap,
`markDuplicates`, and `fromPicked`.

**End-to-end — `scripts/verify-import.mjs`.** Follows the existing script convention:
mint a session with `admin.auth.admin.generateLink` + `verifyOtp`, inject it into
`localStorage` under `sb-<ref>-auth-token`, drive the built app with Playwright
(`channel: 'chrome'`). Paste a known block → assert the review list matches → import →
assert the people appear on My people with the right cadences → clean up the rows it
created.

## Verification before relying on it

Two assumptions this design rests on, both cheap to check for real and neither safe to
assume from a green build:

1. **Row triggers fire on a multi-row insert** — that a bulk `.insert([...])` seeds
   `reminder_settings` and `nudge_style` for every row, not just the first. Checkable
   directly against the database.
2. **The picker works in the installed iOS app with the flag on** — the whole
   `'needs-flag'` path is pointless if the flag does not cross into standalone mode.
   Needs a real iPhone, the way Google sign-in was confirmed.

If (1) fails, the fallback is a second insert into `reminder_settings` inside
`addFriends`. If (2) fails, `'needs-flag'` collapses into `'unsupported'` and paste is
the only source on iOS until Phase 5 — the pipeline is unaffected either way.

## Risks

- **The flag moves.** Apple renames and removes experimental flags between point
  releases with no notice, and the walkthrough would then describe a path that does not
  exist. Mitigated by paste never depending on it, and by the walkthrough saying the
  flag is experimental.
- **Parsing surprises.** Real pastes will contain shapes the rules mishandle. Mitigated
  by the review list: nothing is written that the user has not seen, and only genuinely
  empty lines are dropped silently.

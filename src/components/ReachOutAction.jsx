import { STYLE_LABEL, telHref } from '../lib/share'

/**
 * Calling is a link so the phone actually dials — an installed iOS web app will not
 * reliably dial from window.location, but it always follows an <a href="tel:">. The
 * other styles are buttons that open the share sheet. Both record the contact through
 * the same handler.
 */
export default function ReachOutAction({ style, phone, primary, busy, onAct, label }) {
  const className = primary ? 'btn' : 'btn btn-secondary'
  const text = label ?? STYLE_LABEL[style]

  if (style === 'call' && phone) {
    return (
      <a className={className} href={telHref(phone)} onClick={() => onAct('call')}>
        {text}
      </a>
    )
  }

  return (
    <button className={className} onClick={() => onAct(style)} disabled={busy}>
      {busy && primary ? 'Opening…' : text}
    </button>
  )
}

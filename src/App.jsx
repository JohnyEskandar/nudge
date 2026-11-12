import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { logEvent } from './lib/events'
import { permissionState } from './lib/push'
import Login from './screens/Login'
import FriendList from './screens/FriendList'
import People from './screens/People'
import Onboarding from './screens/Onboarding'
import Settings from './screens/Settings'
import Feedback from './screens/Feedback'
import AddFriend from './screens/AddFriend'
import Import from './screens/Import'
import FriendDetail from './screens/FriendDetail'
import Privacy from './screens/Privacy'
import Terms from './screens/Terms'
import ConsentSheet from './components/ConsentSheet'
import { consentKey } from './lib/consent'

/**
 * Each time a signed-in user opens the app: once at load, and again whenever an installed
 * app comes back from the background (which does not reload the page). The notification
 * permission rides along, which is how a quiet revocation shows up.
 */
function logOpen(resumed) {
  logEvent('app_opened', { props: { path: window.location.pathname, resumed } })
  logEvent('push_permission', { props: { state: permissionState() } })
}

const PUBLIC_PATHS = new Set(['/privacy', '/terms'])

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [consented, setConsented] = useState(null) // null until read for this user
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const signedIn = Boolean(session)
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    try {
      setConsented(Boolean(localStorage.getItem(consentKey(userId))))
    } catch {
      setConsented(false)
    }
  }, [userId])
  useEffect(() => {
    if (!signedIn) return
    logOpen(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') logOpen(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [signedIn])

  if (!ready) {
    return (
      <div className="app">
        <div className="loading">…</div>
      </div>
    )
  }

  // The policy and terms are readable by anyone, signed in or not.
  if (PUBLIC_PATHS.has(location.pathname)) {
    return (
      <div className="app">
        <Routes>
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Routes>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app">
        <Login />
      </div>
    )
  }

  if (consented === null) {
    return (
      <div className="app">
        <div className="loading">…</div>
      </div>
    )
  }

  if (!consented) {
    return (
      <div className="app">
        <ConsentSheet userId={session.user.id} onAccept={() => setConsented(true)} />
      </div>
    )
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<FriendList session={session} />} />
        <Route path="/welcome" element={<Onboarding />} />
        <Route path="/people" element={<People />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/add" element={<AddFriend />} />
        <Route path="/import" element={<Import />} />
        <Route path="/friend/:id" element={<FriendDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

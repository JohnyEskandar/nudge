import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './screens/Login'
import FriendList from './screens/FriendList'
import AddFriend from './screens/AddFriend'
import FriendDetail from './screens/FriendDetail'

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

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

  if (!ready) {
    return (
      <div className="app">
        <div className="loading">…</div>
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

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<FriendList session={session} />} />
        <Route path="/add" element={<AddFriend />} />
        <Route path="/friend/:id" element={<FriendDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

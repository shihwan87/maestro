import { useState, useEffect, lazy, Suspense } from 'react'
import { PinGate } from './components/PinGate'
import { Dashboard } from './components/Dashboard'
import { ConfigTab } from './components/ConfigTab'
import { TabBar } from './components/TabBar'
import { useTabMarkers, markerFor } from './hooks/useTabMarkers'
import { COLORS } from './styles/theme'

const CalendarApp = lazy(() => import('./calendar/CalendarApp'))

const TOP_TAB_KEY = 'maestro.topTab'
const SUB_TAB_KEY = 'maestro.activeTab'

const VALID_TOP_TABS = ['tasks', 'calendar', 'config']
const VALID_SUB_TABS = ['work', 'personal']

export default function App() {
  const [topTab, setTopTab] = useState(() => {
    const saved = sessionStorage.getItem(TOP_TAB_KEY)
    return VALID_TOP_TABS.includes(saved) ? saved : 'tasks'
  })
  const [subTab, setSubTab] = useState(() => {
    const saved = sessionStorage.getItem(SUB_TAB_KEY)
    return VALID_SUB_TABS.includes(saved) ? saved : 'work'
  })
  const markers = useTabMarkers()

  useEffect(() => { sessionStorage.setItem(TOP_TAB_KEY, topTab) }, [topTab])
  useEffect(() => { sessionStorage.setItem(SUB_TAB_KEY, subTab) }, [subTab])

  const subMarkers = {
    work:     markerFor(markers.work.minDays),
    personal: markerFor(markers.personal.minDays),
  }

  const topMarkers = {
    config: markers.openRequests > 0 ? 'bang' : null,
  }

  return (
    <PinGate>
      <TopTabBar active={topTab} onChange={setTopTab} markers={topMarkers} />
      {topTab === 'tasks' && (
        <div style={{ paddingTop: 48 }}>
          <TabBar active={subTab} onChange={setSubTab} markers={subMarkers} />
          <div style={{ paddingTop: 60 }}>
            {subTab === 'work'     && <Dashboard scope="work"     title="Work"     itemNoun="Project" />}
            {subTab === 'personal' && <Dashboard scope="personal" title="Personal" itemNoun="Item" />}
          </div>
        </div>
      )}
      {topTab === 'calendar' && (
        <div style={{ paddingTop: 48 }}>
          <Suspense fallback={<p style={{ color: COLORS.muted, padding: 16 }}>Loading calendar…</p>}>
            <CalendarApp />
          </Suspense>
        </div>
      )}
      {topTab === 'config' && (
        <div style={{ paddingTop: 48 }}>
          <ConfigTab />
        </div>
      )}
    </PinGate>
  )
}

function TopTabBar({ active, onChange, markers = {} }) {
  const tabs = [
    { id: 'tasks',    label: 'TASKS' },
    { id: 'calendar', label: 'CALENDAR' },
    { id: 'config',   label: 'CONFIG' },
  ]
  return (
    <nav style={topBarStyle} className="safe-top">
      {tabs.map(t => {
        const on = active === t.id
        const marker = markers[t.id]
        const urgentColor = marker === 'star' ? COLORS.danger : marker === 'bang' ? COLORS.warn : null
        const label = marker === 'star' ? `☆ ${t.label} ☆` : marker === 'bang' ? `! ${t.label} !` : t.label
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            ...topBtnStyle,
            color: on ? COLORS.primary : (urgentColor || COLORS.muted),
            borderBottom: on ? `2px solid ${COLORS.primary}` : '2px solid transparent',
          }}>{label}</button>
        )
      })}
    </nav>
  )
}

const topBarStyle = {
  position: 'fixed', left: 0, right: 0, top: 0,
  display: 'flex', justifyContent: 'space-around',
  background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}`,
  zIndex: 60,
}

const topBtnStyle = {
  flex: 1, background: 'transparent', border: 0,
  padding: '12px 8px', fontSize: 13, fontWeight: 700, letterSpacing: 1,
  cursor: 'pointer',
}

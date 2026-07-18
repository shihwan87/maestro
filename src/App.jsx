import { useState, useEffect, lazy, Suspense } from 'react'
import { PinGate } from './components/PinGate'
import { Dashboard } from './components/Dashboard'
import { ConfigTab } from './components/ConfigTab'
import { TabBar } from './components/TabBar'
import { useTabMarkers, markerFor } from './hooks/useTabMarkers'
import { COLORS } from './styles/theme'

const CalendarApp = lazy(() => import('./calendar/CalendarApp'))

const TOP_TAB_KEY = 'schemanager.topTab'
const SUB_TAB_KEY = 'schemanager.activeTab'

export default function App() {
  const [topTab, setTopTab] = useState(() => sessionStorage.getItem(TOP_TAB_KEY) || 'tasks')
  const [subTab, setSubTab] = useState(() => sessionStorage.getItem(SUB_TAB_KEY) || 'work')
  const markers = useTabMarkers()

  useEffect(() => { sessionStorage.setItem(TOP_TAB_KEY, topTab) }, [topTab])
  useEffect(() => { sessionStorage.setItem(SUB_TAB_KEY, subTab) }, [subTab])

  const tabMarkers = {
    work:     markerFor(markers.work.minDays),
    personal: markerFor(markers.personal.minDays),
    config:   markers.openRequests > 0 ? 'bang' : null,
  }

  return (
    <PinGate>
      <TopTabBar active={topTab} onChange={setTopTab} />
      {topTab === 'tasks' && (
        <div style={{ paddingTop: 48 }}>
          <TabBar active={subTab} onChange={setSubTab} markers={tabMarkers} />
          <div style={{ paddingTop: 60 }}>
            {subTab === 'work'     && <Dashboard scope="work"     title="Work"     itemNoun="Project" />}
            {subTab === 'personal' && <Dashboard scope="personal" title="Personal" itemNoun="Item" />}
            {subTab === 'config'   && <ConfigTab />}
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
    </PinGate>
  )
}

function TopTabBar({ active, onChange }) {
  const tabs = [
    { id: 'tasks',    label: 'TASKS' },
    { id: 'calendar', label: 'CALENDAR' },
  ]
  return (
    <nav style={topBarStyle} className="safe-top">
      {tabs.map(t => {
        const on = active === t.id
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            ...topBtnStyle,
            color: on ? COLORS.primary : COLORS.muted,
            borderBottom: on ? `2px solid ${COLORS.primary}` : '2px solid transparent',
          }}>{t.label}</button>
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

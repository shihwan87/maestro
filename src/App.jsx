import { useState, useEffect } from 'react'
import { PinGate } from './components/PinGate'
import { Dashboard } from './components/Dashboard'
import { ConfigTab } from './components/ConfigTab'
import { TabBar } from './components/TabBar'

const TAB_KEY = 'schemanager.activeTab'

export default function App() {
  const [tab, setTab] = useState(() => sessionStorage.getItem(TAB_KEY) || 'work')

  useEffect(() => { sessionStorage.setItem(TAB_KEY, tab) }, [tab])

  return (
    <PinGate>
      <TabBar active={tab} onChange={setTab} />
      <div style={{ paddingTop: 60 }}>
        {tab === 'work'     && <Dashboard scope="work"     title="Work"     itemNoun="Project" />}
        {tab === 'personal' && <Dashboard scope="personal" title="Personal" itemNoun="Item" />}
        {tab === 'config'   && <ConfigTab />}
      </div>
    </PinGate>
  )
}

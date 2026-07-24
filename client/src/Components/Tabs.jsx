import React, { useState } from 'react';
import '../screens/main.css';

export function Tabs({ tabs, children }) {
  const [active, setActive] = useState(0);
  const panels = React.Children.toArray(children);

  return (
    <>
      <div className="access-tabs-bar">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            className={`access-tab ${active === i ? 'active' : ''}`}
            onClick={() => setActive(i)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="access-tab-content">
        {panels[active]}
      </div>
    </>
  );
}

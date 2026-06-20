import { useState, type ReactNode } from "react";

export interface InboxTab {
  id: string;
  label: string;
  locked?: boolean;
  content: ReactNode;
}

interface InboxTabsProps {
  tabs: InboxTab[];
}

export function InboxTabs({ tabs }: InboxTabsProps) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);

  if (tabs.length === 0) return null;

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.locked && setActiveId(tab.id)}
            disabled={tab.locked}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ${
              activeTab.id === tab.id
                ? "border-accent-blue text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            } ${tab.locked ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {tab.label}
            {tab.locked && <span className="ml-1 text-[10px]">🔒</span>}
          </button>
        ))}
      </div>
      <div>{activeTab.content}</div>
    </div>
  );
}

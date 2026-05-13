"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MissingInMapHeader } from "@/components/admin/missingInMap/MissingInMapHeader";
import { MissingInMapLocationPanel } from "@/components/admin/missingInMap/MissingInMapLocationPanel";
import { MissingInMapRoutePanel } from "@/components/admin/missingInMap/MissingInMapRoutePanel";
import type { TabKey } from "@/components/admin/missingInMap/MissingInMapTypes";

export default function MissingInMapPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("location");

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
  };

  return (
      <div className="max-w-400 mx-auto w-full flex flex-col">
        <MissingInMapHeader activeTab={activeTab} onTabChange={handleTabChange} />
        {activeTab === "location" ? (
          <MissingInMapLocationPanel activeTab={activeTab} onTabChange={handleTabChange} />
        ) : (
          <MissingInMapRoutePanel activeTab={activeTab} onTabChange={handleTabChange} />
        )}
      </div>
  );
}


"use client";

import dynamic from "next/dynamic";

const SettingsClient = dynamic(() => import("@/components/settings/settings-client"), {
  ssr: false,
  loading: () => <div className="min-h-[40vh]" />,
});

export default SettingsClient;

export type PortalSourcePurpose =
  | "commission"
  | "fee"
  | "aeps_rules"
  | "provider_bank_info"
  | "general_updates";

export const PURPOSE_LABELS: Record<PortalSourcePurpose, { label: string; badgeColor: string; description: string }> = {
  commission: {
    label: "Commission",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "Monitors portal payout and commission slabs for AEPS transactions",
  },
  fee: {
    label: "Fee",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
    description: "Monitors customer surcharge and operational fees",
  },
  aeps_rules: {
    label: "AEPS Rules",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    description: "Tracks NPCI daily transaction limits, 2FA biometric rules, and compliance",
  },
  provider_bank_info: {
    label: "Provider/Bank Information",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    description: "Monitors issuer bank network status, server downtime alerts, and RRN formats",
  },
  general_updates: {
    label: "General Updates",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
    description: "General service notices, settlement timing changes, and maintenance alerts",
  },
};

export interface PortalWatcherSource {
  id: string;
  portalId: string;
  portalName: string;
  url: string;
  purpose: PortalSourcePurpose;
  isEnabled: boolean;
  lastChecked: string | null;
  lastStatus: "idle" | "success" | "warning" | "error";
  lastMessage?: string | null;
  currentPublishedValue: {
    commission?: number | null;
    fee?: number | null;
    summary?: string | null;
    updatedAt?: string | null;
  };
  createdAt: string;
}

export interface PortalChangeRecord {
  id: string;
  sourceId: string;
  portalId: string;
  portalName: string;
  sourceUrl: string;
  purpose: PortalSourcePurpose;
  extractedAt: string;
  oldValue: string;
  newValue: string;
  changeSummary: string;
  normalizedData: {
    commission?: number | null;
    fee?: number | null;
    summary?: string | null;
  };
  status: "pending" | "approved" | "rejected";
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export function getDefaultWatcherSources(portals: { id: string; name: string }[]): PortalWatcherSource[] {
  const sources: PortalWatcherSource[] = [];

  for (const portal of portals) {
    const pName = portal.name.toLowerCase();
    const portalId = portal.id;
    const now = new Date().toISOString();

    if (pName.includes("digipay") || pName.includes("csc")) {
      sources.push(
        {
          id: `src-${portalId}-comm`,
          portalId,
          portalName: portal.name,
          url: "https://digipay.csccloud.in/portal/commission-structure",
          purpose: "commission",
          isEnabled: true,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Baseline published commission verified.",
          currentPublishedValue: {
            commission: 6.0,
            fee: 0.0,
            summary: "Digipay standard AEPS commission slab: ₹6.00 per ₹2000+",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-rules`,
          portalId,
          portalName: portal.name,
          url: "https://digipay.csccloud.in/aeps/npci-guidelines",
          purpose: "aeps_rules",
          isEnabled: true,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "NPCI 2-factor authentication rule active.",
          currentPublishedValue: {
            summary: "Daily limit ₹10,000 per Aadhaar. Biometric verification required.",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-banks`,
          portalId,
          portalName: portal.name,
          url: "https://digipay.csccloud.in/status/issuer-banks",
          purpose: "provider_bank_info",
          isEnabled: true,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "All major PSU and private issuer banks operational.",
          currentPublishedValue: {
            summary: "SBI, PNB, BoB, Canara, HDFC, ICICI, Axis active.",
            updatedAt: now,
          },
          createdAt: now,
        }
      );
    } else if (pName.includes("spice") || pName.includes("money")) {
      sources.push(
        {
          id: `src-${portalId}-comm`,
          portalId,
          portalName: portal.name,
          url: "https://b2b.spicemoney.com/pricing/aeps-slabs",
          purpose: "commission",
          isEnabled: true,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Spice Money Plan A active.",
          currentPublishedValue: {
            commission: 7.0,
            fee: 0.0,
            summary: "Spice Money Plan A: ₹7.00 commission on ₹3000-₹10000 withdrawal",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-fee`,
          portalId,
          portalName: portal.name,
          url: "https://b2b.spicemoney.com/pricing/charges-guide",
          purpose: "fee",
          isEnabled: true,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Zero customer surcharge policy.",
          currentPublishedValue: {
            fee: 0.0,
            summary: "Zero surcharge on cash withdrawal",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-news`,
          portalId,
          portalName: portal.name,
          url: "https://b2b.spicemoney.com/announcements/system-alerts",
          purpose: "general_updates",
          isEnabled: false,
          lastChecked: null,
          lastStatus: "idle",
          lastMessage: "Watcher paused by operator.",
          currentPublishedValue: {
            summary: "Scheduled maintenance windows on 2nd and 4th Saturdays",
            updatedAt: now,
          },
          createdAt: now,
        }
      );
    } else {
      // Generic portal seeds
      sources.push(
        {
          id: `src-${portalId}-comm`,
          portalId,
          portalName: portal.name,
          url: `https://${pName.replace(/\s+/g, "")}.com/rates/commission`,
          purpose: "commission",
          isEnabled: true,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Initial baseline active.",
          currentPublishedValue: {
            commission: 5.0,
            fee: 0.0,
            summary: "Standard portal commission slab",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-rules`,
          portalId,
          portalName: portal.name,
          url: `https://${pName.replace(/\s+/g, "")}.com/aeps/rules`,
          purpose: "aeps_rules",
          isEnabled: true,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Standard AEPS limits enforced.",
          currentPublishedValue: {
            summary: "Standard NPCI withdrawal guidelines",
            updatedAt: now,
          },
          createdAt: now,
        }
      );
    }
  }

  return sources;
}

/**
 * ==============================================================================
 * Autonomous AI Security Auditor & Posture Score Engine
 * ==============================================================================
 */

export type SecurityAuditItem = {
  id: string;
  title: string;
  category: "authentication" | "network" | "financial_tamper" | "data_privacy" | "database";
  status: "pass" | "warn" | "fail";
  scoreImpact: number;
  description: string;
  remediation?: string;
};

export type SecurityPostureReport = {
  score: number; // 0 - 100
  grade: "A+" | "A" | "B" | "C" | "F";
  status: "excellent" | "hardened" | "needs_attention" | "critical";
  checks: SecurityAuditItem[];
  vulnerabilitiesCount: number;
  warningsCount: number;
  passedCount: number;
};

export function runSecurityAudit(params: {
  adminPinConfigured: boolean;
  screenLockEnabled: boolean;
  httpOnlyCookiesActive: boolean;
  securityHeadersActive: boolean;
  rlsCoveragePercent: number;
  rateLimitingActive: boolean;
  unmaskedRecordsCount: number;
}): SecurityPostureReport {
  const {
    adminPinConfigured,
    screenLockEnabled,
    httpOnlyCookiesActive,
    securityHeadersActive,
    rlsCoveragePercent,
    rateLimitingActive,
    unmaskedRecordsCount,
  } = params;

  const checks: SecurityAuditItem[] = [
    {
      id: "auth_httponly_cookies",
      title: "Authentication Token Storage (Zero LocalStorage)",
      category: "authentication",
      status: httpOnlyCookiesActive ? "pass" : "fail",
      scoreImpact: 20,
      description: "JWT access tokens are stored in secure HttpOnly cookies, immune to XSS token theft.",
    },
    {
      id: "manager_override_pin",
      title: "Manager Re-Authentication PIN for High-Risk Actions",
      category: "authentication",
      status: adminPinConfigured ? "pass" : "warn",
      scoreImpact: 15,
      description: "High-risk actions (discounts >10%, cancellations, expense deletion) require supervisor PIN.",
      remediation: "Configure 4-Digit Manager Override PIN in Security Center.",
    },
    {
      id: "counter_screen_lock",
      title: "Counter Inactivity Screen Lock",
      category: "authentication",
      status: screenLockEnabled ? "pass" : "warn",
      scoreImpact: 15,
      description: "Automatically locks unattended counter screen after 3 minutes of inactivity.",
      remediation: "Enable Inactivity Screen Lock in Security Center.",
    },
    {
      id: "security_headers",
      title: "HTTP Security Headers (HSTS, CSP, X-Frame)",
      category: "network",
      status: securityHeadersActive ? "pass" : "fail",
      scoreImpact: 15,
      description: "HSTS, Anti-Clickjacking (X-Frame-Options), and X-Content-Type-Options headers active.",
    },
    {
      id: "api_rate_limiting",
      title: "API Brute-Force & Flooding Rate Limiting",
      category: "network",
      status: rateLimitingActive ? "pass" : "warn",
      scoreImpact: 15,
      description: "In-memory token bucket rate limits protect /login, /api/staff, and /api/whatsapp against automated hammering.",
    },
    {
      id: "database_rls",
      title: "PostgreSQL Row Level Security (RLS) Coverage",
      category: "database",
      status: rlsCoveragePercent >= 95 ? "pass" : "warn",
      scoreImpact: 10,
      description: `Row Level Security active across ${rlsCoveragePercent}% of public database tables.`,
    },
    {
      id: "dpdp_data_masking",
      title: "Sensitive Customer Data Masking (DPDP Compliance)",
      category: "data_privacy",
      status: unmaskedRecordsCount === 0 ? "pass" : "warn",
      scoreImpact: 10,
      description: "Aadhaar, PAN, and Bank Account numbers are masked on staff screens and receipts.",
    },
  ];

  let totalScore = 0;
  for (const c of checks) {
    if (c.status === "pass") totalScore += c.scoreImpact;
    else if (c.status === "warn") totalScore += Math.round(c.scoreImpact * 0.6);
  }

  const passed = checks.filter((c) => c.status === "pass").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const fails = checks.filter((c) => c.status === "fail").length;

  let grade: SecurityPostureReport["grade"] = "A+";
  if (totalScore < 60) grade = "F";
  else if (totalScore < 75) grade = "C";
  else if (totalScore < 88) grade = "B";
  else if (totalScore < 96) grade = "A";

  const status = fails > 0 ? "needs_attention" : totalScore >= 90 ? "excellent" : "hardened";

  return {
    score: totalScore,
    grade,
    status,
    checks,
    vulnerabilitiesCount: fails,
    warningsCount: warns,
    passedCount: passed,
  };
}

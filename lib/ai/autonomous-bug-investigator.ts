import { detectCodeBugs, prepareCodeRepair, type CodeBug, type CodeRepairPlan } from "./code-repair";

export type Investigation = {
  bug: CodeBug;
  rootCause: string;
  confidence: number;
  evidence: string[];
  inferredPath: string | null;
  line: number | null;
  column: number | null;
  repairPlan: CodeRepairPlan | null;
  nextStep: "review" | "blocked";
};

const SAFE_SOURCE = /(?:^|[\\/])(app|components|lib|hooks|utils)[\\/]([^\\s:)]+?)(?::(\\d+))?(?::(\\d+))?(?:\\)|$)/i;

function inferLocation(message: string) {
  const match = message.match(SAFE_SOURCE);
  if (!match) return { path: null, line: null, column: null };
  const path = `${match[1]}/${match[2]}`.replace(/[),]+$/, "");
  return { path, line: match[3] ? Number(match[3]) : null, column: match[4] ? Number(match[4]) : null };
}

function normalize(message: string) {
  return message.replace(/\b[0-9a-f]{7,40}\b/gi, "<sha>").replace(/\b\d+ms\b/g, "<latency>").trim();
}

export async function investigateBugs(): Promise<Investigation[]> {
  const bugs = await detectCodeBugs();
  return bugs.slice(0, 12).map((bug) => {
    const location = inferLocation(bug.message);
    const evidence = [normalize(bug.message), bug.route ? `Route: ${bug.route}` : "No route metadata supplied", bug.source === "github-actions" ? `Workflow run: ${bug.runId ?? "unknown"}` : `Deployment: ${bug.deploymentId ?? "unknown"}`];
    const inferredPath = location.path;
    const rootCause = inferredPath
      ? `Failure points to ${inferredPath}${location.line ? `:${location.line}` : ""}. The investigator mapped the observed error to the first safe application source location in the stack/error text.`
      : "The failure was detected, but its stack/error text does not contain a safe application source path. Manual source selection is required before a patch can be prepared.";
    return { bug, rootCause, confidence: inferredPath ? 0.78 : 0.42, evidence, inferredPath, line: location.line, column: location.column, repairPlan: null, nextStep: inferredPath ? "review" : "blocked" };
  });
}

export async function investigateAndPrepare(bugId: string): Promise<Investigation> {
  const investigations = await investigateBugs();
  const item = investigations.find((entry) => entry.bug.id === bugId);
  if (!item) throw new Error("The selected failure is no longer present in the latest scan.");
  if (!item.inferredPath) return item;
  const repairPlan = await prepareCodeRepair(item.bug, item.inferredPath);
  return { ...item, repairPlan, nextStep: "review" };
}

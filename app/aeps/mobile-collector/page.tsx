import AepsMobileCollector from "@/components/business/aeps-mobile-collector";

export default function AepsMobileCollectorPage() {
  // The component gets its portal master from the browser/API in the normal AEPS
  // workspace. Keep this standalone page intentionally small; it is also useful
  // as a dedicated Android setup screen.
  return <AepsMobileCollector initialPortals={[]} />;
}

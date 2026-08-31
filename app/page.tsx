import { redirect } from "next/navigation";

export default function Home() {
  // Development mode: authentication is intentionally disabled until the ERP is complete.
  redirect("/dashboard");
}

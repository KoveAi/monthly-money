import { requirePrivatePage } from "@/lib/private-page";

export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePrivatePage();
  return children;
}

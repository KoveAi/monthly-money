import { requirePrivatePage } from "@/lib/private-page";

export const dynamic = "force-dynamic";
export default async function MonthlyLayout({ children }: { children: React.ReactNode }) {
  await requirePrivatePage();
  return children;
}

import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { ModulesScreen } from "@/features/modules/components/modules-screen";
import { parseModuleMessage, parsePageNumber } from "@/features/modules/modules";
import { listModules } from "@/features/modules/queries/list-modules";

export const metadata: Metadata = { title: "Modules" };

function firstValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function AdminModulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;
  const search = firstValue(params.q) ?? "";
  const modules = await listModules({ page: parsePageNumber(firstValue(params.page)), search });
  return <ModulesScreen message={parseModuleMessage(firstValue(params.m))} modules={modules} profile={profile} search={search} />;
}

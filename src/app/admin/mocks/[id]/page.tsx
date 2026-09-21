import { notFound } from "next/navigation";
import { EditMockRoute } from "@/features/question-bank/components/mock-routes";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; if (!/^\d+$/.test(id)) notFound();
  return <EditMockRoute mockId={Number(id)} searchParams={searchParams} />;
}

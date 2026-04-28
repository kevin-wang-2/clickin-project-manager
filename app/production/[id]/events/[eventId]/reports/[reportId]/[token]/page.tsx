import ReportViewPage from "../page";

type Ctx = { params: Promise<{ id: string; eventId: string; reportId: string; token: string }> };

export default async function ReportTokenPage({ params }: Ctx) {
  const { id, eventId, reportId, token } = await params;
  return ReportViewPage({
    params: Promise.resolve({ id, eventId, reportId }),
    searchParams: Promise.resolve({ t: token }),
  });
}

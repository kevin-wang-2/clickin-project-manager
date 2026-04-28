import DailyCallPage from "../../page";

type Ctx = { params: Promise<{ date: string; token: string }> };

export default async function DailyCallTokenPage({ params }: Ctx) {
  const { date, token } = await params;
  return DailyCallPage({ searchParams: Promise.resolve({ date, t: token }) });
}

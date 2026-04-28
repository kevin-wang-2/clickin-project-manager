import WeeklyCallPage from "../page";

type Ctx = { params: Promise<{ token: string }> };

export default async function WeeklyCallTokenPage({ params }: Ctx) {
  const { token } = await params;
  return WeeklyCallPage({ searchParams: Promise.resolve({ t: token }) });
}

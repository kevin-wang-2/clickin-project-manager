/**
 * Extracts dynamic segment names from a Next.js route pattern.
 *
 * ExtractRouteParams<"/api/production/[id]/cuelists/[cueListId]">
 *   → { id: string; cueListId: string }
 */
type ExtractRouteParams<T extends string> =
  T extends `${infer _}[${infer Param}]${infer Rest}`
    ? { [K in Param | keyof ExtractRouteParams<Rest>]: string }
    : Record<string, never>;

/**
 * Context argument for Next.js 16 App Router route handlers.
 * params is a Promise in Next.js 16 — always await it.
 *
 * Usage:
 *   export async function GET(req: NextRequest, ctx: RouteContext<"/api/production/[id]">) {
 *     const { id } = await ctx.params;
 *   }
 */
type RouteContext<T extends string> = {
  params: Promise<ExtractRouteParams<T>>;
};

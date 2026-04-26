import { handleKeepAlive } from "../_lib/keep-alive-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return handleKeepAlive();
}

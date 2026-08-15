import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  workspaceStoreFromCloudflareEnv,
} from "@/lib/persistence/d1-workspace-store";
import { createWorkspaceHandlers } from "@/lib/persistence/workspace-route-handlers";

async function cloudflareWorkspaceStore() {
  try {
    const context = await getCloudflareContext({ async: true });
    return workspaceStoreFromCloudflareEnv(context.env);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  return createWorkspaceHandlers(await cloudflareWorkspaceStore()).POST(request);
}

export async function GET(request: Request) {
  return createWorkspaceHandlers(await cloudflareWorkspaceStore()).GET(request);
}

export async function PUT(request: Request) {
  return createWorkspaceHandlers(await cloudflareWorkspaceStore()).PUT(request);
}

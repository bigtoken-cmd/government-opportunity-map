import { withIntakeRateLimit } from "@/lib/intake/intake-rate-limit";
import { createWebsitePost } from "@/lib/intake/website-route-handler";

export const POST = withIntakeRateLimit(createWebsitePost());

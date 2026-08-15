import { createEvidenceBundlePost } from "@/lib/intake/evidence-bundle-route-handler";
import { withIntakeRateLimit } from "@/lib/intake/intake-rate-limit";

export const POST = withIntakeRateLimit(createEvidenceBundlePost());

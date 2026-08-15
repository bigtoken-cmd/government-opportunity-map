import { createEvidencePost } from "@/lib/intake/evidence-route-handler";
import { withIntakeRateLimit } from "@/lib/intake/intake-rate-limit";

export const POST = withIntakeRateLimit(createEvidencePost());

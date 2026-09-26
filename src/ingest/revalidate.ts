import { env } from "../lib/env";
import { logger } from "../lib/logger";

export const revalidateFrontend = async () => {
  if (!env.FRONTEND_REVALIDATE_URL || !env.REVALIDATE_SECRET) {
    return;
  }

  try {
    const res = await fetch(env.FRONTEND_REVALIDATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.REVALIDATE_SECRET}`,
      },
    });

    if (!res.ok) {
      logger.warn(`Frontend revalidation returned ${res.status}`);
    }
  } catch (err) {
    logger.warn("Failed to call frontend revalidation hook", err);
  }
};

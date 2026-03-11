import { task } from "@trigger.dev/sdk";

/**
 * Example task for Trigger.dev. Use for post-sale side effects, reports, etc.
 * Per ENGINEERING_RULES.md §11: do NOT use for sale recording, auth, or light reads.
 */
export const exampleTask = task({
  id: "example-task",
  run: async (payload: { name: string }) => {
    return {
      message: `Hello ${payload.name}!`,
      timestamp: new Date().toISOString(),
    };
  },
});

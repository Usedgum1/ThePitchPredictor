import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {object} body
 */
async function callEmailJobsApi(client, body) {
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("You must be signed in to manage email jobs.");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/owner-email-jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body || {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.msg || "Email jobs request failed.");
  }
  return payload;
}

/** @param {import("@supabase/supabase-js").SupabaseClient} client */
export async function fetchEmailJobsBootstrap(client) {
  return callEmailJobsApi(client, { action: "bootstrap" });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {object} template
 */
export async function upsertEmailTemplate(client, template) {
  return callEmailJobsApi(client, { action: "upsert_template", ...template });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} id
 */
export async function deleteEmailTemplate(client, id) {
  return callEmailJobsApi(client, { action: "delete_template", id });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {object} job
 */
export async function upsertEmailJob(client, job) {
  return callEmailJobsApi(client, { action: "upsert_job", ...job });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} id
 */
export async function deleteEmailJob(client, id) {
  return callEmailJobsApi(client, { action: "delete_job", id });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} id
 * @param {object} [context]
 */
export async function testEmailJob(client, id, context = {}) {
  return callEmailJobsApi(client, { action: "test_job", id, context });
}

export const EMAIL_JOB_EVENT_OPTIONS = [
  { value: "subscription.created", label: "New subscription (checkout)" },
  { value: "subscription.updated", label: "Subscription updated" },
  { value: "subscription.canceled", label: "Subscription canceled" },
  { value: "user.signup", label: "New account signup" },
  { value: "manual.test", label: "Manual / test only" },
];

export const EMAIL_JOB_SCHEDULE_OPTIONS = [
  { value: "manual", label: "Manual only" },
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

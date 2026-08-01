import {
  deleteEmailJob,
  deleteEmailTemplate,
  EMAIL_JOB_EVENT_OPTIONS,
  EMAIL_JOB_SCHEDULE_OPTIONS,
  fetchEmailJobsBootstrap,
  testEmailJob,
  upsertEmailJob,
  upsertEmailTemplate,
} from "../data/emailJobs.js";

/** @type {{
 *   loaded: boolean,
 *   loading: boolean,
 *   error: string,
 *   status: string,
 *   events: string[],
 *   templates: object[],
 *   jobs: object[],
 *   runs: object[],
 *   tab: "jobs"|"templates"|"runs",
 *   draftJob: object,
 *   draftTemplate: object,
 * }} */
const jobsUi = {
  loaded: false,
  loading: false,
  error: "",
  status: "",
  events: [],
  templates: [],
  jobs: [],
  runs: [],
  tab: "jobs",
  draftJob: emptyJobDraft(),
  draftTemplate: emptyTemplateDraft(),
};

function emptyJobDraft() {
  return {
    id: "",
    name: "",
    enabled: true,
    trigger_type: "event",
    event_key: "subscription.created",
    schedule_preset: "daily",
    to_emails: "",
    include_owners: true,
    include_customer: false,
    template_id: "",
    subject_override: "",
    body_override: "",
  };
}

function emptyTemplateDraft() {
  return {
    id: "",
    name: "",
    subject: "",
    body: "",
  };
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string | null | undefined} iso */
function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function jobFromRow(job) {
  const recipients = job?.recipients && typeof job.recipients === "object" ? job.recipients : {};
  return {
    id: job.id || "",
    name: job.name || "",
    enabled: job.enabled !== false,
    trigger_type: job.trigger_type || "event",
    event_key: job.event_key || "subscription.created",
    schedule_preset: job.schedule_preset || "daily",
    to_emails: Array.isArray(recipients.to_emails) ? recipients.to_emails.join(", ") : "",
    include_owners: Boolean(recipients.include_owners),
    include_customer: Boolean(recipients.include_customer),
    template_id: job.template_id || "",
    subject_override: job.subject_override || "",
    body_override: job.body_override || "",
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 */
export async function loadEmailJobsUi(client) {
  jobsUi.loading = true;
  jobsUi.error = "";
  try {
    const payload = await fetchEmailJobsBootstrap(client);
    jobsUi.templates = Array.isArray(payload.templates) ? payload.templates : [];
    jobsUi.jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    jobsUi.runs = Array.isArray(payload.runs) ? payload.runs : [];
    jobsUi.events = Array.isArray(payload.events) ? payload.events : [];
    jobsUi.loaded = true;
  } catch (error) {
    jobsUi.error = error?.message || "Failed to load email jobs.";
    jobsUi.loaded = true;
  } finally {
    jobsUi.loading = false;
  }
}

function renderJobsTab() {
  const rows = jobsUi.jobs
    .map((job) => {
      const trigger =
        job.trigger_type === "schedule"
          ? `Schedule · ${job.schedule_preset || "—"}`
          : `Event · ${job.event_key || "—"}`;
      return `<tr>
        <td class="col-text">${escapeHtml(job.name || "—")}</td>
        <td class="col-text">${job.enabled ? "On" : "Off"}</td>
        <td class="col-text">${escapeHtml(trigger)}</td>
        <td class="col-text">${escapeHtml(fmtWhen(job.last_run_at))}</td>
        <td class="col-text">
          <button type="button" class="btn btn-ghost btn-sm" data-job-edit="${escapeHtml(job.id)}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm" data-job-test="${escapeHtml(job.id)}">Test</button>
          <button type="button" class="btn btn-danger btn-sm" data-job-delete="${escapeHtml(job.id)}">Delete</button>
        </td>
      </tr>`;
    })
    .join("");

  return `
    <div class="email-jobs-split">
      <div>
        <div class="admin-master-head">
          <h4 class="card-title" style="font-size:0.95rem;">Saved jobs</h4>
          <button type="button" class="btn btn-ghost btn-sm" id="email-job-new">New job</button>
        </div>
        <div class="table-shell table-theme-customers">
          <div class="table-scroll email-jobs-table-scroll">
            <table class="data-table">
              <thead><tr>
                <th class="col-text">Name</th>
                <th class="col-text">Enabled</th>
                <th class="col-text">Trigger</th>
                <th class="col-text">Last run</th>
                <th class="col-text">Actions</th>
              </tr></thead>
              <tbody>${rows || `<tr><td class="col-center mini-empty" colspan="5">No jobs yet — build one on the right</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
      ${renderJobBuilder()}
    </div>`;
}

function renderJobBuilder() {
  const d = jobsUi.draftJob;
  const isSchedule = d.trigger_type === "schedule";
  const templateOpts = [`<option value="">Custom subject/body</option>`]
    .concat(
      jobsUi.templates.map(
        (t) =>
          `<option value="${escapeHtml(t.id)}"${d.template_id === t.id ? " selected" : ""}>${escapeHtml(t.name)}</option>`
      )
    )
    .join("");

  const eventOpts = EMAIL_JOB_EVENT_OPTIONS.map(
    (o) =>
      `<option value="${escapeHtml(o.value)}"${d.event_key === o.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`
  ).join("");

  const scheduleOpts = EMAIL_JOB_SCHEDULE_OPTIONS.map(
    (o) =>
      `<option value="${escapeHtml(o.value)}"${d.schedule_preset === o.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`
  ).join("");

  return `
    <div class="email-job-builder">
      <h4 class="card-title" style="font-size:0.95rem;margin-bottom:0.75rem;">${d.id ? "Edit job" : "New job"}</h4>
      <div class="admin-email-compose">
        <label class="field">
          <span>Name</span>
          <input id="email-job-name" class="admin-filter-input" type="text" value="${escapeHtml(d.name)}" placeholder="e.g. Alert me on new subs" />
        </label>
        <label class="admin-radio" style="margin:0;">
          <input id="email-job-enabled" type="checkbox" ${d.enabled ? "checked" : ""} />
          <span>Enabled</span>
        </label>

        <div class="admin-email-audience" role="radiogroup" aria-label="Trigger type">
          <label class="admin-radio">
            <input type="radio" name="email-job-trigger" value="event" ${!isSchedule ? "checked" : ""} />
            <span>On event</span>
          </label>
          <label class="admin-radio">
            <input type="radio" name="email-job-trigger" value="schedule" ${isSchedule ? "checked" : ""} />
            <span>On schedule</span>
          </label>
        </div>

        <label class="field ${isSchedule ? "hidden" : ""}" id="email-job-event-wrap">
          <span>Event</span>
          <select id="email-job-event" class="admin-select">${eventOpts}</select>
        </label>
        <label class="field ${isSchedule ? "" : "hidden"}" id="email-job-schedule-wrap">
          <span>Schedule</span>
          <select id="email-job-schedule" class="admin-select">${scheduleOpts}</select>
        </label>

        <label class="field">
          <span>To emails (comma-separated)</span>
          <input id="email-job-to" class="admin-filter-input" type="text" value="${escapeHtml(d.to_emails)}" placeholder="you@example.com" />
        </label>
        <div class="email-job-recipient-flags">
          <label class="admin-radio"><input id="email-job-owners" type="checkbox" ${d.include_owners ? "checked" : ""} /><span>All owners</span></label>
          <label class="admin-radio"><input id="email-job-customer" type="checkbox" ${d.include_customer ? "checked" : ""} /><span>Affected customer</span></label>
        </div>

        <label class="field">
          <span>Template</span>
          <select id="email-job-template" class="admin-select">${templateOpts}</select>
        </label>
        <label class="field">
          <span>Subject override (optional if template selected)</span>
          <input id="email-job-subject" class="admin-filter-input" type="text" value="${escapeHtml(d.subject_override)}" placeholder="New sub: {{customer_email}} ({{plan}})" />
        </label>
        <label class="field">
          <span>Body override (optional if template selected)</span>
          <textarea id="email-job-body" class="admin-email-body" rows="6" placeholder="Use {{customer_email}}, {{plan}}, {{previous_plan}}, {{username}}, {{user_id}}…">${escapeHtml(d.body_override)}</textarea>
        </label>

        <div class="admin-email-send-row">
          <p class="page-sub" style="margin:0;">Variables: {{customer_email}} {{plan}} {{previous_plan}} {{username}} {{user_id}}</p>
          <button type="button" class="btn btn-primary" id="email-job-save">${d.id ? "Save job" : "Create job"}</button>
        </div>
      </div>
    </div>`;
}

function renderTemplatesTab() {
  const d = jobsUi.draftTemplate;
  const rows = jobsUi.templates
    .map(
      (t) => `<tr>
        <td class="col-text">${escapeHtml(t.name)}</td>
        <td class="col-text">${escapeHtml(t.subject)}</td>
        <td class="col-text">
          <button type="button" class="btn btn-ghost btn-sm" data-template-edit="${escapeHtml(t.id)}">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" data-template-delete="${escapeHtml(t.id)}">Delete</button>
        </td>
      </tr>`
    )
    .join("");

  return `
    <div class="email-jobs-split">
      <div>
        <div class="admin-master-head">
          <h4 class="card-title" style="font-size:0.95rem;">Templates</h4>
          <button type="button" class="btn btn-ghost btn-sm" id="email-template-new">New template</button>
        </div>
        <div class="table-shell table-theme-customers">
          <div class="table-scroll email-jobs-table-scroll">
            <table class="data-table">
              <thead><tr>
                <th class="col-text">Name</th>
                <th class="col-text">Subject</th>
                <th class="col-text">Actions</th>
              </tr></thead>
              <tbody>${rows || `<tr><td class="col-center mini-empty" colspan="3">No templates yet</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="email-job-builder">
        <h4 class="card-title" style="font-size:0.95rem;margin-bottom:0.75rem;">${d.id ? "Edit template" : "New template"}</h4>
        <div class="admin-email-compose">
          <label class="field"><span>Name</span><input id="email-template-name" class="admin-filter-input" type="text" value="${escapeHtml(d.name)}" /></label>
          <label class="field"><span>Subject</span><input id="email-template-subject" class="admin-filter-input" type="text" value="${escapeHtml(d.subject)}" /></label>
          <label class="field"><span>Body</span><textarea id="email-template-body" class="admin-email-body" rows="8">${escapeHtml(d.body)}</textarea></label>
          <div class="admin-email-send-row">
            <p class="page-sub" style="margin:0;">Reusable across jobs</p>
            <button type="button" class="btn btn-primary" id="email-template-save">${d.id ? "Save template" : "Create template"}</button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderRunsTab() {
  const rows = jobsUi.runs
    .map(
      (r) => `<tr>
        <td class="col-text">${escapeHtml(fmtWhen(r.created_at))}</td>
        <td class="col-text">${escapeHtml(r.job_name || "—")}</td>
        <td class="col-text">${escapeHtml(r.event_key || "—")}</td>
        <td class="col-text">${escapeHtml(r.status || "—")}</td>
        <td class="col-text">${escapeHtml(String(r.recipient_count ?? 0))}</td>
        <td class="col-text">${escapeHtml(r.error || "—")}</td>
      </tr>`
    )
    .join("");

  return `
    <div class="table-shell table-theme-customers">
      <div class="table-scroll email-jobs-table-scroll">
        <table class="data-table">
          <thead><tr>
            <th class="col-text">When</th>
            <th class="col-text">Job</th>
            <th class="col-text">Event</th>
            <th class="col-text">Status</th>
            <th class="col-text">Sent</th>
            <th class="col-text">Error</th>
          </tr></thead>
          <tbody>${rows || `<tr><td class="col-center mini-empty" colspan="6">No runs yet</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function readJobDraftFromDom(container) {
  const trigger =
    /** @type {HTMLInputElement | null} */ (
      container.querySelector('input[name="email-job-trigger"]:checked')
    )?.value || "event";
  jobsUi.draftJob = {
    ...jobsUi.draftJob,
    name: /** @type {HTMLInputElement | null} */ (container.querySelector("#email-job-name"))?.value || "",
    enabled: Boolean(/** @type {HTMLInputElement | null} */ (container.querySelector("#email-job-enabled"))?.checked),
    trigger_type: trigger,
    event_key: /** @type {HTMLSelectElement | null} */ (container.querySelector("#email-job-event"))?.value || "subscription.created",
    schedule_preset: /** @type {HTMLSelectElement | null} */ (container.querySelector("#email-job-schedule"))?.value || "daily",
    to_emails: /** @type {HTMLInputElement | null} */ (container.querySelector("#email-job-to"))?.value || "",
    include_owners: Boolean(/** @type {HTMLInputElement | null} */ (container.querySelector("#email-job-owners"))?.checked),
    include_customer: Boolean(/** @type {HTMLInputElement | null} */ (container.querySelector("#email-job-customer"))?.checked),
    template_id: /** @type {HTMLSelectElement | null} */ (container.querySelector("#email-job-template"))?.value || "",
    subject_override: /** @type {HTMLInputElement | null} */ (container.querySelector("#email-job-subject"))?.value || "",
    body_override: /** @type {HTMLTextAreaElement | null} */ (container.querySelector("#email-job-body"))?.value || "",
  };
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   busy?: boolean,
 *   onRequestClient: () => Promise<import("@supabase/supabase-js").SupabaseClient>,
 * }} opts
 */
export function mountEmailJobsPanel(container, opts) {
  const busy = Boolean(opts.busy);

  if (!jobsUi.loaded && !jobsUi.loading) {
    container.innerHTML = `
      <div class="email-jobs-panel">
        <div class="admin-actions-head">
          <div>
            <h3 class="card-title">Email Jobs</h3>
            <p class="page-sub" style="margin:0.15rem 0 0;">Templates, triggers, and schedules</p>
          </div>
        </div>
        <p class="page-sub">Loading job builder…</p>
      </div>`;
    opts
      .onRequestClient()
      .then((client) => loadEmailJobsUi(client))
      .then(() => mountEmailJobsPanel(container, opts))
      .catch((error) => {
        jobsUi.error = error?.message || "Failed to load.";
        jobsUi.loaded = true;
        mountEmailJobsPanel(container, opts);
      });
    return;
  }

  const tab = jobsUi.tab;
  container.innerHTML = `
    <div class="email-jobs-panel">
      <div class="admin-actions-head">
        <div>
          <h3 class="card-title">Email Jobs</h3>
          <p class="page-sub" style="margin:0.15rem 0 0;">Build triggers &amp; schedules on the front end</p>
        </div>
        <div class="email-jobs-head-actions">
          <p class="admin-action-status muted">${escapeHtml(jobsUi.status || jobsUi.error || "")}</p>
          <button type="button" class="btn btn-ghost btn-sm" id="email-jobs-refresh" ${busy || jobsUi.loading ? "disabled" : ""}>Refresh</button>
        </div>
      </div>

      <div class="email-jobs-tabs" role="tablist">
        <button type="button" class="btn btn-sm ${tab === "jobs" ? "btn-primary" : "btn-ghost"}" data-jobs-tab="jobs">Jobs</button>
        <button type="button" class="btn btn-sm ${tab === "templates" ? "btn-primary" : "btn-ghost"}" data-jobs-tab="templates">Templates</button>
        <button type="button" class="btn btn-sm ${tab === "runs" ? "btn-primary" : "btn-ghost"}" data-jobs-tab="runs">Run log</button>
      </div>

      <div class="email-jobs-tab-body">
        ${tab === "templates" ? renderTemplatesTab() : tab === "runs" ? renderRunsTab() : renderJobsTab()}
      </div>
    </div>`;

  /** @param {string} text */
  function setStatus(text) {
    jobsUi.status = text;
    const el = container.querySelector(".admin-action-status");
    if (el) el.textContent = text;
  }

  async function reload() {
    const client = await opts.onRequestClient();
    await loadEmailJobsUi(client);
    mountEmailJobsPanel(container, opts);
  }

  container.querySelectorAll("[data-jobs-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (jobsUi.tab === "jobs") readJobDraftFromDom(container);
      jobsUi.tab = /** @type {"jobs"|"templates"|"runs"} */ (btn.getAttribute("data-jobs-tab") || "jobs");
      mountEmailJobsPanel(container, opts);
    });
  });

  container.querySelector("#email-jobs-refresh")?.addEventListener("click", () => {
    reload().catch((error) => setStatus(error?.message || "Refresh failed"));
  });

  container.querySelectorAll('input[name="email-job-trigger"]').forEach((input) => {
    input.addEventListener("change", () => {
      readJobDraftFromDom(container);
      mountEmailJobsPanel(container, opts);
    });
  });

  container.querySelector("#email-job-new")?.addEventListener("click", () => {
    jobsUi.draftJob = emptyJobDraft();
    mountEmailJobsPanel(container, opts);
  });

  container.querySelectorAll("[data-job-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-job-edit");
      const job = jobsUi.jobs.find((j) => j.id === id);
      if (!job) return;
      jobsUi.draftJob = jobFromRow(job);
      jobsUi.tab = "jobs";
      mountEmailJobsPanel(container, opts);
    });
  });

  container.querySelectorAll("[data-job-test]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-job-test");
      if (!id) return;
      setStatus("Sending test…");
      opts
        .onRequestClient()
        .then((client) => testEmailJob(client, id))
        .then((payload) => {
          setStatus(
            `Test: sent ${payload.result?.sent || 0}, failed ${payload.result?.failed || 0}`
          );
          return reload();
        })
        .catch((error) => setStatus(error?.message || "Test failed"));
    });
  });

  container.querySelectorAll("[data-job-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-job-delete");
      if (!id || !window.confirm("Delete this email job?")) return;
      opts
        .onRequestClient()
        .then((client) => deleteEmailJob(client, id))
        .then(() => {
          if (jobsUi.draftJob.id === id) jobsUi.draftJob = emptyJobDraft();
          setStatus("Job deleted.");
          return reload();
        })
        .catch((error) => setStatus(error?.message || "Delete failed"));
    });
  });

  container.querySelector("#email-job-save")?.addEventListener("click", () => {
    readJobDraftFromDom(container);
    const d = jobsUi.draftJob;
    const payload = {
      id: d.id || undefined,
      name: d.name,
      enabled: d.enabled,
      trigger_type: d.trigger_type,
      event_key: d.trigger_type === "event" ? d.event_key : null,
      schedule_preset: d.trigger_type === "schedule" ? d.schedule_preset : null,
      recipients: {
        to_emails: String(d.to_emails || "")
          .split(/[,;\s]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
        include_owners: Boolean(d.include_owners),
        include_customer: Boolean(d.include_customer),
      },
      template_id: d.template_id || null,
      subject_override: d.subject_override || null,
      body_override: d.body_override || null,
    };
    setStatus("Saving job…");
    opts
      .onRequestClient()
      .then((client) => upsertEmailJob(client, payload))
      .then((res) => {
        jobsUi.draftJob = jobFromRow(res.job || payload);
        setStatus("Job saved.");
        return reload();
      })
      .catch((error) => setStatus(error?.message || "Save failed"));
  });

  container.querySelector("#email-template-new")?.addEventListener("click", () => {
    jobsUi.draftTemplate = emptyTemplateDraft();
    mountEmailJobsPanel(container, opts);
  });

  container.querySelectorAll("[data-template-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-template-edit");
      const template = jobsUi.templates.find((t) => t.id === id);
      if (!template) return;
      jobsUi.draftTemplate = {
        id: template.id,
        name: template.name || "",
        subject: template.subject || "",
        body: template.body || "",
      };
      mountEmailJobsPanel(container, opts);
    });
  });

  container.querySelectorAll("[data-template-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-template-delete");
      if (!id || !window.confirm("Delete this template?")) return;
      opts
        .onRequestClient()
        .then((client) => deleteEmailTemplate(client, id))
        .then(() => {
          if (jobsUi.draftTemplate.id === id) jobsUi.draftTemplate = emptyTemplateDraft();
          setStatus("Template deleted.");
          return reload();
        })
        .catch((error) => setStatus(error?.message || "Delete failed"));
    });
  });

  container.querySelector("#email-template-save")?.addEventListener("click", () => {
    const payload = {
      id: jobsUi.draftTemplate.id || undefined,
      name: /** @type {HTMLInputElement | null} */ (container.querySelector("#email-template-name"))?.value || "",
      subject: /** @type {HTMLInputElement | null} */ (container.querySelector("#email-template-subject"))?.value || "",
      body: /** @type {HTMLTextAreaElement | null} */ (container.querySelector("#email-template-body"))?.value || "",
    };
    setStatus("Saving template…");
    opts
      .onRequestClient()
      .then((client) => upsertEmailTemplate(client, payload))
      .then((res) => {
        jobsUi.draftTemplate = {
          id: res.template?.id || "",
          name: res.template?.name || payload.name,
          subject: res.template?.subject || payload.subject,
          body: res.template?.body || payload.body,
        };
        setStatus("Template saved.");
        return reload();
      })
      .catch((error) => setStatus(error?.message || "Save failed"));
  });
}

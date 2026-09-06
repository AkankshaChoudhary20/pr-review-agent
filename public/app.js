const statusEl = document.getElementById("status");
const tableEl = document.getElementById("reviews-table");
const tbodyEl = document.getElementById("reviews-body");
const overlayEl = document.getElementById("detail-overlay");
const detailBodyEl = document.getElementById("detail-body");
const closeModalBtn = document.getElementById("close-modal");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function riskBadge(risk) {
  const label = { low: "Low", medium: "Medium", high: "High" }[risk] || risk;
  return `<span class="badge ${escapeHtml(risk)}">${escapeHtml(label)}</span>`;
}

async function loadReviews() {
  statusEl.textContent = "Loading reviews...";
  statusEl.classList.remove("error");

  try {
    const res = await fetch("/reviews");
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    const reviews = await res.json();

    if (reviews.length === 0) {
      statusEl.textContent =
        "No reviews yet. Open or update a pull request on a repo with the webhook configured, and it'll show up here.";
      tableEl.classList.add("hidden");
      return;
    }

    statusEl.textContent = "";
    tbodyEl.innerHTML = reviews.map(renderRow).join("");
    tableEl.classList.remove("hidden");

    tbodyEl.querySelectorAll("tr[data-review-id]").forEach((row) => {
      row.addEventListener("click", () => openDetail(row.dataset.reviewId));
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "Failed to load reviews. Is the server running and connected to Postgres?";
    statusEl.classList.add("error");
  }
}

function renderRow(review) {
  const prLabel = `${escapeHtml(review.repo)} #${review.pr_number}`;
  const prLink = review.pr_url
    ? `<a class="pr-link" href="${escapeHtml(review.pr_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${prLabel}</a>`
    : prLabel;

  return `
    <tr data-review-id="${review.id}">
      <td>${escapeHtml(review.repo)}</td>
      <td>${prLink}<br /><small>${escapeHtml(review.pr_title || "")}</small></td>
      <td>${riskBadge(review.risk_level)}</td>
      <td class="verdict">${escapeHtml(review.verdict)}</td>
      <td class="summary-cell" title="${escapeHtml(review.summary)}">${escapeHtml(review.summary)}</td>
      <td>${formatDate(review.created_at)}</td>
    </tr>
  `;
}

async function openDetail(id) {
  detailBodyEl.innerHTML = "<p>Loading...</p>";
  overlayEl.classList.remove("hidden");

  try {
    const res = await fetch(`/reviews/${id}`);
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    const review = await res.json();
    detailBodyEl.innerHTML = renderDetail(review);
  } catch (err) {
    console.error(err);
    detailBodyEl.innerHTML = "<p>Failed to load review detail.</p>";
  }
}

function renderDetail(review) {
  const list = (items, emptyText) =>
    items && items.length > 0
      ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      : `<p class="empty-note">${emptyText}</p>`;

  const prLink = review.pr_url
    ? `<a class="pr-link" href="${escapeHtml(review.pr_url)}" target="_blank" rel="noopener">${escapeHtml(review.repo)} #${review.pr_number}</a>`
    : `${escapeHtml(review.repo)} #${review.pr_number}`;

  return `
    <h2>${prLink}</h2>
    <p>${escapeHtml(review.pr_title || "")}</p>
    <p>${riskBadge(review.risk_level)} &nbsp; <span class="verdict">${escapeHtml(review.verdict)}</span> &nbsp; <small>${formatDate(review.created_at)}</small></p>

    <h3>Summary</h3>
    <p>${escapeHtml(review.summary)}</p>

    <h3>Risks &amp; concerns</h3>
    ${list(review.risks, "No specific risks flagged.")}

    <h3>Missing test coverage</h3>
    ${list(review.missing_tests, "No gaps flagged.")}

    <h3>Raw model response</h3>
    <pre>${escapeHtml(review.raw_response || "")}</pre>
  `;
}

closeModalBtn.addEventListener("click", () => overlayEl.classList.add("hidden"));
overlayEl.addEventListener("click", (e) => {
  if (e.target === overlayEl) overlayEl.classList.add("hidden");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") overlayEl.classList.add("hidden");
});

loadReviews();

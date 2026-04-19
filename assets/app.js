const PROFILE_ROUTE_PREFIX = "/p/";
const DEFAULT_PROFILE_SLUG = "gbanankpon-patrice-alladassivo";
const LINKEDIN_DEFAULT_URL = "https://www.linkedin.com/in/patricealladassivo/";
const CERTIFICATION_LINKS = {
  "red hat certified openshift administrator": "https://www.credly.com/badges/fc4bf2ab-333a-41ee-821e-0fd59b1cdba4",
  "aws artificial intelligence practitioner": "https://www.credly.com/badges/d5ad361b-3d79-4c8d-8049-80123b548ce1/public_url",
  "aws artificial intellingence practitioner": "https://www.credly.com/badges/d5ad361b-3d79-4c8d-8049-80123b548ce1/public_url",
  "red hat certified engineer rhce": "https://www.credly.com/badges/1424b463-182d-406a-9f66-b4e0e7d9f70f/public_url",
  "comptia security ce": "https://www.credly.com/badges/545a4d0b-6f66-44b6-9835-9fa1f6960c97/linked_in",
  "aws certified solutions architect associate": "https://www.credly.com/badges/dd34973c-9821-4f9e-bcbf-03db938cb885/public_url",
  "aws certified cloud practitioner": "https://www.credly.com/badges/0f1ce6af-8212-4294-af81-521ecbcbc4bc/public_url"
};

function monthYearFromIso(iso) {
  if (!iso || iso === "Present") return "Present";
  const [year, month] = iso.split("-");
  if (!year || !month) return iso;
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function dateRange(start, end) {
  return `${monthYearFromIso(start)} - ${monthYearFromIso(end)}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstSentence(list) {
  return asArray(list)[0] || "";
}

function normalizeCertName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function certificationUrl(certification) {
  if (certification?.verificationUrl) return certification.verificationUrl;
  const key = normalizeCertName(certification?.name);
  return CERTIFICATION_LINKS[key] || "";
}

function resolvePublicSlug() {
  const qpSlug = new URLSearchParams(window.location.search).get("slug");
  if (qpSlug) return qpSlug;
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "p" && parts[1]) return parts[1];
  return "";
}

function toResumeShape(profile) {
  return {
    basics: {
      name: profile.full_name || "",
      title: profile.headline || "",
      location: profile.location_label || "",
      email: profile.contact_email || "",
      workAuthorization: profile.work_authorization || "",
      languages: asArray(profile.languages),
      clearance: profile.clearance_label || "",
      summary: asArray(profile.summary_points).length ? asArray(profile.summary_points) : [profile.summary || ""].filter(Boolean)
    },
    certifications: asArray(profile.certifications),
    certificationVerification: profile.certification_verification_url || "",
    skills: asArray(profile.skills),
    experience: asArray(profile.experience),
    education: asArray(profile.education)
  };
}

function getMeta(name) {
  return document.querySelector(`meta[name=\"${name}\"]`) || document.querySelector(`meta[property=\"${name}\"]`);
}

function setMeta(name, value, property = false) {
  const selector = property ? `meta[property=\"${name}\"]` : `meta[name=\"${name}\"]`;
  let node = document.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    if (property) node.setAttribute("property", name);
    else node.setAttribute("name", name);
    document.head.appendChild(node);
  }
  node.setAttribute("content", value);
}

function updateSeo(resume, canonicalUrl) {
  const pageTitle = `${resume.basics.name} | ${resume.basics.title || "Resume Profile"}`;
  const description = firstSentence(resume.basics.summary) || "Professional resume profile.";
  document.title = pageTitle;

  setMeta("description", description);
  setMeta("robots", "index,follow");
  setMeta("og:type", "profile", true);
  setMeta("og:title", pageTitle, true);
  setMeta("og:description", description, true);
  setMeta("og:url", canonicalUrl, true);
  setMeta("og:site_name", "Resume Profile", true);
  setMeta("twitter:card", "summary_large_image");
  setMeta("twitter:title", pageTitle);
  setMeta("twitter:description", description);

  let canonical = document.getElementById("canonical-link");
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.id = "canonical-link";
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestPdfJob(slug) {
  const response = await fetch("/pdf/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ slug })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `PDF job creation failed (${response.status})`);
  }
  return payload;
}

async function readPdfJob(jobId) {
  const response = await fetch(`/pdf/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Failed to read PDF job (${response.status})`);
  }
  return payload;
}

function setupPdfExport() {
  if (new URLSearchParams(window.location.search).get("pdf") === "1") return;

  const button = document.getElementById("pdf-export-btn");
  const statusNode = document.getElementById("pdf-export-status");
  if (!button || !statusNode) return;

  button.addEventListener("click", async () => {
    const slug = resolvePublicSlug() || DEFAULT_PROFILE_SLUG;
    if (!slug) {
      statusNode.textContent = "Missing profile slug; cannot export PDF.";
      return;
    }

    button.disabled = true;
    statusNode.textContent = "Starting PDF export...";

    try {
      const created = await requestPdfJob(slug);

      if (created.status === "done" && created.downloadUrl) {
        statusNode.textContent = created.cacheHit
          ? "Using cached PDF. Download will start now."
          : "PDF ready. Download will start now.";
        window.location.href = created.downloadUrl;
        return;
      }

      statusNode.textContent = "Generating PDF. This usually takes a few seconds...";
      const startedAt = Date.now();
      const timeoutMs = 120000;

      while (Date.now() - startedAt < timeoutMs) {
        await sleep(1800);
        const snapshot = await readPdfJob(created.jobId);

        if (snapshot.status === "done" && snapshot.artifact?.downloadUrl) {
          statusNode.textContent = snapshot.cacheHit
            ? "Cached PDF ready. Download will start now."
            : "PDF generation complete. Download will start now.";
          window.location.href = snapshot.artifact.downloadUrl;
          return;
        }

        if (snapshot.status === "failed") {
          throw new Error(snapshot.error || "PDF generation failed");
        }
      }

      throw new Error("PDF generation timed out. Please retry.");
    } catch (err) {
      statusNode.textContent = `PDF export failed: ${String(err.message || err)}`;
    } finally {
      button.disabled = false;
    }
  });
}

function applyPdfModeClasses() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("pdf") === "1") {
    document.body.classList.add("pdf-export-mode");
  }
}

function applyTemplateTheme(resume) {
  const key = resume?.template?.key || "clean-professional";
  const cssSafe = key.replace(/[^a-z0-9-]/g, "");
  document.body.classList.remove(
    "template-clean-professional",
    "template-modern-card",
    "template-minimal-serif"
  );
  document.body.classList.add(`template-${cssSafe}`);
}

function render(resume) {
  applyTemplateTheme(resume);
  document.getElementById("name").textContent = resume.basics.name;
  document.getElementById("title").textContent = resume.basics.title;
  document.getElementById("subtitle").textContent = firstSentence(resume.basics.summary);

  const contact = document.getElementById("contact-pills");
  contact.innerHTML = [
    resume.basics.location,
    resume.basics.email,
    `Work Authorization: ${resume.basics.workAuthorization}`,
    `Languages: ${asArray(resume.basics.languages).join(" & ")}`,
    `Clearance: ${resume.basics.clearance}`
  ].filter(Boolean).map((item) => `<span class="pill">${item}</span>`).join("");

  const summaryList = document.getElementById("summary-list");
  summaryList.innerHTML = asArray(resume.basics.summary).map((item) => `<li>${item}</li>`).join("");

  const certs = document.getElementById("cert-list");
  certs.innerHTML = asArray(resume.certifications)
    .map((c) => {
      const label = c.name || "";
      const year = c.year || "";
      const url = certificationUrl(c);
      const verify = url
        ? `<a class="cert-link" href="${url}" target="_blank" rel="noreferrer">[Verify]</a>`
        : "";
      return `
        <tr>
          <td>${label}</td>
          <td>${year}</td>
          <td>${verify}</td>
        </tr>
      `;
    })
    .join("");

  const skills = document.getElementById("skills-list");
  skills.innerHTML = asArray(resume.skills).map((item) => `<li>${item}</li>`).join("");

  const xp = document.getElementById("experience-list");
  xp.innerHTML = asArray(resume.experience).map((job) => `
    <article class="xp-item fade">
      <h3>${job.role}</h3>
      <p class="meta">${job.company} | ${job.location} | ${dateRange(job.start, job.end)}</p>
      <ul>${asArray(job.highlights).map((h) => `<li>${h}</li>`).join("")}</ul>
    </article>
  `).join("");

  const edu = document.getElementById("education-list");
  edu.innerHTML = asArray(resume.education).map((item) => `<li>${item}</li>`).join("");

  const verify = document.getElementById("cert-verify");
  verify.href = resume.certificationVerification || "#";
  verify.textContent = "Verify credentials";

  const emailBtn = document.getElementById("email-link");
  emailBtn.href = `mailto:${resume.basics.email}`;

  const linkedinBtn = document.getElementById("linkedin-link");
  if (linkedinBtn) {
    linkedinBtn.href = resume.basics.linkedin || LINKEDIN_DEFAULT_URL;
  }

  const canonicalUrl = new URL(window.location.pathname + window.location.search, window.location.origin).toString();
  updateSeo(resume, canonicalUrl);
}

async function loadFromPublicRoute(slug) {
  const response = await fetch(
    `/api/profiles?slug=eq.${encodeURIComponent(slug)}&is_public=is.true&select=slug,full_name,headline,summary,contact_email,location_label,work_authorization,languages,clearance_label,certification_verification_url,summary_points,skills,certifications,experience,education&limit=1`,
    { headers: { Accept: "application/json" }, cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Public profile API request failed (${response.status})`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No public profile found for slug '${slug}'`);
  }

  return toResumeShape(rows[0]);
}

async function loadLocalPublicFallback() {
  const candidates = [
    new URL("../data/resume.json", window.location.href).toString(),
    new URL("../../data/resume.json", window.location.href).toString(),
    new URL("./data/resume.json", window.location.href).toString()
  ];

  for (const candidate of candidates) {
    const response = await fetch(candidate, { cache: "no-store" }).catch(() => null);
    if (response?.ok) return response.json();
  }

  throw new Error("Local fallback resume data not found for public route");
}

async function loadResume() {
  const slug = resolvePublicSlug();
  const isPublicRoute = window.location.pathname.startsWith(PROFILE_ROUTE_PREFIX);
  if (slug || isPublicRoute) {
    if (!slug) throw new Error("Missing profile slug in /p/{slug} route");
    try {
      return await loadFromPublicRoute(slug);
    } catch {
      return loadLocalPublicFallback();
    }
  }

  const dataMeta = getMeta("resume-data-url");
  const dataUrl = dataMeta?.content || "data/resume.json";
  const response = await fetch(dataUrl, { cache: "no-store" });
  return response.json();
}

function setupReveal() {
  const nodes = [...document.querySelectorAll(".fade")];
  if (!nodes.length) return;
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });

  nodes.forEach((n, index) => {
    n.style.transitionDelay = `${Math.min(index * 45, 250)}ms`;
    io.observe(n);
  });
}

function setupScrollSpotlight() {
  const items = [...document.querySelectorAll("main .section, main .card, main .xp-item")]
    .filter((node) => !node.classList.contains("bg-noise"));
  if (!items.length) return;

  items.forEach((node) => node.classList.add("scroll-spotlight"));

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let frameId = 0;

  const update = () => {
    frameId = 0;
    const viewportHeight = window.innerHeight || 1;
    const viewportCenter = viewportHeight / 2;
    const distanceWindow = viewportHeight * 0.72;

    items.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const normalizedDistance = Math.min(1, Math.abs(center - viewportCenter) / distanceWindow);
      const spotlight = 1 - normalizedDistance;
      const scale = prefersReducedMotion ? 1 : 1 + spotlight * 0.055;
      const lift = prefersReducedMotion ? 0 : spotlight * 12;
      const borderAlpha = 0.14 + spotlight * 0.62;
      const glowAlpha = 0.06 + spotlight * 0.26;

      node.style.setProperty("--spot", spotlight.toFixed(3));
      node.style.setProperty("--spot-scale", scale.toFixed(3));
      node.style.setProperty("--spot-lift", `${lift.toFixed(1)}px`);
      node.style.setProperty("--spot-border-alpha", borderAlpha.toFixed(3));
      node.style.setProperty("--spot-glow-alpha", glowAlpha.toFixed(3));
    });
  };

  const requestUpdate = () => {
    if (frameId) return;
    frameId = window.requestAnimationFrame(update);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  update();
}

(async () => {
  try {
    const resume = await loadResume();
    render(resume);
    applyPdfModeClasses();
    setupPdfExport();
    setupReveal();
    setupScrollSpotlight();
  } catch (err) {
    const target = document.getElementById("experience-list");
    target.innerHTML = `<p>Failed to load resume data: ${String(err)}</p>`;
  }
})();

const contentPath = "dist/content.json";
const imagePath = /^images\/[a-z\d_-]+\.(?:webp|jpe?g|png)$/i;
const imageData = /^data:image\/(webp|jpeg|png);base64,([a-z\d+/]+={0,2})$/i;
const fields = ["artistName", "tagline", "intro", "bio", "commissions", "contactIntro", "contactEmail",
  "whatsapp", "instagram", "facebook", "tiktok", "pinterest", "behance", "youtube", "featuredId", "aboutImage"];

function requestFor(repository, token) {
  return async (path, { method = "GET", payload, action } = {}) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      method,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        ...(payload && { "Content-Type": "application/json" }),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (response.ok) return response.json();
    if (response.status === 401) throw new Error("GitHub could not verify the access token. Check that it is current.");
    if (response.status === 404) throw new Error("GitHub could not find the repository, branch, or portfolio files with this token.");
    const error = await response.json().catch(() => null);
    const message = typeof error?.message === "string"
      ? error.message.replaceAll(token, "[token hidden]").replace(/\s+/g, " ").trim().slice(0, 350)
      : "";
    const context = action ? ` while ${action}` : "";
    throw new Error(`GitHub returned error ${response.status}${context}.${message ? ` ${message}` : ""}`);
  };
}

export async function connectGitHub({ repository, branch = "main", token }) {
  const target = repository.trim();
  const sourceBranch = branch.trim() || "main";
  if (!/^[a-z\d][a-z\d-]*\/[a-z\d_.-]+$/i.test(target) || /\/\.{1,2}$/.test(target)) {
    throw new Error("Enter your GitHub repository as owner/repository.");
  }
  if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(sourceBranch) || sourceBranch.includes("..") || sourceBranch.split("/").some(part => part.startsWith(".") || part.endsWith(".lock") || part.endsWith("."))) {
    throw new Error("Enter a valid GitHub branch name.");
  }
  if (!token?.trim()) throw new Error("Enter your repository access token.");

  const api = requestFor(target, token.trim());
  const ref = `heads/${sourceBranch.split("/").map(encodeURIComponent).join("/")}`;
  const { object } = await api(`git/ref/${ref}`, { action: "opening the publishing branch" });
  const file = await api(`contents/${contentPath}?ref=${object.sha}`, { action: "opening the portfolio content" });
  const bytes = Uint8Array.from(atob(file.content), character => character.charCodeAt(0));
  const content = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(content.artworks) || typeof content.artistName !== "string") {
    throw new Error("This repository is missing the portfolio content file.");
  }
  return { api, ref, repository: target, branch: sourceBranch, head: object.sha, content };
}

function imageReferences(content) {
  return [content.aboutImage, ...content.artworks.map(artwork => artwork.image)].filter(Boolean);
}

function publishableContent(draft) {
  const content = Object.fromEntries(fields.map(key => [key, String(draft[key] ?? "").trim()]));
  content.commissionSteps = (draft.commissionSteps ?? []).map(step => ({
    name: String(step.name ?? "").trim(),
    details: String(step.details ?? "").trim(),
  })).filter(step => step.name);
  content.commissionRates = (draft.commissionRates ?? []).map(rate => ({
    name: String(rate.name ?? "").trim(),
    price: String(rate.price ?? "").trim(),
    details: String(rate.details ?? "").trim(),
  })).filter(rate => rate.name);
  content.faqs = (draft.faqs ?? []).map(faq => ({
    question: String(faq.question ?? "").trim(),
    answer: String(faq.answer ?? "").trim(),
  })).filter(faq => faq.question && faq.answer);
  content.artworks = draft.artworks.map(({ id, title, medium, size, price, description, alt, image, width, height }) => ({
    id, title, medium, size: String(size ?? "").trim(), price: String(price ?? "").trim(),
    description, alt, image, width, height,
  }));

  if (!content.artistName || !content.tagline) throw new Error("Add an artist name and a homepage headline before publishing.");
  for (const artwork of content.artworks) {
    if (!artwork.title?.trim() || !artwork.image || !artwork.alt?.trim()) {
      throw new Error("Give each artwork a title, an image, and a short description for screen readers.");
    }
  }
  return content;
}

export async function publishToGitHub(connection, draft, onProgress = () => {}) {
  const content = publishableContent(draft);
  const { api, ref, repository, head } = connection;
  const { object } = await api(`git/ref/${ref}`, { action: "checking the publishing branch" });
  if (object.sha !== head) {
    throw new Error("The site changed on GitHub after you connected. Reconnect to review the latest version before publishing.");
  }
  const { tree: baseTree } = await api(`git/commits/${head}`, { action: "reading the current version" });
  const paths = new Map();
  const changes = [];
  const previous = new Set(imageReferences(connection.content));

  for (const source of new Set(imageReferences(content))) {
    if (imagePath.test(source)) {
      if (!previous.has(source)) throw new Error("An image in this draft is missing from the GitHub version. Replace the image before publishing.");
      continue;
    }
    const image = source.match(imageData);
    if (!image || image[2].length > 4_300_000) throw new Error("One image could not be published. Try replacing it with a smaller JPEG, PNG, or WebP.");
    const bytes = Uint8Array.from(atob(image[2]), character => character.charCodeAt(0));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hash = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    const file = `images/artwork-${hash}.${image[1].toLowerCase()}`;
    paths.set(source, file);
    if (previous.has(file)) continue;
    onProgress("Uploading artwork to GitHub…");
    const { sha } = await api("git/blobs", {
      method: "POST",
      payload: { content: image[2], encoding: "base64" },
      action: "uploading artwork",
    });
    changes.push({ path: `dist/${file}`, mode: "100644", type: "blob", sha });
  }
  content.aboutImage = paths.get(content.aboutImage) ?? content.aboutImage;
  for (const artwork of content.artworks) artwork.image = paths.get(artwork.image) ?? artwork.image;

  const keep = new Set(imageReferences(content));
  for (const path of previous) {
    if (!keep.has(path) && imagePath.test(path)) {
      changes.push({ path: `dist/${path}`, mode: "100644", type: "blob", sha: null });
    }
  }
  changes.push({ path: contentPath, mode: "100644", type: "blob", content: JSON.stringify(content, null, 2) + "\n" });

  onProgress("Saving the portfolio on GitHub…");
  const tree = await api("git/trees", {
    method: "POST",
    payload: { base_tree: baseTree.sha, tree: changes },
    action: "preparing the portfolio files",
  });
  if (tree.sha === baseTree.sha) return { content, commitUrl: `https://github.com/${repository}/commit/${head}` };
  const commit = await api("git/commits", {
    method: "POST",
    payload: { message: "Update portrait portfolio", tree: tree.sha, parents: [head] },
    action: "saving the portfolio update",
  });
  await api(`git/refs/${ref}`, {
    method: "PATCH",
    payload: { sha: commit.sha, force: false },
    action: "publishing to the branch",
  });
  Object.assign(connection, { content, head: commit.sha });
  return { content, commitUrl: `https://github.com/${repository}/commit/${commit.sha}` };
}

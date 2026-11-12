const $ = (id) => document.getElementById(id);
const draftKey = "current";
const baseUrl = new URL("../", document.baseURI);
const repositorySettingsKey = "portrait-portfolio:repository:" + baseUrl.pathname;
const textFields = [...document.querySelectorAll("[data-field]")];
const panelLinks = [...document.querySelectorAll(".nav-item")];
const panels = [...document.querySelectorAll(".panel")];
const maxUpload = 25 * 1024 * 1024;
const maxImage = 3 * 1024 * 1024;
const imageType = /^image\/(?:jpeg|png|webp)$/;
const dataImage = /^data:image\/(?:jpeg|png|webp);base64,/i;
const commissionEditors = [
  { list: "commission-steps", add: "add-step", field: "commissionSteps", label: "Step", kind: "step" },
  { list: "commission-rates", add: "add-rate", field: "commissionRates", label: "Rate", kind: "rate", hasPrice: true },
  { list: "faqs", add: "add-faq", field: "faqs", kind: "FAQ", name: "question", details: "answer" }
];
const socialFields = [
  ["facebook", "Facebook"], ["tiktok", "TikTok"], ["pinterest", "Pinterest"],
  ["behance", "Behance"], ["youtube", "YouTube"]
];

let content;
let baseline;
let database;
let connection;
let publisher;
let dirty = false;
let saved = false;
let sentToGitHub = false;
let busy = false;
let sourceDiffers = false;
let reviewRequired = false;
let fieldSequence = 0;

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("portrait-portfolio", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close any other Studio tabs and reload this page."));
  });
  return database;
}

async function readDraft() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts");
    const store = transaction.objectStore("drafts");
    const draft = store.get(draftKey);
    const source = store.get("source");
    transaction.oncomplete = () => resolve({ content: draft.result, baseline: source.result });
    transaction.onabort = () => reject(transaction.error);
  });
}

async function storeDraft(data = content, source = baseline) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts", "readwrite");
    const store = transaction.objectStore("drafts");
    store.put(data, draftKey);
    store.put(source, "source");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("The draft could not be saved in this browser."));
    transaction.onerror = () => reject(transaction.error);
  });
}

function showNotice(message, type = "", target = $("notice")) {
  target.hidden = !message;
  target.textContent = message;
  target.classList.toggle("error", type === "error");
}

function updateControls() {
  const available = Boolean(content) && !busy;
  for (const id of ["save", "preview", "publish", "github-settings", "review-github"]) {
    $(id).disabled = !available;
  }
  $("editor-content").inert = busy;
  $("github-fields").inert = busy;
  $("connect").disabled = busy;
  $("disconnect").disabled = busy;
  $("load-remote").disabled = busy;
  $("keep-draft").disabled = busy;
  if (!content) $("save-state").textContent = "Loading portfolio…";
  else if (dirty) $("save-state").textContent = "Unsaved changes";
  else if (sentToGitHub) $("save-state").textContent = "Changes sent to GitHub";
  else if (saved) $("save-state").textContent = "Saved on this device";
  else $("save-state").textContent = "Edits stay on this device";
}

function markDirty() {
  dirty = true;
  sentToGitHub = false;
  updateControls();
}

async function doWork(operation, target = $("notice")) {
  if (busy) return;
  busy = true;
  updateControls();
  try {
    await operation();
  } catch (error) {
    showNotice(error.message || "Something went wrong. Please try again.", "error", target);
  } finally {
    busy = false;
    updateControls();
  }
}

function navigatePanel(focus) {
  const requested = location.hash.slice(1);
  const active = panels.find((panel) => panel.id === requested) ?? panels[0];
  for (const panel of panels) panel.hidden = panel !== active;
  for (const link of panelLinks) {
    if (link.hash === "#" + active.id) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (focus) active.querySelector("h1").focus();
}

function imageSource(value) {
  if (!value) return "";
  if (dataImage.test(value)) return value;
  const url = new URL(value, baseUrl);
  return url.origin === baseUrl.origin && url.pathname.startsWith(baseUrl.pathname + "images/")
    ? url.href
    : "";
}

function renderAbout() {
  const src = imageSource(content.aboutImage);
  const image = $("about-image");
  image.hidden = !src;
  if (src) image.src = src;
  else image.removeAttribute("src");
  $("about-remove").hidden = !src;
  $("about-upload-label").textContent = src ? "Replace photo" : "Choose photo";
}

function setInputFields() {
  for (const field of textFields) {
    field.value = content[field.dataset.field] ?? "";
  }
}

function button(label, className = "button") {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  return element;
}

function editField(item, key, label, maxLength, { heading, fallback = "", multiline = false, help } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const fieldLabel = document.createElement("label");
  fieldLabel.textContent = label;
  const input = document.createElement(multiline ? "textarea" : "input");
  input.id = "studio-field-" + (++fieldSequence);
  fieldLabel.htmlFor = input.id;
  input.value = item[key] ?? "";
  input.maxLength = maxLength;
  if (multiline) input.rows = 2;
  input.addEventListener("input", () => {
    item[key] = input.value;
    if (heading) heading.textContent = input.value.trim() || fallback;
    markDirty();
  });
  wrapper.append(fieldLabel, input);
  if (help) {
    const hint = document.createElement("small");
    hint.id = input.id + "-hint";
    hint.textContent = help;
    input.setAttribute("aria-describedby", hint.id);
    wrapper.append(hint);
  }
  return wrapper;
}

function renderArtwork(keepOpenId, restoreFocus = false) {
  const list = $("artwork-list");
  const openIds = new Set([...list.querySelectorAll("details[open]")].map((card) => card.dataset.id));
  if (keepOpenId) openIds.add(keepOpenId);
  const cards = content.artworks.map((art, index) => {
    const card = document.createElement("details");
    card.className = "art-card";
    card.dataset.id = art.id;
    card.open = openIds.has(art.id);

    const summary = document.createElement("summary");
    const thumbnail = document.createElement("img");
    thumbnail.className = "art-thumb";
    thumbnail.alt = "";
    thumbnail.loading = "lazy";
    const src = imageSource(art.image);
    if (src) thumbnail.src = src;
    const label = document.createElement("span");
    label.className = "art-label";
    const title = document.createElement("strong");
    title.textContent = art.title?.trim() || "Untitled artwork";
    const medium = document.createElement("small");
    medium.textContent = art.medium ?? "";
    label.append(title, medium);
    summary.append(thumbnail, label);
    const featured = art.id === content.featuredId;
    if (featured) {
      const badge = document.createElement("span");
      badge.className = "featured-tag";
      badge.textContent = "Featured";
      summary.append(badge);
    }

    const details = document.createElement("div");
    details.className = "art-details";
    const sizeAndPrice = document.createElement("div");
    sizeAndPrice.className = "field-pair";
    sizeAndPrice.append(
      editField(art, "size", "Artwork size", 120),
      editField(art, "price", "Artwork price", 100, { help: "Optional. Include the currency or write “Quote on request”." })
    );
    details.append(
      editField(art, "title", "Artwork title", 120, { heading: title, fallback: "Untitled artwork" }),
      editField(art, "medium", "Medium", 120, { heading: medium }),
      sizeAndPrice,
      editField(art, "description", "Caption", 500, { multiline: true }),
      editField(art, "alt", "Image description for screen readers", 240)
    );

    const feature = button(featured ? "Featured on homepage" : "Set as featured", "button feature-control");
    feature.disabled = featured;
    feature.addEventListener("click", () => {
      content.featuredId = art.id;
      markDirty();
      renderArtwork(art.id, true);
    });
    details.append(feature);

    const actions = document.createElement("div");
    actions.className = "inline-actions";
    const upload = document.createElement("label");
    upload.className = "button file-button";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    const uploadLabel = document.createElement("span");
    uploadLabel.textContent = "Replace image";
    input.addEventListener("change", () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;
      doWork(async () => {
        const replacement = await prepareImage(file);
        Object.assign(art, replacement);
        markDirty();
        renderArtwork(art.id, true);
        showNotice("Image replaced in your draft.");
      });
    });
    upload.append(input, uploadLabel);

    const moveEarlier = button("Move earlier");
    moveEarlier.disabled = index === 0;
    moveEarlier.addEventListener("click", () => moveArtwork(index, -1));
    const moveLater = button("Move later");
    moveLater.disabled = index === content.artworks.length - 1;
    moveLater.addEventListener("click", () => moveArtwork(index, 1));
    const remove = button("Remove artwork", "text-button remove");
    remove.addEventListener("click", () => {
      content.artworks.splice(index, 1);
      if (featured) content.featuredId = content.artworks[0]?.id ?? "";
      markDirty();
      renderArtwork(undefined, true);
      showNotice("Artwork removed from your draft.");
    });
    actions.append(upload, moveEarlier, moveLater, remove);
    details.append(actions);
    card.append(summary, details);
    return card;
  });

  if (cards.length) list.replaceChildren(...cards);
  else {
    const empty = document.createElement("p");
    empty.className = "sheet empty-state";
    empty.textContent = "Add your first portrait or sketch to start the gallery. Choose a JPG, PNG or WebP file.";
    list.replaceChildren(empty);
  }
  $("artwork-count").textContent = content.artworks.length;
  if (restoreFocus) {
    const card = cards.find((item) => item.dataset.id === keepOpenId) ?? cards[0];
    (card?.querySelector("summary") ?? $("artwork-upload")).focus();
  }
}

function moveArtwork(index, step) {
  const destination = index + step;
  const artwork = content.artworks;
  const [item] = artwork.splice(index, 1);
  artwork.splice(destination, 0, item);
  markDirty();
  renderArtwork(item.id, true);
  showNotice("Artwork moved to position " + (destination + 1) + ".");
}

function renderCommissionEntries(editor, focusIndex) {
  const entries = content[editor.field] ??= [];
  const nameKey = editor.name ?? "name";
  const detailsKey = editor.details ?? "details";
  const kind = editor.label ? "commission " + editor.kind : editor.kind;
  const fallback = "New " + kind;
  const cards = entries.map((entry, index) => {
    const card = document.createElement("fieldset");
    card.className = "commission-entry " + editor.kind.toLowerCase() + "-card";
    const title = document.createElement("legend");
    title.textContent = entry[nameKey]?.trim() || fallback;
    const name = editField(entry, nameKey, editor.label ? editor.label + " name" : "Question", 120, { heading: title, fallback });
    card.append(title);
    if (editor.hasPrice) {
      const nameAndPrice = document.createElement("div");
      nameAndPrice.className = "field-pair";
      nameAndPrice.append(name, editField(entry, "price", "Rate price", 100));
      card.append(nameAndPrice);
    } else {
      card.append(name);
    }

    const actions = document.createElement("div");
    actions.className = "inline-actions";
    const moveEarlier = button("Move earlier");
    moveEarlier.disabled = index === 0;
    moveEarlier.addEventListener("click", () => moveCommissionEntry(editor, index, -1));
    const moveLater = button("Move later");
    moveLater.disabled = index === entries.length - 1;
    moveLater.addEventListener("click", () => moveCommissionEntry(editor, index, 1));
    const remove = button("Remove " + editor.kind, "text-button remove");
    remove.addEventListener("click", () => {
      entries.splice(index, 1);
      markDirty();
      renderCommissionEntries(editor, Math.min(index, entries.length - 1));
      showNotice(title.textContent + " removed from your changes.");
    });
    actions.append(moveEarlier, moveLater, remove);
    card.append(editField(entry, detailsKey, editor.label ? editor.label + " details" : "Answer", 500, { multiline: true }), actions);
    return card;
  });
  $(editor.list).replaceChildren(...cards);
  if (focusIndex !== undefined) (cards[focusIndex]?.querySelector("input") ?? $(editor.add)).focus();
}

function renderCommissions() {
  for (const editor of commissionEditors) renderCommissionEntries(editor);
}

function moveCommissionEntry(editor, index, offset) {
  const entries = content[editor.field];
  const destination = index + offset;
  const [entry] = entries.splice(index, 1);
  entries.splice(destination, 0, entry);
  markDirty();
  renderCommissionEntries(editor, destination);
  showNotice("Moved to position " + (destination + 1) + ".");
}

for (const editor of commissionEditors) {
  $(editor.add).addEventListener("click", () => {
    const entries = content[editor.field];
    const entry = { [editor.name ?? "name"]: "", [editor.details ?? "details"]: "" };
    if (editor.hasPrice) entry.price = "";
    entries.push(entry);
    markDirty();
    renderCommissionEntries(editor, entries.length - 1);
  });
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function decodeImage(file, url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(file.name + " could not be opened as an image."));
    image.src = url;
  });
}

async function prepareImage(file) {
  if (!imageType.test(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > maxUpload) throw new Error(file.name + " is larger than 25 MB. Choose a smaller version.");
  const url = URL.createObjectURL(file);
  try {
    const source = await decodeImage(file, url);
    const scale = Math.min(1, 1800 / Math.max(source.naturalWidth, source.naturalHeight));
    const width = Math.max(1, Math.round(source.naturalWidth * scale));
    const height = Math.max(1, Math.round(source.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(source, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob || blob.size > maxImage) throw new Error("Choose a smaller version of " + file.name + ".");
    return { image: await readAsDataUrl(blob), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function artworkTitle(filename) {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 120) || "Untitled artwork";
}

$("artwork-upload").addEventListener("change", (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  if (!files.length) return;
  doWork(async () => {
    const errors = [];
    let lastId;
    for (const file of files) {
      try {
        const image = await prepareImage(file);
        lastId = crypto.randomUUID();
        content.artworks.push({
          id: lastId,
          title: artworkTitle(file.name),
          medium: "",
          size: "",
          price: "",
          description: "",
          alt: "",
          ...image
        });
      } catch (error) {
        errors.push(error.message);
      }
    }
    if (lastId) {
      content.featuredId ||= content.artworks[0].id;
      markDirty();
      renderArtwork(lastId, true);
    }
    showNotice(errors.length ? errors.join(" ") : "Artwork added to your draft.", errors.length ? "error" : "");
  });
});

$("about-upload").addEventListener("change", (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  doWork(async () => {
    content.aboutImage = (await prepareImage(file)).image;
    renderAbout();
    markDirty();
    showNotice("About photo added to your draft.");
  });
});

$("about-remove").addEventListener("click", () => {
  content.aboutImage = "";
  renderAbout();
  markDirty();
  $("about-upload").focus();
});

for (const field of textFields) {
  field.addEventListener("input", () => {
    content[field.dataset.field] = field.value;
    markDirty();
  });
}

async function saveDraft() {
  try {
    await storeDraft();
  } catch {
    throw new Error("This browser could not save the draft. Check its storage settings or try another browser.");
  }
  dirty = false;
  saved = true;
}

$("save").addEventListener("click", () => doWork(async () => {
  await saveDraft();
  showNotice("Saved on this device. Use Preview to see your changes.");
}));

$("preview").addEventListener("click", () => {
  const preview = connection ? window.open("about:blank", "_blank") : null;
  if (preview) preview.opener = null;
  doWork(async () => {
    try {
      await saveDraft();
    } catch (error) {
      preview?.close();
      throw error;
    }
    const url = new URL("../?draft=1", document.baseURI);
    if (preview) preview.location.replace(url.href);
    else location.assign(url.href);
  });
});

function showConnection() {
  const connected = Boolean(connection);
  $("connection-state").textContent = connected
    ? "Connected to " + $("repository").value + ". Publish live when you’re ready to update the public site."
    : "Saved changes and previews stay on this device. Connect GitHub when you’re ready to update the public site.";
  $("github-settings").textContent = connected ? "GitHub settings" : "Connect GitHub";
  $("github-title").textContent = connected ? "GitHub settings" : "Connect GitHub";
  $("github-fields").hidden = connected;
  $("github-help").hidden = connected;
  $("disconnect").hidden = !connected;
  $("connect").hidden = connected;
  $("review-github").hidden = !connected || !sourceDiffers;
}

function showGitHubDialog() {
  showNotice("", "", $("github-message"));
  if (connection) showNotice("Connected to " + $("repository").value + ".", "", $("github-message"));
  $("github-dialog").showModal();
}

function loadRepositorySettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(repositorySettingsKey));
    if (settings?.repository && settings?.branch) {
      $("repository").value = settings.repository;
      $("branch").value = settings.branch;
    }
  } catch {
    // The browser may block storage. The connection form still works.
  }
}

$("github-settings").addEventListener("click", showGitHubDialog);
$("github-dialog").addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
$("github-dialog").addEventListener("close", () => {
  $("token").value = "";
});

for (const close of document.querySelectorAll("[data-close]")) {
  close.addEventListener("click", () => {
    if (!busy) $(close.dataset.close).close();
  });
}

$("github-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (connection) return;
  const repository = $("repository").value.trim();
  const branch = $("branch").value.trim();
  const token = $("token").value.trim();
  $("token").value = "";
  doWork(async () => {
    if (!repository || !branch || !token) throw new Error("Enter the repository, branch and token.");
    showNotice("Connecting to GitHub…", "", $("github-message"));
    publisher ??= await import("./publisher.js");
    connection = await publisher.connectGitHub({ repository, branch, token });
    try {
      localStorage.setItem(repositorySettingsKey, JSON.stringify({ repository, branch }));
    } catch {
      // The token stays in memory. Repository and branch can be re-entered.
    }
    sourceDiffers = JSON.stringify(connection.content) !== JSON.stringify(baseline);
    reviewRequired = sourceDiffers;
    showConnection();
    $("github-dialog").close();
    if (reviewRequired) $("sync-dialog").showModal();
    showNotice("GitHub connected.");
  }, $("github-message"));
});

$("disconnect").addEventListener("click", () => {
  connection = undefined;
  sourceDiffers = false;
  reviewRequired = false;
  $("token").value = "";
  showConnection();
  $("github-dialog").close();
  showNotice("GitHub disconnected. Your browser draft is still available.");
});

$("review-github").addEventListener("click", () => $("sync-dialog").showModal());
$("keep-draft").addEventListener("click", () => {
  reviewRequired = false;
  $("sync-dialog").close();
  showNotice("Kept your draft. Publishing will update the version on GitHub.");
});
$("load-remote").addEventListener("click", () => {
  $("sync-dialog").close();
  doWork(async () => {
    const latest = structuredClone(connection.content);
    await storeDraft(latest, latest);
    content = latest;
    baseline = structuredClone(latest);
    sourceDiffers = false;
    reviewRequired = false;
    saved = true;
    dirty = false;
    sentToGitHub = false;
    setInputFields();
    renderAbout();
    renderArtwork();
    renderCommissions();
    showConnection();
    showNotice("Loaded the GitHub version into your browser draft.");
  });
});

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function validateForPublish() {
  const next = structuredClone(content);
  for (const field of textFields) {
    const key = field.dataset.field;
    if (typeof next[key] === "string") next[key] = next[key].trim();
  }
  if (!next.artistName || !next.tagline) throw new Error("Enter an artist name and main headline in Profile.");
  for (const artwork of next.artworks) {
    if (!artwork.title.trim() || !artwork.alt.trim()) {
      throw new Error("Enter a title and image description for " + (artwork.title.trim() || "each piece") + ".");
    }
    artwork.size = artwork.size?.trim() ?? "";
    artwork.price = artwork.price?.trim() ?? "";
  }
  for (const editor of commissionEditors) {
    const name = editor.name ?? "name";
    const details = editor.details ?? "details";
    const fields = editor.hasPrice ? [name, "price", details] : [name, details];
    next[editor.field] = next[editor.field].map((entry) =>
      Object.fromEntries(fields.map((field) => [field, entry[field]?.trim() ?? ""]))
    );
    if (next[editor.field].some((entry) => !entry[name] || (!editor.label && !entry[details]))) {
      if (!editor.label) throw new Error("Enter a question and answer for each FAQ, or remove the unused FAQ.");
      throw new Error("Enter a name for each commission " + editor.kind + ", or remove the unused " + editor.kind + ".");
    }
  }
  if (!$("email").validity.valid) throw new Error("Enter a valid email address in Contact & Social.");
  next.whatsapp = next.whatsapp.replace(/[\s()+-]/g, "");
  if (next.whatsapp && !/^[1-9]\d{6,14}$/.test(next.whatsapp)) {
    throw new Error("Enter a WhatsApp number with its country code in Contact & Social.");
  }
  if (next.instagram) {
    const instagramUrl = httpsUrl(next.instagram);
    const handle = next.instagram.replace(/^@/, "");
    const validLink = instagramUrl && /^(?:www\.)?instagram\.com$/i.test(instagramUrl.hostname) &&
      /^\/[A-Za-z0-9._]{1,30}\/?$/.test(instagramUrl.pathname);
    if (validLink) next.instagram = instagramUrl.href;
    else if (/^[A-Za-z0-9._]{1,30}$/.test(handle)) next.instagram = handle;
    else throw new Error("Enter an Instagram username or an Instagram profile link in Contact & Social.");
  }
  for (const [field, label] of socialFields) {
    if (!next[field]) continue;
    const url = httpsUrl(next[field]);
    if (!url) throw new Error("Enter a full HTTPS link for " + label + " in Contact & Social.");
    next[field] = url.href;
  }
  return next;
}

$("publish").addEventListener("click", () => {
  if (!connection) {
    showGitHubDialog();
    return;
  }
  if (reviewRequired) {
    $("sync-dialog").showModal();
    return;
  }
  doWork(async () => {
    const next = validateForPublish();
    await saveDraft();
    showNotice("Publishing your portfolio to GitHub…");
    const result = await publisher.publishToGitHub(connection, next, showNotice);
    content = next;
    baseline = structuredClone(result.content);
    sourceDiffers = false;
    reviewRequired = false;
    dirty = false;
    sentToGitHub = true;
    setInputFields();
    renderAbout();
    renderArtwork();
    renderCommissions();
    showConnection();
    let message = "Changes saved to GitHub. GitHub Pages will update the live site.";
    try {
      await storeDraft();
      saved = true;
    } catch {
      message += " This browser could not update its saved draft.";
      saved = false;
    }
    showNotice(message);
    if (result.commitUrl) {
      const link = document.createElement("a");
      link.href = result.commitUrl;
      link.rel = "noreferrer";
      link.target = "_blank";
      link.textContent = "View changes ↗";
      $("notice").append(link);
    }
  });
});

window.addEventListener("hashchange", () => navigatePanel(true));
window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = true;
});

function removeRetiredImages(draft) {
  const retiredPath = /^images\/sample-/i;
  const previousCount = draft.artworks.length;
  draft.artworks = draft.artworks.filter((art) => !retiredPath.test(art.image));
  const removedAboutImage = retiredPath.test(draft.aboutImage);
  if (removedAboutImage) draft.aboutImage = "";
  if (!draft.artworks.some((art) => art.id === draft.featuredId)) {
    draft.featuredId = draft.artworks[0]?.id ?? "";
  }
  return removedAboutImage || previousCount !== draft.artworks.length;
}

async function start() {
  try {
    const response = await fetch("../content.json", { cache: "no-store" });
    if (!response.ok) throw new Error("The portfolio content could not load. Reload to try again.");
    const currentPortfolio = await response.json();
    baseline = currentPortfolio;
    try {
      const draft = await readDraft();
      if (draft.content) {
        content = draft.content;
        baseline = draft.baseline ?? baseline;
        saved = true;
        if (removeRetiredImages(content)) await storeDraft();
      }
    } catch {
      showNotice("This browser could not open draft storage. Check its storage settings before making changes.", "error");
    }
    content ??= structuredClone(baseline);
    for (const editor of commissionEditors) {
      content[editor.field] ??= structuredClone(currentPortfolio[editor.field] ?? []);
    }
    setInputFields();
    renderAbout();
    renderArtwork();
    renderCommissions();
    navigatePanel(false);
    loadRepositorySettings();
    showConnection();
    $("editor-content").hidden = false;
    updateControls();
  } catch (error) {
    showNotice(error.message, "error");
    $("save-state").textContent = "Portfolio unavailable";
  }
}

start();

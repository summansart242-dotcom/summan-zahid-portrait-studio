"use strict";

const site = document.getElementById("portfolio");
const viewer = document.getElementById("art-viewer");
const previousButton = document.getElementById("viewer-prev");
const nextButton = document.getElementById("viewer-next");
const projectRoot = new URL("./", window.location.href);
const isDraftPreview = new URLSearchParams(window.location.search).get("draft") === "1";

let artworks = [];
let artworkIndex = 0;

function element(id) {
  return document.getElementById(id);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fill(id, value) {
  const target = element(id);
  target.textContent = value;
  target.hidden = !value;
}

function mediaUrl(value) {
  const path = text(value);
  if (!path) return "";
  if (/^data:image\/(?:jpeg|png|webp|avif|gif);base64,/i.test(path)) return path;

  try {
    const url = new URL(path, projectRoot);
    return url.origin === projectRoot.origin && url.pathname.startsWith(projectRoot.pathname) ? url.href : "";
  } catch {
    return "";
  }
}

function setArtworkImage(image, artwork) {
  image.src = artwork.image;
  image.alt = text(artwork.alt) || artwork.title;

  if (artwork.width > 0 && artwork.height > 0) {
    image.width = artwork.width;
    image.height = artwork.height;
  } else {
    image.removeAttribute("width");
    image.removeAttribute("height");
  }
}

function createExpandIcon() {
  return document.querySelector("#hero-trigger .expand-icon").cloneNode(true);
}

function artworkDetails(artwork) {
  return [text(artwork.medium), text(artwork.size)].filter(Boolean).join(" · ");
}

function createArtworkCard(artwork, index) {
  const figure = document.createElement("figure");
  const trigger = document.createElement("button");
  const image = document.createElement("img");
  const caption = document.createElement("figcaption");
  const title = document.createElement("span");
  const medium = document.createElement("span");
  const price = document.createElement("span");

  trigger.type = "button";
  trigger.className = "art-trigger";
  trigger.setAttribute("aria-label", `Enlarge ${artwork.title}`);
  trigger.addEventListener("click", () => showArtwork(index));
  image.loading = "lazy";
  image.decoding = "async";
  setArtworkImage(image, artwork);
  trigger.append(image, createExpandIcon());

  caption.className = "art-caption";
  title.className = "art-title";
  medium.className = "art-medium";
  price.className = "art-price";
  title.textContent = artwork.title;
  medium.textContent = artworkDetails(artwork);
  price.textContent = text(artwork.price);
  caption.append(title);
  if (price.textContent) caption.append(price);
  if (medium.textContent) caption.append(medium);

  figure.append(trigger, caption);
  return figure;
}

function normalizeArtworks(entries) {
  if (!Array.isArray(entries)) return [];

  return entries.filter(entry => entry && typeof entry === "object").map(entry => ({
    ...entry,
    title: text(entry.title) || "Untitled",
    image: mediaUrl(entry.image)
  })).filter(entry => entry.image);
}

async function getPortraitStyles() {
  try {
    const response = await fetch(new URL("portrait-styles.json", projectRoot), { cache: "no-cache" });
    return response.ok ? normalizeArtworks(await response.json()) : [];
  } catch {
    return [];
  }
}

async function renderArtworks(content) {
  artworks = normalizeArtworks(content.artworks);
  const showPortraitStyles = artworks.length === 0;
  if (showPortraitStyles) artworks = await getPortraitStyles();

  const hasArtwork = artworks.length > 0;
  element("work").hidden = !hasArtwork;
  for (const link of document.querySelectorAll("[data-work-link]")) link.hidden = !hasArtwork;

  if (!hasArtwork) {
    element("hero-studio-image").src = new URL("images/studio-materials.webp", projectRoot).href;
    element("hero-studio-art").hidden = false;
    return;
  }

  const featured = artworks.find(artwork => artwork.id === content.featuredId) || artworks[0];
  const heroTrigger = element("hero-trigger");
  if (showPortraitStyles) {
    fill("work-title", "Portrait styles");
    fill("work-description", "Illustrated examples for planning your commission.");
    fill("hero-gallery-link", "Explore portrait styles");
    heroTrigger.setAttribute("data-illustration", "");
    element("art-grid").setAttribute("data-illustrations", "");
  }
  setArtworkImage(element("hero-image"), featured);
  fill("hero-art-title", showPortraitStyles ? "Portrait illustration" : featured.title);
  fill("hero-art-medium", artworkDetails(featured));
  fill("hero-art-price", text(featured.price));
  heroTrigger.setAttribute("aria-label", `Enlarge ${featured.title}`);
  heroTrigger.addEventListener("click", () => showArtwork(artworks.indexOf(featured)));
  element("hero-art").hidden = false;

  element("art-grid").replaceChildren(...artworks.map(createArtworkCard));
}

function showArtwork(index) {
  artworkIndex = (index + artworks.length) % artworks.length;
  const artwork = artworks[artworkIndex];

  setArtworkImage(element("viewer-image"), artwork);
  fill("viewer-title", artwork.title);
  fill("viewer-medium", artworkDetails(artwork));
  fill("viewer-price", text(artwork.price));
  fill("viewer-description", text(artwork.description));
  fill("viewer-count", `${artworkIndex + 1} / ${artworks.length}`);
  previousButton.disabled = artworks.length < 2;
  nextButton.disabled = artworks.length < 2;

  if (!viewer.open) viewer.showModal();
  viewer.scrollTop = 0;
}

previousButton.addEventListener("click", () => showArtwork(artworkIndex - 1));
nextButton.addEventListener("click", () => showArtwork(artworkIndex + 1));

viewer.addEventListener("click", event => {
  if (event.target === viewer) viewer.close();
});

viewer.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    showArtwork(artworkIndex + (event.key === "ArrowLeft" ? -1 : 1));
  }
});

const socialPlatforms = [
  { key: "instagram", name: "Instagram", domains: ["instagram.com"], icon: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm9 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm1.5-5.5h.01" },
  { key: "facebook", name: "Facebook", domains: ["facebook.com", "fb.com", "fb.me"], icon: "M14 21v-8h3l.5-3H14V8c0-1 .3-2 1.9-2H18V3h-3c-3 0-5 2-5 5v2H7v3h3v8" },
  { key: "tiktok", name: "TikTok", domains: ["tiktok.com"], icon: "M14 3v12.5a4.5 4.5 0 1 1-4.5-4.5m4.5-8c.6 4 2.8 6 6 6" },
  { key: "pinterest", name: "Pinterest", domains: ["pinterest.com", "pin.it"], icon: "M8 20l3-12m0 6c1.2 2.5 5 1.8 6.5-.5C20 9 16.8 5 12 5c-4.6 0-7 3-7 6 0 2 1 3 2 3.5" },
  { key: "behance", name: "Behance", domains: ["behance.net"], icon: "M3 6v12h5a3 3 0 0 0 0-6H3h4.5a3 3 0 0 0 0-6H3Zm11 8h7a3.5 3.5 0 1 0-3.5 4 4 4 0 0 0 3.2-1.5M15 7h5" },
  { key: "youtube", name: "YouTube", domains: ["youtube.com", "youtu.be"], icon: "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm7 1 5 3-5 3V9Z" }
];

function platformUrl(value, platform) {
  if (platform.key === "instagram") {
    const handle = value.replace(/^@/, "");
    if (/^[A-Za-z0-9_.]{1,30}$/.test(handle) && !handle.includes("..") && !handle.startsWith(".") && !handle.endsWith(".")) {
      return `https://www.instagram.com/${handle}/`;
    }
  }
  try {
    const url = new URL(value);
    const matchesPlatform = platform.domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
    return url.protocol === "https:" && !url.username && !url.password && !url.port && matchesPlatform ? url.href : "";
  } catch {
    return "";
  }
}

function contactIcon(pathData, className) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS(svg.namespaceURI, "path");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  path.setAttribute("d", pathData);
  svg.append(path);
  return svg;
}

function contactAnchor({ href, name }) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = name;
  if (href.startsWith("https:")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return link;
}

function contactCard(channel) {
  const link = contactAnchor(channel);
  const name = document.createElement("strong");
  const action = document.createElement("span");
  const label = document.createElement("span");
  name.textContent = channel.name;
  action.textContent = channel.action;
  label.className = "contact-card-copy";
  label.append(name, action);
  link.className = "contact-card contact-button";
  link.replaceChildren(contactIcon(channel.icon, "contact-icon"), label, contactIcon("M6 18 18 6m-8 0h8v8", "contact-arrow"));
  return link;
}

function renderContact(content) {
  const channels = [];
  const email = text(content.contactEmail);
  const whatsapp = text(content.whatsapp).replace(/[ +()-]/g, "");

  if (/^[A-Z0-9._%+\-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
    channels.push({
      name: "Email", action: "Ask about a portrait",
      href: `mailto:${encodeURIComponent(email).replace("%40", "@")}`,
      icon: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 2 9 6 9-6"
    });
  }
  if (/^[1-9]\d{6,14}$/.test(whatsapp)) {
    channels.push({
      name: "WhatsApp", action: "Send a message",
      href: `https://wa.me/${whatsapp}`,
      icon: "M21 11.5a8.5 8.5 0 0 1-12.6 7.4L4 20l1.2-4.2A8.5 8.5 0 1 1 21 11.5Zm-11-3c-.6 2.4 2.2 5.3 4.8 6.1l1-1.2-1.8-.9"
    });
  }

  const socials = socialPlatforms.map(platform => ({
    ...platform, href: platformUrl(text(content[platform.key]), platform), action: "View profile"
  })).filter(platform => platform.href);
  channels.push(...socials);
  element("contact-links").replaceChildren(...channels.map(contactCard));
  element("contact-channels").hidden = channels.length === 0;
  element("footer-socials").replaceChildren(...socials.map(contactAnchor));
  element("footer-socials").hidden = socials.length === 0;
  fill("contact-intro", text(content.contactIntro) || "For a custom portrait, have a reference photo and a few details ready.");
  fill("commission-inquiry", channels.length ? "Start an inquiry" : "Prepare an inquiry");
}

function renderFaqs(content) {
  if (!Array.isArray(content.faqs)) return;

  const faqs = content.faqs.filter(faq => faq && text(faq.question) && text(faq.answer));
  if (!faqs.length) return;

  const items = faqs.map(faq => {
    const disclosure = document.createElement("details");
    const question = document.createElement("summary");
    const answer = document.createElement("p");
    question.textContent = text(faq.question);
    answer.textContent = text(faq.answer);
    disclosure.append(question, answer);
    return disclosure;
  });
  element("faq-list").replaceChildren(...items);
  element("faq").hidden = false;
  for (const link of document.querySelectorAll("[data-faq-link]")) link.hidden = false;
}

function renderCommissionRates(content) {
  if (!Array.isArray(content.commissionRates)) return;

  const rates = content.commissionRates.filter(rate => rate && text(rate.name));
  if (!rates.length) return;

  const items = rates.map(rate => {
    const item = document.createElement("li");
    const name = document.createElement("h4");
    const price = document.createElement("p");
    const details = document.createElement("p");
    name.textContent = text(rate.name);
    price.className = "commission-price";
    price.textContent = text(rate.price) || "Quote on request";
    details.className = "commission-rate-details";
    details.textContent = text(rate.details);
    item.append(name, price);
    if (details.textContent) item.append(details);
    return item;
  });

  element("commission-rates").replaceChildren(...items);
  element("commission-pricing").hidden = false;
}

function renderCommissionProcess(content) {
  if (!Array.isArray(content.commissionSteps)) return;

  const steps = content.commissionSteps.filter(step => step && text(step.name));
  if (!steps.length) return;

  const items = steps.map(step => {
    const item = document.createElement("li");
    const name = document.createElement("h4");
    const details = document.createElement("p");
    name.textContent = text(step.name);
    details.className = "commission-step-details";
    details.textContent = text(step.details);
    item.append(name);
    if (details.textContent) item.append(details);
    return item;
  });

  element("commission-steps").replaceChildren(...items);
  element("commission-process").hidden = false;
}

function readDraft() {
  return new Promise(resolve => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open("portrait-portfolio");
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("drafts")) {
        database.close();
        resolve(null);
        return;
      }

      const transaction = database.transaction("drafts", "readonly");
      const read = transaction.objectStore("drafts").get("current");
      transaction.oncomplete = () => {
        database.close();
        resolve(read.result || null);
      };
      transaction.onabort = () => {
        database.close();
        resolve(null);
      };
    };
  });
}

async function getContent() {
  if (isDraftPreview) {
    const draft = await readDraft().catch(() => null);
    if (draft && typeof draft === "object") return { content: draft, foundDraft: true };
  }

  const response = await fetch(new URL("content.json", projectRoot), { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not read portfolio content (${response.status}).`);
  return { content: await response.json(), foundDraft: false };
}

async function renderPortfolio() {
  try {
    const { content, foundDraft } = await getContent();
    const artistName = text(content.artistName) || "Portrait portfolio";
    document.title = `${artistName} | Portrait Portfolio`;
    const intro = text(content.intro);
    if (intro) document.querySelector('meta[name="description"]').content = intro;
    for (const wordmark of document.querySelectorAll("[data-artist-name]")) wordmark.textContent = artistName;

    fill("hero-title", text(content.tagline) || "Portraits and sketches");
    fill("hero-intro", intro);
    fill("artist-bio", text(content.bio));
    fill("commission-details", text(content.commissions));
    element("about").hidden = !text(content.bio);
    for (const link of document.querySelectorAll("[data-about-link]")) link.hidden = element("about").hidden;
    const aboutImage = mediaUrl(content.aboutImage);
    if (!element("about").hidden) {
      const aboutPhoto = element("about-image");
      aboutPhoto.src = aboutImage || new URL("images/studio-materials.webp", projectRoot).href;
      if (!aboutImage) aboutPhoto.alt = "Graphite pencils and drawing paper on a studio desk";
      element("about-art").hidden = false;
    }
    element("draft-banner").hidden = !foundDraft;

    await renderArtworks(content);
    renderContact(content);
    renderCommissionProcess(content);
    renderCommissionRates(content);
    renderFaqs(content);
    site.hidden = false;
  } catch {
    element("load-error").hidden = false;
  }
}

renderPortfolio();

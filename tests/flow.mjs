/**
 * End-to-end walk through the two things this product must never get wrong:
 * the matchmaker's private note staying private, and a candidate copied to a
 * second client arriving without the first relationship attached.
 *
 * Runs against a production build in demo mode:
 *   rm -rf .data && npm run build && npm start -- -p 3100
 *   node tests/flow.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const CID = "fb877c7f-853d-5624-a3e1-aabd2a624f9c";
const ITEM = "e64a9d01-23b1-5a2d-9e64-6784a9f22fca"; // Stephanie C on Patrick's roster
const B = process.env.BASE_URL ?? "http://localhost:3100";
const STORE = new URL("../.data/demo.json", import.meta.url).pathname;

const ok = [], fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);
const store = () => JSON.parse(readFileSync(STORE, "utf8"));

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });

// 1 — the client answers in their portal
await p.goto(`${B}/portal/${CID}/${ITEM}`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /Interested/ }).click();
await p.getByLabel("Your notes").fill("Yes — would love to meet her. Free most evenings next week.");
await p.waitForTimeout(1600);

// 2 — it reaches the matchmaker
await p.goto(`${B}/app/clients/${CID}/${ITEM}`, { waitUntil: "networkidle" });
const body = await p.locator("body").innerText();
check("client's note reaches the matchmaker", body.includes("Free most evenings next week"));
check("client's reaction reaches the matchmaker", /INTERESTED/i.test(body));

// 3 — the matchmaker's private note must never cross over
await p.getByLabel("Private matchmaker notes").fill("CANARY-private-do-not-leak");
await p.waitForTimeout(1400);
check("private note stored", store().rosterItems.find((i) => i.id === ITEM).privateNote.includes("CANARY"));
for (const path of [`/portal/${CID}`, `/portal/${CID}/${ITEM}`]) {
  await p.goto(B + path, { waitUntil: "networkidle" });
  check(`private note absent from ${path}`, !(await p.content()).includes("CANARY"));
}

// 4 — feedback is visible on the roster at a glance
await p.goto(`${B}/app/clients/${CID}`, { waitUntil: "networkidle" });
check("roster counts the feedback", (await p.locator(".page-sub").innerText()).includes("1 WITH FEEDBACK"));
check("roster shows the reaction badge", (await p.locator(".badge.reaction").count()) === 1);

// 5 — status change persists
await p.goto(`${B}/app/clients/${CID}/${ITEM}`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Strong fit" }).click();
await p.waitForTimeout(1000);
check("status change persists", store().rosterItems.find((i) => i.id === ITEM).status === "yes");

// 6 — a second client, and copying a candidate onto their roster
p.once("dialog", (d) => d.accept("Jonathan"));
await p.locator(".switcher-btn").click();
await p.getByRole("button", { name: "+ New client" }).click();
await p.waitForURL((u) => /\/app\/clients\//.test(u.pathname) && !u.pathname.includes(CID), { timeout: 20000 });
const newId = new URL(p.url()).pathname.split("/").pop();
check("new client created", Boolean(newId));

await p.goto(`${B}/app/clients/${CID}`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Copy to…" }).click();
await p.locator(".card").first().click(); // Stephanie C, now "Strong fit"
p.once("dialog", (d) => d.accept());
await p.getByRole("button", { name: "Copy to Jonathan" }).click();
await p.waitForURL(`${B}/app/clients/${newId}`, { timeout: 20000 });
await p.waitForLoadState("networkidle");

const s = store();
const jRoster = s.rosters.find((r) => r.clientId === newId);
const jItems = s.rosterItems.filter((i) => i.rosterId === jRoster.id);
check("exactly one candidate copied", jItems.length === 1);
const copied = jItems[0];
check("copy points at the same candidate record",
  copied.candidateId === s.rosterItems.find((i) => i.id === ITEM).candidateId);
check("copy resets status to maybe", copied.status === "maybe");
check("copy carries no match line", copied.blurb === "");
check("copy carries no private note", copied.privateNote === "");
check("copy carries no client feedback", !s.feedback.some((f) => f.rosterItemId === copied.id));

await p.goto(`${B}/app/clients/${newId}/${copied.id}`, { waitUntil: "networkidle" });
check("copy keeps her own bio", (await p.locator("#about").inputValue()).startsWith("Stephanie is smart"));
check("copy starts with an empty match line", (await p.locator("#blurb").inputValue()) === "");

// 7 — a draft roster is invisible in the portal until it is shared
await p.goto(`${B}/portal/${newId}`, { waitUntil: "networkidle" });
check("draft roster hidden from the portal",
  !(await p.locator("body").innerText()).includes("Stephanie C"));

// 8 — sharing reveals it
await p.goto(`${B}/app/clients/${newId}`, { waitUntil: "networkidle" });
p.once("dialog", (d) => d.accept());
await p.getByRole("button", { name: "Share" }).click();
await p.waitForTimeout(1400);
await p.goto(`${B}/portal/${newId}`, { waitUntil: "networkidle" });
check("shared roster appears in the portal",
  (await p.locator("body").innerText()).includes("Stephanie C"));

console.log("PASS\n  " + ok.join("\n  "));
if (fail.length) console.log("FAIL\n  " + fail.join("\n  "));
console.log(`\n${ok.length} passed, ${fail.length} failed`);
await b.close();
process.exit(fail.length ? 1 : 0);

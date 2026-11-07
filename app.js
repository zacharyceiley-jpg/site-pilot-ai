import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

// Public browser configuration. The legacy anon key is intended for browser use;
// privileged service-role credentials remain inside Supabase Edge Functions.
const SUPABASE_URL = "https://hhszfqpojhmwbmuhdmis.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QDwOQQnHcUlQTiz6K-wNmQ_fa2tXl2y";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const state = { messages: [], user: null, profile: null, sending: false, remaining: null };
const speechToggle = $("speechToggle");

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }

function updateAccount() {
  const signedIn = Boolean(state.user);
  const name = state.profile?.username || state.user?.user_metadata?.username || state.user?.user_metadata?.full_name || state.user?.email?.split("@")[0] || "Guest";
  $("accountName").textContent = signedIn ? name : "Guest";
  $("accountStatus").textContent = signedIn ? "Deluxe account connected" : "80 messages per day";
  $("accountAvatar").textContent = signedIn ? name.slice(0, 1).toUpperCase() : "G";
  $("signInButton").classList.toggle("hidden", signedIn);
  $("accountAction").textContent = signedIn ? "↗" : "⋯";
  $("usageLabel").textContent = signedIn ? "Deluxe account · Unlimited messages" : (state.remaining === null ? "80 free messages today" : state.remaining + " guest messages left today");
  $("composerFootnote").classList.toggle("hidden", signedIn);
}

function addTextWithBasicFormatting(container, text) {
  const paragraph = document.createElement("p");
  const safe = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  paragraph.innerHTML = safe.replace(/\n/g, "<br>");
  container.appendChild(paragraph);
}

function renderMessage(message) {
  const row = document.createElement("article");
  row.className = "message " + message.role;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = message.role === "assistant" ? "SP" : "YOU";
  const content = document.createElement("div");
  content.className = "message-content";

  const parts = message.content.split(/```/);
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const firstNewline = part.indexOf("\n");
      const language = firstNewline >= 0 ? part.slice(0, firstNewline).trim() : "";
      const code = firstNewline >= 0 ? part.slice(firstNewline + 1) : part;
      const wrap = document.createElement("div");
      wrap.className = "code-wrap";
      const head = document.createElement("div");
      head.className = "code-head";
      const lang = document.createElement("span");
      lang.textContent = language || "CODE";
      const copy = document.createElement("button");
      copy.className = "copy-button";
      copy.type = "button";
      copy.textContent = "Copy code";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(code.replace(/\n$/, "")); copy.textContent = "Copied!"; }
        catch { copy.textContent = "Copy failed"; }
        setTimeout(() => copy.textContent = "Copy code", 1500);
      });
      head.append(lang, copy);
      const pre = document.createElement("pre");
      const codeEl = document.createElement("code");
      codeEl.textContent = code.replace(/\n$/, "");
      pre.appendChild(codeEl);
      wrap.append(head, pre);
      content.appendChild(wrap);
    } else if (part.trim()) {
      part.split(/\n\s*\n/).forEach((chunk) => addTextWithBasicFormatting(content, chunk));
    }
  });

  row.append(avatar, content);
  $("messages").appendChild(row);
}

function refreshChat() {
  $("messages").replaceChildren();
  state.messages.forEach(renderMessage);
  $("welcome").classList.toggle("hidden", state.messages.length > 0);
  $("chatArea").scrollTop = $("chatArea").scrollHeight;
}

async function loadProfile() {
  if (!state.user) {
    state.profile = null;
    updateAccount();
    return;
  }
  const { data } = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", state.user.id)
    .maybeSingle();
  state.profile = data ?? null;
  updateAccount();
}

async function loadSession() {
  const { data } = await supabase.auth.getSession();
  state.user = data.session?.user ?? null;
  await loadProfile();
  supabase.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user ?? null;
    state.profile = null;
    updateAccount();
    if (state.user) void loadProfile();
  });
}

async function sendMessage(text) {
  const clean = text.trim();
  if (!clean || state.sending) return;
  state.messages.push({ role: "user", content: clean });
  refreshChat();
  state.sending = true;
  $("sendButton").disabled = true;
  $("messageInput").disabled = true;

  try {
    const { data, error } = await supabase.functions.invoke("site-pilot-chat", {
      body: { messages: state.messages.slice(-12) },
    });
    if (error) {
      let details = null;
      try { details = await error.context?.json(); } catch {}
      throw new Error(details?.error || error.message || "Couldn't reach Site Pilot.");
    }
    if (!data?.reply) throw new Error("Site Pilot returned an empty reply.");
    state.messages.push({ role: "assistant", content: data.reply });
    if (typeof data.remaining === "number") state.remaining = data.remaining;
    updateAccount();
    refreshChat();
    if (speechToggle.checked && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(data.reply));
    }
  } catch (error) {
    const message = error?.message || "Something went wrong.";
    state.messages.push({ role: "assistant", content: message });
    refreshChat();
    showToast(message);
  } finally {
    state.sending = false;
    $("sendButton").disabled = false;
    $("messageInput").disabled = false;
    $("messageInput").focus();
  }
}

$("chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("messageInput");
  const value = input.value;
  input.value = "";
  input.style.height = "auto";
  sendMessage(value);
});
$("messageInput").addEventListener("input", (event) => {
  event.target.style.height = "auto";
  event.target.style.height = Math.min(event.target.scrollHeight, 180) + "px";
});
document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt || ""));
});
$("newChatButton").addEventListener("click", () => { state.messages = []; refreshChat(); $("messageInput").focus(); $("sidebar").classList.remove("open"); });
$("settingsButton").addEventListener("click", () => openModal("settingsModal"));
$("signInButton").addEventListener("click", () => openModal("signInModal"));
$("footnoteSignIn").addEventListener("click", () => openModal("signInModal"));
$("mobileMenuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("accountAction").addEventListener("click", async () => {
  if (state.user) {
    await supabase.auth.signOut();
    showToast("Signed out of your Deluxe account.");
  } else openModal("signInModal");
});
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop) backdrop.classList.add("hidden");
}));
$("signInForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = $("signInSubmit");
  const message = $("signInMessage");
  const email = $("emailInput").value.trim().toLowerCase();
  const password = $("passwordInput").value;

  if (!email.includes("@")) {
    message.textContent = "Please enter the email address linked to your Deluxe account, not your Deluxe username.";
    $("emailInput").focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = "Signing in…";
  message.textContent = "Checking your Deluxe account…";

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const friendly = {
        "Invalid login credentials": "The email or password wasn't recognised. Use the same email address and password you use on Secret Unblocked Deluxe.",
        "Email not confirmed": "This Deluxe account needs its email confirmed before it can sign in.",
        "Too many requests": "There have been too many sign-in attempts. Wait a little and try again."
      };
      message.textContent = friendly[error.message] || error.message;
      return;
    }

    const signedInUser = data?.user;
    if (!signedInUser) {
      message.textContent = "Deluxe didn't return a signed-in account. Please try again.";
      return;
    }

    state.user = signedInUser;
    state.profile = null;
    await loadProfile();
    updateAccount();
    closeModal("signInModal");
    $("passwordInput").value = "";
    message.textContent = "Signed in.";
    showToast("Connected to your Deluxe account.");
  } catch (error) {
    message.textContent = error?.message || "Couldn't connect to Deluxe authentication. Check your connection and try again.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Sign in";
  }
});
speechToggle.checked = localStorage.getItem("sitePilotSpeech") === "true";
speechToggle.addEventListener("change", () => {
  localStorage.setItem("sitePilotSpeech", String(speechToggle.checked));
  if (!speechToggle.checked && "speechSynthesis" in window) window.speechSynthesis.cancel();
});
loadSession();

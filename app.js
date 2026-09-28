/* =========================================================
   التقني إكس — موقع الأعضاء
   ========================================================= */

firebase.initializeApp(MEMBER_FIREBASE_CONFIG);
const contentApp = firebase.initializeApp(CONTENT_FIREBASE_CONFIG, "content"); // xix2 — قراءة المحتوى فقط
const auth = firebase.auth();
const db = firebase.firestore();          // xix1: حسابات الأعضاء + المنشورات + الدردشة
const cdb = contentApp.firestore();       // xix2: منتجات/مقالات/بوت/إعدادات عامة (قراءة فقط هون)

/* صور منشورات الأعضاء ترفع على مفتاح ImgBB مخصص للأعضاء (SETTINGS.imgbbApiKeyMembers)، منفصل عن مفتاح الإدارة */
async function uploadToImgbb(file) {
  const key = SETTINGS.imgbbApiKeyMembers;
  if (!key) throw new Error("رفع الصور غير مفعّل حاليًا (لم يتم ضبط استضافة الصور من الإدارة بعد)");
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, { method: "POST", body: formData });
  const json = await res.json();
  if (!json.success) throw new Error((json.error && json.error.message) || "فشل رفع الصورة");
  return json.data.display_url || json.data.url; // التحقق الضمني: ما منكمل غير إذا success=true
}

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

function toast(msg, type = "info") {
  let wrap = document.getElementById("toastWrap");
  if (!wrap) { wrap = document.createElement("div"); wrap.id = "toastWrap"; wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  el.onclick = () => el.remove();
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

/* ---------------------------------------------------------
   الحالة العامة
--------------------------------------------------------- */
let CURRENT_USER = null;
let SETTINGS = { postingEnabled: true, chatOnline: false };
let BOT_CONFIG = { welcomeOfflineMessage: "أهلاً وسهلاً بكم، نحن نعتذر، ممكن نتأخر بالرد عليكم قليلاً، سنسعى حتى نصل للدعم ونتحدث معكم بأسرع ما يمكن، اوصف لنا ما هو طلبك 🙏", buttons: [] };

/* ---------------------------------------------------------
   المصادقة (اشتراك الأعضاء)
--------------------------------------------------------- */
auth.onAuthStateChanged(user => {
  CURRENT_USER = user;
  $("#authArea").innerHTML = user
    ? `<span class="text-sm text-[var(--muted)]">${esc(user.email)}</span>
       <button id="logoutBtn" class="btn-outline text-sm px-3 py-1.5">خروج</button>`
    : `<button id="openAuthBtn" class="btn-brand text-sm px-4 py-1.5">تسجيل الدخول</button>`;

  if (user) $("#logoutBtn").onclick = () => auth.signOut();
  else $("#openAuthBtn").onclick = () => openAuthModal();

  $("#myPostsTabBtn").classList.toggle("hidden", !user);
  renderMyPosts();
  initUnreadWatcher();
});

function openAuthModal(mode = "login") {
  $("#authModal").classList.remove("hidden");
  setAuthMode(mode);
}
function setAuthMode(mode) {
  $("#authModalTitle").textContent = mode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد";
  $("#authSubmitBtn").textContent = mode === "login" ? "دخول" : "إنشاء الحساب";
  $("#authSwitchLink").textContent = mode === "login" ? "ليس لديك حساب؟ أنشئ واحد" : "لديك حساب؟ سجّل الدخول";
  $("#authForm").dataset.mode = mode;
  $("#displayNameField").classList.toggle("hidden", mode === "login");
}
$("#closeAuthModal").onclick = () => $("#authModal").classList.add("hidden");
$("#authSwitchLink").onclick = () => setAuthMode($("#authForm").dataset.mode === "login" ? "signup" : "login");

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const mode = $("#authForm").dataset.mode;
  const email = $("#authEmail").value.trim();
  const pass = $("#authPassword").value;
  const name = $("#authName").value.trim();
  $("#authError").classList.add("hidden");
  try {
    if (mode === "login") {
      await auth.signInWithEmailAndPassword(email, pass);
    } else {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName: name || email.split("@")[0] });
    }
    $("#authModal").classList.add("hidden");
    $("#authForm").reset();
  } catch (err) {
    $("#authError").textContent = translateAuthError(err.code) || err.message;
    $("#authError").classList.remove("hidden");
  }
});

function translateAuthError(code) {
  const map = {
    "auth/email-already-in-use": "هذا البريد مستخدم مسبقاً",
    "auth/invalid-email": "صيغة البريد غير صحيحة",
    "auth/weak-password": "كلمة السر ضعيفة (6 أحرف على الأقل)",
    "auth/wrong-password": "كلمة السر غير صحيحة",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد",
    "auth/invalid-credential": "بيانات الدخول غير صحيحة"
  };
  return map[code];
}

/* ---------------------------------------------------------
   الإعدادات العامة (تشغيل/إيقاف النشر + حالة الدردشة)
--------------------------------------------------------- */
cdb.collection("settings").doc("general").onSnapshot(snap => {
  SETTINGS = Object.assign({ postingEnabled: true, chatOnline: false, heroImages: [], socialLinks: {}, imgbbApiKeyMembers: "" }, snap.data() || {});
  updateFab();
  renderPostComposerState();
  renderSocialLinks();
  renderHeroSlides(SETTINGS.heroImages || []);
  togglePostImageAvailability();
  if ($("#chatPanel").dataset.open === "1") renderChatBody();
});

function togglePostImageAvailability() {
  const available = !!SETTINGS.imgbbApiKeyMembers;
  $("#postImageSection").classList.toggle("hidden", !available);
  $("#postImageUnavailableNote").classList.toggle("hidden", available);
}

/* ---------------------------------------------------------
   أيقونات التواصل الاجتماعي + خلفية الهيرو المتحركة
--------------------------------------------------------- */
function renderSocialLinks() {
  const links = SETTINGS.socialLinks || {};
  const map = { instagram: "#socialInstagram", facebook: "#socialFacebook", whatsapp: "#socialWhatsapp" };
  Object.entries(map).forEach(([key, sel]) => {
    const el = $(sel);
    if (links[key]) { el.href = links[key]; el.classList.remove("hidden"); }
    else el.classList.add("hidden");
  });
}

let heroTimer = null;
let heroIndex = 0;
function renderHeroSlides(images) {
  const wrap = $("#heroSlides");
  if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
  if (!images.length) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = images.map(url => `<div class="hero-slide" style="background-image:url('${esc(url)}')"></div>`).join("");
  const slides = $$(".hero-slide", wrap);
  heroIndex = 0;
  slides[0].classList.add("active");
  if (slides.length > 1) {
    heroTimer = setInterval(() => {
      slides[heroIndex].classList.remove("active");
      heroIndex = (heroIndex + 1) % slides.length;
      slides[heroIndex].classList.add("active");
    }, 5000);
  }
}

cdb.collection("botConfig").doc("main").onSnapshot(snap => {
  if (snap.exists) BOT_CONFIG = Object.assign({ welcomeOfflineMessage: BOT_CONFIG.welcomeOfflineMessage, buttons: [] }, snap.data());
});


/* ---------------------------------------------------------
   المنتجات
--------------------------------------------------------- */
cdb.collection("products").orderBy("createdAt", "desc").onSnapshot(qs => {
  const wrap = $("#productsGrid");
  if (qs.empty) { wrap.innerHTML = emptyState("ما في منتجات مضافة حالياً"); return; }
  wrap.innerHTML = qs.docs.map(d => productCard(d.data())).join("");
}, () => { $("#productsGrid").innerHTML = emptyState("تعذّر تحميل المنتجات — تأكد من إعدادات فيربيس"); });

function productCard(p) {
  const img = (p.images && p.images[0]) || "";
  return `
  <div class="card flex flex-col">
    <div class="card-top-accent"></div>
    ${img ? `<img src="${esc(img)}" class="w-full h-44 object-cover" loading="lazy">` : `<div class="w-full h-44 bg-[var(--surface-2)] flex items-center justify-center text-[var(--muted)] text-sm">لا توجد صورة</div>`}
    <div class="p-4 flex flex-col gap-2 flex-1">
      <h3 class="font-semibold text-[15px]">${esc(p.name || "منتج بدون اسم")}</h3>
      <p class="text-sm text-[var(--muted)] line-clamp-3">${esc(p.description || "")}</p>
      <div class="flex items-center justify-between mt-auto pt-2">
        <span class="font-bold text-[var(--brand)]">${p.price ? esc(p.price) + " $" : ""}</span>
        ${p.contactLink ? `<a href="${esc(p.contactLink)}" target="_blank" rel="noopener" class="btn-brand text-sm px-4 py-1.5">تواصل للشراء</a>` : ""}
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------
   المقالات
--------------------------------------------------------- */
cdb.collection("articles").orderBy("createdAt", "desc").onSnapshot(qs => {
  const wrap = $("#articlesGrid");
  if (qs.empty) { wrap.innerHTML = emptyState("ما في مقالات منشورة حالياً"); return; }
  wrap.innerHTML = qs.docs.map(d => articleCard(d.data())).join("");
}, () => { $("#articlesGrid").innerHTML = emptyState("تعذّر تحميل المقالات — تأكد من إعدادات فيربيس"); });

function articleCard(a) {
  const img = (a.images && a.images[0]) || "";
  return `
  <div class="card flex flex-col">
    <div class="card-top-accent"></div>
    ${img ? `<img src="${esc(img)}" class="w-full h-44 object-cover" loading="lazy">` : ""}
    <div class="p-4 flex flex-col gap-2 flex-1">
      <h3 class="font-semibold text-[15px]">${esc(a.title || "مقالة")}</h3>
      <p class="text-sm text-[var(--muted)] line-clamp-4">${esc(a.content || "")}</p>
      <div class="flex items-center justify-end mt-auto pt-2">
        ${a.contactLink ? `<a href="${esc(a.contactLink)}" target="_blank" rel="noopener" class="btn-brand text-sm px-4 py-1.5">تواصل للشراء</a>` : ""}
      </div>
    </div>
  </div>`;
}

function emptyState(msg) {
  return `<div class="col-span-full text-center text-[var(--muted)] py-10 border border-dashed border-[var(--line)] rounded-lg">${esc(msg)}</div>`;
}

/* ---------------------------------------------------------
   منشورات الأعضاء (تحتاج موافقة الأدمن)
--------------------------------------------------------- */
db.collection("posts").where("status", "==", "approved").orderBy("createdAt", "desc").limit(50)
  .onSnapshot(qs => {
    const wrap = $("#communityFeed");
    if (qs.empty) { wrap.innerHTML = emptyState("لا توجد منشورات بعد"); return; }
    wrap.innerHTML = qs.docs.map(d => communityCard(d.data())).join("");
  }, err => {
    console.error("communityFeed query failed:", err);
    $("#communityFeed").innerHTML = emptyState("تعذّر تحميل المنشورات: " + err.message);
  });

function communityCard(p) {
  return `
  <div class="surface rounded-lg overflow-hidden">
    ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" class="w-full h-44 object-cover" loading="lazy">` : ""}
    <div class="p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-[var(--muted)]">${esc(p.authorName || "عضو")}</span>
        <span class="text-xs text-[var(--muted)]">${fmtDate(p.createdAt)}</span>
      </div>
      ${p.title ? `<h3 class="font-display font-bold text-lg mb-1">${esc(p.title)}</h3>` : ""}
      <p class="text-sm leading-6 text-[var(--muted)]">${esc(p.content || "")}</p>
    </div>
  </div>`;
}

function renderPostComposerState() {
  const box = $("#postComposerBox");
  if (!SETTINGS.postingEnabled) {
    box.innerHTML = `<div class="surface rounded-lg p-4 text-sm text-[var(--muted)] text-center">✋ النشر متوقف مؤقتاً من قبل الإدارة</div>`;
    return;
  }
  const initial = CURRENT_USER ? (CURRENT_USER.displayName || CURRENT_USER.email || "؟")[0].toUpperCase() : "؟";
  box.innerHTML = `
    <div class="surface rounded-lg p-3 flex items-center gap-3">
      <span class="w-9 h-9 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-sm font-bold text-[var(--muted)] flex-shrink-0">${esc(initial)}</span>
      <button id="openPostModalBtn" class="flex-1 text-right bg-[var(--bg)] border border-[var(--line)] rounded-full px-4 py-2.5 text-sm text-[var(--muted)] hover:border-[var(--teal)] transition-colors">
        شاركنا مشكلتك أو استفسارك...
      </button>
      <button id="openPostModalImgBtn" class="w-9 h-9 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center flex-shrink-0 hover:border-[var(--brand)] transition-colors" title="إضافة صورة">
        📷
      </button>
    </div>`;
  const open = () => {
    if (!CURRENT_USER) return openAuthModal("login");
    $("#postModal").classList.remove("hidden");
  };
  $("#openPostModalBtn").onclick = open;
  $("#openPostModalImgBtn").onclick = open;
}

$("#closePostModal").onclick = () => $("#postModal").classList.add("hidden");

/* ---- رفع صورة المنشور والتحقق منها قبل الإرسال ---- */
let pendingPostImageUrl = null;
$("#postImageFile").addEventListener("change", async () => {
  const file = $("#postImageFile").files[0];
  if (!file) return;
  const statusEl = $("#postImageStatus");
  statusEl.textContent = "جارِ رفع الصورة...";
  statusEl.classList.remove("hidden");
  $("#postImagePreviewWrap").classList.add("hidden");
  try {
    const url = await uploadToImgbb(file); // فيها التحقق الضمني (success + رابط فعلي)
    pendingPostImageUrl = url;
    $("#postImagePreview").src = url;
    $("#postImagePreviewWrap").classList.remove("hidden");
    statusEl.classList.add("hidden");
  } catch (err) {
    statusEl.textContent = "تعذّر رفع الصورة: " + err.message;
    toast("تعذّر رفع الصورة: " + err.message, "error");
  }
});
$("#removePostImage").onclick = () => {
  pendingPostImageUrl = null;
  $("#postImageFile").value = "";
  $("#postImagePreviewWrap").classList.add("hidden");
};

$("#postForm").addEventListener("submit", async e => {
  e.preventDefault();
  const title = $("#postTitle").value.trim();
  const content = $("#postContent").value.trim();
  if (!title || !content) return;
  $("#postSubmitBtn").disabled = true;
  $("#postSubmitBtn").textContent = "جارِ الإرسال...";
  try {
    await db.collection("posts").add({
      authorUid: CURRENT_USER.uid,
      authorName: CURRENT_USER.displayName || CURRENT_USER.email.split("@")[0],
      title,
      content,
      imageUrl: pendingPostImageUrl || null,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $("#postForm").reset();
    pendingPostImageUrl = null;
    $("#postImagePreviewWrap").classList.add("hidden");
    $("#postModal").classList.add("hidden");
    switchTab("myposts");
    toast("تم إرسال منشورك للمراجعة ✓", "success");
  } catch (err) {
    toast("تعذّر إرسال المنشور: " + err.message, "error");
  } finally {
    $("#postSubmitBtn").disabled = false;
    $("#postSubmitBtn").textContent = "إرسال للمراجعة";
  }
});

function renderMyPosts() {
  const wrap = $("#myPostsFeed");
  if (!CURRENT_USER) { wrap.innerHTML = emptyState("سجّل الدخول لعرض منشوراتك"); return; }
  db.collection("posts").where("authorUid", "==", CURRENT_USER.uid).orderBy("createdAt", "desc")
    .onSnapshot(qs => {
      if (qs.empty) { wrap.innerHTML = emptyState("لم تقم بنشر أي شيء بعد"); return; }
      wrap.innerHTML = qs.docs.map(d => {
        const p = d.data();
        const chip = p.status === "approved" ? `<span class="chip chip-approved">تم النشر ✓</span>`
          : p.status === "rejected" ? `<span class="chip chip-rejected">تم الرفض ✕</span>`
          : `<span class="chip chip-pending">قيد المراجعة</span>`;
        return `
        <div class="surface rounded-lg overflow-hidden">
          ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" class="w-full h-40 object-cover" loading="lazy">` : ""}
          <div class="p-4">
            <div class="flex items-center justify-between mb-2">
              ${chip}
              <span class="text-xs text-[var(--muted)]">${fmtDate(p.createdAt)}</span>
            </div>
            ${p.title ? `<h3 class="font-display font-bold text-lg mb-1">${esc(p.title)}</h3>` : ""}
            <p class="text-sm leading-6 text-[var(--muted)]">${esc(p.content || "")}</p>
            ${p.status === "rejected" && p.rejectionReason ? `<p class="text-xs text-[var(--danger)] mt-2">سبب الرفض: ${esc(p.rejectionReason)}</p>` : ""}
          </div>
        </div>`;
      }).join("");
    }, err => {
      console.error("myPosts query failed:", err);
      wrap.innerHTML = emptyState("تعذّر تحميل منشوراتك: " + err.message);
    });
}

function fmtDate(ts) {
  if (!ts || !ts.toDate) return "";
  return ts.toDate().toLocaleString("ar-EG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ---------------------------------------------------------
   التبويبات
--------------------------------------------------------- */
function switchTab(name) {
  $$(".tab-panel").forEach(p => p.classList.add("hidden"));
  $(`#tab-${name}`).classList.remove("hidden");
  $$(".tab-btn").forEach(b => b.classList.toggle("text-[var(--brand)]", b.dataset.tab === name));
}
$$(".tab-btn").forEach(b => b.onclick = () => switchTab(b.dataset.tab));

/* ===========================================================
   نظام الدعم الفني: دردشة مباشرة (لو الإدارة متصلة) أو بوت تلقائي
   =========================================================== */
function getGuestId() {
  let id = localStorage.getItem("technix_guest_id");
  if (!id) { id = "guest_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem("technix_guest_id", id); }
  return id;
}
function getChatId() { return CURRENT_USER ? "u_" + CURRENT_USER.uid : getGuestId(); }

let chatUnsub = null;
let botState = null; // { buttonId, questionIndex } أو null لو محادثة حرة/مباشرة

function updateFab() {
  const dot = $("#fabDot");
  dot.className = "dot " + (SETTINGS.chatOnline ? "dot-online" : "dot-offline");
}

$("#supportFab").onclick = () => {
  const panel = $("#chatPanel");
  const willOpen = panel.classList.contains("hidden-chat");
  panel.classList.toggle("hidden-chat", !willOpen);
  panel.dataset.open = willOpen ? "1" : "0";
  if (willOpen) { renderChatBody(); markChatSeenNow(); }
};
$("#closeChatBtn").onclick = () => { $("#chatPanel").classList.add("hidden-chat"); $("#chatPanel").dataset.open = "0"; };

function chatDocRef() { return db.collection("chats").doc(getChatId()); }
function chatMessagesRef() { return chatDocRef().collection("messages"); }

/* ---- شارة الرسائل غير المقروءة ---- */
let unreadUnsub = null;
function seenKey() { return "technix_chat_seen_" + getChatId(); }
function showFabBadge() { $("#fabBadge").classList.remove("hidden"); }
function hideFabBadge() { $("#fabBadge").classList.add("hidden"); }
function markChatSeenNow() { localStorage.setItem(seenKey(), String(Date.now())); hideFabBadge(); }

function initUnreadWatcher() {
  if (unreadUnsub) { unreadUnsub(); unreadUnsub = null; }
  unreadUnsub = chatMessagesRef().orderBy("createdAt", "desc").limit(1).onSnapshot(qs => {
    if (qs.empty) return;
    const m = qs.docs[0].data();
    const isOpen = $("#chatPanel").dataset.open === "1";
    if (m.sender === "member" || isOpen) return; // رسالتي أنا، أو الشات مفتوح أصلاً
    const lastSeen = Number(localStorage.getItem(seenKey()) || 0);
    const ts = (m.createdAt && m.createdAt.toMillis) ? m.createdAt.toMillis() : Date.now();
    if (ts > lastSeen) {
      showFabBadge();
      toast("📩 رسالة جديدة من الدعم الفني", "info");
    }
  }, err => console.error("unread watcher failed:", err));
}

async function ensureChatDoc(source) {
  try {
    await chatDocRef().set({
      name: CURRENT_USER ? (CURRENT_USER.displayName || CURRENT_USER.email) : "زائر",
      source,
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error("ensureChatDoc failed:", err);
    toast("تعذّر فتح المحادثة: " + err.message, "error");
  }
}

async function pushMessage(sender, text, imageUrl) {
  try {
    await chatMessagesRef().add({
      sender, text: text || "", imageUrl: imageUrl || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await chatDocRef().set({ lastMessageAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error("pushMessage failed:", err);
    toast("تعذّر إرسال الرسالة: " + err.message, "error");
  }
}

function renderChatBody() {
  const body = $("#chatBody");
  const inputRow = $("#chatInputRow");
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }

  if (SETTINGS.chatOnline) {
    $("#chatHeaderStatus").textContent = "الدعم متصل الآن";
    $("#chatHeaderStatus").className = "text-xs text-[var(--success)]";
    ensureChatDoc("live");
    body.innerHTML = `<div class="text-center text-xs text-[var(--muted)]">تم فتح المحادثة مع فريق الدعم</div>`;
    chatUnsub = chatMessagesRef().orderBy("createdAt", "asc").onSnapshot(qs => {
      renderMessages(qs.docs.map(d => d.data()));
    });
    inputRow.classList.remove("hidden");
    $("#chatInput").placeholder = "اكتب رسالتك...";
    $("#chatInput").onkeydown = e => { if (e.key === "Enter") sendLiveMessage(); };
    $("#chatSendBtn").onclick = sendLiveMessage;
  } else {
    $("#chatHeaderStatus").textContent = "غير متصل الآن — الرد التلقائي مُفعّل";
    $("#chatHeaderStatus").className = "text-xs text-[var(--muted)]";
    ensureChatDoc("bot");
    startBotFlow();
  }
}

function renderMessages(list) {
  const body = $("#chatBody");
  body.innerHTML = list.map(m => {
    const cls = m.sender === "member" ? "msg-member" : "msg-bot";
    let html = m.text ? `<div class="msg ${cls}">${esc(m.text)}</div>` : "";
    if (m.imageUrl) html += `<div class="msg ${cls} p-1"><img src="${esc(m.imageUrl)}" class="rounded-lg max-w-full"></div>`;
    return `<div class="flex flex-col ${m.sender === "member" ? "items-end" : "items-start"}">${html}</div>`;
  }).join("");
  body.scrollTop = body.scrollHeight;
}

async function sendLiveMessage() {
  const val = $("#chatInput").value.trim();
  if (!val) return;
  $("#chatInput").value = "";
  await pushMessage("member", val);
}

/* ---- منطق البوت (مع مؤشر كتابة قبل كل رد) ---- */
function showTyping() {
  const body = $("#chatBody");
  if ($("#typingIndicator")) return;
  const wrap = document.createElement("div");
  wrap.id = "typingIndicator";
  wrap.className = "flex flex-col items-start";
  wrap.innerHTML = `<div class="msg msg-bot typing-dots"><span></span><span></span><span></span></div>`;
  body.appendChild(wrap);
  body.scrollTop = body.scrollHeight;
}
function hideTyping() { const el = $("#typingIndicator"); if (el) el.remove(); }

/** يظهر مؤشر "عم يكتب..." لمدة قصيرة، وبعدين يعرض رسالة البوت الفعلية ويحفظها */
async function botSay(text, imageUrl) {
  showTyping();
  await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
  hideTyping();
  addLocalMessage("bot", text, imageUrl);
  await pushMessage("bot", text, imageUrl);
}

async function startBotFlow() {
  botState = null;
  const body = $("#chatBody");
  body.innerHTML = "";
  $("#chatInputRow").classList.add("hidden");
  await botSay(BOT_CONFIG.welcomeOfflineMessage);

  const buttons = BOT_CONFIG.buttons || [];
  if (buttons.length) {
    const btnWrap = document.createElement("div");
    btnWrap.className = "flex flex-col";
    btnWrap.innerHTML = buttons.map(b => `<button class="bot-btn" data-id="${esc(b.id)}"><span>${esc(b.label)}</span></button>`).join("");
    body.appendChild(btnWrap);
    body.scrollTop = body.scrollHeight;
    $$(".bot-btn", btnWrap).forEach(btn => btn.onclick = () => chooseBotButton(btn.dataset.id, btnWrap));
  }
}

function addLocalMessage(sender, text, imageUrl) {
  const body = $("#chatBody");
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col " + (sender === "member" ? "items-end" : "items-start");
  let html = text ? `<div class="msg ${sender === "member" ? "msg-member" : "msg-bot"}">${esc(text)}</div>` : "";
  if (imageUrl) html += `<div class="msg msg-bot p-1"><img src="${esc(imageUrl)}" class="rounded-lg max-w-full"></div>`;
  wrap.innerHTML = html;
  body.appendChild(wrap);
  body.scrollTop = body.scrollHeight;
}

async function chooseBotButton(buttonId, btnWrapToRemove) {
  const btn = (BOT_CONFIG.buttons || []).find(b => b.id === buttonId);
  if (!btn) return;
  btnWrapToRemove.remove();
  addLocalMessage("member", btn.label);
  await pushMessage("member", btn.label);
  botState = { buttonId, questionIndex: 0 };
  askNextBotQuestion();
}

async function askNextBotQuestion() {
  const btn = (BOT_CONFIG.buttons || []).find(b => b.id === botState.buttonId);
  const questions = (btn && btn.questions) || [];
  if (botState.questionIndex < questions.length) {
    $("#chatInputRow").classList.add("hidden");
    const q = questions[botState.questionIndex];
    await botSay(q);
    $("#chatInputRow").classList.remove("hidden");
    $("#chatInput").placeholder = "اكتب إجابتك...";
    $("#chatInput").onkeydown = e => { if (e.key === "Enter") answerBotQuestion(btn); };
    $("#chatSendBtn").onclick = () => answerBotQuestion(btn);
  } else {
    finishBotFlow(btn);
  }
}

async function answerBotQuestion(btn) {
  const val = $("#chatInput").value.trim();
  if (!val) return;
  $("#chatInput").value = "";
  addLocalMessage("member", val);
  await pushMessage("member", val);
  botState.questionIndex++;
  askNextBotQuestion();
}

async function finishBotFlow(btn) {
  $("#chatInputRow").classList.add("hidden");
  const closingText = "شكراً لتواصلك معنا! هاي معلومات التواصل المباشر:";
  await botSay(closingText);
  if (btn && btn.finalImage) {
    await botSay("", btn.finalImage);
  }
  if (btn && btn.finalContactLink) {
    const body = $("#chatBody");
    const a = document.createElement("a");
    a.href = btn.finalContactLink; a.target = "_blank"; a.rel = "noopener";
    a.className = "btn-brand text-sm px-4 py-2 mt-2 inline-block w-fit";
    a.textContent = "تواصل معنا مباشرة";
    body.appendChild(a);
    body.scrollTop = body.scrollHeight;
  }
  // إتاحة كتابة حرة بعد انتهاء تدفق البوت — تُحفظ ليراجعها الأدمن لاحقاً
  $("#chatInputRow").classList.remove("hidden");
  $("#chatInput").placeholder = "بإمكانك ترك رسالة إضافية...";
  $("#chatInput").onkeydown = e => { if (e.key === "Enter") sendLiveMessage(); };
  $("#chatSendBtn").onclick = sendLiveMessage;
}

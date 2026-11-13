/* Alrafah Cash — external remittances feature. Classic script; loaded by the route loader. */
/* This file intentionally has no boot-time execution. The parent route calls externalOpen/externalMount. */

var extState = window.__alrafahExternalState || {
  section: "main",
  pending: false,
  loaded: false,
  office: null,
  error: "",
  counts: { incoming: 0, outgoing: 0, received: 0 },
  countsLoaded: false,
  cache: Object.create(null),
  lists: Object.create(null),
  listBusy: Object.create(null),
  listQ: Object.create(null),
  listOffset: Object.create(null),
  listHasMore: Object.create(null),
  searchTimers: Object.create(null),
  wizard: {
    step: 1,
    office: null,
    offices: [],
    officeQuery: "",
    currency: "usd",
    amount: "",
    quote: null,
    beneficiary_account: "",
    recipient_name: "",
    recipient_phone: "",
    reference_id: ""
  },
  intent: null,
  detail: null,
  detailId: "",
  detailBusy: false,
  proof: null,
  proofBusy: false,
  receipt: null,
  admin: {
    q: "",
    status: "",
    office_id: "",
    remittances: [],
    offices: [],
    summary: null,
    pagination: {},
    busy: false,
    statement: null,
    statementId: "",
    timers: null,
    loaded: false
  },
  actionRefs: Object.create(null),
  mountPromise: null,
  actorKey: "",
  actorGeneration: 0
};
window.__alrafahExternalState = extState;

var EXT_CURRENCIES = ["usd", "try", "syp"];
var EXT_CURRENCY_LABELS = { usd: "دولار أمريكي", try: "ليرة تركية", syp: "ليرة سورية" };
var EXT_CURRENCY_CODES = { usd: "USD", try: "₺", syp: "ل.س" };
var EXT_FEE_MAX = { usd: 5, try: 5, syp: 15 };
var EXT_BUCKET_LABELS = { incoming: "الحوالات الواردة", outgoing: "الحوالات الصادرة", received: "الحوالات المستلمة" };
var EXT_STATUS_LABELS = {
  pending: "قيد الانتظار",
  accepted: "معتمدة للتسليم",
  verified: "تم التحقق",
  delivered: "مستلمة",
  cancelled: "ملغاة"
};
var EXT_SECURITY_WARNING = "تحذير أمني: لا يتم تسليم مبلغ الحوالة إلا لصاحب العلاقة شخصياً وبعد التحقق من هويته الأصلية ومطابقة كلمة السر الخاصة بالحوالة. يمنع تسليم المبلغ لأي شخص آخر مهما كانت صفته أو درجة قرابته. يتحمل مكتب التسليم مسؤولية التحقق من هوية المستلم قبل صرف أي مبلغ.";

function extEsc(value) {
  if (typeof esc === "function") return esc(value == null ? "" : String(value));
  return String(value == null ? "" : value).replace(/[&<>\"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
  });
}
function extIcon(name, size) {
  if (typeof I === "function") return I(name, size || 22);
  return "<span aria-hidden=\"true\">•</span>";
}
function extIcons() { try { if (typeof ico === "function") ico(); } catch (e) {} }
function extMoney(value, currency) {
  var n = Number(value || 0);
  var code = EXT_CURRENCY_CODES[currency] || currency || "";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " " + code;
}
function extDate(value) {
  if (value == null || value === "") return "—";
  var n = Number(value);
  var date = new Date(n > 100000000000 ? n : n * 1000);
  if (isNaN(date.getTime())) date = new Date(value);
  try { return date.toLocaleString("ar-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }); }
  catch (e) { return date.toLocaleString("ar"); }
}
function extStatus(status) { return EXT_STATUS_LABELS[status] || status || "غير معروف"; }
function extCurrencyName(currency) { return EXT_CURRENCY_LABELS[currency] || currency || ""; }
function extAccount() {
  try { return typeof accountNo === "function" ? accountNo(me) : (me && (me.account_number || me.id)) || ""; }
  catch (e) { return ""; }
}
function extHasAdmin() { return !!(typeof adminAllowed !== "undefined" && adminAllowed); }
function extErrorText(error) {
  if (error && (error.status === 503 || error.code === "remittance_secret_missing" || error.code === "feature_unavailable")) return "ميزة الحوالات الخارجية غير مفعلة على الخادم الآن؛ لم يُنشأ طلب مالي. تواصل مع الإدارة قبل إعادة المحاولة.";
  return error && error.message ? error.message : "تعذر الاتصال بالخادم؛ حاول مرة أخرى دون تكرار العملية المالية.";
}
function extRandomId() {
  try { return crypto.randomUUID(); } catch (e) { return "ext-" + Date.now() + "-" + Math.random().toString(36).slice(2); }
}
function extJson(path, options) {
  if (typeof cfApi !== "function") return Promise.reject(new Error("واجهة الخادم غير مهيأة بعد."));
  return cfApi(path, options || {});
}
function extPost(path, body) {
  if (typeof uiPost === "function") return uiPost(path, body);
  return extJson(path, { method: "POST", body: JSON.stringify(body) });
}
function extNotify(title, text) {
  if (typeof showMessage === "function") showMessage(title, text);
  else window.alert(title + "\n" + text);
}
function extRoot() { return document.getElementById("externalRoot") || document.querySelector("[data-external-root]"); }
function extPaint() {
  var root = document.getElementById("externalRoot");
  if (root) {
    root.outerHTML = externalView();
  } else {
    var shell = document.querySelector("[data-external-root]");
    if (shell) shell.outerHTML = externalView();
  }
  externalBind();
  extIcons();
  return extRoot();
}
function extRootContent() { return extRoot() || document; }
function extCacheBust() { extState.cache = Object.create(null); }
function extCacheKey(path) { return "external:" + path; }
function extCachedGet(path, ttl) {
  var hit = extState.cache[extCacheKey(path)];
  return hit && hit.expires > Date.now() ? hit.data : null;
}
async function extGet(path, ttl) {
  var cached = extCachedGet(path, ttl);
  if (cached) return cached;
  var data = await extJson(path);
  if (ttl !== 0) extState.cache[extCacheKey(path)] = { data: data, expires: Date.now() + (ttl || 12000) };
  return data;
}
function extOfficeFrom(data) { return data && (data.office || data.data && data.data.office) || null; }
function extRemittanceFrom(data) {
  var r = data && (data.remittance || data.data && data.data.remittance) || null;
  if (r && !r.status && r.state) r = Object.assign({}, r, { status: r.state });
  return r;
}
function extRequiredRemittance(data, status) {
  var r = extRemittanceFrom(data);
  if (!r || (status && r.status !== status)) throw new Error("لم يؤكد الخادم انتقال الحوالة إلى الحالة المطلوبة؛ افتح التفاصيل وتحقق من الحالة قبل إعادة المحاولة.");
  return r;
}
function extGetCounts(data) {
  var c = data && (data.counts || data.data && data.data.counts);
  if (!c) return;
  ["incoming", "outgoing", "received"].forEach(function (k) { if (c[k] != null) extState.counts[k] = Number(c[k]) || 0; });
}
function extActorKey() {
  return String((typeof me !== "undefined" && me && me.id) || "") + "|" + String((typeof cfToken !== "undefined" && cfToken) || "");
}
function extEnsureActor() {
  var key = extActorKey();
  if (extState.actorKey && extState.actorKey !== key) {
    extState.cache = Object.create(null);
    extState.office = null;
    extState.loaded = false;
    extState.countsLoaded = false;
    extState.detail = null;
    extState.receipt = null;
    extState.intent = null;
    extState.proof = null;
    extState.wizard = { step: 1, office: null, offices: [], officeQuery: "", currency: "usd", amount: "", quote: null, beneficiary_account: "", recipient_name: "", recipient_phone: "", reference_id: "" };
    extState.lists = Object.create(null);
    extState.counts = { incoming: 0, outgoing: 0, received: 0 };
  }
  extState.actorKey = key;
  return key;
}
function extActorStill(snapshot) { return snapshot === extActorKey() && !!(typeof me !== "undefined" && me && me.id); }

function externalView() {
  var title = "الحوالات الخارجية";
  if (extState.section === "settings") title = "إعدادات المكتب";
  if (extState.section === "send") title = "إرسال حوالة";
  if (extState.section === "incoming") title = "الحوالات الواردة";
  if (extState.section === "outgoing") title = "الحوالات الصادرة";
  if (extState.section === "received") title = "الحوالات المستلمة";
  if (extState.section === "detail") title = "تفاصيل الحوالة";
  if (extState.section === "receipt") title = "إشعار الحوالة";
  if (extState.section === "admin") title = "إدارة الحوالات الخارجية";
  return '<section id="externalRoot" class="external-root" data-external-root dir="rtl">' +
    '<header class="external-topbar topbar">' +
      '<div class="top">' +
        (extState.section !== "main" ? '<button class="circ" type="button" onclick="externalBack()" aria-label="رجوع">' + extIcon("arrow-right", 21) + '</button>' : '<span class="external-top-spacer"></span>') +
        '<div class="top-brand"><img class="tlogo" src="' + extEsc(typeof LOGO_URL !== "undefined" ? LOGO_URL : "logo.webp") + '" alt="الرفاه كاش"><div class="topbar-title"><b>' + extEsc(title) + '</b><small>تحويل إلكتروني بين مكاتب الصرافة</small></div></div>' +
        (extState.section === "main" ? '<button class="circ" type="button" onclick="externalOpen(\'settings\')" aria-label="إعدادات المكتب">' + extIcon("settings-2", 21) + '</button>' : '<span class="external-top-spacer"></span>') +
      '</div>' +
    '</header>' +
    '<div class="external-scroll" data-external-scroll>' + externalBody() + '</div>' +
  '</section>';
}
function externalBody() {
  if (extState.pending && !extState.office && !extState.loaded) return '<div class="external-loading">' + (typeof skeleton === "function" ? skeleton(4) : '<div class="external-skeleton"></div>') + '</div>';
  if (extState.error && !extState.loaded) return '<div class="external-error-card"><div class="external-error-icon">' + extIcon("wifi-off", 32) + '</div><h2>تعذر تحميل الحوالات</h2><p>' + extEsc(extState.error) + '</p><button class="btn" type="button" onclick="externalMount(true)">إعادة المحاولة</button></div>';
  if (extState.section === "main") return externalMainHtml();
  if (extState.section === "settings") return externalSettingsHtml();
  if (extState.section === "send") return externalWizardHtml();
  if (["incoming", "outgoing", "received"].indexOf(extState.section) >= 0) return externalListHtml(extState.section);
  if (extState.section === "detail") return externalDetailHtml();
  if (extState.section === "receipt") return externalReceiptHtml();
  if (extState.section === "admin") return externalAdminHtml();
  return externalMainHtml();
}
function externalRenderView() {
  return externalView();
}

async function externalOpen(section) {
  section = section || "main";
  if (section === "admin" && !extHasAdmin()) return false;
  if (["main", "settings", "send", "incoming", "outgoing", "received", "detail", "receipt", "admin"].indexOf(section) < 0) section = "main";
  if (typeof tab !== "undefined" && tab !== "external" && typeof go === "function") {
    if (typeof isAdm !== "undefined") isAdm = false;
    go("external");
  }
  var previousSection=extState.section;
  extState.section = section;
  extState.error = "";
  if (section === "send" && ((!extState.intent && previousSection !== "send") || !extState.wizard.office)) {
    extState.wizard = { step: 1, office: null, offices: [], officeQuery: "", currency: (typeof cur !== "undefined" && cur) || "usd", amount: "", quote: null, beneficiary_account: "", recipient_name: "", recipient_phone: "", reference_id: "" };
  }
  extPaint();
  await externalMount();
  return true;
}

async function externalMount(force) {
  extEnsureActor();
  if (extState.mountPromise) return extState.mountPromise;
  var snapshot = extState.actorKey, needsOffice = !!force || !extState.loaded;
  var listSection = ["incoming", "outgoing", "received"].indexOf(extState.section) >= 0;
  var needsList = listSection && (!!force || !Object.prototype.hasOwnProperty.call(extState.lists, extState.section));
  var needsCounts = extState.section === "main" && (!!force || !extState.countsLoaded);
  var needsDetail = extState.section === "detail" && !!extState.detailId && !extState.detail;
  var needsAdmin = extState.section === "admin" && extHasAdmin() && (!!force || !extState.admin.loaded);
  if (!needsOffice && !needsCounts && !needsList && !needsDetail && !needsAdmin) return Promise.resolve(false);
  extState.mountPromise = (async function () {
    extState.pending = true;
    if (!extState.loaded) extPaint();
    try {
      if (needsOffice) {
        var officeData = await extGet("/api/offices/me", 5000);
        if (!extActorStill(snapshot)) return;
        extState.office = extOfficeFrom(officeData);
        extState.loaded = true;
      }
      if (needsCounts) await externalLoadCounts();
      if (!extActorStill(snapshot)) return;
      if (needsList) await externalLoadList(extState.section, false);
      if (needsDetail) await externalLoadDetail(extState.detailId);
      if (needsAdmin) await externalLoadAdmin(false);
      if (!extActorStill(snapshot)) return;
      extState.error = "";
    } catch (e) {
      if (extActorStill(snapshot)) extState.error = extErrorText(e);
    } finally {
      if (extActorStill(snapshot)) { extState.pending = false; extPaint(); }
      if (extState.mountPromise) extState.mountPromise = null;
    }
  })();
  return extState.mountPromise;
}
async function externalLoadCounts() {
  var jobs = ["incoming", "outgoing", "received"].map(function (bucket) {
    return extGet("/api/external/remittances?bucket=" + encodeURIComponent(bucket) + "&limit=1&offset=0", 6000).then(function (d) {
      extGetCounts(d);
      if (d && d.pagination && d.pagination.total != null) extState.counts[bucket] = Number(d.pagination.total) || 0;
    }).catch(function () {});
  });
  await Promise.all(jobs);
  extState.countsLoaded = true;
}
async function externalRefreshAfterMutation() {
  await externalRefresh({ quiet: true });
  try { if (typeof cfRefresh === "function") await cfRefresh(); } catch (e) {}
}
async function externalRefresh(options) {
  options = options || {};
  var snapshot = extEnsureActor();
  extCacheBust();
  try {
    var officeData = await extGet("/api/offices/me", 0);
    if (!extActorStill(snapshot)) return false;
    extState.office = extOfficeFrom(officeData);
    extState.loaded = true;
    await externalLoadCounts();
    if (!options.quiet || ["main", "incoming", "outgoing", "received"].indexOf(extState.section) >= 0) extPaint();
    return true;
  } catch (e) {
    if (!options.quiet) { extState.error = extErrorText(e); extPaint(); }
    return false;
  }
}
function externalReset() {
  if (extState.mountPromise) extState.mountPromise = null;
  extState.pending = false;
  extState.loaded = false;
  extState.office = null;
  extState.error = "";
  extState.cache = Object.create(null);
  extState.lists = Object.create(null);
  extState.listBusy = Object.create(null);
  extState.listQ = Object.create(null);
  extState.listOffset = Object.create(null);
  extState.listHasMore = Object.create(null);
    extState.counts = { incoming: 0, outgoing: 0, received: 0 };
  extState.countsLoaded = false;
  extState.detail = null;
  extState.detailId = "";
  extState.receipt = null;
  extState.proof = null;
  extState.intent = null;
  extState.actionRefs = Object.create(null);
  extState.admin.loaded = false;
  extState.actorKey = "";
  extState.section = "main";
  extState.wizard = { step: 1, office: null, offices: [], officeQuery: "", currency: "usd", amount: "", quote: null, beneficiary_account: "", recipient_name: "", recipient_phone: "", reference_id: "" };
}

function externalMainHtml() {
  var office = extState.office;
  var cards = EXT_CURRENCIES.map(function (c) {
    var value = typeof me !== "undefined" && me ? Number(me[c] || 0) : 0;
    return '<div class="external-balance-card"><span class="external-balance-symbol">' + extIcon(c === "usd" ? "dollar-sign" : c === "try" ? "coins" : "banknote", 19) + '</span><small>' + extEsc(EXT_CURRENCY_LABELS[c]) + '</small><strong dir="ltr">' + extMoney(value, c) + '</strong><em>الرصيد المتاح</em></div>';
  }).join("");
  var officeBlock = office ? '<div class="external-office-head"><div class="external-office-avatar">' + extIcon("building-2", 25) + '</div><div class="external-office-copy"><b>' + extEsc(office.name || "مكتبك") + '</b><small>' + extEsc(office.address || office.city || "لم يكتمل عنوان المكتب") + '</small><small dir="ltr">' + extEsc(extAccount()) + '</small><span class="external-state-dot ' + (office.active === false ? "off" : "") + '">' + (office.active === false ? "غير فعال" : "فعال لاستقبال الحوالات") + '</span></div><button class="receipt-open" type="button" onclick="externalOpen(\'settings\')" aria-label="إعدادات المكتب">' + extIcon("settings-2", 21) + '</button></div>' : '<div class="external-onboarding"><div class="external-onboarding-icon">' + extIcon("building-2", 32) + '</div><div><b>أكمل ملف مكتبك</b><p>احفظ بيانات المكتب لتتمكن من إرسال واستقبال الحوالات.</p></div><button class="btn" type="button" onclick="externalOpen(\'settings\')">إعداد المكتب</button></div>';
  var actions = [
    ["send", "send", "إرسال حوالة", "ابدأ حوالة جديدة", "externalOpen('send')", 0],
    ["incoming", "inbox", "حوالات واردة", "مسؤولية مكتبك", "externalOpen('incoming')", extState.counts.incoming],
    ["outgoing", "send-horizontal", "حوالات صادرة", "الحوالات التي أرسلتها", "externalOpen('outgoing')", extState.counts.outgoing],
    ["received", "badge-check", "حوالات مستلمة", "سجل التسليم الإلكتروني", "externalOpen('received')", extState.counts.received]
  ].map(function (a) {
    var disabled = a[0] === "send" && !office;
    return '<button class="external-action-card ' + (disabled ? "is-disabled" : "") + '" type="button" ' + (disabled ? 'disabled title="أكمل إعداد المكتب أولاً"' : 'onclick="' + a[4] + '"') + '><span class="external-action-icon">' + extIcon(a[1], 25) + '</span><b>' + a[2] + (a[5] ? '<span class="external-count">' + extEsc(a[5]) + '</span>' : '') + '</b><small>' + a[3] + '</small></button>';
  }).join("");
  return '<div class="external-page external-main-page"><div class="external-balance-strip">' + cards + '</div>' + officeBlock + '<div class="external-section-heading"><div><h2>الحوالات الخارجية</h2><p>كل الأرصدة مرتبطة بمحفظة حسابك الحالية، دون محفظة منفصلة.</p></div></div><div class="external-actions-grid">' + actions + '</div><div class="external-escrow-note"><span>' + extIcon("shield-check", 22) + '</span><div><b>حماية المبلغ حتى التسليم</b><p>يُحجز أصل الحوالة ورسوم مكتب الاستلام وعمولة التطبيق عند الإرسال، ولا تُصرف الرسوم إلا بعد التسليم الإلكتروني في حساب SY الموجود للمستلم.</p></div></div>' + (extHasAdmin() ? '<button class="external-admin-link" type="button" onclick="externalOpenAdmin()">' + extIcon("shield", 18) + ' لوحة إدارة الحوالات</button>' : '') + '</div>';
}

function externalSettingsHtml() {
  var o = extState.office || {};
  var r = o.rates || {};
  var currencies = o.currencies || EXT_CURRENCIES;
  var rateInputs = EXT_CURRENCIES.map(function (c) {
    return '<div class="external-rate-field"><label for="extRate_' + c + '">' + extEsc(EXT_CURRENCY_LABELS[c]) + '<small>الحد الأقصى ' + extMoney(EXT_FEE_MAX[c], c) + ' لكل 1000</small></label><input id="extRate_' + c + '" data-ext-rate="' + c + '" type="number" min="0" max="' + EXT_FEE_MAX[c] + '" step="0.01" value="' + extEsc(r[c] == null ? "" : r[c]) + '" inputmode="decimal"></div>';
  }).join("");
  var checkedCurrencies = EXT_CURRENCIES.map(function (c) { return '<label class="external-check"><input type="checkbox" data-ext-currency="' + c + '" ' + (currencies.indexOf(c) >= 0 ? "checked" : "") + '><span>' + extEsc(EXT_CURRENCY_LABELS[c]) + '</span></label>'; }).join("");
  var noOffice = !extState.office;
  return '<div class="external-page external-settings-page"><div class="external-intro-card"><span>' + extIcon("settings-2", 25) + '</span><div><h2>' + (noOffice ? "إعداد مكتبك لأول مرة" : "بيانات المكتب وإعدادات الاستلام") + '</h2><p>تُحفظ هذه البيانات على مكتبك الحالي المرتبط بحساب ' + extEsc(extAccount() || "SY") + ' فقط.</p></div></div><div class="external-form-card"><label class="external-label" for="extOfficeName">اسم المكتب</label><input id="extOfficeName" maxlength="120" value="' + extEsc(o.name || "") + '" placeholder="اسم المكتب كما يظهر للمرسل"><label class="external-label" for="extOfficeAddress">العنوان الكامل</label><input id="extOfficeAddress" maxlength="240" value="' + extEsc(o.address || "") + '" placeholder="العنوان"><div class="external-form-two"><div><label class="external-label" for="extOfficeCity">المدينة</label><input id="extOfficeCity" maxlength="80" value="' + extEsc(o.city || "") + '" placeholder="المدينة"></div><div><label class="external-label" for="extOfficeArea">المنطقة</label><input id="extOfficeArea" maxlength="80" value="' + extEsc(o.area || "") + '" placeholder="المنطقة"></div></div><label class="external-label" for="extOfficePhone">هاتف المكتب</label><input id="extOfficePhone" type="tel" maxlength="40" value="' + extEsc(o.phone || "") + '" placeholder="رقم هاتف المكتب" dir="ltr"><label class="external-toggle"><input id="extReceiving" type="checkbox" ' + (o.receiving !== false ? "checked" : "") + '><span><b>استقبال الحوالات</b><small>يسمح للمكاتب الأخرى باختيار هذا المكتب للحوالات الجديدة.</small></span></label><label class="external-toggle"><input id="extActive" type="checkbox" ' + (o.active !== false ? "checked" : "") + '><span><b>المكتب فعال</b><small>لا تُرسل حوالات إلى مكتب غير فعال.</small></span></label><h3 class="external-form-title">العملات التي يستقبلها المكتب</h3><div class="external-check-grid">' + checkedCurrencies + '</div><h3 class="external-form-title">باقات أجور الاستلام</h3><p class="external-muted">الأجر يخص مكتب الاستلام، ويُحسب لكل حوالة تناسبيًا من المبلغ. الخادم هو المصدر النهائي للحساب والتقريب إلى أصغر وحدة.</p><div class="external-rate-packages"><button type="button" onclick="externalRatePackage(\'economical\')">اقتصادية<br><small>50% من الحد</small></button><button type="button" onclick="externalRatePackage(\'normal\')">عادية<br><small>75% من الحد</small></button><button type="button" onclick="externalRatePackage(\'premium\')">مميزة<br><small>الحد الأقصى</small></button><button type="button" onclick="externalRatePackage(\'custom\')">مخصصة<br><small>أدخل القيم</small></button></div><div class="external-rate-grid">' + rateInputs + '</div><label class="external-toggle"><input id="extIncludeAddress" type="checkbox" ' + (o.include_address !== false && !(o.notice_preferences && o.notice_preferences.include_address === false) ? "checked" : "") + '><span><b>إظهار العنوان في إشعارات الحوالات</b><small>يمكنك إخفاء العنوان من الإشعارات مع إبقائه في السجل الداخلي.</small></span></label><div class="msg" id="externalSettingsMsg"></div><button class="btn" id="externalSettingsSave" type="button" onclick="externalSaveSettings()">' + extIcon("save", 18) + ' حفظ بيانات المكتب</button></div></div>';
}
function externalRatePackage(packageName) {
  var factor = packageName === "economical" ? 0.5 : packageName === "normal" ? 0.75 : packageName === "premium" ? 1 : null;
  if (factor == null) return;
  EXT_CURRENCIES.forEach(function (c) { var input = document.getElementById("extRate_" + c); if (input) input.value = (EXT_FEE_MAX[c] * factor).toFixed(2).replace(/\.00$/, ""); });
}
async function externalSaveSettings() {
  var msg = document.getElementById("externalSettingsMsg"), button = document.getElementById("externalSettingsSave");
  var rates = {}, currencies = [];
  EXT_CURRENCIES.forEach(function (c) { var input = document.getElementById("extRate_" + c); rates[c] = Number(input && input.value || 0); var checkbox = document.querySelector('[data-ext-currency="' + c + '"]'); if (checkbox && checkbox.checked) currencies.push(c); });
  var invalid = EXT_CURRENCIES.some(function (c) { return !isFinite(rates[c]) || rates[c] < 0 || rates[c] > EXT_FEE_MAX[c]; });
  var name = (document.getElementById("extOfficeName") || {}).value || "";
  var address = (document.getElementById("extOfficeAddress") || {}).value || "";
  if (!name.trim() || !address.trim() || !currencies.length || invalid) { if (msg) msg.textContent = "أكمل اسم المكتب والعنوان واختر عملة واحدة على الأقل، وتأكد من عدم تجاوز حدود الأجور."; return; }
  if (button) button.disabled = true;
  try {
    var body = {
      account_number: extAccount(),
      name: name.trim(),
      address: address.trim(),
      city: ((document.getElementById("extOfficeCity") || {}).value || "").trim(),
      area: ((document.getElementById("extOfficeArea") || {}).value || "").trim(),
      phone: ((document.getElementById("extOfficePhone") || {}).value || "").trim(),
      active: !!(document.getElementById("extActive") || {}).checked,
      receiving: !!(document.getElementById("extReceiving") || {}).checked,
      currencies: currencies,
      rates: rates,
      show_address: !!(document.getElementById("extIncludeAddress") || {}).checked,
      show_phone: true
    };
    var data = await extPost("/api/offices/me", body);
    var savedOffice = extOfficeFrom(data); if(!savedOffice || !savedOffice.id)throw new Error("لم يرجع الخادم ملف المكتب المحفوظ؛ حدّث البيانات للتحقق."); extState.office = savedOffice;
    extState.loaded = true;
    extCacheBust();
    extPaint();
  } catch (e) { if (msg) msg.textContent = extErrorText(e); }
  finally { if (button && button.isConnected) button.disabled = false; }
}

function externalWizardHtml() {
  var w = extState.wizard;
  if (!extState.office) return '<div class="external-page"><div class="external-empty-card"><span>' + extIcon("building-2", 34) + '</span><h2>يجب إعداد المكتب أولاً</h2><p>أكمل بيانات مكتبك قبل إنشاء حوالة خارجية.</p><button class="btn" type="button" onclick="externalOpen(\'settings\')">إعداد المكتب</button></div></div>';
  var progress = [1, 2, 3, 4, 5].map(function (n) { return '<span class="' + (n <= w.step ? "on" : "") + '"></span>'; }).join("");
  var body = w.step === 1 ? externalWizardOfficeStep() : w.step === 2 ? externalWizardAmountStep() : w.step === 3 ? externalWizardRecipientStep() : w.step === 4 ? externalWizardReviewStep() : externalWizardResultStep();
  return '<div class="external-page external-wizard-page"><div class="external-wizard-progress" aria-label="المرحلة ' + w.step + ' من 5">' + progress + '</div><div class="external-wizard-caption">المرحلة ' + w.step + ' من 5</div>' + body + '</div>';
}
function externalWizardOfficeStep() {
  var w = extState.wizard, results = w.offices || [];
  return '<div class="external-step-card"><div class="external-step-icon">' + extIcon("search", 29) + '</div><h2>اختر مكتب الاستلام</h2><p class="external-muted">ابحث باسم المكتب أو صاحبه أو المدينة أو المنطقة أو العنوان. تظهر المكاتب الفعالة التي تستقبل الحوالات فقط.</p><input id="externalOfficeSearch" value="' + extEsc(w.officeQuery) + '" placeholder="ابحث عن مكتب الاستلام…" oninput="externalOfficeSearch(this.value)" autocomplete="off"><div id="externalOfficeResults">' + externalOfficeResultsHtml(results) + '</div><div class="external-step-actions"><button class="btn" type="button" onclick="externalWizardNext()" ' + (!w.office ? "disabled" : "") + '>متابعة إلى المبلغ ' + extIcon("arrow-left", 18) + '</button></div></div>';
}
function externalOfficeResultsHtml(results) {
  var w = extState.wizard;
  if (!w.officeQuery && !results.length) return '<div class="external-hint">ابدأ بكتابة اسم المكتب أو المدينة.</div>';
  if (extState.pending && !results.length) return typeof skeleton === "function" ? skeleton(2) : '<div class="external-hint">جارٍ البحث…</div>';
  if (!results.length) return '<div class="external-empty-inline">لا توجد مكاتب فعالة مطابقة للبحث.</div>';
  return results.map(function (o) {
    var selected = w.office && String(w.office.id) === String(o.id);
    var currencies = (o.currencies || []).map(function (c) { return extCurrencyName(c); }).join("، ");
    var address = [o.address, o.city, o.area].filter(Boolean).join("، ");
    return '<button type="button" class="external-office-result ' + (selected ? "selected" : "") + '" onclick="externalPickOffice(\'' + extEsc(String(o.id)) + '\')"><span class="external-office-result-icon">' + extIcon("building-2", 22) + '</span><span class="external-office-result-main"><b>' + extEsc(o.name || "مكتب") + '</b><small>' + extEsc(o.owner_name || "") + '</small><small>' + extEsc(address || "العنوان غير متاح") + '</small><small>هاتف: <span dir="ltr">' + extEsc(o.phone || "—") + '</span> • العملات: ' + extEsc(currencies || "—") + '</small></span><span class="external-office-status">' + (o.active === false ? "غير فعال" : selected ? "مختار" : "متاح") + '</span></button>';
  }).join("");
}
function externalOfficeSearch(value) {
  extState.wizard.officeQuery = String(value || "");
  clearTimeout(extState.searchTimers.office);
  if (!extState.wizard.officeQuery.trim()) { extState.wizard.offices = []; externalUpdateOfficeResults(); return; }
  extState.searchTimers.office = setTimeout(function () { externalSearchOffices(extState.wizard.officeQuery); }, 280);
}
async function externalSearchOffices(query) {
  if (!query || extState.wizard.step !== 1) return;
  var currency = extState.wizard.currency || "usd";
  var path = "/api/offices?q=" + encodeURIComponent(query.trim()) + "&currency=" + encodeURIComponent(currency) + "&limit=50&offset=0";
  var box = document.getElementById("externalOfficeResults");
  if (box) box.innerHTML = typeof skeleton === "function" ? skeleton(2) : '<div class="external-hint">جارٍ البحث…</div>';
  try {
    var data = await extJson(path), offices = data.offices || data.data && data.data.offices || [];
    extState.wizard.offices = offices;
    extState.wizard.officesPagination = data.pagination || {};
    externalUpdateOfficeResults();
  } catch (e) { if (box) box.innerHTML = '<div class="external-inline-error">' + extEsc(extErrorText(e)) + '</div>'; }
}
function externalUpdateOfficeResults() { var box = document.getElementById("externalOfficeResults"); if (box) { box.innerHTML = externalOfficeResultsHtml(extState.wizard.offices || []); extIcons(); } }
function externalPickOffice(id) {
  var found = (extState.wizard.offices || []).find(function (o) { return String(o.id) === String(id); });
  if (!found) return;
  extState.wizard.office = found;
  extState.wizard.quote = null;
  extPaint();
}
function externalWizardAmountStep() {
  var w = extState.wizard;
  var currencies = EXT_CURRENCIES.filter(function (c) { return !w.office.currencies || w.office.currencies.indexOf(c) >= 0; });
  return '<div class="external-step-card"><div class="external-step-icon">' + extIcon("calculator", 29) + '</div><h2>المبلغ والعملة</h2><div class="external-selected-office"><span>' + extIcon("building-2", 18) + '</span><b>' + extEsc(w.office.name || "مكتب الاستلام") + '</b><small>' + extEsc([w.office.city, w.office.area].filter(Boolean).join("، ") || w.office.address || "") + '</small></div><label class="external-label" for="externalCurrency">عملة الحوالة</label><select id="externalCurrency" onchange="externalSetWizard(\'currency\',this.value);externalQuoteDebounced()">' + currencies.map(function (c) { return '<option value="' + c + '" ' + (w.currency === c ? "selected" : "") + '>' + extEsc(EXT_CURRENCY_LABELS[c]) + ' (' + EXT_CURRENCY_CODES[c] + ')</option>'; }).join("") + '</select><label class="external-label" for="externalAmount">مبلغ الحوالة</label><input id="externalAmount" type="number" min="0.01" step="0.01" inputmode="decimal" value="' + extEsc(w.amount) + '" placeholder="أدخل المبلغ" oninput="externalSetWizard(\'amount\',this.value);externalQuoteDebounced()"><div id="externalQuoteBox">' + externalQuoteHtml() + '</div><div class="external-step-actions"><button class="btn g" type="button" onclick="externalWizardBack()">رجوع</button><button class="btn" type="button" onclick="externalWizardNext()" ' + (!w.quote ? "disabled" : "") + '>بيانات المستلم ' + extIcon("arrow-left", 18) + '</button></div></div>';
}
function externalQuoteHtml() {
  var q = extState.wizard.quote;
  if (extState.wizard.amount && !q) return '<div class="external-quote-card is-loading">' + extIcon("loader-circle", 19) + ' جارٍ حساب السعر النهائي من الخادم…</div>';
  if (!q) return '<div class="external-quote-card">أدخل مبلغًا صحيحًا ليحسب الخادم الرسوم والإجمالي.</div>';
  return '<div class="external-quote-card"><div class="external-quote-row"><span>مبلغ الحوالة</span><b>' + extMoney(q.amount, q.currency) + '</b></div><div class="external-quote-row"><span>أجر مكتب الاستلام</span><b>' + extMoney(q.office_fee, q.currency) + '</b></div><div class="external-quote-row"><span>عمولة التطبيق (0.1%)</span><b>' + extMoney(q.app_fee, q.currency) + '</b></div><div class="external-quote-total"><span>إجمالي الخصم من رصيد المرسل</span><strong>' + extMoney(q.total, q.currency) + '</strong></div><small>تُثبت هذه القيم مع الحوالة ويحسبها الخادم نهائيًا. التقريب إلى أصغر وحدة مالية عند الحاجة.</small></div>';
}
function externalSetWizard(field, value) { if (Object.prototype.hasOwnProperty.call(extState.wizard, field)) extState.wizard[field] = value; }
function externalQuoteDebounced() {
  extState.wizard.quote = null;
  var box = document.getElementById("externalQuoteBox"); if (box) box.innerHTML = externalQuoteHtml();
  clearTimeout(extState.searchTimers.quote);
  extState.searchTimers.quote = setTimeout(externalFetchQuote, 360);
}
async function externalFetchQuote() {
  var w = extState.wizard, amount = Number(w.amount), actor=extEnsureActor(), quoteKey=[w.office?.id,w.currency,w.amount].join("|");
  if (!w.office || !(amount > 0) || EXT_CURRENCIES.indexOf(w.currency) < 0) return;
  var box = document.getElementById("externalQuoteBox");
  if (box) box.innerHTML = externalQuoteHtml();
  try {
    var data = await extPost("/api/external/quote", { office_id: w.office.id, currency: w.currency, amount: amount });
    var quote = data.quote || data.data && data.data.quote;
    if (!quote) throw new Error("لم يعثر الخادم على عرض صالح.");
    if(!extActorStill(actor)||quoteKey!==[extState.wizard.office?.id,extState.wizard.currency,extState.wizard.amount].join("|"))return;
    extState.wizard.quote = quote;
    if (box) { box.innerHTML = externalQuoteHtml(); var next = document.querySelector(".external-step-actions .btn:not(.g)"); if (next) next.disabled = false; }
  } catch (e) {
    extState.wizard.quote = null;
    if (box) box.innerHTML = '<div class="external-inline-error">' + extEsc(extErrorText(e)) + '</div>';
  }
}
function externalWizardRecipientStep() {
  var w = extState.wizard;
  return '<div class="external-step-card"><div class="external-step-icon">' + extIcon("user-round-check", 29) + '</div><h2>بيانات المستلم</h2><p class="external-muted">يجب أن تكون البيانات مطابقة للمستلم المسجل في حساب SY الموجود. لا يوجد صرف نقدي؛ التسليم إيداع إلكتروني فقط.</p><label class="external-label" for="externalRecipientAccount">حساب المستفيد الحالي</label><input id="externalRecipientAccount" maxlength="26" value="' + extEsc(w.beneficiary_account) + '" placeholder="SY + 24 رقمًا" dir="ltr" oninput="externalSetWizard(\'beneficiary_account\',this.value.trim().toUpperCase())"><label class="external-label" for="externalRecipientName">الاسم الثلاثي للمستلم</label><input id="externalRecipientName" maxlength="160" value="' + extEsc(w.recipient_name) + '" placeholder="كما هو مسجل في حساب SY" oninput="externalSetWizard(\'recipient_name\',this.value)"><label class="external-label" for="externalRecipientPhone">رقم هاتف المستلم</label><input id="externalRecipientPhone" type="tel" maxlength="40" value="' + extEsc(w.recipient_phone) + '" placeholder="رقم الهاتف المرتبط بالحساب" dir="ltr" oninput="externalSetWizard(\'recipient_phone\',this.value)"><div class="external-beneficiary-note"><b>حساب SY موجود فقط</b><span>سيطابق الخادم الحساب والاسم والهاتف مع حساب SY الفعال قبل إنشاء الحوالة.</span></div><div class="external-step-actions"><button class="btn g" type="button" onclick="externalWizardBack()">رجوع</button><button class="btn" type="button" onclick="externalWizardNext()">مراجعة الحوالة ' + extIcon("arrow-left", 18) + '</button></div></div>';
}
function externalReviewRow(label, value, dir) { return '<div class="external-review-row"><span>' + extEsc(label) + '</span><b ' + (dir ? 'dir="' + dir + '"' : '') + '>' + extEsc(value || "—") + '</b></div>'; }
function externalWizardReviewStep() {
  var w = extState.wizard, q = w.quote || {}, from = extState.office || {};
  return '<div class="external-step-card"><div class="external-step-icon">' + extIcon("file-check-2", 29) + '</div><h2>مراجعة الحوالة</h2><div class="external-review-box">' + externalReviewRow("مكتب الإرسال", from.name || "مكتبك") + externalReviewRow("عنوان مكتب الإرسال", [from.address, from.city, from.area].filter(Boolean).join("، ")) + externalReviewRow("مكتب الاستلام", w.office.name) + externalReviewRow("عنوان مكتب الاستلام", [w.office.address, w.office.city, w.office.area].filter(Boolean).join("، ")) + externalReviewRow("حساب المستفيد", w.beneficiary_account, "ltr") + externalReviewRow("المستلم", w.recipient_name) + externalReviewRow("هاتف المستلم", w.recipient_phone, "ltr") + externalReviewRow("المبلغ", extMoney(q.amount || w.amount, w.currency)) + externalReviewRow("تاريخ المراجعة", extDate(Date.now())) + '</div><div class="external-fee-review"><div><span>أجر مكتب الاستلام</span><b>' + extMoney(q.office_fee, w.currency) + '</b></div><div><span>عمولة التطبيق 0.1%</span><b>' + extMoney(q.app_fee, w.currency) + '</b></div><div class="total"><span>إجمالي الخصم</span><strong>' + extMoney(q.total, w.currency) + '</strong></div></div><p class="external-review-note"><b>لماذا تظهر الرسوم هنا؟</b> تُخصم الرسوم من رصيد مكتب الإرسال وتبقى محجوزة حتى إتمام التسليم. لا تظهر هذه الرسوم أو العمولة في إشعار العميل المستلم.</p><div class="external-step-actions"><button class="btn g" type="button" onclick="externalWizardBack()">رجوع</button><button class="btn" type="button" onclick="externalWizardNext()">تأكيد وتجهيز الإرسال ' + extIcon("arrow-left", 18) + '</button></div></div>';
}
function externalWizardResultStep() {
  var r = extState.receipt;
  if (!r) return '<div class="external-empty-card"><span>' + extIcon("loader-circle", 34) + '</span><h2>جارٍ إنشاء الحوالة</h2><p>لا تغلق الصفحة ولا تعاود الضغط؛ سيبقى نفس مرجع الطلب عند التحقق من الشبكة.</p></div>';
  return externalReceiptCard(r, true);
}
function externalWizardNext() {
  var w = extState.wizard, msg;
  if (w.step === 1 && !w.office) { msg = "اختر مكتب استلام فعالًا أولاً."; }
  else if (w.step === 2 && (!w.quote || !(Number(w.amount) > 0))) { msg = "أدخل مبلغًا صحيحًا وانتظر عرض الخادم قبل المتابعة."; }
  else if (w.step === 3 && (!/^SY\d{24}$/.test(w.beneficiary_account.trim().toUpperCase()) || w.recipient_name.trim().split(/\s+/).length < 3 || w.recipient_phone.trim().length < 5)) { msg = "أدخل حساب SY المكوّنًا من SY و24 رقمًا، والاسم الثلاثي ورقم الهاتف المطابقين للحساب."; }
  if (msg) { extNotify("بيانات الحوالة", msg); return; }
  if (w.step < 4) { w.step += 1; extPaint(); return; }
  if (w.step === 4) { externalSend(); return; }
}
function externalWizardBack() { if (extState.wizard.step > 1) { extState.wizard.step -= 1; extPaint(); } }

async function externalSend() {
  var w = extState.wizard, q = w.quote, beneficiaryAccount = w.beneficiary_account.trim().toUpperCase(), key = [w.office && w.office.id, w.currency, w.amount, beneficiaryAccount, w.recipient_name.trim(), w.recipient_phone.trim(), q && q.quote_digest].join("|");
  if (!q || !w.office || !/^SY\d{24}$/.test(beneficiaryAccount) || extState.wizard.step !== 4) return;
  if (!extState.intent || extState.intent.key !== key) extState.intent = { key: key, reference_id: w.reference_id || extRandomId() };
  w.reference_id = extState.intent.reference_id;
  w.step = 5;
  extState.receipt = null;
  extState.pending = true;
  extPaint();
  try {
    var data = await extPost("/api/external/remittances", { office_id: w.office.id, currency: w.currency, amount: Number(w.amount), beneficiary_account: beneficiaryAccount, recipient_name: w.recipient_name.trim(), recipient_phone: w.recipient_phone.trim(), reference_id: w.reference_id, quote_digest: q.quote_digest });
    var remittance = extRemittanceFrom(data);
    if (!remittance) throw new Error("أنشأ الخادم استجابة غير مكتملة؛ لا تعاود الإرسال قبل التحقق من سجل الحوالات.");
    extState.receipt = remittance;
    extState.intent = null;
    extState.pending = false;
    await externalRefreshAfterMutation();
    extState.section = "receipt";
    extPaint();
  } catch (e) {
    extState.pending = false;
    extState.wizard.step = 4;
    extState.error = extErrorText(e);
    extPaint();
    var target = document.querySelector(".external-send-error"); if (target) target.textContent = extState.error + " المرجع محفوظ: " + w.reference_id;
  }
}

function externalListHtml(bucket) {
  var list = extState.lists[bucket] || [], q = extState.listQ[bucket] || "", busy = extState.listBusy[bucket];
  var rows = busy && !list.length ? (typeof skeleton === "function" ? skeleton(3) : '<div class="external-skeleton"></div>') : list.length ? list.map(function (r) { return externalRowHtml(r, bucket); }).join("") : '<div class="external-empty-card"><span>' + extIcon("inbox", 34) + '</span><h2>لا توجد حوالات</h2><p>' + (q ? "لا توجد نتائج مطابقة للبحث." : "ستظهر الحوالات هنا عند تسجيلها على الخادم.") + '</p></div>';
  return '<div class="external-page external-list-page"><div class="external-list-intro"><div><h2>' + extEsc(EXT_BUCKET_LABELS[bucket]) + '</h2><p>السجلات الحقيقية المرتبطة بحساب المكتب.</p></div><span class="external-list-count">' + extEsc(extState.counts[bucket] || 0) + '</span></div><div class="external-search-row"><input id="externalListSearch" value="' + extEsc(q) + '" placeholder="بحث برقم الحوالة أو الاسم أو المكتب…" oninput="externalListSearch(\'' + bucket + '\',this.value)"><button type="button" onclick="externalLoadList(\'' + bucket + '\',false)" aria-label="تحديث">' + extIcon("refresh-cw", 19) + '</button></div><div id="externalListRows">' + rows + '</div>' + ((extState.listHasMore[bucket] && !busy) ? '<button class="btn g" type="button" onclick="externalLoadList(\'' + bucket + '\',true)">تحميل المزيد</button>' : '') + '<div class="external-list-status" id="externalListStatus"></div></div>';
}
function externalRowHtml(r, bucket) {
  var name = bucket === "incoming" ? (r.recipient_name || "المستلم") : (bucket === "outgoing" ? (r.recipient_name || "المستلم") : (r.sender_office_name || r.sender_name || "مكتب الإرسال"));
  var office = bucket === "incoming" ? ((r.sender_office_name||'')+' — '+(r.sender_office_address||'')) : (r.receiver_office_name || "");
  var pending = r.status === "pending";
  return '<button type="button" class="external-remittance-row ' + (pending ? "is-pending" : "") + '" onclick="externalOpenDetail(\'' + extEsc(String(r.id || r.reference_id || "")) + '\',\'' + bucket + '\')"><span class="external-row-icon">' + extIcon(bucket === "incoming" ? "inbox" : bucket === "outgoing" ? "send-horizontal" : "badge-check", 21) + '</span><span class="external-row-copy"><b>' + extEsc(name) + '</b><small>' + extEsc(office) + '</small><small dir="ltr">' + extEsc(r.recipient_phone||'') + '</small>' + (r.status==='delivered'?'<small>التسليم: '+extEsc(extDate(r.delivered_at))+' — '+extEsc(r.delivered_by_name||r.delivered_by_account||r.delivered_by||'')+'</small>':'') + '<small dir="ltr">' + extEsc(r.reference_number || r.number || r.reference_id || r.id || "—") + ' • ' + extDate(r.created_at) + '</small></span><span class="external-row-amount"><strong dir="ltr">' + extMoney(r.amount, r.currency) + '</strong><small class="external-status status-' + extEsc(r.status || "") + '">' + (pending ? '<i></i>' : '') + extEsc(extStatus(r.status)) + '</small></span></button>';
}
function externalListSearch(bucket, value) {
  extState.listQ[bucket] = String(value || "");
  clearTimeout(extState.searchTimers[bucket]);
  extState.searchTimers[bucket] = setTimeout(function () { externalLoadList(bucket, false); }, 300);
}
async function externalLoadList(bucket, append) {
  if (extState.listBusy[bucket]) return;
  extState.listBusy[bucket] = true;
  if (!append) { extState.listOffset[bucket] = 0; extState.lists[bucket] = []; }
  var offset = extState.listOffset[bucket] || 0, q = extState.listQ[bucket] || "";
  var path = "/api/external/remittances?bucket=" + encodeURIComponent(bucket) + "&status=" + encodeURIComponent("") + "&q=" + encodeURIComponent(q) + "&limit=50&offset=" + offset;
  try {
    var data = await extJson(path, {}), rows = data.remittances || data.data && data.data.remittances || [];
    extGetCounts(data);
    extState.lists[bucket] = append ? extMergeById(extState.lists[bucket] || [], rows) : rows;
    extState.listOffset[bucket] = data.pagination && data.pagination.next_offset != null ? data.pagination.next_offset : offset + rows.length;
    extState.listHasMore[bucket] = !!(data.pagination && data.pagination.has_more);
    if (data.pagination && data.pagination.total != null) extState.counts[bucket] = Number(data.pagination.total) || 0;
  } catch (e) {
    var status = document.getElementById("externalListStatus"); if (status) status.textContent = extErrorText(e);
  } finally {
    extState.listBusy[bucket] = false;
    if (extState.section === bucket) { extPaint(); }
  }
}
function extMergeById(a, b) { return Array.from(new Map(a.concat(b).map(function (x) { return [x.id || x.reference_id, x]; })).values()); }

async function externalOpenDetail(id, bucket) {
  if (!id) return;
  extState.section = "detail";
  extState.detailId = id;
  extState.detailBucket = bucket || extState.detailBucket || "incoming";
  extState.detail = null;
  extState.detailBusy = true;
  extPaint();
  try {
    await externalLoadDetail(id);
    if (extState.detail && typeof me !== "undefined" && me && String(extState.detail.sender_id || "") === String(me.id)) extState.detailBucket = "outgoing";
    else if (extState.detail && extState.detail.status === "delivered") extState.detailBucket = "received";
  }
  catch (e) { extState.error = extErrorText(e); }
  finally { extState.detailBusy = false; extPaint(); }
}
async function externalLoadDetail(id) {
  var data = await extGet("/api/external/remittances/detail?id=" + encodeURIComponent(id), 0);
  extState.detail = extRemittanceFrom(data) || data.remittance || data;
  return extState.detail;
}
function externalDetailHtml() {
  if (extState.detailBusy || !extState.detail) return '<div class="external-page">' + (typeof skeleton === "function" ? skeleton(3) : '<div class="external-skeleton"></div>') + '</div>';
  var r = extState.detail, bucket = extState.detailBucket || "incoming", sender = bucket === "outgoing" || (typeof me !== "undefined" && r.sender_id && me && String(r.sender_id) === String(me.id));
  var rows = externalReviewRow("رقم الحوالة", r.reference_number || r.number || r.reference_id || r.id, "ltr") + externalReviewRow("المستلم", r.recipient_name) + externalReviewRow("هاتف المستلم", r.recipient_phone, "ltr") + externalReviewRow("المبلغ", extMoney(r.amount, r.currency)) + externalReviewRow("مكتب الإرسال", r.sender_office_name || r.sender_name) + externalReviewRow("عنوان مكتب الإرسال", r.sender_office_address) + externalReviewRow("مكتب الاستلام", r.receiver_office_name) + externalReviewRow("تاريخ الإرسال", extDate(r.created_at));
  var action = "";
  if (bucket === "outgoing" && r.status === "pending") action += '<button class="btn danger" type="button" onclick="externalCancelSheet()">إلغاء الحوالة</button>';
  if (bucket === "outgoing" && sender) action += '<button class="btn g" type="button" onclick="externalOpenReceiptFromDetail()">عرض إشعار المرسل</button>';
  if (bucket === "incoming" && r.status === "pending") action += '<button class="btn" type="button" onclick="externalAccept()">اعتماد الحوالة للتسليم</button>';
  if (bucket === "incoming" && (r.status === "accepted" || r.status === "verified")) action += externalVerifyFormHtml(r);
  if (bucket === "incoming" && r.status === "verified") action += '<button class="btn" type="button" onclick="externalDeliver()">تأكيد التسليم والإيداع الإلكتروني</button>';
  if (r.status === "delivered") action += '<div class="external-delivered-note"><b>' + extIcon("check-circle", 18) + ' تم التسليم الإلكتروني</b><small>' + extDate(r.delivered_at) + (r.delivered_by ? ' • المنفذ: ' + extEsc(r.delivered_by_name||r.delivered_by_account||r.delivered_by) : '') + '</small></div>';
  return '<div class="external-page external-detail-page"><div class="external-detail-status status-' + extEsc(r.status || "") + '"><span>' + extIcon(r.status === "delivered" ? "check-circle" : r.status === "cancelled" ? "circle-x" : "clock-3", 25) + '</span><div><b>' + extEsc(extStatus(r.status)) + '</b><small>' + extEsc(r.status === "accepted" ? "لا يمكن إلغاء الحوالة بعد اعتمادها." : "تتقدم الحالة على الخادم ولا تُصرف الحوالة مرتين." ) + '</small></div></div><div class="external-detail-card"><div class="external-review-box">' + rows + '</div>' + (sender && r.password ? '<div class="external-secret-line"><span>كلمة سر الحوالة</span><b dir="ltr">' + extEsc(r.password) + '</b></div>' : '') + '</div><div class="external-detail-actions">' + action + '</div><div class="external-private-note">' + extIcon("lock-keyhole", 17) + ' المرفقات الخاصة لا تُعرض للعامة ولا تُتاح إلا في صلاحية المكتب المسؤول أو الإدارة.</div></div>';
}
function externalVerifyFormHtml(r) {
  if (r.status !== "accepted") return '<div class="external-verify-state"><b>' + extIcon("badge-check", 18) + ' تم التحقق من البيانات</b><small>أكّد التسليم الإلكتروني بعد المراجعة النهائية.</small></div>';
  return '<div class="external-verify-card"><h3>التحقق قبل التسليم</h3><p>أدخل كلمة السر المملوكة لصاحب الإشعار وأرفق صورة الهوية أو المستند المعتمد. المطابقة يدوية من الموظف؛ لا يدّعي التطبيق قراءة الهوية آليًا.</p><label class="external-label" for="externalPassword">كلمة سر الحوالة</label><input id="externalPassword" type="password" autocomplete="off" maxlength="100" placeholder="أدخلها كما سلّمها صاحب الإشعار" dir="ltr"><label class="external-proof-picker"><span>' + extIcon("paperclip", 20) + '</span><span id="externalProofName">' + (extState.proof ? extEsc(extState.proof.name) : "اختيار صورة الهوية أو الإشعار (حد 300KB)") + '</span><input id="externalProofFile" type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"></label><label class="external-confirm"><input id="externalIdentityConfirm" type="checkbox"><span>أؤكد بصفتي الموظف المسؤول أن الاسم مطابق للوثيقة الأصلية، وأنني تحققت يدويًا من هوية صاحب العلاقة.</span></label><div class="msg" id="externalVerifyMsg"></div><button class="btn" type="button" onclick="externalVerify()">تحقق من كلمة السر وسجل المطابقة</button></div>';
}
function externalBind() {
  var file = document.getElementById("externalProofFile");
  if (file) file.onchange = function () { externalReadProof(file.files && file.files[0]); };
  var scroll = document.querySelector("[data-external-scroll]");
  if (scroll) scroll.onscroll = function () { var bar = document.querySelector(".external-topbar"); if (bar) bar.classList.toggle("sc", scroll.scrollTop > 4); };
}
async function externalReadProof(file) {
  if (!file) return;
  extState.proofBusy = true;
  var name = document.getElementById("externalProofName"); if (name) name.textContent = "جارٍ تجهيز المرفق…";
  try {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      if (file.size > 300 * 1024) throw new Error("ملف PDF أكبر من 300KB؛ اختر ملفًا أصغر.");
      extState.proof = { data_url: await extFileData(file), name: file.name, mime: "application/pdf", bytes: file.size };
    } else if (/^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name)) {
      extState.proof = await extCompressImage(file);
    } else throw new Error("يسمح فقط بصور JPEG/PNG أو ملف PDF.");
    if (name) name.textContent = extState.proof.name + " • " + Math.ceil(extState.proof.bytes / 1024) + "KB";
  } catch (e) { extState.proof = null; if (name) name.textContent = extErrorText(e); }
  finally { extState.proofBusy = false; }
}
function extFileData(file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(file); }); }
async function extCompressImage(file) {
  var url = URL.createObjectURL(file);
  try {
    var image = new Image(); image.src = url; await image.decode();
    var scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight)), quality = 0.82, result;
    for (var i = 0; i < 8; i++) {
      var canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      var context = canvas.getContext("2d", { alpha: false }); context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      result = canvas.toDataURL("image/jpeg", quality);
      var bytes = Math.ceil((result.split(",")[1] || "").length * 0.75);
      if (bytes <= 300 * 1024) return { data_url: result, name: file.name.replace(/\.[^.]+$/, ".jpg"), mime: "image/jpeg", bytes: bytes };
      if (quality > 0.5) quality -= 0.08; else scale *= 0.78;
    }
    throw new Error("تعذر ضغط الصورة إلى الحد المسموح 300KB.");
  } finally { URL.revokeObjectURL(url); }
}
async function externalAccept() {
  var r = extState.detail; if (!r || r.status !== "pending") return;
  var key = "accept:" + (r.id || r.reference_id), ref = extActionRef(key), button = document.querySelector(".external-detail-actions .btn"); if (button) button.disabled = true;
  try { var data = await extPost("/api/external/remittances/accept", { id: r.id, reference_id: ref }); extState.detail = extRequiredRemittance(data, "accepted"); await externalRefreshAfterMutation(); extPaint(); }
  catch (e) { if (button) button.disabled = false; extNotify("لم يتم اعتماد الحوالة", extErrorText(e)); }
}
async function externalVerify() {
  var r = extState.detail, msg = document.getElementById("externalVerifyMsg"), password = (document.getElementById("externalPassword") || {}).value || "", confirmed = !!(document.getElementById("externalIdentityConfirm") || {}).checked;
  if (!r || r.status !== "accepted") return;
  if (!password.trim() || !extState.proof || !confirmed) { if (msg) msg.textContent = "أدخل كلمة السر وأرفق المستند وأكد المطابقة اليدوية."; return; }
  var button = document.querySelector(".external-verify-card .btn"); if (button) button.disabled = true;
  try { var data = await extPost("/api/external/remittances/verify", { id: r.id, password: password, evidence: { data_url: extState.proof.data_url, name: extState.proof.name, mime: extState.proof.mime }, identity_confirmed: true, reference_id: extActionRef("verify:" + r.id) }); extState.detail = extRequiredRemittance(data, "verified"); extState.proof = null; await externalRefreshAfterMutation(); extPaint(); }
  catch (e) { if (msg) msg.textContent = extErrorText(e); if (button) button.disabled = false; }
}
async function externalDeliver() {
  var r = extState.detail; if (!r || r.status !== "verified") return;
  var key = "deliver:" + (r.id || r.reference_id), ref = extActionRef(key), button = document.querySelector(".external-detail-actions > .btn"); if (button) button.disabled = true;
  try { var data = await extPost("/api/external/remittances/deliver", { id: r.id, reference_id: ref, identity_confirmed: true }); extState.detail = extRequiredRemittance(data, "delivered"); await externalRefreshAfterMutation(); extPaint(); }
  catch (e) { if (button) button.disabled = false; extNotify("لم يتم التسليم", extErrorText(e)); }
}
function extActionRef(key) { if (!extState.actionRefs[key]) extState.actionRefs[key] = extRandomId(); return extState.actionRefs[key]; }
function externalCancelSheet() {
  var r = extState.detail; if (!r || r.status !== "pending") return;
  if (typeof sheet !== "function") return;
  sheet('<div class="external-cancel-sheet"><h2>إلغاء الحوالة</h2><p>لا يمكن الإلغاء إلا وهي قيد الانتظار وقبل اعتماد مكتب الاستلام. ستُعاد قيمة الحوالة والرسوم والعمولة إلى محفظة المرسل ضمن المعاملة الذرية.</p><label class="external-label" for="externalCancelReason">سبب الإلغاء</label><textarea id="externalCancelReason" maxlength="500" placeholder="اكتب سببًا واضحًا"></textarea><div class="msg" id="externalCancelMsg"></div><button class="btn danger" type="button" id="externalCancelButton">تأكيد الإلغاء</button><button class="btn g" type="button" onclick="sheet(null)">إغلاق</button></div>');
  var button = document.getElementById("externalCancelButton"); if (button) button.onclick = externalCancel;
}
async function externalCancel() {
  var r = extState.detail, reason = ((document.getElementById("externalCancelReason") || {}).value || "").trim(), msg = document.getElementById("externalCancelMsg"), button = document.getElementById("externalCancelButton");
  if (!reason) { if (msg) msg.textContent = "سبب الإلغاء مطلوب."; return; }
  if (button) button.disabled = true;
  try { var data = await extPost("/api/external/remittances/cancel", { id: r.id, reason: reason, reference_id: extActionRef("cancel:" + r.id) }); extState.detail = extRequiredRemittance(data, "cancelled"); await externalRefreshAfterMutation(); sheet(null); extPaint(); }
  catch (e) { if (msg) msg.textContent = extErrorText(e); if (button) button.disabled = false; }
}
function externalOpenReceiptFromDetail() {
  if (!extState.detail) return;
  extState.receipt = extState.detail;
  extState.section = "receipt";
  extPaint();
}
async function externalShowDetails(id) {
  if (!id) return false;
  await externalOpenDetail(id, "incoming");
  return true;
}

function externalReceiptHtml() {
  return '<div class="external-page external-receipt-page">' + externalReceiptCard(extState.receipt, false) + '</div>';
}
function externalReceiptCard(r, justCreated) {
  if (!r) return '<div class="external-empty-card"><span>' + extIcon("file-warning", 34) + '</span><h2>لا يوجد إشعار</h2><p>لم تُرجع العملية إشعارًا صالحًا من الخادم.</p></div>';
  var logo = typeof LOGO_URL !== "undefined" ? LOGO_URL : "logo.webp", password = r.password || "";
  return '<article class="external-customer-receipt receiptPrint"><div class="external-receipt-watermark"><img src="' + extEsc(logo) + '" alt=""></div><div class="external-receipt-head"><img src="' + extEsc(logo) + '" alt="شعار الرفاه كاش"><div><h2>الرفاه كاش</h2><small>' + (justCreated ? "تم إنشاء الحوالة بنجاح" : "إشعار حوالة خارجية") + '</small></div><span class="external-receipt-ok">' + extIcon("check-circle", 21) + '</span></div><div class="external-receipt-amount"><small>قيمة الحوالة للمستفيد</small><strong dir="ltr">' + extMoney(r.amount, r.currency) + '</strong></div><div class="external-receipt-table">' + externalReviewRow("رقم الحوالة", r.reference_number || r.number || r.reference_id || r.id, "ltr") + externalReviewRow("كلمة سر الحوالة", password || "متاحة في إشعار المرسل", "ltr") + externalReviewRow("حساب المستفيد", r.beneficiary_account || r.recipient_account, "ltr") + externalReviewRow("المستلم", r.recipient_name) + externalReviewRow("هاتف المستلم", r.recipient_phone, "ltr") + externalReviewRow("مكتب الإرسال", r.sender_office_name || r.sender_name) + externalReviewRow("عنوان مكتب الإرسال", r.sender_office_address) + externalReviewRow("مكتب الاستلام", r.receiver_office_name) + externalReviewRow("عنوان مكتب الاستلام", r.receiver_office_address) + externalReviewRow("الحالة", extStatus(r.status)) + externalReviewRow("التاريخ والوقت", extDate(r.created_at)) + '</div><div class="external-receipt-warning"><b>' + extIcon("shield-alert", 19) + ' تنبيه أمني</b><p>' + extEsc(EXT_SECURITY_WARNING) + '</p></div><div class="external-receipt-actions"><button class="btn" type="button" onclick="externalReceiptPdf(\'save\')">' + extIcon("file-down", 18) + ' حفظ PDF</button><button class="btn g" type="button" onclick="externalReceiptPdf(\'share\')">' + extIcon("share-2", 18) + ' مشاركة PDF</button><button class="btn g" type="button" onclick="externalPrintReceipt()">' + extIcon("printer", 18) + ' طباعة</button></div><div class="external-sensitive-note">' + extIcon("lock-keyhole", 16) + ' كلمة السر حساسة. اضغط مشاركة أو حفظ فقط عندما تكون مستعدًا لحمايتها وعدم نشرها علنًا.</div><div class="external-receipt-status" id="externalReceiptStatus"></div></article>';
}
function externalPrintReceipt() { window.print(); }
async function externalReceiptPdf(mode) {
  var r = extState.receipt; if (!r) return;
  var status = document.getElementById("externalReceiptStatus"); if (status) status.textContent = "جارٍ تجهيز ملف PDF…";
  try {
    if (typeof loadFeature === "function") await loadFeature("pdf");
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("ميزة PDF غير متاحة في هذا المتصفح.");
    var canvas = await externalReceiptCanvas(r), pdf = new window.jspdf.jsPDF({ unit: "px", format: [canvas.width/2, canvas.height/2], orientation: "portrait", compress: true });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width/2, canvas.height/2, undefined, "FAST");
    var name = "alrafah-external-remittance-" + (r.reference_number || r.reference_id || r.id || Date.now()) + ".pdf", blob = pdf.output("blob");
    if (mode === "share") {
      var shared = false;
      if (typeof shareBlobFile === "function") shared = await shareBlobFile(blob, name, "application/pdf");
      if (!shared && navigator.share && navigator.canShare) { var file = new File([blob], name, { type: "application/pdf" }); if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "إشعار حوالة الرفاه كاش" }); shared = true; } }
      if (!shared) { var shareLink = document.createElement("a"); shareLink.href = URL.createObjectURL(blob); shareLink.download = name; shareLink.click(); setTimeout(function () { URL.revokeObjectURL(shareLink.href); }, 1000); }
      if (status) status.textContent = "تم فتح خيارات المشاركة أو الحفظ.";
    } else if (typeof saveBlobFile === "function" && window.AlrafahAndroid) { await saveBlobFile(blob, name, "application/pdf"); if (status) status.textContent = "تم حفظ الإشعار."; }
    else { pdf.save(name); if (status) status.textContent = "تم تجهيز الإشعار للحفظ."; }
  } catch (e) { if (status) status.textContent = "تعذر تجهيز PDF دون تغيير الحوالة: " + extErrorText(e); }
}
async function externalReceiptCanvas(r) {
  try { await document.fonts.load('700 24px Cairo'); await document.fonts.load('400 20px Cairo'); if(typeof LOGO_IMG!=='undefined'&&LOGO_IMG.decode)await LOGO_IMG.decode(); } catch {}
  var c=document.createElement('canvas'),scale=2;c.width=800*scale;c.height=2;var x=c.getContext('2d');x.scale(scale,scale);
  function box(px,py,w,h,rad,fill){x.beginPath();x.moveTo(px+rad,py);x.arcTo(px+w,py,px+w,py+h,rad);x.arcTo(px+w,py+h,px,py+h,rad);x.arcTo(px,py+h,px,py,rad);x.arcTo(px,py,px+w,py,rad);x.closePath();x.fillStyle=fill;x.fill()}
  function txt(v,px,py,font,color,align,dir){x.font=font+' Cairo,sans-serif';x.fillStyle=color;x.textAlign=align||'right';x.direction=dir||'rtl';x.fillText(String(v??''),px,py)}
  function lines(v,max,font){x.font=font+' Cairo,sans-serif';var words=String(v??'—').split(/\s+/),result=[],line='';for(var word of words){while(x.measureText(word).width>max){var chunk='';for(var ch of word){if(x.measureText(chunk+ch).width>max)break;chunk+=ch}if(line){result.push(line);line=''}result.push(chunk);word=word.slice(chunk.length)}var next=line?line+' '+word:word;if(x.measureText(next).width>max&&line){result.push(line);line=word}else line=next}if(line)result.push(line);return result.length?result:['—']}
  var rows=[['رقم الحوالة',r.reference_number||r.reference_id||r.id,'ltr'],['كلمة سر الحوالة',r.password||'متاحة في إشعار المرسل','ltr'],['حساب SY للمستفيد',r.beneficiary_account,'ltr'],['اسم المستلم',r.recipient_name],['هاتف المستلم',r.recipient_phone,'ltr'],['مكتب الإرسال',r.sender_office_name||r.sender_office?.name],['حساب مكتب الإرسال',r.sender_office?.account_number,'ltr'],['عنوان مكتب الإرسال',r.sender_office_address||r.sender_office?.address],['مكتب التسليم',r.receiver_office_name||r.receiver_office?.name],['حساب مكتب التسليم',r.receiver_office?.account_number,'ltr'],['عنوان مكتب التسليم',r.receiver_office_address||r.receiver_office?.address],['حالة الحوالة',extStatus(r.status||r.state)],['تاريخ ووقت الإرسال',extDate(r.created_at)]];
  var layout=rows.map(row=>({label:row[0],dir:row[2]||'rtl',value:lines(row[1],625,'700 22px')})),tableHeight=24+layout.reduce((n,row)=>n+42+row.value.length*31,0),warning=lines(EXT_SECURITY_WARNING,625,'400 18px'),warningHeight=65+warning.length*27,totalHeight=470+tableHeight+warningHeight+120;
  if(totalHeight>4000)throw new Error('بيانات الإيصال أطول من حد التصدير؛ استخدم الطباعة لعرضها كاملة.');
  c.height=Math.ceil(totalHeight*scale);x=c.getContext('2d');x.scale(scale,scale);
  x.fillStyle='#f5f3ff';x.fillRect(0,0,800,totalHeight);var g=x.createLinearGradient(0,0,800,285);g.addColorStop(0,'#291b80');g.addColorStop(1,'#6842ee');x.fillStyle=g;x.fillRect(0,0,800,285);
  if(typeof LOGO_IMG!=='undefined')x.drawImage(LOGO_IMG,58,58,122,122);txt('الرفاه كاش',746,116,'700 44px','#fff');txt('إشعار حوالة خارجية',746,166,'400 25px','#f2edff');
  box(50,220,700,180,30,'#fff');txt('قيمة الحوالة للمستفيد',400,278,'400 23px','#7d7898','center');txt(extMoney(r.amount,r.currency),400,350,'700 54px','#4b2fc0','center','ltr');
  var y=445;box(50,420,700,tableHeight,28,'#fff');for(var row of layout){txt(row.label,715,y,'700 19px','#7e7a96');for(var line of row.value){y+=31;txt(line,715,y,'700 22px','#211d39','right',row.dir)}y+=29;if(row!==layout[layout.length-1]){x.fillStyle='#eceaf8';x.fillRect(85,y-8,630,2)}y+=13}
  var wy=440+tableHeight;box(50,wy,700,warningHeight,24,'#fff0f0');txt('تنبيه أمني — صاحب العلاقة شخصيًا',715,wy+36,'700 21px','#a13c47');warning.forEach((line,i)=>txt(line,715,wy+67+i*27,'400 18px','#773640'));
  var footer=wy+warningHeight+35;if(typeof LOGO_IMG!=='undefined')x.drawImage(LOGO_IMG,60,footer-8,38,38);txt('الرفاه كاش — محفظتك الرقمية',715,footer+18,'400 17px','#8b839e');
  return c;
}


function externalAdminOpen() { return externalOpenAdmin(); }
async function externalOpenAdmin() {
  if (!extHasAdmin()) return false;
  if (typeof tab !== "undefined" && tab !== "external" && typeof go === "function") {
    if (typeof isAdm !== "undefined") isAdm = false;
    go("external");
  }
  extState.section = "admin"; extPaint();
  await externalLoadAdmin(false); extState.admin.busy = false; extPaint(); return true;
}
function externalAdminHtml() {
  if (!extHasAdmin()) return '<div class="external-page"><div class="external-empty-card"><h2>غير مصرح</h2><p>هذه الصفحة للمشرفين المعتمدين فقط.</p></div></div>';
  var a = extState.admin, summary = a.summary || {}, totals = summary.totals || {};
  var totalCards = EXT_CURRENCIES.map(function (c) { var t = totals[c] || {}; return '<div class="external-admin-total"><small>' + extEsc(EXT_CURRENCY_LABELS[c]) + '</small><b dir="ltr">' + extMoney(t.amount || 0, c) + '</b><span>رسوم المكتب ' + extMoney(t.office_fee || 0, c) + '</span><span>عمولة التطبيق ' + extMoney(t.app_fee || 0, c) + '</span></div>'; }).join("");
  var offices = (a.offices || []).map(function (o) { return '<option value="' + extEsc(o.id) + '" ' + (a.office_id === o.id ? "selected" : "") + '>' + extEsc(o.name || o.id) + '</option>'; }).join("");
  var rows = a.busy && !a.remittances.length ? (typeof skeleton === "function" ? skeleton(4) : '<div class="external-skeleton"></div>') : a.remittances.length ? a.remittances.map(function (r) { return '<div class="external-admin-row"><div><b>' + extEsc(r.reference_number || r.reference_id || r.id) + '</b><small>' + extEsc(r.sender_office_name || "") + ' ← ' + extEsc(r.receiver_office_name || "") + '</small><small>' + extEsc(r.recipient_name || "") + ' • ' + extDate(r.created_at) + '</small></div><div><b dir="ltr">' + extMoney(r.amount, r.currency) + '</b><small class="external-status status-' + extEsc(r.status || "") + '">' + extEsc(extStatus(r.status)) + '</small><button class="receipt-open" type="button" onclick="externalAdminRemittance(\'' + extEsc(String(r.id || "")) + '\')" aria-label="عرض تفاصيل الحوالة">' + extIcon("chevron-left", 17) + '</button></div></div>'; }).join("") : '<div class="external-empty-inline">لا توجد حوالات بهذه الفلاتر.</div>';
  return '<div class="external-page external-admin-page"><div class="external-admin-hero"><b>' + extIcon("shield-check", 20) + ' لوحة الحوالات الخارجية</b><small>لا يمكن للمكاتب تعديل العمولة أو بيانات الإدارة.</small></div><div class="external-admin-summary">' + totalCards + '</div><div class="external-admin-filters"><input id="externalAdminSearch" value="' + extEsc(a.q) + '" placeholder="بحث برقم الحوالة أو الاسم أو المكتب…" oninput="externalAdminSearch(this.value)"><select id="externalAdminStatus" onchange="externalAdminFilter(\'status\',this.value)"><option value="">كل الحالات</option>' + Object.keys(EXT_STATUS_LABELS).map(function (s) { return '<option value="' + s + '" ' + (a.status === s ? "selected" : "") + '>' + extEsc(EXT_STATUS_LABELS[s]) + '</option>'; }).join("") + '</select><select id="externalAdminOffice" onchange="externalAdminFilter(\'office_id\',this.value)"><option value="">كل المكاتب</option>' + offices + '</select><button class="btn g" type="button" onclick="externalLoadAdmin(false)">تحديث</button></div><div class="external-admin-list">' + rows + '</div>' + (a.offices || []).map(function (o) { return '<div class="external-admin-office"><div><b>' + extEsc(o.name || "مكتب") + '</b><small>' + extEsc(o.account_number || o.user_id || o.id) + ' • ' + (o.active === false ? "غير فعال" : "فعال") + '</small></div><button class="btn g" type="button" onclick="externalAdminToggleOffice(\'' + extEsc(String(o.id)) + '\',' + (o.active === false ? "true" : "false") + ')">' + (o.active === false ? "تفعيل" : "تعطيل") + '</button><button class="receipt-open" type="button" onclick="externalAdminStatement(\'' + extEsc(String(o.id)) + '\')" aria-label="كشف حساب المكتب">' + extIcon("file-text", 19) + '</button></div>'; }).join("") + (a.statement ? externalAdminStatementHtml() : '') + '<div class="external-list-status" id="externalAdminStatusMsg"></div></div>';
}
function externalAdminSearch(value) { extState.admin.q = String(value || ""); clearTimeout(extState.admin.timers); extState.admin.timers = setTimeout(function () { externalLoadAdmin(false); }, 300); }
function externalAdminFilter(key, value) { extState.admin[key] = value; externalLoadAdmin(false); }
async function externalLoadAdmin(append) {
  if (!extHasAdmin() || extState.admin.busy && !append) return;
  extState.admin.busy = true;
  var a = extState.admin, offset = append ? (a.pagination.next_offset || 0) : 0;
  var path = "/api/admin/external?q=" + encodeURIComponent(a.q || "") + "&status=" + encodeURIComponent(a.status || "") + "&office_id=" + encodeURIComponent(a.office_id || "") + "&limit=50&offset=" + offset;
  try {
    var data = await extJson(path, {}); a.remittances = append ? extMergeById(a.remittances, data.remittances || []) : (data.remittances || []); a.offices = data.offices || a.offices || []; a.summary = data.summary || a.summary || {}; a.pagination = data.pagination || {}; a.loaded = true; extState.error = "";
  } catch (e) { extState.error = extErrorText(e); }
  finally { a.busy = false; if (extState.section === "admin") extPaint(); }
}
function externalAdminRemittance(id) {
  var r = extState.admin.remittances.find(function (x) { return String(x.id) === String(id); });
  if (!r) return;
  var title = r.reference_number || r.reference_id || r.id, details = '<div class="external-admin-detail"><h3>' + extEsc(title) + '</h3>' + externalReviewRow("المرسل", r.sender_office_name || r.sender_name) + externalReviewRow("المستلم", r.recipient_name) + externalReviewRow("المبلغ", extMoney(r.amount, r.currency)) + externalReviewRow("الحالة", extStatus(r.status)) + externalReviewRow("تاريخ الإنشاء", extDate(r.created_at)) + externalReviewRow("تاريخ التسليم", extDate(r.delivered_at)) + '<p>سجل التدقيق والخصومات والتسويات يظل مصدره الخادم وقاعدة البيانات.</p></div>';
  if (typeof sheet === "function") sheet(details + '<button class="btn g" onclick="sheet(null)">إغلاق</button>');
}
async function externalAdminToggleOffice(officeId, active) {
  if (!extHasAdmin()) return;
  var msg = document.getElementById("externalAdminStatusMsg");
  try { await extPost("/api/admin/offices/status", { office_id: officeId, active: !!active }); await externalLoadAdmin(false); if (msg) msg.textContent = "تم تحديث حالة المكتب."; }
  catch (e) { if (msg) msg.textContent = extErrorText(e); }
}
async function externalAdminStatement(officeId) {
  if (!extHasAdmin()) return;
  extState.admin.statementId = officeId; extState.admin.statement = null; extPaint();
  try { var data = await extGet("/api/admin/external/office-statement?office_id=" + encodeURIComponent(officeId), 0); extState.admin.statement = data; }
  catch (e) { extState.error = extErrorText(e); }
  extPaint();
}
function externalAdminStatementHtml() {
  var s = extState.admin.statement || {}, office = s.office || {}, summary = s.summary || {};
  return '<div class="external-statement-card"><div class="external-statement-head"><div><h3>كشف حساب المكتب</h3><small>' + extEsc(office.name || extState.admin.statementId) + '</small></div><button class="receipt-open" type="button" onclick="extState.admin.statement=null;extPaint()" aria-label="إغلاق الكشف">' + extIcon("x", 19) + '</button></div><div class="external-statement-summary">' + EXT_CURRENCIES.map(function (c) { var x = summary[c] || {}; return '<span><b>' + extEsc(EXT_CURRENCY_CODES[c]) + '</b><strong dir="ltr">' + extMoney(x.net || x.amount || 0, c) + '</strong></span>'; }).join("") + '</div><div class="external-ledger-list">' + ((s.ledger || []).map(function (l) { return '<div><span>' + extEsc(l.type || l.description || "حركة") + '<small>' + extDate(l.created_at) + '</small></span><b dir="ltr">' + extMoney(l.amount, l.currency) + '</b></div>'; }).join("") || '<div class="external-empty-inline">لا توجد حركات في الكشف.</div>') + '</div></div>';
}

function externalBack() {
  if (extState.section === "send" && extState.wizard.step > 1 && extState.wizard.step < 5) { extState.wizard.step -= 1; extPaint(); return true; }
  if (extState.section === "send" && extState.wizard.step === 5) { extState.wizard.step = 4; extState.receipt = null; extPaint(); return true; }
  if (["settings", "send", "incoming", "outgoing", "received", "detail", "receipt", "admin"].indexOf(extState.section) >= 0) { extState.section = "main"; extState.detail = null; extState.receipt = null; extPaint(); return true; }
  return false;
}
function externalHandleBack() { return externalBack(); }

window.externalOpen = externalOpen;
window.externalView = externalView;
window.externalRenderView = externalRenderView;
window.externalMount = externalMount;
window.externalBack = externalBack;
window.externalHandleBack = externalHandleBack;
window.externalOpenAdmin = externalOpenAdmin;
window.externalAdminOpen = externalAdminOpen;
window.externalShowDetails = externalShowDetails;
window.externalRefresh = externalRefresh;
window.externalReset = externalReset;

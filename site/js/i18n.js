/* Interface text and the language registry. Arabic (`AR`) is the source language and is always loaded; other languages are separate modules
   (site/i18n/<lang>.js) that call registerDict(). Values are strings, or functions of one params object (for counts, names, sentences).
   Rule: no Arabic UI text anywhere else in the code (tests/i18n_check.mjs enforces it). Missing keys in another language fall back to Arabic. */

export const LANG_META = {
  ar: { dir: "rtl", locale: "ar_AR", name: "عربي" },
  en: { dir: "ltr", locale: "en_US", name: "English" },
  ur: { dir: "rtl", locale: "ur_PK", name: "اردو" },
  xx: { dir: "ltr", locale: "en_XA", name: "xx" },   // pseudo-locale: built only for tests (scripts/build.mjs, LANGS=ar,xx)
};

let cur = "ar";
const dicts = {};
export const getLang = () => cur;
export const setLang = l => { cur = Object.hasOwn(LANG_META, l) ? l : "ar"; return cur; };
export const registerDict = (l, d) => { dicts[l] = d; };
export const langPrefix = (l = cur) => l === "ar" ? "" : "/" + l;
export const hasDict = l => Object.hasOwn(dicts, l);
/* glossary of a language: curated transliterations of series, sections, books and fixed phrases (see site/js/titles.js) */
const glossaries = {};
export const registerGlossary = (l, g) => { glossaries[l] = g; };
export const getGlossary = (l = cur) => glossaries[l] || null;

export function t(key, p) {
  let v = dicts[cur] && Object.hasOwn(dicts[cur], key) ? dicts[cur][key] : undefined;
  if (v === undefined) v = AR[key];
  if (v === undefined) return `⟦${key}⟧`;                  // a missing key is visible (and caught by tests/i18n_check.mjs)
  return typeof v === "function" ? v(p || {}) : v;
}

const B = {
  name: "الشيخ وصي الله بن محمد عباس", dua: "حفظه الله",
  officialPre: "الموقع الرسمي لفضيلة الشيخ الأستاذ الدكتور", fullName: "وصي الله بن محمد عباس بن أحمد عباس",
  role: "المدرس بالمسجد الحرام والأستاذ بجامعة أم القرى",
};
B.nameFull = `${B.name} ${B.dua}`;                                   // «الشيخ وصي الله بن محمد عباس حفظه الله»
B.official = `${B.officialPre} ${B.fullName}`;

export const AR = {
  /* names (wording supplied by the Sheikh's team, 2026-10-04) */
  "brand.name": B.name, "brand.dua": B.dua, "brand.officialPre": B.officialPre, "brand.fullName": B.fullName, "brand.role": B.role,
  "brand.nameFull": B.nameFull, "brand.official": B.official,
  "brand.small": "الموقع الرسمي · دروس الشيخ وصي الله عباس",
  "brand.aria": p => `${p.name} — الرئيسية`,
  "ld.siteAlt": ["الموقع الرسمي للشيخ وصي الله عباس", "دروس الشيخ وصي الله عباس"],
  "ld.personAlt": ["وصي الله بن محمد عباس", "وصي الله عباس", "الشيخ وصي الله عباس"],
  "ld.honorific": "الشيخ الأستاذ الدكتور", "ld.author": "وصي الله بن محمد عباس",
  "title.withSite": p => `${p.title} | الموقع الرسمي للشيخ ${B.name.replace(/^الشيخ /, "")}`,

  /* sections and units */
  "sec.duroos.title": "الدروس المرئية", "sec.duroos.desc": "شروح الكتب والسلاسل العلمية مرئيةً، على يوتيوب.",
  "sec.audio.title": "الدروس الصوتية", "sec.audio.desc": "سلاسل علمية صوتية للاستماع والتحميل.",
  "sec.lectures.title": "المحاضرات", "sec.lectures.desc": "محاضرات وكلمات وفتاوى ولقاءات منفردة.",
  "sec.khutab.title": "الخطب", "sec.khutab.desc": "خطب الجمعة والمناسبات.",
  "sec.urdu.title": "الدروس بالأردية", "sec.urdu.desc": "دروس ومحاضرات باللغة الأردية.",
  "sec.books.title": "الكتب", "sec.books.desc": "مؤلفات الشيخ وتحقيقاته للقراءة والتحميل.",
  "unit.majlis": "المجلس", "unit.lesson": "الدرس",
  "count.lessons": p => `${p.n} درسًا`, "count.books": p => `${p.n} كتابًا`, "count.results": p => `${p.n} نتيجة`,
  "hours": p => `${p.n} ساعة`,
  "hijri.months": ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"],
  "hijri.era": "هـ",
  "weekdays": ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],   // data identifiers (schedule.json uses them): never shown directly in other languages
  "weekday.names": ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],   // display names
  "date.fmt": p => [p.d, p.m, p.y, p.era].filter(Boolean).join(" "),
  "cx.part": p => `الجزء ${p.n}`, "cx.hadith": p => `ح ${p.n}`, "cx.no": p => `رقم ${p.n}`, "cx.more": "(تابع)", "cx.a": "(أ)", "cx.b": "(ب)", "cx.fromHadith": p => `من الحديث ${p.n}`,
  "lang.switch": "اللغة",
  "lang.hint.msg": "هذا الموقع متوفر أيضًا بلغات أخرى.", "lang.hint.go": "عرض بلغة أخرى", "lang.hint.close": "إغلاق", "lang.note.ar": "هذا المحتوى متوفر بالعربية فقط.",

  /* home */
  "hero.bism": "بسم الله الرحمن الرحيم", "hero.duaLead": " ", "hero.nm1": "وصي الله", "hero.nm2": "بن محمد عباس", "hero.nm3": "بن أحمد عباس",
  "hero.p": "فهرس منظّم لدروس الشيخ أ.د. وصي الله بن محمد عباس حفظه الله ومحاضراته وخطبه وكتبه، مرتّبة بحسب الأقسام والكتب لتصل إلى ما تريده بسرعة.",
  "hero.search": "ابحث عن درس أو كتاب أو باب… مثال: صحيح مسلم كتاب الحج",
  "stat.lessons": "مادة علمية", "stat.series": "سلسلة", "stat.books": "كتابًا",
  "home.news": "آخر الإعلانات", "home.schedule": "جدول الدروس الأسبوعي", "home.about": "عن الشيخ", "home.sections": "الأقسام", "home.shelf": "خزانة الكتب", "home.latest": "أحدث المواد",
  "home.allNews": "كل الإعلانات", "home.fullSchedule": "الجدول كاملًا", "home.readMore": "اقرأ المزيد", "home.allSections": "كل الأقسام", "home.all": "الكل",
  "home.schedNote": "بتوقيت مكة المكرمة؛ الجدول قابل للتغيير.",
  "home.title": () => `${B.officialPre} ${B.fullName.replace(" بن أحمد عباس", "")} ${B.dua} — دروس الشيخ وصي الله عباس`,
  "home.desc": () => `${B.official} ${B.dua}، ${B.role}: دروس الشيخ وصي الله عباس ومحاضراته وخطبه وكتبه، شروح صحيح مسلم وسنن ابن ماجه وسنن أبي داود والترمذي وغيرها، للاستماع والمشاهدة والتحميل.`,

  /* components */
  "crumb.home": "الرئيسية", "crumb.aria": "مسار الصفحة",
  "spine.aria": p => `${p.title}، ${p.n} درسًا`, "spine.title": p => `${p.title} — ${p.n} درسًا`,
  "spine.note": "سُمك الكتاب بقدر عدد دروسه — اضغط على كتاب لفتح السلسلة",
  "list.other": "أخرى", "list.empty": "لا توجد نتائج.", "list.more": "عرض المزيد",
  "sort.label": "الترتيب", "sort.new": "الأحدث أولًا", "sort.old": "الأقدم أولًا", "sort.num": "بالترتيب (الأول فالأخير)",
  "filter.all": "الكل", "filter.book": "تصفية حسب الكتاب", "filter.section": "تصفية حسب القسم",

  /* pages */
  "library.crumb": "الأقسام", "library.h1": "المكتبة", "library.lede": "اختر قسمًا لتصفّح محتواه.", "library.title": "المكتبة — أقسام الدروس والمحاضرات والكتب",
  "library.desc": () => `أقسام موقع ${B.nameFull}: الدروس المرئية والصوتية والمحاضرات والخطب والدروس بالأردية والكتب.`,
  "section.lede": p => `${p.desc} — ${p.series} سلسلة · ${p.items} مادة`, "section.details": "تفاصيل السلاسل",
  "section.metaTitle": p => `${p.title} — ${p.n} سلسلة`, "section.metaDesc": p => `${p.desc} ${p.series} سلسلة و${p.items} مادة من ${B.nameFull}.`,
  "series.search": "ابحث داخل السلسلة (رقم الدرس أو الباب)…",
  "series.metaTitle": p => `${p.title} — ${p.n} درسًا`,
  "series.metaDesc": p => `${p.desc ? p.desc + " " : ""}${p.n} درسًا${p.hours ? " (" + p.hours + ")" : ""} من ${p.sec} — ${B.nameFull}.`,
  "search.words": p => `المجلس الدرس ${p.n}`,
  "lesson.audio": "تسجيل صوتي", "lesson.video": "درس مرئي",
  "lesson.desc": p => `${p.kind}: ${p.title}${p.date ? " — " + p.date : ""}. ${B.nameFull}.`,
  "lesson.speeds": "سرعة التشغيل", "lesson.playVideo": p => `تشغيل الفيديو: ${p.title}`,
  "lesson.download": "تحميل", "lesson.openYt": "فتح في يوتيوب", "lesson.next": "التالي", "lesson.prev": "السابق", "lesson.copy": "نسخ الرابط", "lesson.copied": "تم النسخ",
  "lesson.all": p => `كل دروس السلسلة (${p.n})`,
  "search.crumb": "بحث", "search.h1": "البحث في المكتبة", "search.ph": "ابحث في كل الدروس والمحاضرات…",
  "search.noscript": "البحث يحتاج إلى تفعيل جافاسكربت في المتصفح.",
  "search.empty": "لا توجد نتائج مطابقة. جرّب كلمات أقل أو اكتب اسم الكتاب فقط.",
  "search.metaTitle": "البحث في المكتبة", "search.metaDesc": () => `ابحث في دروس ومحاضرات وخطب ${B.nameFull}.`,
  "books.title": "الكتب", "books.group": "الكتب", "books.download": "تحميل",
  "books.metaTitle": p => `الكتب — ${p.n} كتابًا للقراءة والتحميل`, "books.metaDesc": () => `مؤلفات ${B.nameFull} وتحقيقاته وبحوثه للقراءة والتحميل (PDF).`,
  "about.sources": "المصادر", "about.metaDesc": () => `نبذة عن ${B.nameFull}.`,
  "notfound.title": "الصفحة غير موجودة", "notfound.desc": "الصفحة المطلوبة غير موجودة.", "notfound.home": "العودة للرئيسية",
  "news.title": "الإعلانات", "news.lede": () => `إعلانات الموقع وأخبار دروس الشيخ ${B.name} حفظه الله.`,
  "news.loading": "جارٍ التحميل…", "news.noscript": "تحتاج هذه الصفحة إلى تفعيل جافاسكربت.", "news.metaDesc": "إعلانات الموقع وأخبار دروس الشيخ.",
  "news.none": "لا توجد إعلانات حاليًا.",
  "sched.crumb": "جدول الدروس", "sched.lede": () => `مواعيد دروس ${B.nameFull} حفظه الله خلال الأسبوع، بتوقيت مكة المكرمة.`,
  "sched.note": "الجدول قابل للتغيير؛ تابع قناة الشيخ على يوتيوب لمعرفة أي تعديل.", "sched.days": "أيام الأسبوع", "sched.ur": "بالأردية",
  "sched.liveDefault": "حضور البث المباشر",
  "sched.metaDesc": p => `مواعيد الدروس الأسبوعية للشيخ ${B.nameFull}: ${p.titles.join("، ")}. بتوقيت مكة المكرمة.`,

  /* chrome */
  "nav.home": "الرئيسية", "nav.libraryDrawer": "كل الأقسام", "nav.libraryBottom": "الأقسام", "nav.search": "بحث", "nav.sections": "الأقسام", "nav.more": "المزيد",
  "nav.topLabel": s => s,
  "nav.bottomLabel": s => s.replace("الدروس ", ""),
  "nav.quick": "التنقل السريع", "nav.menu": "القائمة", "nav.menuMain": "القائمة الرئيسية", "nav.close": "إغلاق",
  "nav.theme": "تبديل الوضع الليلي", "nav.toLight": "التبديل إلى الوضع النهاري", "nav.toDark": "التبديل إلى الوضع الليلي",
  "drawer.yt": "قناة يوتيوب", "drawer.site": "موقع الشيخ",
  "skip": "تخطَّ إلى المحتوى",
  "foot.official": p => `<strong>${p.name} ${B.dua}</strong>، ${p.role}.`,
  "foot.sources": p => `الدروس المرئية على <a href="${p.yt}" target="_blank" rel="noopener">قناة واحة السنة</a> في يوتيوب، والمواد الصوتية والكتب مأخوذة من <a href="${p.wp}" target="_blank" rel="noopener">مدونة الشيخ</a>، ويحفظ هذا الموقع نسخًا من الصوتيات والكتب لتسهيل الوصول إليها.`,
  "foot.updated": p => `آخر تحديث للفهرس: ${p.date}`,

  /* browser app */
  "dl.busy": " جارٍ التحميل…", "dl.pct": p => ` ${p.n}٪`,
  "shelf.more": "عرض مزيد من الكتب", "shelf.back": "الرجوع إلى الكتب السابقة",
  "today.tag": "اليوم", "today.then": " ثم ", "today.line": p => "اليوم: " + p.text, "today.next": p => `الدرس القادم يوم ${p.day}: ${p.text}`,
  "audio.error": p => `تعذّر تشغيل هذا التسجيل الآن (الملف غير متاح عند المصدر). ${p.next ? "يمكنك الانتقال إلى الدرس التالي." : ""}`,
  "live.details": "التفاصيل", "live.close": "إغلاق الإعلان", "live.day": "يوم ", "live.cancelled": "ملغى ", "live.changed": "تغيير في الموعد",
};
dicts.ar = AR;

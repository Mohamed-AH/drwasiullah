# نبذة عن الشيخ — ما نحتاجه من فريق الشيخ

الموقع جاهز لعرض صفحة **«عن الشيخ»** وبطاقة تعريفية في الصفحة الرئيسية. **لن تظهر أي منهما حتى يصلنا النص المعتمد**؛
ولن نكتب أي معلومة عن الشيخ من عندنا.

## المطلوب
1. **نبذة قصيرة** (٢–٣ أسطر) تظهر في الصفحة الرئيسية وفي نتائج البحث.
2. **السيرة التفصيلية** مقسّمة إلى أقسام بعناوين وفقرات، مثلًا (يُنقَّح كما يراه الفريق):
   النشأة والطلب · الشيوخ والإجازات · الأعمال العلمية والوظائف · المؤلفات والتحقيقات · الدروس والمجالس.
3. **صورة** للشيخ بإذنه (يُفضَّل مربعة، لا تقل عن ٦٠٠×٦٠٠، بصيغة JPG).
4. **المصادر** (روابط المواقع الرسمية التي أُخذت منها المعلومات) إن وُجدت.
5. تأكيد كتابي بأن النص والصورة معتمدان من الشيخ أو من يفوّضه.

## الصيغة
يكفي إرسال النص في ملف Word أو رسالة؛ نحن نحوّله. الشكل الذي سيُخزَّن به (للمطوّر) هو الملف `site/data/bio.json`:

```json
{
  "title": "الشيخ وصي الله بن محمد عباس",
  "summary": "نبذة قصيرة من سطرين أو ثلاثة.",
  "photo": "/img/sheikh.jpg",
  "sections": [
    { "title": "النشأة والطلب", "paragraphs": ["فقرة أولى.", "فقرة ثانية."], "items": ["نقطة ١", "نقطة ٢"] }
  ],
  "sources": [ { "label": "الموقع الرسمي", "url": "https://wasiullahabbas.wordpress.com/" } ]
}
```

---
### For the developer (English)
Drop `site/data/bio.json` (schema above; `title`, `photo`, `items`, `sources` optional) and, if used, the photo at `site/img/sheikh.jpg`, then deploy.
When the file exists the build adds: the `/about/` page (+ `Person` JSON-LD), the «عن الشيخ» nav item, the home-page teaser and the sitemap entry.
When it doesn't, none of them is generated. Content must come from the Sheikh's team (see CLAUDE.md, *Content integrity*).

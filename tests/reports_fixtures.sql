-- Fixtures for tests/admin_reports.mjs (local test database only)
INSERT INTO series (id, origin, pos, sec, title, status, data) VALUES ('rpt-empty','library',9000,'lectures','سلسلة فارغة للتقرير','published','{"id":"rpt-empty","sec":"lectures","title":"سلسلة فارغة للتقرير"}');
INSERT INTO lessons (id, origin, pos, series_id, kind, n, section, status, data) VALUES
 ('rpt-nodate','library',9001,'tadrib','audio',9999,NULL,'published','{"id":"rpt-nodate","series":"tadrib","kind":"audio","n":9999,"title":"<b>بلا تاريخ</b>"}'),
 ('rpt-dup','library',9002,'tadrib','audio',1,NULL,'published','{"id":"rpt-dup","series":"tadrib","kind":"audio","n":1,"title":"درس مكرر الرقم","date":"2020-01-01","duration":600}'),
 ('rpt-draft','library',9003,'tadrib','audio',9998,NULL,'draft','{"id":"rpt-draft","series":"tadrib","kind":"audio","n":9998,"title":"مسودة تقرير","date":"2020-01-02"}'),
 ('rpt-formula','library',9004,'tadrib','audio',9997,NULL,'published','{"id":"rpt-formula","series":"tadrib","kind":"audio","n":9997,"title":"=SUM(1)","date":"2020-01-03","duration":60}');

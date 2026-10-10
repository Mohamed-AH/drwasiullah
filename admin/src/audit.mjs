/* every change goes through here: who, what, and the row before/after (the log is how a mistake is traced and undone) */
export const auditStmt = (db, actor, action, entity, id, before, after) =>
  db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, before, after) VALUES (?,?,?,?,?,?)")
    .bind(actor, action, entity, id ?? null, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after));
export const audit = (db, ...a) => auditStmt(db, ...a).run();

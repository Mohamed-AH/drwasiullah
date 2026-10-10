/* Who may do what. Admin: everything. Editor: content only (the content screens arrive in phases 3-4; they are listed so the matrix is settled now). */
const MATRIX = {
  admin:  ["view", "content.edit", "content.hide", "content.publish", "content.delete", "layout.edit", "schedule.edit", "banners.edit", "users.manage", "audit.view", "analytics.view", "reports.view", "settings.edit"],
  editor: ["view", "content.edit", "content.hide", "content.publish"],
};
export const ROLES = Object.keys(MATRIX);
export const can = (role, action) => !!MATRIX[role] && MATRIX[role].includes(action);
export const ROLE_AR = { admin: "مدير", editor: "محرر" };

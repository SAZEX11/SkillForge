const { query } = require('../config/db');
// Pass a transaction client as `db` so the log row commits or rolls back with the change.
exports.log = (db, actorId, action, entityType, entityId, oldData, newData) =>
  (db ? db.query.bind(db) : query)(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_data, new_data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorId, action, entityType, entityId, oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null]);

exports.create = (client, userId, title, message, link) => client.query(
  'INSERT INTO notifications (user_id, title, message, link) VALUES ($1, $2, $3, $4)',
  [userId, title, message, link || null]);

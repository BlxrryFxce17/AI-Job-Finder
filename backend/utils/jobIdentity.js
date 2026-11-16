const mongoose = require('mongoose');
function jobFilter(userId, id) {
  if (typeof id !== 'string' || !id.trim()) throw Object.assign(new Error('A job ID is required'), { status: 400 });
  return { userId, $or: [{ id }, ...(mongoose.isObjectIdOrHexString(id) ? [{ _id: id }] : [])] };
}
module.exports = { jobFilter };

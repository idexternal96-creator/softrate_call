const Employee = require('../../../models/Employee');

function findEmployees(filter) {
  return Employee.find(filter).sort({ name: 1 }).lean();
}

function updateEmployeeTags(employeeId, tags) {
  return Employee.findByIdAndUpdate(employeeId, { $set: { tags } }, { new: true }).lean();
}

module.exports = {
  findEmployees,
  updateEmployeeTags,
};

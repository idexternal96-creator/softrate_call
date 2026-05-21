const { mapEmployeeDocument } = require('./employee.mapper');
const repository = require('./employee.repository');

async function listEmployees(filter) {
  const documents = await repository.findEmployees(filter);
  return documents.map(mapEmployeeDocument);
}

async function updateTags(employeeId, tags) {
  const document = await repository.updateEmployeeTags(employeeId, tags);
  return mapEmployeeDocument(document);
}

module.exports = {
  listEmployees,
  updateTags,
};

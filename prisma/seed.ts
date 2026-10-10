// Production records belong in the database, never in source control.
// The old seed included private household data and deleted existing expenses.
// Seeding is intentionally disabled: use the authenticated app to add records.
console.log("Database seeding is disabled. Existing financial records are unchanged.");

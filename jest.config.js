/**
 * @type {import('@jest/types').Config.ProjectConfig}
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  watchPathIgnorePatterns: ["<rootDir>/test/testing"],
  testPathIgnorePatterns: ["<rootDir>/test/tsFixtures"],
}

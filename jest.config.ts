import { defineConfig } from "jest";

export default defineConfig({
  maxConcurrency: 20,
  modulePathIgnorePatterns: ["./out"],
  preset: "ts-jest",
  testEnvironment: "node",
});

import * as glob from "glob"
import { autobarrel, resolveAutobarrelConfig } from "../src/autobarrel"
import fs from "fs-extra"
import path from "path"

describe("autobarrel", () => {
  beforeEach(() => {
    try {
      fs.rmdirSync(path.join(__dirname, "testing"), { recursive: true })
    } catch {}
    fs.copySync(
      path.join(__dirname, "fixtures"),
      path.join(__dirname, "testing")
    )
    try {
      fs.rmdirSync(path.join(__dirname, "tsTesting"), { recursive: true })
    } catch {}
    fs.copySync(
      path.join(__dirname, "tsFixtures"),
      path.join(__dirname, "tsTesting")
    )
  })

  afterEach(() => {
    try {
      fs.rmdirSync(path.join(__dirname, "testing"), { recursive: true })
    } catch {}
    try {
      fs.rmdirSync(path.join(__dirname, "tsTesting"), { recursive: true })
    } catch {}
  })

  test("autobarrel tests", async () => {
    const pathsWritten = await autobarrel(
      await resolveAutobarrelConfig({
        path: path.join(__dirname, "testing", "autobarrel.json"),
      })
    )
    const globFiles = glob.sync("testing/**", {
      cwd: __dirname,
    })
    expect(globFiles).toMatchSnapshot()
    const indexFiles = globFiles.filter((f) => f.endsWith("index.ts"))

    indexFiles.map((f) => {
      expect(fs.readFileSync(path.join(__dirname, f), "utf8")).toMatchSnapshot(
        f
      )
    })

    expect(pathsWritten).toMatchSnapshot("Paths Written")
  })

  test("autobarrel (tsconfig.json) tests", async () => {
    const pathsWritten = await autobarrel(
      await resolveAutobarrelConfig({
        path: path.join(__dirname, "tsTesting", "autobarrel.json"),
      })
    )
    const globFiles = glob.sync("tsTesting/**", {
      cwd: __dirname,
    })
    expect(globFiles).toMatchSnapshot()
    const indexFiles = globFiles.filter((f) => f.endsWith("index.ts"))

    indexFiles.map((f) => {
      expect(fs.readFileSync(path.join(__dirname, f), "utf8")).toMatchSnapshot(
        f
      )
    })

    expect(pathsWritten).toMatchSnapshot("Paths Written")
  })
})

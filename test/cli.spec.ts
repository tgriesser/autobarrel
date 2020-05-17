import * as path from "path"
import * as fs from "fs-extra"
import childProcess from "child_process"
import glob from "glob"
import util from "util"

const globAsync = util.promisify(glob)

describe("autobarrel cli", () => {
  beforeEach(() => {
    try {
      fs.rmdirSync(path.join(__dirname, "testing"), { recursive: true })
    } catch {}
    fs.copySync(
      path.join(__dirname, "fixtures"),
      path.join(__dirname, "testing")
    )
  })

  afterEach(() => {
    try {
      // fs.rmdirSync(path.join(__dirname, "testing"), { recursive: true })
    } catch {}
  })

  test.only("should run the CLI", async () => {
    const result = childProcess.spawnSync(
      "./cli.js",
      ["--config", path.join(__dirname, "testing", "autobarrel.json")],
      {
        cwd: path.join(__dirname, "../dist"),
        stdio: "inherit",
      }
    )
    const globbed = await globAsync(path.join(__dirname, "testing/**"))
    expect(globbed).toMatchSnapshot()
  })

  test("should find autobarrel conf if in the pwd", (done) => {
    const result = childProcess.spawnSync("./cli.js", [], {
      cwd: path.join(__dirname, "testing"),
    })
    expect(result.stderr).toBeNull()
  })

  test("should run --watch mode", (done) => {
    childProcess.spawn("./cli.js", [], {
      cwd: path.join(__dirname, "../dist"),
    })
  })
})

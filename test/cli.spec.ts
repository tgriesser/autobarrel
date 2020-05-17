import * as path from "path"
import * as fs from "fs-extra"
import childProcess from "child_process"
import glob from "glob"
import util from "util"
import pDefer from "p-defer"

const globAsync = util.promisify(glob)

beforeEach(() => {
  try {
    fs.rmdirSync(path.join(__dirname, "testing"), { recursive: true })
  } catch {}
  fs.copySync(path.join(__dirname, "fixtures"), path.join(__dirname, "testing"))
})

afterEach(() => {
  try {
    fs.rmdirSync(path.join(__dirname, "testing"), { recursive: true })
  } catch {}
})

describe("autobarrel cli", () => {
  test("should run the CLI", async () => {
    childProcess.spawnSync(
      "./cli.js",
      ["--config", path.join(__dirname, "testing", "autobarrel.json")],
      {
        cwd: path.join(__dirname, "../dist"),
        stdio: "inherit",
      }
    )
    const globbed = await globAsync("testing/**", {
      cwd: __dirname,
    })
    expect(globbed).toMatchSnapshot()
  })
})

describe("watch mode", () => {
  const watchArgs = [
    "--config",
    path.join(__dirname, "testing", "autobarrel.json"),
    "--watch",
  ]

  // Run the watcher
  let spawned: childProcess.ChildProcess
  beforeEach(async () => {
    const dfd = pDefer()
    spawned = childProcess.spawn("./cli.js", watchArgs, {
      cwd: path.join(__dirname, "../dist"),
    })
    spawned.stdout?.on("data", (chunk) => {
      if (String(chunk).includes("Autobarrel watching")) {
        dfd.resolve()
      } else {
        console.log(String(chunk))
      }
    })
    spawned.stderr?.pipe(process.stderr)
    await dfd.promise
  })

  afterEach(() => {
    spawned.kill("SIGKILL")
    spawned.removeAllListeners()
  })

  const readWatchIndex = async () => {
    return await fs.readFile(
      path.join(__dirname, "testing/testDir/watchTest/index.ts"),
      "utf8"
    )
  }

  const delay = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  test("should run --watch mode, watch file add", async () => {
    expect(await readWatchIndex()).toMatchSnapshot("Before file add")
    await fs.writeFile(
      path.join(__dirname, "testing/testDir/watchTest/added.ts"),
      "export const added = {}"
    )
    let hasAdded = false
    do {
      hasAdded = (
        await fs.readFile(
          path.join(__dirname, "testing/testDir/watchTest/index.ts"),
          "utf8"
        )
      ).includes("./added")
      await delay(10)
    } while (!hasAdded)

    expect(await readWatchIndex()).toMatchSnapshot("After file add")
  })

  test("should run --watch mode, watch file remove", async () => {
    expect(await readWatchIndex()).toMatchSnapshot("Before file remove")
    await fs.unlink(path.join(__dirname, "testing/testDir/watchTest/watch.ts"))
    let hasRemoved = false
    do {
      hasRemoved = !fs.existsSync(
        path.join(__dirname, "testing/testDir/watchTest/index.ts")
      )
      await delay(10)
    } while (!hasRemoved)
  })

  describe("dir remove", () => {
    beforeEach(async () => {
      await fs.mkdirp(
        path.join(__dirname, "testing/testDir/watchTest/addedDir")
      )
      await fs.writeFile(
        path.join(__dirname, "testing/testDir/watchTest/addedDir/watch.ts"),
        "export const addedDir = {}"
      )
      let hasAdded = false
      do {
        hasAdded = (
          await fs.readFile(
            path.join(__dirname, "testing/testDir/watchTest/index.ts"),
            "utf8"
          )
        ).includes("./addedDir")
        await delay(10)
      } while (!hasAdded)
    })

    test("should run --watch mode, watch dir remove", async () => {
      expect(await readWatchIndex()).toMatchSnapshot("Before dir remove")
      await fs.remove(
        path.join(__dirname, "testing/testDir/watchTest/addedDir")
      )
      let hasRemoved = false
      do {
        hasRemoved = !(
          await fs.readFile(
            path.join(__dirname, "testing/testDir/watchTest/index.ts"),
            "utf8"
          )
        ).includes("./addedDir")
        await delay(10)
      } while (!hasRemoved)
      expect(await readWatchIndex()).toMatchSnapshot("After dir remove")
    })
  })
})

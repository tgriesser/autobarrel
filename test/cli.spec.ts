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
    await delay(1000)
    expect(await readWatchIndex()).toMatchSnapshot("After file add")
  })

  test("should run --watch mode, watch file remove", async () => {
    expect(await readWatchIndex()).toMatchSnapshot("Before file remove")
    await fs.unlink(path.join(__dirname, "testing/testDir/watchTest/watch.ts"))
    await delay(1000)
    expect(readWatchIndex()).rejects.toHaveProperty(
      "message",
      expect.stringContaining("ENOENT: no such file or directory")
    )
  })

  test("should run --watch mode, watch dir add", async () => {
    expect(await readWatchIndex()).toMatchSnapshot("Before watch")
    await fs.mkdirp(path.join(__dirname, "testing/testDir/watchTest/addedDir"))
    await fs.writeFile(
      path.join(__dirname, "testing/testDir/watchTest/addedDir/watch.ts"),
      "export const addedDir = {}"
    )
    expect(await readWatchIndex()).toMatchSnapshot("After watch")
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
      await delay(1000)
    })

    test("should run --watch mode, watch dir remove", async () => {
      expect(await readWatchIndex()).toMatchSnapshot("Before dir remove")
      await fs.remove(
        path.join(__dirname, "testing/testDir/watchTest/addedDir")
      )
      await delay(1000)
      expect(await readWatchIndex()).toMatchSnapshot("After dir remove")
    })
  })
})

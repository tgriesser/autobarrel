import chokidar from "chokidar"
import * as fs from "fs"
import glob from "glob"
import * as path from "path"
import util from "util"

const unlinkAsync = util.promisify(fs.unlink)
const statAsync = util.promisify(fs.stat)
const writeFileAsync = util.promisify(fs.writeFile)
const readFileAsync = util.promisify(fs.readFile)
const globAsync = util.promisify(glob)

export type AutoBarrelConfig = {
  /**
   * Absolute path to autobarrel.json
   */
  path: string
}

export type AutoBarrelData = {
  /**
   * Prefix to the file
   */
  prefix?: string
  /**
   * Current working directory for the globs
   */
  cwd: string
  /**
   * Absolute glob patterns we want to process
   */
  paths: string[]
  /**
   * Absolute paths we want to ignore entirely
   */
  ignore?: string[]
  /**
   * Absolute paths of files / directories we want to avoid re-exporting
   */
  exclude?: string[]
}

export async function autobarrel(configData: AutoBarrelData) {
  const promises = []
  const globbedFiles = new Set<string>()
  const excludeFiles = new Set<string>()

  promises.push(
    ...(configData.exclude?.map(async (p) => {
      const exclude = await globAsync(p, {
        cwd: configData.cwd,
        ignore: configData.ignore || [],
      })
      exclude.map((e) => {
        if (path.extname(e) === "") {
          e = `${e}/index.ts`
        }
        excludeFiles.add(path.normalize(e))
      })
    }) ?? [])
  )

  promises.push(
    ...configData.paths.map(async (p) => {
      const added = await globAsync(p, {
        cwd: configData.cwd,
        ignore: configData.ignore || [],
      })
      added.map((a) => globbedFiles.add(path.normalize(a)))
    })
  )

  await Promise.all(promises)

  const toBarrel = Array.from(globbedFiles)
  const toBarrelMap: Record<string, Set<string>> = {}
  const dirCandidates: string[] = []
  const tsFiles = new Set<string>()
  const directories = new Set<string>()

  toBarrel.forEach((p) => {
    if (p.match(/\.tsx?$/) && !p.endsWith(".d.ts")) {
      tsFiles.add(p)
    } else if (!path.extname(p)) {
      dirCandidates.push(p)
    }
  })

  await Promise.all(
    dirCandidates.map(async (dir) => {
      const stat = await statAsync(path.join(configData.cwd, dir))
      if (stat.isDirectory()) {
        directories.add(dir)
        const barrelFile = path.join(dir, "index.ts")
        tsFiles.add(barrelFile)
        if (excludeFiles.has(dir)) {
          excludeFiles.add(barrelFile)
        }
      }
    })
  )

  Array.from(directories).forEach((dir) => {
    toBarrelMap[dir] = new Set()
  })

  Array.from(tsFiles).forEach((file) => {
    const dirName = path.dirname(file)
    if (
      toBarrelMap[dirName] &&
      (!excludeFiles.has(file) || path.basename(file) === "index.ts")
    ) {
      toBarrelMap[dirName].add(file)
    }
  })

  Object.keys(toBarrelMap).forEach((k) => {
    const dirName = path.dirname(k)
    if (
      toBarrelMap[dirName] &&
      toBarrelMap[k].has(path.join(k, "index.ts")) &&
      !excludeFiles.has(path.join(k, "index.ts"))
    ) {
      toBarrelMap[dirName].add(k)
    }
  })

  const toRemove: string[] = []

  const maybeDestroy = (key: string, val: Set<string>) => {
    if (toBarrelMap[key]) {
      if (val.size === 1) {
        if (globbedFiles.has(path.join(key, "index.ts"))) {
          toRemove.push(path.join(key, "index.ts"))
        }
        delete toBarrelMap[key]
        const p = path.dirname(key)
        if (toBarrelMap[p]) {
          toBarrelMap[p].delete(key)
          maybeDestroy(p, toBarrelMap[p])
        }
      }
    }
  }

  Object.entries(toBarrelMap).forEach(([key, val]) => {
    maybeDestroy(key, val)
  })

  const [pathsWritten] = await Promise.all([
    Promise.all(
      Object.entries(toBarrelMap).map(async ([key, val]) => {
        const lines = ["// created by autobarrel, do not modify directly\n\n"]

        if (configData.prefix) {
          lines.unshift(`${configData.prefix}\n`)
        }

        const toAdd = Array.from(val).sort()

        toAdd
          .map((p) => path.relative(key, p))
          .map((p) => (path.extname(p) ? p : `${p}/`))
          .forEach((p) => {
            if (path.basename(p) !== "index.ts") {
              lines.push(`export * from './${p.replace(/\.tsx?$/, "")}'\n`)
            }
          })
        const writePath = path.join(key, "index.ts")
        await writeFileAsync(
          path.join(configData.cwd, writePath),
          lines.join("")
        )
        return writePath
      })
    ),
    Promise.all(
      toRemove.map(async (file) => {
        try {
          await unlinkAsync(path.join(configData.cwd, file))
        } catch {}
      })
    ),
  ])

  return pathsWritten.sort()
}

export type AutoBarrelWatchData = AutoBarrelData & {
  /**
   * Whether the watch is running in verbose mode
   */
  verbose?: boolean
}

export async function autobarrelWatch(configData: AutoBarrelWatchData) {
  let running = false
  let needsRerun = 0
  const watcher = chokidar.watch(configData.paths, {
    cwd: configData.cwd,
    ignoreInitial: true,
    ignored: configData.ignore ?? [],
  })
  async function maybeAutobarrel(reason: string, file: string = "") {
    if (running) {
      if (!file.endsWith("index.ts")) {
        needsRerun++
      }
      return
    }
    running = true
    try {
      if (configData.verbose) {
        console.log(`Autobarrel running due to ${reason} - ${file}`)
      }
      await autobarrel(configData)
    } catch (e) {
      console.error(e)
    } finally {
      running = false
      const shouldRerun = needsRerun > 0
      needsRerun = 0
      if (shouldRerun) {
        maybeAutobarrel("Changes during last autobarrel")
      }
    }
  }
  watcher.on("add", (e) => {
    if (e.match(/\.tsx?$/)) {
      maybeAutobarrel("add", e)
    }
  })
  watcher.on("unlink", (e) => {
    if (e.match(/\.tsx?$/)) {
      maybeAutobarrel("unlink", e)
    }
  })
  watcher.on("unlinkDir", (e) => maybeAutobarrel("unlinkDir", e))
  await maybeAutobarrel("Intial Autobarrel")
  console.log("Autobarrel watching...")
  return watcher
}

export async function resolveAutobarrelConfig(config: AutoBarrelConfig) {
  let configPath = path.isAbsolute(config.path)
    ? config.path
    : path.join(process.cwd(), config.path)
  const stat = await statAsync(configPath)

  if (!stat.isFile()) {
    throw new Error(`Autobarrel config ${configPath} is not a file`)
  }
  let configData: Omit<AutoBarrelData, "cwd">
  try {
    configData = JSON.parse(await readFileAsync(configPath, "utf8"))
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(
        `Invalid syntax in the autobarrel JSON file: ${configPath}`
      )
    }
    throw e
  }

  if (!Array.isArray(configData.paths)) {
    throw new Error(`Missing required paths Array in autobarrel config`)
  }
  if (configData.exclude && !Array.isArray(configData.exclude)) {
    throw new Error(
      `Expected autobarrel exclude to be an array, saw ${configData.exclude}`
    )
  }
  if (configData.ignore && !Array.isArray(configData.ignore)) {
    throw new Error(
      `Expected autobarrel ignore to be an array, saw ${configData.exclude}`
    )
  }
  return {
    cwd: path.dirname(configPath),
    ...configData,
  }
}

import chokidar from "chokidar"
import * as fs from "fs"
import glob from "glob"
import * as path from "path"
import util from "util"

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
        ignore: configData.ignore || [],
      })
      exclude.map((e) => {
        if (path.extname(e) === "") {
          excludeFiles.add(e + "/index.ts")
        } else {
          excludeFiles.add(e)
        }
      })
    }) ?? [])
  )

  promises.push(
    ...configData.paths.map(async (p) => {
      const added = await globAsync(p, {
        ignore: configData.ignore || [],
      })
      added.map((a) => globbedFiles.add(a))
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
      const stat = await statAsync(dir)
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

  Object.entries(toBarrelMap).forEach(([key, val]) => {
    maybeDestroy(key, val)
  })

  function maybeDestroy(key: string, val: Set<string>) {
    if (toBarrelMap[key]) {
      if (val.size === 1) {
        delete toBarrelMap[key]
        const p = path.dirname(key)
        if (toBarrelMap[p]) {
          toBarrelMap[p].delete(key)
          maybeDestroy(p, toBarrelMap[p])
        }
      }
    }
  }

  const pathsWritten = await Promise.all(
    Object.entries(toBarrelMap).map(async ([key, val]) => {
      const lines = ["// created by autobarrel, do not modify directly\n"]
      const toAdd = Array.from(val).sort()

      toAdd
        .map((p) => path.relative(key, p))
        .map((p) => (path.extname(p) ? p : `${p}/`))
        .forEach((p) => {
          if (path.basename(p) !== "index.ts") {
            lines.push(`export * from './${p.replace(/\.tsx?$/, "")}'`)
          }
        })
      const writePath = path.join(key, "index.ts")
      await writeFileAsync(writePath, lines.join("\n"))
      return writePath
    })
  )

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
  await autobarrel(configData)
  const watcher = chokidar.watch(configData.paths, {
    ignoreInitial: true,
    ignored: configData.ignore ?? [],
  })
  async function maybeAutobarrel(p: string) {
    if (!running) {
      running = true
      try {
        if (configData.verbose) {
          console.log(`Autobarrel running due to ${p}`)
        }
        await autobarrel(configData)
      } catch (e) {
        console.error(e)
      } finally {
        running = false
      }
    }
  }
  console.log("Autobarrel watching...")
  watcher.on("add", (e) => {
    if (e.match(/\.tsx?$/)) {
      maybeAutobarrel(e)
    }
  })
  watcher.on("addDir", maybeAutobarrel)
  watcher.on("unlink", (e) => {
    if (e.match(/\.tsx?$/)) {
      maybeAutobarrel(e)
    }
  })
  watcher.on("unlinkDir", maybeAutobarrel)
  return watcher
}

export async function resolveAutobarrelConfig(config: AutoBarrelConfig) {
  if (!path.isAbsolute(config.path)) {
    throw new Error(
      `resolveAutobarrelConfig expects config.path to be absolute`
    )
  }
  const stat = await statAsync(config.path)
  if (!stat.isFile()) {
    throw new Error(`Autobarrel config ${config.path} is not a file`)
  }
  let configData: AutoBarrelData
  try {
    configData = JSON.parse(await readFileAsync(config.path, "utf8"))
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(
        `Invalid syntax in the autobarrel JSON file: ${config.path}`
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
  const absPathDir = path.dirname(config.path)

  Object.keys(configData).forEach((k) => {
    const key = k as keyof typeof configData
    if (Array.isArray(configData[key])) {
      configData[key] = configData[key]!.map((p) =>
        path.isAbsolute(p) ? p : path.join(absPathDir, p)
      )
    }
  })
  return configData
}

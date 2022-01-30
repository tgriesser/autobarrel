#!/usr/bin/env node
import fs from "fs"
import minimist from "minimist"
import path from "path"
import {
  autobarrel,
  autobarrelWatch,
  resolveAutobarrelConfig,
} from "./autobarrel"

//
const argv = minimist(process.argv.slice(2))

if (argv.h || argv.help) {
  console.log(`Syntax: autobarrel [options]\n`)
  console.log(`Example: autobarrel --config path/to/autobarrel.json --watch\n`)
  console.log(`Options:\n`)
  console.log(`--help       Print this message`)
  console.log(`--watch      Watch mode, via chokidar`)
  console.log(
    `--config     Specify the path to autobarrel.json config, default to cwd`
  )
  process.exit()
}

const confPath = argv.config
  ? path.isAbsolute(argv.config)
    ? argv.config
    : path.join(process.cwd(), argv.config)
  : path.join(process.cwd(), "autobarrel.json")

if (
  !fs.existsSync(confPath) &&
  !fs.existsSync(confPath.replace(path.basename(confPath), "tsconfig.json"))
) {
  throw new Error(
    `Could not find autobarrel.json file at ${confPath}, specify a valid path via --config`
  )
}

;(async function runAutoBarrel() {
  const configData = await resolveAutobarrelConfig({ path: confPath })
  if (argv.watch) {
    await autobarrelWatch(configData)
  } else {
    await autobarrel(configData)
    console.log(`Autobarrel complete for ${configData.paths}`)
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})

## autobarrel

Simple tool for creating ["barrel" files](https://basarat.gitbook.io/typescript/main-1/barrel) in TypeScript

Caveats:

- Has not been tested on Windows
- Only meant for TypeScript, as TS will check that there are no conflicting exports
- Assumes you do not `export default` or have specific exports in the index. If you need this, exclude and re-export from another module
- Does not actually check files for the presence of `export` in ts files
  - Possibly in future scope, PRs welcome. In the meantime use the `paths` / `exclude` / `ignored` options

### CLI Usage:

```ts
autobarrel [--config path/to/autobarrel.json] [--watch]
```

### Programmatic Usage:

```ts
import { autobarrel, resolveAutobarrelConfig } from "autobarrel"

//
await autobarrel(
  // Converts relative paths to absolute paths for consistency
  await resolveAutobarrelConfig({
    path: path.join(__dirname, "testing", "autobarrel.json"),
  })
)
```

## License

MIT

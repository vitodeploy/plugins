# VitoDeploy Plugins

The official marketplace for [VitoDeploy](https://vitodeploy.com) plugins.

Every official plugin lives here, and anyone can **fork → add a plugin → open a
PR** to get it listed. On merge, CI validates each changed plugin, packs it into
a deterministic zip, signs it with minisign, and uploads it to the VitoDeploy
marketplace.

## Docs

https://vitodeploy.com/docs/plugins

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the fork → scaffold → validate → PR
flow. Copy the starter in [`examples/hello-world`](examples/hello-world) to begin.

## Local tooling

Needs **Node ≥ 20**:

```bash
npm install
npm run validate          # validate plugins
npm run pack -- --dry-run # prove the zip is deterministic + see its sha256
```

## License

[AGPL-3.0](LICENSE), matching the VitoDeploy app.

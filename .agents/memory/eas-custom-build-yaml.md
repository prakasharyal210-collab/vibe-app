---
name: EAS custom build YAML path rules
description: How to correctly configure EAS custom build YAML files and the pnpm frozen-lockfile fix for CI.
---

## EAS custom build YAML — path rules

The `config` field in a build profile inside `eas.json` is resolved as:
```
<eas.json directory>/.eas/build/<config value>
```

So `"config": "android-apk.yml"` → looks for `artifacts/mobile/.eas/build/android-apk.yml`.

**WRONG**: `"config": ".eas/build/android-apk.yml"` → resolves to `.eas/build/.eas/build/android-apk.yml` (double-prefixed, file not found).

**RIGHT**: `"config": "android-apk.yml"` → resolves to `.eas/build/android-apk.yml` relative to eas.json dir.

The YAML files must live at `artifacts/mobile/.eas/build/`.
The workspace-root `.eas/build/` files are NOT read by EAS (EAS resolves relative to the eas.json location).

## pnpm frozen-lockfile in CI

EAS build workers and GitHub Actions both set `CI=true`, which makes pnpm auto-enable `--frozen-lockfile`.

Two places need fixing:
1. **`.npmrc`** at workspace root: add `frozen-lockfile=false` — overrides CI auto-detection when no explicit flag is passed
2. **GitHub Actions workflow**: change `pnpm install --frozen-lockfile` → `pnpm install --no-frozen-lockfile`

The lockfile version mismatch (`lockfileVersion: '9.0'` in our lockfile but EAS may run a different pnpm version) is why frozen-lockfile fails — the lockfile is marked "not compatible" and treated as absent.

## GitHub Actions: pnpm/action-setup@v4 + packageManager conflict

`pnpm/action-setup@v4` throws `ERR_PNPM_BAD_PM_VERSION` if BOTH:
- `version:` key is set in the action config
- `packageManager` field exists in `package.json`

**Fix**: Remove `version:` from the action; let it read from `packageManager` automatically.

## EAS custom build YAML step names (Android)

```yaml
build:
  name: Android APK build
  steps:
    - eas/checkout
    - run:
        name: Install dependencies
        command: pnpm install --no-frozen-lockfile
    - eas/prebuild
    - eas/configure_eas_update
    - eas/inject_android_credentials
    - eas/run_gradlew
    - eas/find_and_upload_build_artifacts
```

`eas/install_node_modules` is the step that uses `--frozen-lockfile`. Replace it with a custom `run` step.
